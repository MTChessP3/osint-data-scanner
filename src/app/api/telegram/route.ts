/**
 * /api/telegram — Telegram Bot Management API
 *
 * Handles:
 * - Auto-detection of Chat ID via getUpdates
 * - Connection testing (send test message)
 * - Status verification (check if bot token is valid)
 *
 * Protected by verifyAuth()
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/auth';
import { isTelegramConfigured, testTelegramAlert, sendTelegramAlert } from '@/lib/telegram-alerts';

// ── GET: Check Telegram configuration status ──

export async function GET(request: NextRequest) {
  const auth = await verifyAuth(request);
  if (!auth.authenticated) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const configured = isTelegramConfigured();
  const hasBotToken = !!(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_BOT_TOKEN.trim().length > 0);
  const hasChatId = !!(process.env.TELEGRAM_CHAT_ID && process.env.TELEGRAM_CHAT_ID.trim().length > 0);

  // If bot token exists, verify it's valid by calling getMe
  let botInfo = null;
  if (hasBotToken) {
    try {
      const token = process.env.TELEGRAM_BOT_TOKEN!;
      const meRes = await fetch(`https://api.telegram.org/bot${token}/getMe`, {
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
    configured,
    hasBotToken,
    hasChatId,
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
      // ── Detect Chat ID automatically via getUpdates ──
      case 'detect_chat_id': {
        const botToken = process.env.TELEGRAM_BOT_TOKEN;
        if (!botToken || botToken.trim().length === 0) {
          return NextResponse.json({
            success: false,
            error: 'TELEGRAM_BOT_TOKEN no está configurado en las variables de entorno del servidor.',
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
        const botToken = process.env.TELEGRAM_BOT_TOKEN;
        if (!botToken || botToken.trim().length === 0) {
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
        if (!isTelegramConfigured()) {
          return NextResponse.json({
            success: false,
            error: 'Telegram no está completamente configurado. Se necesitan TELEGRAM_BOT_TOKEN y TELEGRAM_CHAT_ID.',
          }, { status: 400 });
        }
        const sent = await testTelegramAlert();
        return NextResponse.json({
          success: sent,
          message: sent ? 'Alerta de prueba enviada exitosamente' : 'No se pudo enviar la alerta de prueba',
        });
      }

      default:
        return NextResponse.json({
          error: `Acción desconocida: "${action}". Acciones válidas: detect_chat_id, verify_token, test_alert`,
        }, { status: 400 });
    }
  } catch (error) {
    console.error('[Telegram API] Error:', error);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
