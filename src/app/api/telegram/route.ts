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

        const detectedAlerts: Array<{
          keyword: string;
          sourceType: string;
          sourceName: string;
          sourceUrl: string;
          messageText: string;
          chatType: string;
          timestamp: string;
          telegramSent: boolean;
        }> = [];

        let totalGroups = 0;
        let totalBotMessages = 0;
        let keywordsProcessed = 0;

        // ── Normalize text: lowercase, remove accents, remove special chars ──
        function normalizeText(text: string): string {
          return text
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '') // remove accents
            .replace(/[^a-z0-9\s]/g, ' ')    // remove special chars
            .replace(/\s+/g, ' ')
            .trim();
        }

        // ── Match keyword with normalization ──
        function matchKeywordNormalized(text: string, kw: string): boolean {
          const normText = normalizeText(text);
          const normKw = normalizeText(kw);
          return normText.includes(normKw);
        }

        // ── Extract context around keyword match ──
        function extractContext(text: string, kw: string, radius = 80): string {
          const normText = normalizeText(text);
          const normKw = normalizeText(kw);
          const idx = normText.indexOf(normKw);
          if (idx === -1) return text.substring(0, 200);
          const start = Math.max(0, idx - radius);
          const end = Math.min(text.length, idx + normKw.length + radius);
          return text.substring(start, end);
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
        }) {
          const { keyword, sourceType, sourceName, sourceUrl, messageText, chatType, matchedContext } = params;

          // Deduplicate
          const isDuplicate = detectedAlerts.some(
            a => normalizeText(a.keyword) === normalizeText(keyword) && normalizeText(a.sourceName) === normalizeText(sourceName)
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
                findingUrl: sourceUrl,
              };
              telegramSent = await sendTelegramAlert(alert);
            } catch { /* ignore */ }
          }

          detectedAlerts.push({
            keyword,
            sourceType,
            sourceName,
            sourceUrl,
            messageText: messageText.substring(0, 500),
            chatType,
            timestamp: new Date().toISOString(),
            telegramSent,
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

          // ═══════════════════════════════════════════════
          //  METHOD 1: Z.ai Web Search — search for keywords on Telegram
          //  Uses the Z.ai SDK which WORKS from Vercel serverless
          // ═══════════════════════════════════════════════
          console.log('[ScanGroups] Starting Z.ai web search for keywords...');

          try {
            const ZAI = (await import('z-ai-web-dev-sdk')).default;
            const zai = await ZAI.create();

            // Search for each keyword (up to 15 per scan)
            const MAX_KEYWORDS_SEARCH = 15;
            const keywordsToSearch = keywords.slice(0, MAX_KEYWORDS_SEARCH);

            for (const keyword of keywordsToSearch) {
              keywordsProcessed++;
              try {
                // Search with multiple query variants for better coverage
                const searchQueries = [
                  `site:t.me ${keyword}`,
                  `telegram ${keyword} estafa fraude`,
                  `t.me ${keyword}`,
                ];

                for (const searchQuery of searchQueries) {
                  try {
                    const searchResults = await zai.functions.invoke('web_search', {
                      query: searchQuery,
                      num: 10,
                    });

                    if (!Array.isArray(searchResults) || searchResults.length === 0) continue;

                    for (const result of searchResults) {
                      const resultUrl: string = result.url || result.link || '';
                      const resultName: string = result.name || result.title || '';
                      const resultSnippet: string = result.snippet || result.content || '';

                      // Must be a Telegram link or mention Telegram
                      const isTme = resultUrl.includes('t.me') || resultUrl.includes('telegram.me');
                      const mentionsTelegram = resultName.toLowerCase().includes('telegram') ||
                        resultSnippet.toLowerCase().includes('telegram') ||
                        resultName.toLowerCase().includes('t.me');

                      if (!isTme && !mentionsTelegram) continue;

                      // Must contain the keyword (normalized match)
                      const combinedText = `${resultName} ${resultSnippet}`;
                      if (!matchKeywordNormalized(combinedText, keyword)) continue;

                      // Extract Telegram entity info from URL
                      const tmeMatch = resultUrl.match(/(?:t\.me|telegram\.me)\/([a-zA-Z0-9_]{5,32})/);
                      const rawUsername = tmeMatch ? tmeMatch[1] : undefined;
                      const skipPaths = ['s', 'login', 'joinchat', 'addstickers', 'proxy', 'iv'];
                      const cleanUsername = rawUsername && !skipPaths.includes(rawUsername.toLowerCase()) ? rawUsername : undefined;

                      // Determine source type
                      let sourceType = 'channel';
                      const textLower = combinedText.toLowerCase();
                      if (textLower.includes('grupo') || textLower.includes('group') || textLower.includes('chat')) {
                        sourceType = 'group';
                      } else if (textLower.includes('bot')) {
                        sourceType = 'bot';
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
                        matchedContext: extractContext(combinedText, keyword),
                      });
                    }

                    // If we already found results for this keyword from one query, skip the rest
                    if (detectedAlerts.some(a => normalizeText(a.keyword) === normalizeText(keyword))) break;
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

          // ═══════════════════════════════════════════════
          //  METHOD 2: t.me/s/{channel} — Scrape public channel previews
          //  Known Telegram channels/groups that discuss fraud/phishing
          //  These pages are publicly accessible without authentication
          // ═══════════════════════════════════════════════
          const KNOWN_CHANNELS = [
            'cibestfraude', 'cibest_fraude', 'bancolombiaphishing', 'nequifraude',
            'estafasbancolombia', 'cuentasbancolombia', 'binsbancolombia',
            'ccsbancolombia', 'fraudecolombiano', 'estafascolombia',
            'cibest_alertas', 'bancolombia_estafa', 'nequi_estafa',
            'bancolombia_cc', 'fullzbancolombia', 'dumbancolombia',
            'combobancolombia', 'basebancolombia', 'logsbancolombia',
            'bancolombiamod', 'nequimod', 'wompi_cashout',
            'cuentasmulas', 'cuentasreceptoras', 'panelbancolombia',
          ];

          console.log(`[ScanGroups] Scraping ${KNOWN_CHANNELS.length} known Telegram channel previews...`);

          // Scrape up to 12 channels in parallel (to stay within Vercel 60s limit)
          const channelsToScrape = KNOWN_CHANNELS.slice(0, 12);
          const channelResults = await Promise.allSettled(
            channelsToScrape.map(async (channelName) => {
              try {
                const previewUrl = `https://t.me/s/${channelName}`;
                const res = await fetch(previewUrl, {
                  headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml',
                    'Accept-Language': 'es,en;q=0.9',
                  },
                  signal: AbortSignal.timeout(8000),
                });

                if (!res.ok) return { channelName, exists: false, messages: [] as string[] };

                const html = await res.text();

                // Check if channel exists (has messages)
                // t.me/s/ pages contain messages in div.message div or similar
                // Extract message text from the preview page
                const messages: string[] = [];

                // Method 1: Extract from data-post attributes (standard t.me preview)
                const msgPattern = /class="tgme_widget_message_text"[^>]*>([\s\S]*?)<\/div>/gi;
                let msgMatch;
                while ((msgMatch = msgPattern.exec(html)) !== null && messages.length < 20) {
                  const msgText = msgMatch[1]
                    .replace(/<br\s*\/?>/gi, '\n')
                    .replace(/<[^>]+>/g, '')
                    .replace(/&amp;/g, '&')
                    .replace(/&lt;/g, '<')
                    .replace(/&gt;/g, '>')
                    .replace(/&quot;/g, '"')
                    .replace(/&#39;/g, "'")
                    .replace(/<\/?[^>]+(>|$)/g, '')
                    .trim();
                  if (msgText.length > 5) messages.push(msgText);
                }

                // Method 2: If no structured messages found, extract from broader text blocks
                if (messages.length === 0) {
                  // Try extracting from the full page text
                  const bodyText = html
                    .replace(/<script[\s\S]*?<\/script>/gi, '')
                    .replace(/<style[\s\S]*?<\/style>/gi, '')
                    .replace(/<[^>]+>/g, ' ')
                    .replace(/\s+/g, ' ')
                    .trim();

                  // Check for "Channel not found" indicators
                  if (bodyText.includes('no such') || bodyText.includes('not found') || bodyText.includes('If you have')) {
                    return { channelName, exists: false, messages: [] };
                  }

                  // Try to extract meaningful text blocks
                  if (bodyText.length > 100) {
                    messages.push(bodyText.substring(0, 2000));
                  }
                }

                // Extract channel title
                const titleMatch = html.match(/class="tgme_channel_info_header_title"[^>]*>([\s\S]*?)<\/span>/i)
                  || html.match(/class="tgme_page_title"[^>]*>([\s\S]*?)<\/div>/i)
                  || html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
                const channelTitle = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, '').trim() : channelName;

                return { channelName, exists: messages.length > 0, messages, channelTitle };
              } catch {
                return { channelName, exists: false, messages: [] as string[] };
              }
            })
          );

          // Process channel results for keyword matches
          for (const result of channelResults) {
            if (result.status !== 'fulfilled') continue;
            const { channelName, exists, messages, channelTitle } = result.value;

            if (!exists || messages.length === 0) continue;

            totalGroups++;

            // Check each message for keyword matches
            for (const msgText of messages) {
              for (const keyword of keywords) {
                if (matchKeywordNormalized(msgText, keyword)) {
                  const sourceName = channelTitle || `@${channelName}`;
                  const sourceUrl = `https://t.me/${channelName}`;

                  await addDetectedAlert({
                    keyword,
                    sourceType: 'channel',
                    sourceName,
                    sourceUrl,
                    messageText: msgText.substring(0, 500),
                    chatType: 'channel',
                    matchedContext: extractContext(msgText, keyword),
                  });
                }
              }
            }
          }

          // ═══════════════════════════════════════════════
          //  METHOD 3: Bot polling — messages from groups the bot is a member of
          // ═══════════════════════════════════════════════
          if (botToken) {
            try {
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
                          if (matchKeywordNormalized(messageText, keyword)) {
                            const chatType = chat.type === 'supergroup' ? 'group' : chat.type;
                            const sourceName = chat.title || chat.username || chat.first_name || `Chat ${chat.id}`;
                            const sourceUrl = chat.username ? `https://t.me/${chat.username}` : '';

                            await addDetectedAlert({
                              keyword,
                              sourceType: chatType,
                              sourceName,
                              sourceUrl,
                              messageText: messageText.substring(0, 500),
                              chatType: chat.type,
                              matchedContext: extractContext(messageText, keyword),
                            });
                          }
                        }
                      }
                    }
                  }

                  totalGroups += groupsFound.size;
                  keywordsProcessed = Math.max(keywordsProcessed, keywords.length);
                }
              }
            } catch (botErr) {
              console.warn('[ScanGroups] Bot polling failed:', botErr instanceof Error ? botErr.message : 'unknown');
            }
          }

          // Get updated alert history
          const updatedAlertHistory = getAlertHistory();

          return NextResponse.json({
            success: true,
            totalGroups,
            totalBotMessages,
            keywordsProcessed: Math.max(keywordsProcessed, keywords.length),
            totalKeywords: keywords.length,
            maxKeywordsPerScan: keywords.length,
            detectedAlerts,
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
