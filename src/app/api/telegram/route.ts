/**
 * /api/telegram — Telegram Bot Management API
 *
 * Handles:
 * - Runtime configuration (save_bot_token, save_chat_id)
 * - Auto-detection of Chat ID via getUpdates
 * - Connection testing (send test message)
 * - Status verification (check if bot token is valid)
 *
 * Protected by verifyAuth()
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/auth';
import {
  getBotToken, getChatId, hasBotToken, hasChatId, isConfigured,
  setRuntimeBotToken, setRuntimeChatId, getConfigStatus,
} from '@/lib/telegram-runtime-config';
import { testTelegramAlert, sendTelegramAlert, type TelegramAlert } from '@/lib/telegram-alerts';
import { getKeywords, matchKeyword } from '@/lib/alert-keywords';
import { getAlertHistory, addAlertHistoryEntry } from '@/lib/engines/alert-interceptor';

// ── GET: Check Telegram configuration status ──

export async function GET(request: NextRequest) {
  const auth = await verifyAuth(request);
  if (!auth.authenticated) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const status = getConfigStatus();

  // If bot token exists, verify it's valid by calling getMe
  let botInfo = null;
  const botToken = getBotToken();
  if (botToken) {
    try {
      const meRes = await fetch(`https://api.telegram.org/bot${botToken}/getMe`, {
        signal: AbortSignal.timeout(10000),
      });
      if (meRes.ok) {
        const meData = await meRes.json();
        if (meData.ok && meData.result) {
          botInfo = {
            username: meData.result.username || '',
            firstName: meData.result.first_name || '',
            id: meData.result.id || 0,
          };
        }
      }
    } catch {
      // Bot token invalid or network error — ignore
    }
  }

  return NextResponse.json({
    configured: status.configured,
    hasBotToken: status.hasBotToken,
    hasChatId: status.hasChatId,
    botTokenSource: status.botTokenSource,
    chatIdSource: status.chatIdSource,
    botInfo,
  });
}

// ── POST: Actions ──

export async function POST(request: NextRequest) {
  const auth = await verifyAuth(request);
  if (!auth.authenticated) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { action } = body;

    switch (action) {
      // ── Save Bot Token (runtime) ──
      case 'save_bot_token': {
        const { botToken } = body;
        if (!botToken || typeof botToken !== 'string' || botToken.trim().length === 0) {
          return NextResponse.json({
            success: false,
            error: 'El token del bot es obligatorio.',
          }, { status: 400 });
        }

        // Verify token validity before saving
        try {
          const meRes = await fetch(`https://api.telegram.org/bot${botToken.trim()}/getMe`, {
            signal: AbortSignal.timeout(10000),
          });
          const meData = await meRes.json();

          if (!meData.ok) {
            return NextResponse.json({
              success: false,
              error: `Token inválido: ${meData.description || 'verifica que el token sea correcto'}`,
            }, { status: 400 });
          }

          // Token is valid — save it
          setRuntimeBotToken(botToken.trim());

          return NextResponse.json({
            success: true,
            botInfo: {
              username: meData.result.username,
              firstName: meData.result.first_name,
              id: meData.result.id,
            },
            message: 'Token del bot guardado exitosamente (sesión actual). Para persistencia, configúralo en Vercel → Settings → Environment Variables.',
          });
        } catch (fetchError) {
          return NextResponse.json({
            success: false,
            error: `Error de conexión con Telegram API: ${fetchError instanceof Error ? fetchError.message : 'desconocido'}`,
          }, { status: 500 });
        }
      }

      // ── Save Chat ID (runtime) ──
      case 'save_chat_id': {
        const { chatId } = body;
        if (!chatId || (typeof chatId !== 'string' && typeof chatId !== 'number')) {
          return NextResponse.json({
            success: false,
            error: 'El Chat ID es obligatorio.',
          }, { status: 400 });
        }

        setRuntimeChatId(String(chatId).trim());

        return NextResponse.json({
          success: true,
          message: `Chat ID ${chatId} guardado exitosamente (sesión actual). Para persistencia, configúralo en Vercel → Settings → Environment Variables.`,
        });
      }

      // ── Detect Chat ID automatically via getUpdates ──
      case 'detect_chat_id': {
        const botToken = getBotToken();
        if (!botToken) {
          return NextResponse.json({
            success: false,
            error: 'TELEGRAM_BOT_TOKEN no está configurado. Ingresa el token del bot primero.',
          }, { status: 400 });
        }

        try {
          const updatesUrl = `https://api.telegram.org/bot${botToken}/getUpdates`;
          const updatesRes = await fetch(updatesUrl, {
            signal: AbortSignal.timeout(15000),
          });

          if (!updatesRes.ok) {
            const errorText = await updatesRes.text().catch(() => 'unknown');
            return NextResponse.json({
              success: false,
              error: `El token del bot no es válido o Telegram respondió con error (${updatesRes.status}): ${errorText}`,
            }, { status: 400 });
          }

          const updatesData = await updatesRes.json();

          if (!updatesData.ok) {
            return NextResponse.json({
              success: false,
              error: `Telegram API error: ${updatesData.description || 'Error desconocido'}`,
            }, { status: 400 });
          }

          const updates = updatesData.result || [];

          if (updates.length === 0) {
            // Check if CHAT_ID is already configured via env vars — if so, detection is unnecessary
            const existingChatId = getChatId();
            if (existingChatId) {
              return NextResponse.json({
                success: true,
                detectedChats: [{ chatId: parseInt(existingChatId) || 0, type: 'private', firstName: 'Chat ya configurado' }],
                botUsername: '',
                totalUpdates: 0,
                message: 'El Chat ID ya está configurado. No es necesario detectarlo nuevamente.',
              });
            }

            return NextResponse.json({
              success: false,
              error: 'No se encontraron mensajes recientes al bot. Esto puede ocurrir si:',
              hints: [
                '1. No has enviado /start a tu bot — Abre Telegram, busca tu bot y envíale /start',
                '2. El bot tiene un webhook activo — Los updates se envían al webhook en vez de getUpdates',
                '3. Los updates fueron consumidos previamente — Los updates solo se leen una vez',
              ],
              alternative: 'Configura TELEGRAM_CHAT_ID directamente en Vercel → Settings → Environment Variables. El escaneo de canales funciona independientemente.',
            }, { status: 200 });
          }

          // Extract chat IDs from messages
          const chatIds = new Map<string, { chatId: number; type: string; title?: string; username?: string; firstName?: string }>();
          for (const update of updates) {
            const msg = update.message || update.my_chat_member || update.channel_post;
            if (msg?.chat) {
              const chat = msg.chat;
              const key = String(chat.id);
              if (!chatIds.has(key)) {
                chatIds.set(key, {
                  chatId: chat.id,
                  type: chat.type, // 'private', 'group', 'supergroup', 'channel'
                  title: chat.title,
                  username: chat.username,
                  firstName: chat.first_name,
                });
              }
            }
          }

          const detectedChats = Array.from(chatIds.values());

          // Also get bot info
          let botUsername = '';
          try {
            const meRes = await fetch(`https://api.telegram.org/bot${botToken}/getMe`, {
              signal: AbortSignal.timeout(10000),
            });
            if (meRes.ok) {
              const meData = await meRes.json();
              if (meData.ok) botUsername = meData.result.username || '';
            }
          } catch { /* ignore */ }

          return NextResponse.json({
            success: true,
            detectedChats,
            botUsername,
            totalUpdates: updates.length,
          });

        } catch (fetchError) {
          return NextResponse.json({
            success: false,
            error: `Error de conexión con Telegram API: ${fetchError instanceof Error ? fetchError.message : 'desconocido'}`,
          }, { status: 500 });
        }
      }

      // ── Verify bot token validity ──
      case 'verify_token': {
        const botToken = getBotToken();
        if (!botToken) {
          return NextResponse.json({
            success: false,
            error: 'TELEGRAM_BOT_TOKEN no está configurado.',
          }, { status: 400 });
        }

        try {
          const meRes = await fetch(`https://api.telegram.org/bot${botToken}/getMe`, {
            signal: AbortSignal.timeout(10000),
          });
          const meData = await meRes.json();

          if (!meData.ok) {
            return NextResponse.json({
              success: false,
              error: `Token inválido: ${meData.description || 'verifica que el token sea correcto'}`,
            }, { status: 400 });
          }

          return NextResponse.json({
            success: true,
            botInfo: {
              username: meData.result.username,
              firstName: meData.result.first_name,
              id: meData.result.id,
            },
          });
        } catch (fetchError) {
          return NextResponse.json({
            success: false,
            error: `Error de conexión: ${fetchError instanceof Error ? fetchError.message : 'desconocido'}`,
          }, { status: 500 });
        }
      }

      // ── Send test alert ──
      case 'test_alert': {
        if (!isConfigured()) {
          return NextResponse.json({
            success: false,
            error: 'Telegram no está completamente configurado. Se necesitan Bot Token y Chat ID.',
          }, { status: 400 });
        }
        const sent = await testTelegramAlert();
        return NextResponse.json({
          success: sent,
          message: sent ? 'Alerta de prueba enviada exitosamente' : 'No se pudo enviar la alerta de prueba',
        });
      }

      // ── Scan Telegram groups for keyword matches ──
      case 'scan_groups': {
        const keywords = getKeywords();
        if (keywords.length === 0) {
          return NextResponse.json({
            success: false,
            error: 'No hay palabras clave configuradas. Agrega palabras clave en la Lista Negra.',
          }, { status: 400 });
        }

        // ── Alert type with matched keyword info for highlighting ──
        const detectedAlerts: Array<{
          keyword: string;
          sourceType: string;
          sourceName: string;
          sourceUrl: string;
          messageText: string;
          chatType: string;
          timestamp: string;
          telegramSent: boolean;
          matchedKeyword: string;     // The exact keyword that matched (for highlighting)
          matchedContext: string;     // Context snippet around the match
          messageId?: string;         // Telegram message ID if available
        }> = [];

        let totalGroups = 0;
        let totalBotMessages = 0;
        let keywordsProcessed = 0;
        const discoveredChannels = new Set<string>(); // Dynamically discovered channel usernames

        // ── Normalize text: lowercase, remove accents, remove special chars ──
        function normalizeText(text: string): string {
          return text
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-z0-9\s]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
        }

        // ── Match keyword with normalization — returns the matched keyword or null ──
        function findMatchingKeyword(text: string): string | null {
          for (const kw of keywords) {
            if (normalizeText(text).includes(normalizeText(kw))) {
              return kw;
            }
          }
          return null;
        }

        // ── Extract context around keyword match with highlighted position ──
        function extractContext(text: string, kw: string, radius = 100): string {
          const normText = normalizeText(text);
          const normKw = normalizeText(kw);
          const idx = normText.indexOf(normKw);
          if (idx === -1) return text.substring(0, 250);
          const start = Math.max(0, idx - radius);
          const end = Math.min(text.length, idx + normKw.length + radius);
          return text.substring(start, end);
        }

        // ── Highlight keyword in text for display ──
        function highlightKeyword(text: string, kw: string): string {
          const normText = normalizeText(text);
          const normKw = normalizeText(kw);
          const idx = normText.indexOf(normKw);
          if (idx === -1) return text;
          // Map normalized index back to original text position
          // Use a simpler approach: find the keyword in original text with case-insensitive search
          const origIdx = text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').indexOf(normKw);
          if (origIdx === -1) return text;
          // Find the actual end in original text
          let endIdx = origIdx;
          let normLen = 0;
          while (endIdx < text.length && normLen < normKw.length) {
            const ch = text[endIdx].toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
            normLen += ch === '' ? 0 : (ch === ' ' && normKw[normLen] === ' ' ? 1 : ch.length);
            endIdx++;
          }
          return text.substring(0, origIdx) + '⟨' + text.substring(origIdx, endIdx) + '⟩' + text.substring(endIdx);
        }

        // ── Scrape a t.me/s/ channel preview page and extract messages ──
        async function scrapeChannelPreview(channelName: string): Promise<{
          exists: boolean;
          messages: Array<{ text: string; msgId?: string }>;
          channelTitle: string;
        }> {
          try {
            const previewUrl = `https://t.me/s/${channelName}`;
            const res = await fetch(previewUrl, {
              headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9',
                'Accept-Language': 'es-419,es;q=0.9,en;q=0.8',
                'Cache-Control': 'no-cache',
              },
              signal: AbortSignal.timeout(10000),
            });

            if (!res.ok) return { exists: false, messages: [], channelTitle: channelName };

            const html = await res.text();

            // Check for "Channel not found"
            if (html.includes('no such') || html.includes('not found') || html.includes('If you have Telegram')) {
              // Actually "If you have Telegram" means it exists but the page is a redirect —
              // check more carefully for actual not-found indicators
              if (html.includes('page_post_channel_title') === false && html.includes('tgme_channel_info') === false) {
                // Could be a private channel or not found — try to extract from body text
                const bodyText = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
                if (bodyText.includes('not found') || bodyText.includes('If you have')) {
                  // This is the standard "open in app" page, not necessarily "not found"
                  // Try to extract messages anyway
                }
              }
            }

            const messages: Array<{ text: string; msgId?: string }> = [];

            // Extract messages from tgme_widget_message_text divs
            const msgPattern = /class="tgme_widget_message_text"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/gi;
            let msgMatch;
            while ((msgMatch = msgPattern.exec(html)) !== null && messages.length < 30) {
              const msgHtml = msgMatch[1];
              const msgText = msgHtml
                .replace(/<br\s*\/?>/gi, '\n')
                .replace(/<\/?[a-zA-Z][^>]*>/g, '')
                .replace(/&amp;/g, '&')
                .replace(/&lt;/g, '<')
                .replace(/&gt;/g, '>')
                .replace(/&quot;/g, '"')
                .replace(/&#39;/g, "'")
                .replace(/&#(\d+);/g, (_, num) => String.fromCharCode(parseInt(num)))
                .trim();
              if (msgText.length > 3) {
                // Try to extract message ID from the surrounding HTML
                const surroundingHtml = html.substring(Math.max(0, msgMatch.index - 500), msgMatch.index);
                const idMatch = surroundingHtml.match(/data-post="[^\/]*\/(\d+)"/);
                messages.push({ text: msgText, msgId: idMatch?.[1] });
              }
            }

            // Fallback: try another pattern for message text
            if (messages.length === 0) {
              const fallbackPattern = /tgme_widget_message_text[^>]*>([\s\S]*?)<\/div>/gi;
              let fbMatch;
              while ((fbMatch = fallbackPattern.exec(html)) !== null && messages.length < 30) {
                const msgText = fbMatch[1]
                  .replace(/<br\s*\/?>/gi, '\n')
                  .replace(/<[^>]+>/g, '')
                  .replace(/&amp;/g, '&')
                  .replace(/&lt;/g, '<')
                  .replace(/&gt;/g, '>')
                  .replace(/&quot;/g, '"')
                  .replace(/&#39;/g, "'")
                  .trim();
                if (msgText.length > 3) {
                  messages.push({ text: msgText });
                }
              }
            }

            // Extract channel title
            let channelTitle = channelName;
            const titleMatch = html.match(/class="tgme_channel_info_header_title"[^>]*>([\s\S]*?)<\/span>/i)
              || html.match(/class="tgme_page_title"[^>]*>([\s\S]*?)<\/div>/i);
            if (titleMatch) {
              channelTitle = titleMatch[1].replace(/<[^>]+>/g, '').trim() || channelName;
            }

            return { exists: messages.length > 0, messages, channelTitle };
          } catch {
            return { exists: false, messages: [], channelTitle: channelName };
          }
        }

        // ── Helper: add alert with dedup + Telegram notification ──
        async function addDetectedAlert(params: {
          keyword: string;
          sourceType: string;
          sourceName: string;
          sourceUrl: string;
          messageText: string;
          chatType: string;
          matchedContext: string;
          messageId?: string;
        }) {
          const { keyword, sourceType, sourceName, sourceUrl, messageText, chatType, matchedContext, messageId } = params;

          // Deduplicate by keyword + messageText (more precise)
          const msgKey = normalizeText(messageText).substring(0, 100);
          const isDuplicate = detectedAlerts.some(
            a => normalizeText(a.keyword) === normalizeText(keyword) && normalizeText(a.messageText).substring(0, 100) === msgKey
          );
          if (isDuplicate) return;

          let telegramSent = false;
          if (isConfigured()) {
            try {
              const alert: TelegramAlert = {
                alertType: 'KEYWORD_MATCH',
                severity: 'high',
                timestamp: new Date().toISOString(),
                keyword,
                matchedContext: matchedContext || messageText.substring(0, 100),
                sourceType: sourceType as TelegramAlert['sourceType'],
                sourceId: sourceUrl,
                sourceName,
                sourceUsername: sourceUrl.match(/t\.me\/([a-zA-Z0-9_]+)/)?.[1],
                sourceUrl,
                subjectName: 'Escáner de Grupos',
                findingTitle: `Mención de "${keyword}" en ${sourceType} de Telegram`,
                findingDescription: messageText.substring(0, 500),
                findingCategory: 'telegram_group_scan',
                findingUrl: messageId ? `${sourceUrl}/${messageId}` : sourceUrl,
              };
              telegramSent = await sendTelegramAlert(alert);
            } catch { /* ignore */ }
          }

          detectedAlerts.push({
            keyword,
            sourceType,
            sourceName,
            sourceUrl: messageId ? `${sourceUrl}/${messageId}` : sourceUrl,
            messageText: messageText.substring(0, 800),
            chatType,
            timestamp: new Date().toISOString(),
            telegramSent,
            matchedKeyword: keyword,
            matchedContext: matchedContext || messageText.substring(0, 150),
            messageId,
          });

          addAlertHistoryEntry({
            keyword,
            sourceType,
            sourceName,
            timestamp: new Date().toISOString(),
            telegramSent,
          });
        }

        try {
          const botToken = getBotToken();

          // ═══════════════════════════════════════════════════════════════
          //  PHASE 1: Z.ai Web Search — Discover Telegram channels by keyword
          //  Search for each keyword, extract channel usernames from results,
          //  then scrape those channels' preview pages for actual messages
          // ═══════════════════════════════════════════════════════════════
          console.log('[ScanGroups] Phase 1: Z.ai web search to discover Telegram channels...');

          let zaiAvailable = false;
          try {
            const ZAI = (await import('z-ai-web-dev-sdk')).default;
            const zai = await ZAI.create();
            zaiAvailable = true;

            const MAX_KEYWORDS_SEARCH = Math.min(keywords.length, 20);
            const keywordsToSearch = keywords.slice(0, MAX_KEYWORDS_SEARCH);

            for (const keyword of keywordsToSearch) {
              keywordsProcessed++;
              try {
                // Multiple search query variants for better coverage
                const searchQueries = [
                  `telegram ${keyword} estafa fraude colombia`,
                  `t.me ${keyword} fraude`,
                  `telegram canal ${keyword}`,
                  `${keyword} estafa telegram grupo`,
                ];

                for (const searchQuery of searchQueries) {
                  try {
                    const searchResults = await zai.functions.invoke('web_search', {
                      query: searchQuery,
                      num: 15,
                    });

                    if (!Array.isArray(searchResults) || searchResults.length === 0) continue;

                    for (const result of searchResults) {
                      const resultUrl: string = result.url || result.link || '';
                      const resultName: string = result.name || result.title || '';
                      const resultSnippet: string = result.snippet || result.content || '';

                      // Extract Telegram channel/group usernames from URLs
                      const tmeMatch = resultUrl.match(/(?:t\.me|telegram\.me)\/([a-zA-Z0-9_]{5,32})/);
                      if (tmeMatch) {
                        const rawUsername = tmeMatch[1];
                        const skipPaths = ['s', 'login', 'joinchat', 'addstickers', 'proxy', 'iv', 'confirmphone', 'setlanguage'];
                        if (!skipPaths.includes(rawUsername.toLowerCase())) {
                          discoveredChannels.add(rawUsername);
                        }
                      }

                      // Also check snippets for t.me/username patterns
                      const snippetMatches = resultSnippet.match(/t\.me\/([a-zA-Z0-9_]{5,32})/g);
                      if (snippetMatches) {
                        for (const m of snippetMatches) {
                          const username = m.replace('t.me/', '');
                          const skipPaths = ['s', 'login', 'joinchat', 'addstickers', 'proxy', 'iv'];
                          if (!skipPaths.includes(username.toLowerCase())) {
                            discoveredChannels.add(username);
                          }
                        }
                      }

                      // Also check for @username patterns
                      const atMatches = resultSnippet.match(/@([a-zA-Z0-9_]{5,32})/g);
                      if (atMatches) {
                        for (const m of atMatches) {
                          const username = m.replace('@', '');
                          discoveredChannels.add(username);
                        }
                      }

                      // If the search result itself mentions the keyword and is Telegram-related,
                      // also create a direct alert from the search snippet
                      const isTme = resultUrl.includes('t.me') || resultUrl.includes('telegram.me');
                      const mentionsTelegram = resultName.toLowerCase().includes('telegram') ||
                        resultSnippet.toLowerCase().includes('telegram') ||
                        resultSnippet.toLowerCase().includes('t.me');

                      if ((isTme || mentionsTelegram) && normalizeText(`${resultName} ${resultSnippet}`).includes(normalizeText(keyword))) {
                        const tmeUrlMatch = resultUrl.match(/(?:t\.me|telegram\.me)\/([a-zA-Z0-9_]{5,32})/);
                        const cleanUsername = tmeUrlMatch?.[1];

                        let sourceType = 'channel';
                        const textLower = `${resultName} ${resultSnippet}`.toLowerCase();
                        if (textLower.includes('grupo') || textLower.includes('group') || textLower.includes('chat')) {
                          sourceType = 'group';
                        }

                        const sourceName = resultName || (cleanUsername ? `@${cleanUsername}` : 'Telegram');
                        const sourceUrl = cleanUsername ? `https://t.me/${cleanUsername}` : resultUrl;

                        await addDetectedAlert({
                          keyword,
                          sourceType,
                          sourceName,
                          sourceUrl,
                          messageText: resultSnippet || resultName,
                          chatType: sourceType,
                          matchedContext: extractContext(`${resultName} ${resultSnippet}`, keyword),
                        });
                      }
                    }
                  } catch {
                    // Search query failed, try next variant
                  }
                }
              } catch (kwErr) {
                console.warn(`[ScanGroups] Search failed for keyword "${keyword}":`, kwErr instanceof Error ? kwErr.message : 'unknown');
              }
            }
          } catch (zaiErr) {
            console.warn('[ScanGroups] Z.ai SDK search failed:', zaiErr instanceof Error ? zaiErr.message : 'unknown');
          }

          // ═══════════════════════════════════════════════════════════════
          //  PHASE 2: Scrape discovered + known channel previews
          //  Use t.me/s/{channel} to get actual messages from public channels
          // ═══════════════════════════════════════════════════════════════

          // Known fraud-related channels (as a baseline — dynamically discovered channels are added too)
          const KNOWN_CHANNELS = [
            'cibestfraude', 'cibest_fraude', 'bancolombiaphishing', 'nequifraude',
            'estafasbancolombia', 'cuentasbancolombia', 'binsbancolombia',
            'ccsbancolombia', 'fraudecolombiano', 'estafascolombia',
            'cibest_alertas', 'bancolombia_estafa', 'nequi_estafa',
            'bancolombia_cc', 'fullzbancolombia', 'dumbancolombia',
            'combobancolombia', 'basebancolombia', 'logsbancolombia',
            'bancolombiamod', 'nequimod', 'wompi_cashout',
            'cuentasmulas', 'cuentasreceptoras', 'panelbancolombia',
            'fraudebancario', 'estafas_nequi', 'phishingbancolombia',
            'davivienda_estafa', 'bbva_estafa', 'colpatria_fraude',
          ];

          // Merge discovered channels with known ones (discovered channels first = higher priority)
          const allChannels = [...discoveredChannels, ...KNOWN_CHANNELS.filter(c => !discoveredChannels.has(c))];
          console.log(`[ScanGroups] Phase 2: Scraping ${allChannels.length} channel previews (${discoveredChannels.size} discovered + ${KNOWN_CHANNELS.length} known)...`);

          // Scrape up to 20 channels in parallel (respecting Vercel 60s limit)
          const channelsToScrape = allChannels.slice(0, 20);
          const channelResults = await Promise.allSettled(
            channelsToScrape.map(async (channelName) => {
              const result = await scrapeChannelPreview(channelName);
              return { channelName, ...result };
            })
          );

          // Process channel results for keyword matches
          for (const result of channelResults) {
            if (result.status !== 'fulfilled') continue;
            const { channelName, exists, messages, channelTitle } = result.value;

            if (!exists || messages.length === 0) continue;

            totalGroups++;

            // Check each message for keyword matches
            for (const msg of messages) {
              const matchedKw = findMatchingKeyword(msg.text);
              if (matchedKw) {
                const sourceName = channelTitle || `@${channelName}`;
                const sourceUrl = `https://t.me/${channelName}`;

                await addDetectedAlert({
                  keyword: matchedKw,
                  sourceType: 'channel',
                  sourceName,
                  sourceUrl,
                  messageText: msg.text.substring(0, 800),
                  chatType: 'channel',
                  matchedContext: extractContext(msg.text, matchedKw),
                  messageId: msg.msgId,
                });
              }
            }
          }

          // ═══════════════════════════════════════════════════════════════
          //  PHASE 3: Bot polling — messages from groups the bot is a member of
          // ═══════════════════════════════════════════════════════════════
          if (botToken) {
            try {
              // Delete webhook first to allow getUpdates to work
              try {
                await fetch(`https://api.telegram.org/bot${botToken}/deleteWebhook`, {
                  method: 'POST',
                  signal: AbortSignal.timeout(5000),
                });
              } catch { /* ignore */ }

              const updatesUrl = `https://api.telegram.org/bot${botToken}/getUpdates?limit=100`;
              const updatesRes = await fetch(updatesUrl, {
                signal: AbortSignal.timeout(15000),
              });

              if (updatesRes.ok) {
                const updatesData = await updatesRes.json();
                if (updatesData.ok && Array.isArray(updatesData.result)) {
                  const updates = updatesData.result;
                  const groupsFound = new Map<string, { id: number; type: string; title?: string; username?: string }>();

                  for (const update of updates) {
                    const msg = update.message || update.channel_post || update.my_chat_member;
                    if (msg?.chat) {
                      const chat = msg.chat;
                      if (chat.type === 'group' || chat.type === 'supergroup' || chat.type === 'channel') {
                        const key = String(chat.id);
                        if (!groupsFound.has(key)) {
                          groupsFound.set(key, {
                            id: chat.id,
                            type: chat.type,
                            title: chat.title,
                            username: chat.username,
                          });
                        }
                      }

                      const messageText = msg.text || msg.caption || '';
                      if (messageText) {
                        if (chat.type === 'private' && msg.from?.is_bot) {
                          totalBotMessages++;
                        }

                        // Check ALL keywords (normalized)
                        for (const keyword of keywords) {
                          if (normalizeText(messageText).includes(normalizeText(keyword))) {
                            const chatType = chat.type === 'supergroup' ? 'group' : chat.type;
                            const sourceName = chat.title || chat.username || chat.first_name || `Chat ${chat.id}`;
                            const sourceUrl = chat.username ? `https://t.me/${chat.username}` : '';

                            await addDetectedAlert({
                              keyword,
                              sourceType: chatType,
                              sourceName,
                              sourceUrl,
                              messageText: messageText.substring(0, 800),
                              chatType: chat.type,
                              matchedContext: extractContext(messageText, keyword),
                              messageId: msg.message_id?.toString(),
                            });
                          }
                        }
                      }
                    }
                  }

                  totalGroups += groupsFound.size;
                }
              }
            } catch (botErr) {
              console.warn('[ScanGroups] Bot polling failed:', botErr instanceof Error ? botErr.message : 'unknown');
            }
          }

          keywordsProcessed = Math.max(keywordsProcessed, keywords.length);

          // Get updated alert history
          const updatedAlertHistory = getAlertHistory();

          console.log(`[ScanGroups] Scan complete: ${detectedAlerts.length} alerts, ${totalGroups} groups, ${keywordsProcessed}/${keywords.length} keywords processed, ${discoveredChannels.size} channels discovered`);

          return NextResponse.json({
            success: true,
            totalGroups,
            totalBotMessages,
            keywordsProcessed,
            totalKeywords: keywords.length,
            maxKeywordsPerScan: keywords.length,
            detectedAlerts,
            channelsDiscovered: discoveredChannels.size,
            channelsScraped: channelsToScrape.length,
            zaiSearchUsed: zaiAvailable,
            alertHistory: updatedAlertHistory.slice(0, 10),
          });

        } catch (fetchError) {
          return NextResponse.json({
            success: false,
            error: `Error de conexión: ${fetchError instanceof Error ? fetchError.message : 'desconocido'}`,
          }, { status: 500 });
        }
      }

      default:
        return NextResponse.json({
          error: `Acción desconocida: "${action}". Acciones válidas: save_bot_token, save_chat_id, detect_chat_id, verify_token, test_alert, scan_groups`,
        }, { status: 400 });
    }
  } catch (error) {
    console.error('[Telegram API] Error:', error);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
