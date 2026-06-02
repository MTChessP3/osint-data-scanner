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
            return NextResponse.json({
              success: false,
              error: 'No se encontraron mensajes al bot. Por favor envía /start a tu bot en Telegram primero, luego intenta de nuevo.',
              hint: 'Abre Telegram, busca tu bot por username, y envíale /start',
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
        const botToken = getBotToken();
        if (!botToken) {
          return NextResponse.json({
            success: false,
            error: 'TELEGRAM_BOT_TOKEN no está configurado. Ingresa el token del bot primero.',
          }, { status: 400 });
        }

        const keywords = getKeywords();
        if (keywords.length === 0) {
          return NextResponse.json({
            success: false,
            error: 'No hay palabras clave configuradas. Agrega palabras clave en la Lista Negra.',
          }, { status: 400 });
        }

        const MAX_KEYWORDS_PER_SCAN = 11;
        const keywordsToProcess = keywords.slice(0, MAX_KEYWORDS_PER_SCAN);
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

        try {
          // ── Method 1: Bot polling — get messages from groups where bot is a member ──
          const updatesUrl = `https://api.telegram.org/bot${botToken}/getUpdates?limit=100`;
          const updatesRes = await fetch(updatesUrl, {
            signal: AbortSignal.timeout(15000),
          });

          const groupsFound = new Map<string, { id: number; type: string; title?: string; username?: string }>();

          if (updatesRes.ok) {
            const updatesData = await updatesRes.json();
            if (updatesData.ok && Array.isArray(updatesData.result)) {
              const updates = updatesData.result;

              for (const update of updates) {
                const msg = update.message || update.channel_post || update.my_chat_member;
                if (msg?.chat) {
                  const chat = msg.chat;
                  // Only count groups, supergroups, channels (not private chats)
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

                  // Check message text for keyword matches
                  const messageText = msg.text || msg.caption || '';
                  if (messageText) {
                    if (chat.type === 'private' && msg.from?.is_bot) {
                      totalBotMessages++;
                    }

                    const match = matchKeyword(messageText);
                    if (match) {
                      const chatType = chat.type === 'supergroup' ? 'group' : chat.type;
                      const sourceName = chat.title || chat.username || chat.first_name || `Chat ${chat.id}`;
                      const sourceUrl = chat.username ? `https://t.me/${chat.username}` : '';

                      // Avoid duplicate alerts for same keyword + chat
                      const isDuplicate = detectedAlerts.some(
                        a => a.keyword === match.keyword && a.sourceName === sourceName
                      );

                      if (!isDuplicate) {
                        let telegramSent = false;
                        // Try sending Telegram alert
                        if (isConfigured()) {
                          try {
                            const alert: TelegramAlert = {
                              alertType: 'KEYWORD_MATCH',
                              severity: 'high',
                              timestamp: new Date().toISOString(),
                              keyword: match.keyword,
                              matchedContext: match.context,
                              sourceType: chatType as TelegramAlert['sourceType'],
                              sourceId: String(chat.id),
                              sourceName,
                              sourceUsername: chat.username,
                              sourceUrl: sourceUrl || `https://t.me/`,
                              subjectName: 'Escáner de Grupos',
                              findingTitle: `Mención de "${match.keyword}" en ${chatType} de Telegram`,
                              findingDescription: messageText.substring(0, 500),
                              findingCategory: 'telegram_group_scan',
                            };
                            telegramSent = await sendTelegramAlert(alert);
                          } catch { /* ignore */ }
                        }

                        detectedAlerts.push({
                          keyword: match.keyword,
                          sourceType: chatType,
                          sourceName,
                          sourceUrl,
                          messageText: messageText.substring(0, 300),
                          chatType: chat.type,
                          timestamp: new Date().toISOString(),
                          telegramSent,
                        });

                        // Record in alert history
                        addAlertHistoryEntry({
                          keyword: match.keyword,
                          sourceType: chatType,
                          sourceName,
                          timestamp: new Date().toISOString(),
                          telegramSent,
                        });
                      }
                    }
                  }
                }
              }
            }
          }

          totalGroups = groupsFound.size;

          // ── Method 2: Web search — find public Telegram groups mentioning keywords ──
          const { performWebSearch } = await import('@/lib/osint-scanner');

          for (const keyword of keywordsToProcess) {
            keywordsProcessed++;
            try {
              const searchQuery = `site:t.me ${keyword}`;
              const searchResults = await performWebSearch(searchQuery, 10);

              for (const result of searchResults) {
                const combinedText = `${result.name} ${result.snippet}`.toLowerCase();
                if (!combinedText.includes(keyword.toLowerCase())) continue;

                // Extract Telegram entity info from URL
                const tmeMatch = result.url.match(/(?:t\.me|telegram\.me)\/([a-zA-Z0-9_]{5,32})/);
                const username = tmeMatch ? tmeMatch[1] : undefined;
                const skipPaths = ['s', 'login', 'joinchat', 'addstickers', 'proxy', 'iv'];
                const cleanUsername = username && !skipPaths.includes(username.toLowerCase()) ? username : undefined;

                // Determine source type from snippet
                let sourceType = 'channel';
                const textLower = combinedText;
                if (textLower.includes('grupo') || textLower.includes('group') || textLower.includes('chat')) {
                  sourceType = 'group';
                } else if (textLower.includes('bot')) {
                  sourceType = 'bot';
                }

                const sourceName = result.name || (cleanUsername ? `@${cleanUsername}` : 'Telegram');
                const sourceUrl = cleanUsername ? `https://t.me/${cleanUsername}` : result.url;

                // Avoid duplicate alerts
                const isDuplicate = detectedAlerts.some(
                  a => a.keyword === keyword && a.sourceName === sourceName
                );

                if (!isDuplicate) {
                  let telegramSent = false;
                  if (isConfigured()) {
                    try {
                      const alert: TelegramAlert = {
                        alertType: 'KEYWORD_MATCH',
                        severity: 'high',
                        timestamp: new Date().toISOString(),
                        keyword,
                        matchedContext: result.snippet?.substring(0, 100) || '',
                        sourceType: sourceType as TelegramAlert['sourceType'],
                        sourceId: cleanUsername || result.url,
                        sourceName,
                        sourceUsername: cleanUsername,
                        sourceUrl,
                        subjectName: 'Escáner de Grupos',
                        findingTitle: `Mención de "${keyword}" en ${sourceType} de Telegram`,
                        findingDescription: result.snippet || result.name,
                        findingCategory: 'telegram_group_scan',
                        findingUrl: result.url,
                      };
                      telegramSent = await sendTelegramAlert(alert);
                    } catch { /* ignore */ }
                  }

                  detectedAlerts.push({
                    keyword,
                    sourceType,
                    sourceName,
                    sourceUrl,
                    messageText: result.snippet?.substring(0, 300) || '',
                    chatType: sourceType,
                    timestamp: new Date().toISOString(),
                    telegramSent,
                  });

                  // Record in alert history
                  addAlertHistoryEntry({
                    keyword,
                    sourceType,
                    sourceName,
                    timestamp: new Date().toISOString(),
                    telegramSent,
                  });
                }
              }
            } catch {
              // Search for this keyword failed, continue with next
              console.warn(`[ScanGroups] Web search failed for keyword: ${keyword}`);
            }
          }

          // Get updated alert history
          const updatedAlertHistory = getAlertHistory();

          return NextResponse.json({
            success: true,
            totalGroups,
            totalBotMessages,
            keywordsProcessed,
            totalKeywords: keywords.length,
            maxKeywordsPerScan: MAX_KEYWORDS_PER_SCAN,
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
