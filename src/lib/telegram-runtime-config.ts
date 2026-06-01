/**
 * Telegram Runtime Configuration — Server-side in-memory storage
 *
 * Stores TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID at runtime,
 * so the bot can be configured from the UI without Vercel env vars.
 *
 * Priority:
 *   1. Environment variables (TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID) — persistent across cold starts
 *   2. Runtime config (set via /api/telegram with action=save_config) — session-only
 *
 * On Vercel serverless, runtime config resets on cold start.
 * For permanent config, set env vars in Vercel Dashboard → Settings → Environment Variables.
 */

// ── Runtime storage (server-side only, not exposed to client) ──

let runtimeBotToken: string | null = null;
let runtimeChatId: string | null = null;

// ── Getters — check env vars first, then runtime ──

export function getBotToken(): string | null {
  const env = process.env.TELEGRAM_BOT_TOKEN;
  if (env && env.trim().length > 0) return env.trim();
  return runtimeBotToken;
}

export function getChatId(): string | null {
  const env = process.env.TELEGRAM_CHAT_ID;
  if (env && env.trim().length > 0) return env.trim();
  return runtimeChatId;
}

export function hasBotToken(): boolean {
  return !!(getBotToken());
}

export function hasChatId(): boolean {
  return !!(getChatId());
}

export function isConfigured(): boolean {
  return !!(getBotToken() && getChatId());
}

// ── Setters — runtime only (not persistent) ──

export function setRuntimeBotToken(token: string): void {
  runtimeBotToken = token.trim();
}

export function setRuntimeChatId(chatId: string): void {
  runtimeChatId = chatId.trim();
}

export function clearRuntimeConfig(): void {
  runtimeBotToken = null;
  runtimeChatId = null;
}

// ── Status info (safe to expose — no secrets) ──

export function getConfigStatus(): {
  configured: boolean;
  hasBotToken: boolean;
  hasChatId: boolean;
  botTokenSource: 'env' | 'runtime' | 'none';
  chatIdSource: 'env' | 'runtime' | 'none';
} {
  const envBotToken = !!(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_BOT_TOKEN.trim().length > 0);
  const envChatId = !!(process.env.TELEGRAM_CHAT_ID && process.env.TELEGRAM_CHAT_ID.trim().length > 0);

  return {
    configured: isConfigured(),
    hasBotToken: hasBotToken(),
    hasChatId: hasChatId(),
    botTokenSource: envBotToken ? 'env' : runtimeBotToken ? 'runtime' : 'none',
    chatIdSource: envChatId ? 'env' : runtimeChatId ? 'runtime' : 'none',
  };
}
