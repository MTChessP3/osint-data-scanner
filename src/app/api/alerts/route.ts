/**
 * Alerts API — Manage keyword blacklist and test Telegram alerts
 *
 * GET  /api/alerts — Get current keywords and Telegram config status
 * POST /api/alerts — Manage keywords and test alerts
 *   Actions: add_keyword, remove_keyword, set_keywords, test_alert
 *
 * Protected by verifyAuth()
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/auth';
import { getKeywords, addKeyword, removeKeyword, setKeywords } from '@/lib/alert-keywords';
import { isTelegramConfigured, testTelegramAlert } from '@/lib/telegram-alerts';
import { getAlertHistory } from '@/lib/engines/alert-interceptor';

// ── GET: Retrieve alert configuration ──

export async function GET(request: NextRequest) {
  // Verify authentication
  const auth = await verifyAuth(request);
  if (!auth.authenticated) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const keywords = getKeywords();
  const telegramReady = isTelegramConfigured();

  // Check which env vars are set (don't expose values)
  const hasBotToken = !!(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_BOT_TOKEN.trim().length > 0);
  const hasChatId = !!(process.env.TELEGRAM_CHAT_ID && process.env.TELEGRAM_CHAT_ID.trim().length > 0);

  const history = getAlertHistory().slice(0, 10);

  return NextResponse.json({
    keywords,
    telegram: {
      configured: telegramReady,
      hasBotToken,
      hasChatId,
    },
    alertHistory: history,
  });
}

// ── POST: Manage keywords and test alerts ──

export async function POST(request: NextRequest) {
  // Verify authentication
  const auth = await verifyAuth(request);
  if (!auth.authenticated) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { action } = body;

    switch (action) {
      case 'add_keyword': {
        const { keyword } = body;
        if (!keyword || typeof keyword !== 'string' || keyword.trim().length === 0) {
          return NextResponse.json({ error: 'Keyword is required' }, { status: 400 });
        }
        const updated = addKeyword(keyword);
        return NextResponse.json({ success: true, keywords: updated });
      }

      case 'remove_keyword': {
        const { keyword } = body;
        if (!keyword || typeof keyword !== 'string' || keyword.trim().length === 0) {
          return NextResponse.json({ error: 'Keyword is required' }, { status: 400 });
        }
        const updated = removeKeyword(keyword);
        return NextResponse.json({ success: true, keywords: updated });
      }

      case 'set_keywords': {
        const { keywords: newKeywords } = body;
        if (!Array.isArray(newKeywords)) {
          return NextResponse.json({ error: 'Keywords must be an array' }, { status: 400 });
        }
        const updated = setKeywords(newKeywords);
        return NextResponse.json({ success: true, keywords: updated });
      }

      case 'test_alert': {
        if (!isTelegramConfigured()) {
          return NextResponse.json({
            success: false,
            error: 'Telegram is not configured. Set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID environment variables.',
          }, { status: 400 });
        }
        const sent = await testTelegramAlert();
        return NextResponse.json({
          success: sent,
          message: sent ? 'Test alert sent successfully' : 'Failed to send test alert',
        });
      }

      default:
        return NextResponse.json({
          error: `Unknown action: "${action}". Valid actions: add_keyword, remove_keyword, set_keywords, test_alert`,
        }, { status: 400 });
    }
  } catch (error) {
    console.error('[Alerts API] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
