/**
 * /api/telegram — Telegram Bot Management & OSINT Scanning API
 *
 * Handles:
 * - Runtime configuration (save_bot_token, save_chat_id)
 * - Auto-detection of Chat ID via getUpdates
 * - Connection testing (send test message)
 * - Status verification (check if bot token is valid)
 * - Global keyword scanning across Telegram (scan_groups)
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

  let botInfo: { username: string; firstName: string; id: number } | null = null;
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

          const chatIds = new Map<string, { chatId: number; type: string; title?: string; username?: string; firstName?: string }>();
          for (const update of updates) {
            const msg = update.message || update.my_chat_member || update.channel_post;
            if (msg?.chat) {
              const chat = msg.chat;
              const key = String(chat.id);
              if (!chatIds.has(key)) {
                chatIds.set(key, {
                  chatId: chat.id,
                  type: chat.type,
                  title: chat.title,
                  username: chat.username,
                  firstName: chat.first_name,
                });
              }
            }
          }

          const detectedChats = Array.from(chatIds.values());

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

      // ═══════════════════════════════════════════════════════════════════
      //  SCAN GROUPS — Global Telegram keyword scanning
      // ═══════════════════════════════════════════════════════════════════
      case 'scan_groups': {
        const keywords = getKeywords();
        if (keywords.length === 0) {
          return NextResponse.json({
            success: false,
            error: 'No hay palabras clave configuradas. Agrega palabras clave en la Lista Negra.',
          }, { status: 400 });
        }

        // ── Alert data type ──
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
          riskLevel?: 'high' | 'medium' | 'low';
          isOfficial?: boolean;
          riskTags?: string[];
          discoverySource?: string;
          channelUsername?: string;
          subscriberCount?: number;
          messageDate?: string;
        }> = [];

        let totalGroups = 0;
        let totalBotMessages = 0;
        let keywordsProcessed = 0;
        const discoveredChannels = new Set<string>();
        const scanDiagnostics: Array<{ phase: string; status: string; details: string }> = [];

        // ── Normalize text ──
        function normalizeText(text: string): string {
          return text
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-z0-9\s]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
        }

        // ── Find ALL matching keywords in text ──
        function findAllMatchingKeywords(text: string): string[] {
          const normText = normalizeText(text);
          const matches: string[] = [];
          for (const kw of keywords) {
            if (normText.includes(normalizeText(kw))) {
              matches.push(kw);
            }
          }
          return matches;
        }

        // ── Extract context around keyword ──
        function extractContext(text: string, kw: string, radius = 150): string {
          const normText = normalizeText(text);
          const normKw = normalizeText(kw);
          const idx = normText.indexOf(normKw);
          if (idx === -1) return text.substring(0, 300);
          const start = Math.max(0, idx - radius);
          const end = Math.min(text.length, idx + normKw.length + radius);
          return text.substring(start, end);
        }

        // ── Official channels set (lowercase for matching) ──
        const OFFICIAL_CHANNELS_LC = new Set([
          'bancolombia', 'bancolombia_comunica', 'bancolombiaempresas', 'bancolombiainversion',
          'nequi', 'nequicuentas', 'nequicol', 'nequiayuda',
          'wompi_co', 'wompicol',
          'banistmo',
          'bancoagricola', 'bancoagricolasv',
          'grupo_cibest', 'cibest',
          'davivienda', 'daviviendaayuda',
          'bancodebogota', 'bancobogota',
          'bbva_colombia', 'scotiabankcol', 'colpatria',
          'bancolombia_ayuda',
        ]);

        function isOfficialChannel(name: string): boolean {
          const lc = name.toLowerCase();
          if (OFFICIAL_CHANNELS_LC.has(lc)) return true;
          const officialIndicators = ['_comunica', 'empresas', 'inversion'];
          if (officialIndicators.some(ind => lc.includes(ind))) return true;
          return false;
        }

        // ── Classify channel risk ──
        function classifyChannelRisk(channelName: string, snippet?: string): {
          riskLevel: 'high' | 'medium' | 'low';
          isOfficial: boolean;
          riskTags: string[];
        } {
          const nameLower = channelName.toLowerCase();
          const snippetLower = (snippet || '').toLowerCase();
          const riskTags: string[] = [];
          const isOfficial = isOfficialChannel(channelName);

          // Impersonator detection
          const impersonatorSuffixes = ['_soporte', 'soporte', '_oficial', 'oficial', '_ayuda', 'ayuda', '_support', 'support'];
          const kwNorm = nameLower.replace(/[_.]/g, '');
          for (const suffix of impersonatorSuffixes) {
            for (const kw of keywords) {
              const kwNorm2 = normalizeText(kw).replace(/\s+/g, '');
              if (kwNorm === kwNorm2 + suffix || kwNorm === 'fake' + kwNorm2) {
                riskTags.push('impersonacion');
                break;
              }
            }
          }

          // High-risk indicators
          const highRiskTerms = ['estafa', 'scam', 'fraude', 'phishing', 'robo', 'hack', 'filtro', 'venta', 'datos', 'filtracion', 'credential', 'clon', 'clonacion', 'suplantacion', 'falso', 'fak'];
          const mediumRiskTerms = ['sospech', 'alerta', 'cuidado', 'aviso', 'estafador', 'spam', 'malware', 'ransomware', 'engano'];

          for (const term of highRiskTerms) {
            if (nameLower.includes(term) || snippetLower.includes(term)) riskTags.push(term);
          }
          for (const term of mediumRiskTerms) {
            if (nameLower.includes(term) || snippetLower.includes(term)) riskTags.push(term);
          }

          if (isOfficial) return { riskLevel: 'low', isOfficial: true, riskTags: [] };
          if (riskTags.includes('impersonacion')) return { riskLevel: 'high', isOfficial: false, riskTags };
          if (riskTags.some(t => highRiskTerms.includes(t))) return { riskLevel: 'high', isOfficial: false, riskTags };
          if (riskTags.length > 0) return { riskLevel: 'medium', isOfficial: false, riskTags };
          return { riskLevel: 'medium', isOfficial: false, riskTags: [] };
        }

        // ── Scrape t.me/s/ channel preview — FIXED regex ──
        async function scrapeChannelPreview(channelName: string, beforeMsgId?: string): Promise<{
          exists: boolean;
          messages: Array<{ text: string; msgId?: string; messageDate?: string }>;
          channelTitle: string;
          subscriberCount?: number;
          channelUsername?: string;
          oldestMsgId?: string;
        }> {
          try {
            const previewUrl = beforeMsgId
              ? `https://t.me/s/${channelName}?before=${beforeMsgId}`
              : `https://t.me/s/${channelName}`;
            const res = await fetch(previewUrl, {
              headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9',
                'Accept-Language': 'es-419,es;q=0.9,en;q=0.8',
                'Cache-Control': 'no-cache',
              },
              signal: AbortSignal.timeout(12000),
            });

            if (!res.ok) return { exists: false, messages: [], channelTitle: channelName };

            const html = await res.text();
            const hasMessages = html.includes('tgme_widget_message_text');
            const hasChannelInfo = html.includes('tgme_channel_info') || html.includes('tgme_page_title');

            if (!hasMessages && !hasChannelInfo) return { exists: false, messages: [], channelTitle: channelName };

            const messages: Array<{ text: string; msgId?: string; messageDate?: string }> = [];

            // FIXED: Use js-message_text pattern which matches the actual HTML
            const msgPattern = /tgme_widget_message_text\s+js-message_text[^>]*>([\s\S]*?)<\/div>/gi;
            let msgMatch;
            while ((msgMatch = msgPattern.exec(html)) !== null && messages.length < 25) {
              const msgHtml = msgMatch[1];
              const msgText = msgHtml
                .replace(/<br\s*\/?>/gi, '\n')
                .replace(/<\/?[a-zA-Z][^>]*>/g, '')
                .replace(/&amp;/g, '&')
                .replace(/&lt;/g, '<')
                .replace(/&gt;/g, '>')
                .replace(/&quot;/g, '"')
                .replace(/&#39;/g, "'")
                .replace(/&#036;/g, '$')
                .replace(/&#(\d+);/g, (_, num) => String.fromCharCode(parseInt(num)))
                .trim();
              if (msgText.length > 3) {
                // Find message ID from surrounding HTML
                const surroundingHtml = html.substring(Math.max(0, msgMatch.index - 800), msgMatch.index);
                const idMatch = surroundingHtml.match(/data-post="[^\/]*\/(\d+)"/);
                // Find message date
                let messageDate: string | undefined;
                const dateMatch = surroundingHtml.match(/datetime="([^"]+)"/) || surroundingHtml.match(/class="tgme_widget_message_date"[^>]*><time[^>]*>([^<]+)<\/time>/);
                if (dateMatch) messageDate = dateMatch[1] || dateMatch[2];
                messages.push({ text: msgText, msgId: idMatch?.[1], messageDate });
              }
            }

            // Fallback pattern if no messages found
            if (messages.length === 0) {
              const fbPattern = /tgme_widget_message_text[^>]*>([\s\S]*?)<\/div>/gi;
              let fbMatch;
              while ((fbMatch = fbPattern.exec(html)) !== null && messages.length < 25) {
                const msgText = fbMatch[1]
                  .replace(/<br\s*\/?>/gi, '\n')
                  .replace(/<[^>]+>/g, '')
                  .replace(/&amp;/g, '&')
                  .replace(/&lt;/g, '<')
                  .replace(/&gt;/g, '>')
                  .replace(/&quot;/g, '"')
                  .replace(/&#036;/g, '$')
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
              if (numMatch) subscriberCount = parseInt(numMatch[1].replace(/[,\s]/g, ''));
            }

            // Find oldest message ID for pagination
            let oldestMsgId: string | undefined;
            if (messages.length > 0) {
              const allPostIds = [...html.matchAll(/data-post="[^\/]*\/(\d+)"/gi)];
              if (allPostIds.length > 0) oldestMsgId = allPostIds[allPostIds.length - 1][1];
            }

            return {
              exists: messages.length > 0 || hasChannelInfo,
              messages,
              channelTitle,
              subscriberCount,
              channelUsername: channelName,
              oldestMsgId,
            };
          } catch (err) {
            console.log(`[scrapeChannelPreview] ${channelName} error: ${err instanceof Error ? err.message : 'unknown'}`);
            return { exists: false, messages: [], channelTitle: channelName };
          }
        }

        // ── Dedup helper ──
        function makeDedupKey(keyword: string, channelUsername: string | undefined, messageText: string): string {
          const chKey = (channelUsername || '').toLowerCase();
          const msgKey = normalizeText(messageText).substring(0, 100);
          return `${normalizeText(keyword)}|${chKey}|${msgKey}`;
        }

        // ── Add alert with dedup + Telegram notification ──
        async function addDetectedAlert(params: {
          keyword: string;
          sourceType: string;
          sourceName: string;
          sourceUrl: string;
          messageText: string;
          chatType: string;
          matchedContext: string;
          messageId?: string;
          channelUsername?: string;
          subscriberCount?: number;
          messageDate?: string;
        }) {
          const { keyword, sourceType, sourceName, sourceUrl, messageText, chatType, matchedContext, messageId, channelUsername, subscriberCount, messageDate } = params;

          const dedupKey = makeDedupKey(keyword, channelUsername, messageText);
          const isDuplicate = detectedAlerts.some(
            a => makeDedupKey(a.keyword, a.channelUsername, a.messageText) === dedupKey
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
                sourceUsername: channelUsername || sourceUrl.match(/t\.me\/([a-zA-Z0-9_]+)/)?.[1],
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
            channelUsername,
            subscriberCount,
            messageDate,
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

          // Load Z.ai config
          try {
            const fs = await import('fs');
            const configPaths = ['/etc/.z-ai-config'];
            for (const configPath of configPaths) {
              try {
                const content = fs.readFileSync(configPath, 'utf-8');
                const config = JSON.parse(content);
                if (config.token && !process.env.ZAI_TOKEN) process.env.ZAI_TOKEN = config.token;
                if (config.userId && !process.env.ZAI_USER_ID) process.env.ZAI_USER_ID = config.userId;
                if (config.chatId && !process.env.ZAI_CHAT_ID) process.env.ZAI_CHAT_ID = config.chatId;
                if (config.token) {
                  console.log('[ScanGroups] Loaded Z.ai config from', configPath);
                  break;
                }
              } catch { /* file not found */ }
            }
          } catch { /* fs not available */ }

          // Initialize Z.ai SDK — no test search, just try to create instance
          try {
            const ZAI = (await import('z-ai-web-dev-sdk')).default;
            await ZAI.create();
            zaiAvailable = true;
            console.log('[ScanGroups] Z.ai SDK initialized successfully');
          } catch (err) {
            zaiError = err instanceof Error ? err.message : 'SDK init failed';
            console.warn('[ScanGroups] Z.ai SDK init failed:', zaiError);
          }

          // Validate Bot API
          if (botToken) {
            try {
              const meRes = await fetch(`https://api.telegram.org/bot${botToken}/getMe`, {
                signal: AbortSignal.timeout(10000),
              });
              const meData = await meRes.json();
              botApiOk = meData.ok;
              if (!botApiOk) botApiError = meData.description || 'Bot token invalid';
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
          //  PHASE 1: Z.ai Web Search — Discover Telegram channels
          // ═══════════════════════════════════════════════════════════════
          let phase1ResultsCount = 0;
          let phase1Errors = 0;
          const SKIP_PATHS = ['s', 'login', 'joinchat', 'addstickers', 'proxy', 'iv', 'confirmphone', 'setlanguage'];

          if (zaiAvailable) {
            console.log('[ScanGroups] Phase 1: Z.ai web search to discover Telegram channels...');
            try {
              const ZAI = (await import('z-ai-web-dev-sdk')).default;
              const zai = await ZAI.create();

              for (let ki = 0; ki < keywords.length; ki++) {
                const keyword = keywords[ki];
                keywordsProcessed++;
                if (ki > 0) await new Promise(r => setTimeout(r, 500));

                try {
                  // Search queries designed to find ACTUAL Telegram channel content
                  const searchQueries = [
                    `site:t.me ${keyword}`,
                    `"${keyword}" telegram canal grupo`,
                    `"${keyword}" telegram estafa fraude scam phishing`,
                    `"${keyword}" telegram venta datos filtro robo cuenta`,
                  ];

                  for (let qi = 0; qi < searchQueries.length; qi++) {
                    try {
                      if (qi > 0) await new Promise(r => setTimeout(r, 400));

                      const searchResults = await zai.functions.invoke('web_search', {
                        query: searchQueries[qi],
                        num: 10,
                      });

                      if (!Array.isArray(searchResults) || searchResults.length === 0) continue;

                      for (const result of searchResults) {
                        const resultUrl: string = result.url || '';
                        const resultName: string = result.name || '';
                        const resultSnippet: string = result.snippet || '';

                        // Extract Telegram usernames from URLs (3-32 chars)
                        const tmeMatch = resultUrl.match(/(?:t\.me|telegram\.me)\/s\/([a-zA-Z0-9_]{3,32})/)
                          || resultUrl.match(/(?:t\.me|telegram\.me)\/([a-zA-Z0-9_]{3,32})/);
                        if (tmeMatch && !SKIP_PATHS.includes(tmeMatch[1].toLowerCase())) {
                          discoveredChannels.add(tmeMatch[1]);
                        }

                        // Extract from snippets
                        const snippetTme = resultSnippet.match(/t\.me\/([a-zA-Z0-9_]{3,32})/g);
                        if (snippetTme) {
                          for (const m of snippetTme) {
                            const u = m.replace('t.me/', '');
                            if (!SKIP_PATHS.includes(u.toLowerCase())) discoveredChannels.add(u);
                          }
                        }
                        const atMatches = resultSnippet.match(/@([a-zA-Z0-9_]{3,32})/g);
                        if (atMatches) {
                          for (const m of atMatches) discoveredChannels.add(m.replace('@', ''));
                        }

                        // If result mentions keyword AND is Telegram-related, create immediate alert
                        const isTme = resultUrl.includes('t.me') || resultUrl.includes('telegram.me');
                        const mentionsTelegram = resultName.toLowerCase().includes('telegram') ||
                          resultSnippet.toLowerCase().includes('telegram') ||
                          resultSnippet.toLowerCase().includes('t.me');

                        if ((isTme || mentionsTelegram) && normalizeText(`${resultName} ${resultSnippet}`).includes(normalizeText(keyword))) {
                          const tmeUrlMatch = resultUrl.match(/(?:t\.me|telegram\.me)\/([a-zA-Z0-9_]{3,32})/);
                          const cleanUsername = tmeUrlMatch?.[1];

                          let sourceType = 'channel';
                          const textLower = `${resultName} ${resultSnippet}`.toLowerCase();
                          if (textLower.includes('grupo') || textLower.includes('group') || textLower.includes('chat')) {
                            sourceType = 'group';
                          }

                          const risk = classifyChannelRisk(cleanUsername || '', resultSnippet);
                          await addDetectedAlert({
                            keyword,
                            sourceType,
                            sourceName: resultName || (cleanUsername ? `@${cleanUsername}` : 'Telegram'),
                            sourceUrl: cleanUsername ? `https://t.me/${cleanUsername}` : resultUrl,
                            messageText: resultSnippet || resultName,
                            chatType: sourceType,
                            matchedContext: extractContext(`${resultName} ${resultSnippet}`, keyword),
                            channelUsername: cleanUsername,
                          });
                          const lastAlert = detectedAlerts[detectedAlerts.length - 1];
                          if (lastAlert) {
                            lastAlert.riskLevel = risk.riskLevel;
                            lastAlert.isOfficial = risk.isOfficial;
                            lastAlert.riskTags = risk.riskTags;
                            lastAlert.discoverySource = 'web_search';
                          }
                          phase1ResultsCount++;
                        }
                      }
                    } catch (searchErr) {
                      phase1Errors++;
                      console.warn(`[ScanGroups] Search failed:`, searchErr instanceof Error ? searchErr.message : 'unknown');
                      if (searchErr instanceof Error && (searchErr.message.includes('401') || searchErr.message.includes('403'))) {
                        zaiAvailable = false;
                        zaiError = 'Auth failed during search';
                        break;
                      }
                    }
                  }
                } catch (kwErr) {
                  phase1Errors++;
                }
              }
            } catch (zaiErr) {
              phase1Errors++;
              zaiAvailable = false;
              zaiError = zaiErr instanceof Error ? zaiErr.message : 'unknown';
            }
          }

          scanDiagnostics.push({
            phase: 'phase1_web_search',
            status: zaiAvailable ? (phase1Errors === 0 ? 'ok' : 'partial') : 'skipped',
            details: `${keywordsProcessed} keywords, ${discoveredChannels.size} channels discovered, ${phase1ResultsCount} alerts, ${phase1Errors} errors. Z.ai: ${zaiAvailable ? 'available' : `unavailable (${zaiError})`}`,
          });

          // ═══════════════════════════════════════════════════════════════
          //  PHASE 1.5: Direct Channel Probing for impersonators
          // ═══════════════════════════════════════════════════════════════
          let phase15ChannelsFound = 0;
          let phase15Alerts = 0;

          console.log('[ScanGroups] Phase 1.5: Direct channel probing...');
          for (const keyword of keywords) {
            const kwNorm = normalizeText(keyword).replace(/\s+/g, '');

            const probeNames = [
              kwNorm,
              `${kwNorm}_soporte`, `${kwNorm}soporte`,
              `${kwNorm}_oficial`, `${kwNorm}oficial`,
              `fake${kwNorm}`,
              `${kwNorm}_ayuda`, `${kwNorm}_support`,
            ];

            const probeResults = await Promise.allSettled(
              probeNames.map(async (probeName) => {
                const result = await scrapeChannelPreview(probeName);
                return { probeName, ...result };
              })
            );

            for (const result of probeResults) {
              if (result.status !== 'fulfilled') continue;
              const { probeName, exists, messages, channelTitle, subscriberCount } = result.value;
              if (!exists || messages.length === 0) continue;

              discoveredChannels.add(probeName);
              phase15ChannelsFound++;

              for (const msg of messages) {
                const allMatchedKws = findAllMatchingKeywords(msg.text);
                for (const matchedKw of allMatchedKws) {
                  const risk = classifyChannelRisk(probeName, msg.text);
                  await addDetectedAlert({
                    keyword: matchedKw,
                    sourceType: 'channel',
                    sourceName: channelTitle || `@${probeName}`,
                    sourceUrl: `https://t.me/${probeName}`,
                    messageText: msg.text.substring(0, 800),
                    chatType: 'channel',
                    matchedContext: extractContext(msg.text, matchedKw),
                    messageId: msg.msgId,
                    channelUsername: probeName,
                    subscriberCount,
                    messageDate: msg.messageDate,
                  });
                  const lastAlert = detectedAlerts[detectedAlerts.length - 1];
                  if (lastAlert) {
                    lastAlert.riskLevel = risk.riskLevel;
                    lastAlert.isOfficial = risk.isOfficial;
                    lastAlert.riskTags = risk.riskTags;
                    lastAlert.discoverySource = 'direct_probe';
                  }
                  phase15Alerts++;
                }
              }
            }
          }

          scanDiagnostics.push({
            phase: 'phase15_direct_probe',
            status: phase15ChannelsFound > 0 ? 'ok' : 'no_new_channels',
            details: `${phase15ChannelsFound} channels found, ${phase15Alerts} alerts`,
          });

          // ═══════════════════════════════════════════════════════════════
          //  PHASE 2: Deep scrape discovered + monitoring channels
          // ═══════════════════════════════════════════════════════════════
          const MONITORING_CHANNELS = [
            'Losqueinvierten', 'DescuentosTech', 'DailyEstafa',
            'estafascolombia', 'INCIBE017Informacion',
            'ciberseguridad', 'criptonoticias', 'group_ib',
            'notoscam', 'hackplayers', 'seguridadinformatica',
            'fraudebancario', 'ciberseguridadcol', 'seguridadcolombia',
            'ANGELREPORTA', 'Bandec97', 'BleepinComputer',
          ];

          const discoveredNotOfficial = [...discoveredChannels].filter(c => !isOfficialChannel(c));
          const discoveredOfficial = [...discoveredChannels].filter(c => isOfficialChannel(c));
          const allChannels = [
            ...discoveredNotOfficial,
            ...MONITORING_CHANNELS.filter(c => !discoveredChannels.has(c)),
            ...discoveredOfficial,
          ];

          console.log(`[ScanGroups] Phase 2: Scraping ${allChannels.length} channels...`);

          const BATCH_SIZE = 8;
          const MAX_CHANNELS = 60;
          let channelsScraped = 0;
          let channelsWithMessages = 0;
          let phase2Alerts = 0;

          for (let batchStart = 0; batchStart < allChannels.length && batchStart < MAX_CHANNELS; batchStart += BATCH_SIZE) {
            const batch = allChannels.slice(batchStart, batchStart + BATCH_SIZE);

            const batchResults = await Promise.allSettled(
              batch.map(async (channelName) => {
                const result = await scrapeChannelPreview(channelName);
                return { channelName, ...result };
              })
            );

            for (const result of batchResults) {
              channelsScraped++;
              if (result.status !== 'fulfilled') continue;
              const { channelName, exists, messages, channelTitle, subscriberCount, channelUsername, oldestMsgId } = result.value;

              if (!exists || messages.length === 0) continue;

              channelsWithMessages++;
              totalGroups++;

              let channelHasMatch = false;
              for (const msg of messages) {
                const allMatchedKws = findAllMatchingKeywords(msg.text);
                for (const matchedKw of allMatchedKws) {
                  const risk = classifyChannelRisk(channelName, msg.text);
                  await addDetectedAlert({
                    keyword: matchedKw,
                    sourceType: 'channel',
                    sourceName: channelTitle || `@${channelName}`,
                    sourceUrl: `https://t.me/${channelName}`,
                    messageText: msg.text.substring(0, 800),
                    chatType: 'channel',
                    matchedContext: extractContext(msg.text, matchedKw),
                    messageId: msg.msgId,
                    channelUsername: channelUsername || channelName,
                    subscriberCount,
                    messageDate: msg.messageDate,
                  });
                  const lastAlert = detectedAlerts[detectedAlerts.length - 1];
                  if (lastAlert) {
                    lastAlert.riskLevel = risk.riskLevel;
                    lastAlert.isOfficial = risk.isOfficial;
                    lastAlert.riskTags = risk.riskTags;
                    lastAlert.discoverySource = discoveredChannels.has(channelName) ? 'web_search' : MONITORING_CHANNELS.includes(channelName) ? 'monitoring_list' : 'official_list';
                  }
                  phase2Alerts++;
                  channelHasMatch = true;
                }
              }

              // Pagination: scrape older messages if channel has matches
              if (channelHasMatch && oldestMsgId) {
                try {
                  const olderResult = await scrapeChannelPreview(channelName, oldestMsgId);
                  if (olderResult.exists && olderResult.messages.length > 0) {
                    for (const msg of olderResult.messages) {
                      const allMatchedKws = findAllMatchingKeywords(msg.text);
                      for (const matchedKw of allMatchedKws) {
                        await addDetectedAlert({
                          keyword: matchedKw,
                          sourceType: 'channel',
                          sourceName: channelTitle || `@${channelName}`,
                          sourceUrl: `https://t.me/${channelName}`,
                          messageText: msg.text.substring(0, 800),
                          chatType: 'channel',
                          matchedContext: extractContext(msg.text, matchedKw),
                          messageId: msg.msgId,
                          channelUsername: channelUsername || channelName,
                          subscriberCount: olderResult.subscriberCount,
                          messageDate: msg.messageDate,
                        });
                        const lastAlert = detectedAlerts[detectedAlerts.length - 1];
                        if (lastAlert) {
                          const risk = classifyChannelRisk(channelName, msg.text);
                          lastAlert.riskLevel = risk.riskLevel;
                          lastAlert.isOfficial = risk.isOfficial;
                          lastAlert.riskTags = risk.riskTags;
                          lastAlert.discoverySource = 'deep_scrape';
                        }
                        phase2Alerts++;
                      }
                    }
                  }
                } catch { /* pagination failed */ }
              }
            }

            if (batchStart + BATCH_SIZE < allChannels.length) {
              await new Promise(resolve => setTimeout(resolve, 200));
            }
          }

          scanDiagnostics.push({
            phase: 'phase2_channel_scraping',
            status: channelsWithMessages > 0 ? 'ok' : (channelsScraped > 0 ? 'no_matches' : 'error'),
            details: `${channelsScraped} scraped, ${channelsWithMessages} with messages, ${phase2Alerts} matches`,
          });

          // ═══════════════════════════════════════════════════════════════
          //  PHASE 3: Bot polling
          // ═══════════════════════════════════════════════════════════════
          let phase3Groups = 0;
          let phase3Alerts = 0;

          if (botToken) {
            try {
              try {
                await fetch(`https://api.telegram.org/bot${botToken}/deleteWebhook`, {
                  method: 'POST',
                  signal: AbortSignal.timeout(5000),
                });
              } catch { /* ignore */ }

              const updatesRes = await fetch(`https://api.telegram.org/bot${botToken}/getUpdates?limit=100`, {
                signal: AbortSignal.timeout(15000),
              });

              if (updatesRes.ok) {
                const updatesData = await updatesRes.json();
                if (updatesData.ok && Array.isArray(updatesData.result)) {
                  const groupsFound = new Map<string, { id: number; type: string; title?: string; username?: string }>();

                  for (const update of updatesData.result) {
                    const msg = update.message || update.channel_post || update.my_chat_member;
                    if (msg?.chat) {
                      const chat = msg.chat;
                      if (chat.type === 'group' || chat.type === 'supergroup' || chat.type === 'channel') {
                        if (!groupsFound.has(String(chat.id))) {
                          groupsFound.set(String(chat.id), { id: chat.id, type: chat.type, title: chat.title, username: chat.username });
                        }
                      }
                      const messageText = msg.text || msg.caption || '';
                      if (messageText) {
                        if (chat.type === 'private' && msg.from?.is_bot) totalBotMessages++;
                        const allMatchedKws = findAllMatchingKeywords(messageText);
                        for (const keyword of allMatchedKws) {
                          await addDetectedAlert({
                            keyword,
                            sourceType: chat.type === 'supergroup' ? 'group' : chat.type,
                            sourceName: chat.title || chat.username || `Chat ${chat.id}`,
                            sourceUrl: chat.username ? `https://t.me/${chat.username}` : '',
                            messageText: messageText.substring(0, 800),
                            chatType: chat.type,
                            matchedContext: extractContext(messageText, keyword),
                            messageId: msg.message_id?.toString(),
                            channelUsername: chat.username,
                          });
                          const lastAlert = detectedAlerts[detectedAlerts.length - 1];
                          if (lastAlert) {
                            const risk = classifyChannelRisk(chat.username || '', messageText);
                            lastAlert.riskLevel = risk.riskLevel;
                            lastAlert.isOfficial = risk.isOfficial;
                            lastAlert.riskTags = risk.riskTags;
                            lastAlert.discoverySource = 'bot_polling';
                          }
                          phase3Alerts++;
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
            details: `${phase3Groups} groups, ${phase3Alerts} matches. Bot API: ${!botToken ? 'no token' : botApiOk ? 'OK' : botApiError}`,
          });

          keywordsProcessed = Math.max(keywordsProcessed, keywords.length);

          // Sort: high risk first, then non-official
          const riskOrder = { high: 0, medium: 1, low: 2 };
          detectedAlerts.sort((a, b) => {
            const aRisk = riskOrder[a.riskLevel || 'medium'] ?? 1;
            const bRisk = riskOrder[b.riskLevel || 'medium'] ?? 1;
            if (aRisk !== bRisk) return aRisk - bRisk;
            if (a.isOfficial !== b.isOfficial) return (a.isOfficial ? 1 : 0) - (b.isOfficial ? 1 : 0);
            return 0;
          });

          const updatedAlertHistory = getAlertHistory();
          const allMethodsFailed = !zaiAvailable && channelsScraped === 0 && (!botToken || !botApiOk);
          const hasPartialIssues = (!zaiAvailable || channelsScraped === 0) && detectedAlerts.length === 0;

          console.log(`[ScanGroups] Complete: ${detectedAlerts.length} alerts, ${totalGroups} groups, ${keywordsProcessed}/${keywords.length} keywords`);

          const responseBody: Record<string, unknown> = {
            success: detectedAlerts.length > 0 || !allMethodsFailed,
            totalGroups,
            totalBotMessages,
            keywordsProcessed,
            totalKeywords: keywords.length,
            maxKeywordsPerScan: keywords.length,
            channelsDiscovered: discoveredChannels.size,
            channelsScraped,
            channelsWithMessages,
            zaiSearchUsed: zaiAvailable,
            detectedAlerts,
            diagnostics: scanDiagnostics,
            alertHistory: updatedAlertHistory.slice(0, 10),
            riskBreakdown: {
              high: detectedAlerts.filter(a => a.riskLevel === 'high').length,
              medium: detectedAlerts.filter(a => a.riskLevel === 'medium').length,
              low: detectedAlerts.filter(a => a.riskLevel === 'low').length,
              official: detectedAlerts.filter(a => a.isOfficial).length,
              nonOfficial: detectedAlerts.filter(a => !a.isOfficial).length,
            },
            suspiciousChannels: [...discoveredChannels].filter(c => !isOfficialChannel(c)).slice(0, 20),
          };

          if (allMethodsFailed) {
            responseBody.success = false;
            responseBody.error = 'No se pudieron obtener resultados. Z.ai SDK no disponible y scraping sin resultados. Revisa los diagnósticos.';
            responseBody.technicalIssues = true;
          } else if (hasPartialIssues) {
            responseBody.technicalIssues = true;
            responseBody.partialSuccess = true;
          }

          return NextResponse.json(responseBody, { status: 200 });

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
