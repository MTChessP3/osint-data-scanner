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
          matchedKeyword: string;
          matchedContext: string;
          messageId?: string;
        }> = [];

        let totalGroups = 0;
        let totalBotMessages = 0;
        let keywordsProcessed = 0;
        const discoveredChannels = new Set<string>();
        const scanDiagnostics: Array<{ phase: string; status: string; details: string }> = [];

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

        // ── Extract context around keyword match ──
        function extractContext(text: string, kw: string, radius = 120): string {
          const normText = normalizeText(text);
          const normKw = normalizeText(kw);
          const idx = normText.indexOf(normKw);
          if (idx === -1) return text.substring(0, 300);
          const start = Math.max(0, idx - radius);
          const end = Math.min(text.length, idx + normKw.length + radius);
          return text.substring(start, end);
        }

        // ── Exponential backoff delay ──
        function backoffDelay(attempt: number, baseMs = 500): Promise<void> {
          const delay = Math.min(baseMs * Math.pow(2, attempt), 8000);
          return new Promise(resolve => setTimeout(resolve, delay));
        }

        // ── Scrape a t.me/s/ channel preview page and extract messages ──
        async function scrapeChannelPreview(channelName: string): Promise<{
          exists: boolean;
          messages: Array<{ text: string; msgId?: string }>;
          channelTitle: string;
          subscriberCount?: number;
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
              signal: AbortSignal.timeout(12000),
            });

            if (!res.ok) {
              console.log(`[scrapeChannelPreview] ${channelName} returned HTTP ${res.status}`);
              return { exists: false, messages: [], channelTitle: channelName };
            }

            const html = await res.text();

            // Check for actual "channel not found" page — distinguish from "open in app" page
            // A real channel page will have tgme_widget_message_text classes
            // A not-found page will have different structure
            const hasMessages = html.includes('tgme_widget_message_text');
            const hasChannelInfo = html.includes('tgme_channel_info') || html.includes('tgme_page_title');

            if (!hasMessages && !hasChannelInfo) {
              return { exists: false, messages: [], channelTitle: channelName };
            }

            const messages: Array<{ text: string; msgId?: string }> = [];

            // Extract messages from tgme_widget_message_text divs — try multiple patterns
            // Pattern 1: Full message text div
            const msgPattern1 = /class="tgme_widget_message_text"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/gi;
            let msgMatch;
            while ((msgMatch = msgPattern1.exec(html)) !== null && messages.length < 30) {
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
                const surroundingHtml = html.substring(Math.max(0, msgMatch.index - 500), msgMatch.index);
                const idMatch = surroundingHtml.match(/data-post="[^\/]*\/(\d+)"/);
                messages.push({ text: msgText, msgId: idMatch?.[1] });
              }
            }

            // Pattern 2: Simpler fallback
            if (messages.length === 0) {
              const msgPattern2 = /tgme_widget_message_text[^>]*>([\s\S]*?)<\/div>/gi;
              let fbMatch;
              while ((fbMatch = msgPattern2.exec(html)) !== null && messages.length < 30) {
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

            // Extract subscriber count
            let subscriberCount: number | undefined;
            const subMatch = html.match(/tgme_channel_info_header_counter[^>]*>([\s\S]*?)<\/div>/i);
            if (subMatch) {
              const subText = subMatch[1].replace(/<[^>]+>/g, '').trim();
              const numMatch = subText.match(/(\d[\d,.\s]*)/);
              if (numMatch) {
                subscriberCount = parseInt(numMatch[1].replace(/[,\s]/g, ''));
              }
            }

            return { exists: messages.length > 0, messages, channelTitle, subscriberCount };
          } catch (err) {
            console.log(`[scrapeChannelPreview] ${channelName} error: ${err instanceof Error ? err.message : 'unknown'}`);
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
          //  PHASE 0: Validate connections
          // ═══════════════════════════════════════════════════════════════
          let zaiAvailable = false;
          let zaiError = '';
          let botApiOk = false;
          let botApiError = '';

          // Validate Z.ai SDK
          try {
            const ZAI = (await import('z-ai-web-dev-sdk')).default;
            const zai = await ZAI.create();
            zaiAvailable = true;
            // Test with a quick search
            const testResult = await zai.functions.invoke('web_search', { query: 'test', num: 1 });
            if (!Array.isArray(testResult)) {
              zaiAvailable = false;
              zaiError = 'Z.ai web_search returned non-array response';
            }
          } catch (err) {
            zaiError = err instanceof Error ? err.message : 'SDK import/init failed';
            console.warn('[ScanGroups] Z.ai SDK validation failed:', zaiError);
          }

          // Validate Telegram Bot API
          if (botToken) {
            try {
              const meRes = await fetch(`https://api.telegram.org/bot${botToken}/getMe`, {
                signal: AbortSignal.timeout(10000),
              });
              const meData = await meRes.json();
              if (meData.ok) {
                botApiOk = true;
              } else {
                botApiError = meData.description || 'Bot token invalid';
              }
            } catch (err) {
              botApiError = err instanceof Error ? err.message : 'Connection failed';
            }
          }

          scanDiagnostics.push({
            phase: 'validation',
            status: zaiAvailable ? 'ok' : 'error',
            details: `Z.ai: ${zaiAvailable ? 'OK' : `ERROR: ${zaiError}`}. Bot API: ${!botToken ? 'no token' : botApiOk ? 'OK' : `ERROR: ${botApiError}`}`,
          });

          // ═══════════════════════════════════════════════════════════════
          //  PHASE 1: Z.ai Web Search — Discover Telegram channels by keyword
          // ═══════════════════════════════════════════════════════════════
          let phase1ResultsCount = 0;
          let phase1Errors = 0;

          if (zaiAvailable) {
            console.log('[ScanGroups] Phase 1: Z.ai web search to discover Telegram channels...');
            try {
              const ZAI = (await import('z-ai-web-dev-sdk')).default;
              const zai = await ZAI.create();

              const MAX_KEYWORDS_SEARCH = Math.min(keywords.length, 30);
              const keywordsToSearch = keywords.slice(0, MAX_KEYWORDS_SEARCH);

              for (let ki = 0; ki < keywordsToSearch.length; ki++) {
                const keyword = keywordsToSearch[ki];
                keywordsProcessed++;

                // Exponential backoff between keywords to avoid rate limiting
                if (ki > 0) await backoffDelay(Math.min(ki, 4), 300);

                try {
                  // Search with multiple query variants — including the keyword alone
                  const searchQueries = [
                    `telegram ${keyword}`,
                    `site:t.me ${keyword}`,
                    `t.me ${keyword} estafa fraude`,
                    `"${keyword}" telegram canal grupo`,
                    `${keyword} colombia telegram`,
                  ];

                  for (let qi = 0; qi < searchQueries.length; qi++) {
                    const searchQuery = searchQueries[qi];
                    try {
                      // Backoff between search queries
                      if (qi > 0) await backoffDelay(qi, 200);

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

                        // If the search result mentions the keyword and is Telegram-related, create alert
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
                          phase1ResultsCount++;
                        }
                      }
                    } catch (searchErr) {
                      phase1Errors++;
                      console.warn(`[ScanGroups] Search query "${searchQuery}" failed:`, searchErr instanceof Error ? searchErr.message : 'unknown');
                      // Apply backoff on error
                      await backoffDelay(phase1Errors, 1000);
                    }
                  }
                } catch (kwErr) {
                  phase1Errors++;
                  console.warn(`[ScanGroups] Keyword "${keyword}" search failed:`, kwErr instanceof Error ? kwErr.message : 'unknown');
                }
              }
            } catch (zaiErr) {
              phase1Errors++;
              console.warn('[ScanGroups] Z.ai SDK search failed:', zaiErr instanceof Error ? zaiErr.message : 'unknown');
            }
          }

          scanDiagnostics.push({
            phase: 'phase1_web_search',
            status: zaiAvailable ? (phase1Errors === 0 ? 'ok' : 'partial') : 'skipped',
            details: `${keywordsProcessed} keywords searched, ${discoveredChannels.size} channels discovered, ${phase1ResultsCount} direct alerts, ${phase1Errors} errors. Z.ai: ${zaiAvailable ? 'available' : `unavailable (${zaiError})`}`,
          });

          // ═══════════════════════════════════════════════════════════════
          //  PHASE 2: Scrape discovered + known channel previews
          // ═══════════════════════════════════════════════════════════════

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
            'bancolombiacuentas', 'nequicuentas', 'cibestcol',
            'grupo_cibest', 'cibestcompras', 'cibestventa',
            'fullzcolombia', 'daviviendaphishing', 'bbvafraude',
            'colpatria_estafa', 'bogotafraude', 'medellinfraude',
            'cali_estafa', 'colombia_phishing', 'bancolombia_logins',
            'nequi_phishing', 'wompi_fraude', 'addi_fraude',
            'bancolombia_datos', 'cuentasnequi', 'basenequi',
          ];

          // Merge discovered channels with known ones (discovered first = higher priority)
          const allChannels = [...discoveredChannels, ...KNOWN_CHANNELS.filter(c => !discoveredChannels.has(c))];
          console.log(`[ScanGroups] Phase 2: Scraping ${allChannels.length} channel previews (${discoveredChannels.size} discovered + ${KNOWN_CHANNELS.length} known)...`);

          // Scrape in batches to stay within Vercel function timeout
          const BATCH_SIZE = 10;
          let channelsScraped = 0;
          let channelsWithMessages = 0;
          let phase2Alerts = 0;
          const scrapeErrors: string[] = [];

          for (let batchStart = 0; batchStart < allChannels.length && batchStart < 50; batchStart += BATCH_SIZE) {
            const batch = allChannels.slice(batchStart, batchStart + BATCH_SIZE);

            const batchResults = await Promise.allSettled(
              batch.map(async (channelName) => {
                const result = await scrapeChannelPreview(channelName);
                return { channelName, ...result };
              })
            );

            for (const result of batchResults) {
              channelsScraped++;
              if (result.status !== 'fulfilled') {
                scrapeErrors.push(`${batch[batchResults.indexOf(result)]}: rejected`);
                continue;
              }
              const { channelName, exists, messages, channelTitle } = result.value;

              if (!exists || messages.length === 0) continue;

              channelsWithMessages++;
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
                  phase2Alerts++;
                }
              }
            }

            // Small delay between batches to avoid overwhelming t.me
            if (batchStart + BATCH_SIZE < allChannels.length) {
              await new Promise(resolve => setTimeout(resolve, 300));
            }
          }

          scanDiagnostics.push({
            phase: 'phase2_channel_scraping',
            status: channelsWithMessages > 0 ? 'ok' : (channelsScraped > 0 ? 'no_matches' : 'error'),
            details: `${channelsScraped} channels scraped, ${channelsWithMessages} with messages, ${phase2Alerts} keyword matches. ${scrapeErrors.length} errors: ${scrapeErrors.slice(0, 3).join('; ')}`,
          });

          // ═══════════════════════════════════════════════════════════════
          //  PHASE 3: Bot polling — messages from groups the bot is a member of
          // ═══════════════════════════════════════════════════════════════
          let phase3Groups = 0;
          let phase3Alerts = 0;

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
                            phase3Alerts++;
                          }
                        }
                      }
                    }
                  }

                  phase3Groups = groupsFound.size;
                  totalGroups += groupsFound.size;
                }
              }
            } catch (botErr) {
              console.warn('[ScanGroups] Bot polling failed:', botErr instanceof Error ? botErr.message : 'unknown');
            }
          }

          scanDiagnostics.push({
            phase: 'phase3_bot_polling',
            status: botToken ? (phase3Groups > 0 ? 'ok' : 'no_groups') : 'no_token',
            details: `${phase3Groups} groups found, ${phase3Alerts} keyword matches. Bot API: ${!botToken ? 'no token' : botApiOk ? 'OK' : botApiError}`,
          });

          keywordsProcessed = Math.max(keywordsProcessed, keywords.length);

          // Get updated alert history
          const updatedAlertHistory = getAlertHistory();

          console.log(`[ScanGroups] Scan complete: ${detectedAlerts.length} alerts, ${totalGroups} groups, ${keywordsProcessed}/${keywords.length} keywords, ${discoveredChannels.size} discovered, ${channelsScraped} scraped`);

          // Determine if the scan had technical issues that prevented results
          const hasTechnicalIssues = !zaiAvailable || (channelsScraped === 0 && !botToken);
          const responseStatus = hasTechnicalIssues && detectedAlerts.length === 0 ? 503 : 200;

          const responseBody: Record<string, unknown> = {
            success: true,
            totalGroups,
            totalBotMessages,
            keywordsProcessed,
            totalKeywords: keywords.length,
            maxKeywordsPerScan: keywords.length,
            detectedAlerts,
            channelsDiscovered: discoveredChannels.size,
            channelsScraped,
            channelsWithMessages,
            zaiSearchUsed: zaiAvailable,
            diagnostics: scanDiagnostics,
            alertHistory: updatedAlertHistory.slice(0, 10),
          };

          if (hasTechnicalIssues && detectedAlerts.length === 0) {
            responseBody.success = false;
            responseBody.error = 'No se pudieron obtener resultados debido a problemas técnicos. Revisa los diagnósticos para más detalles.';
            (responseBody as Record<string, unknown>).technicalIssues = true;
          }

          return NextResponse.json(responseBody, { status: responseStatus });

        } catch (fetchError) {
          console.error('[ScanGroups] Fatal error:', fetchError);
          return NextResponse.json({
            success: false,
            error: `Error de conexión: ${fetchError instanceof Error ? fetchError.message : 'desconocido'}`,
            diagnostics: scanDiagnostics,
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
