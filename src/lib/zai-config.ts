/**
 * ZAI SDK Configuration Helper
 *
 * Provides authentication for the Z.ai API.
 * Credentials are loaded at runtime — no hardcoded tokens.
 *
 * Priority:
 * 1. /etc/.z-ai-config (local/development) — direct access to internal API
 * 2. ZAI.create() auto-configuration (SDK handles auth)
 * 3. Environment variables (ZAI_TOKEN, ZAI_USER_ID, ZAI_CHAT_ID)
 */

import ZAI from 'z-ai-web-dev-sdk';
import { setZAIHeaders } from './osint-scanner';

export interface ZAIConfig {
  baseUrl: string;
  apiKey: string;
  token?: string;
  userId?: string;
  chatId?: string;
}

// Public-facing API base URL (accessible from anywhere)
const PUBLIC_API_BASE = 'https://api.z.ai/api/v1';

// Internal API base URL (only accessible from within Z.ai network)
const INTERNAL_API_BASE = 'https://internal-api.z.ai/v1';

let cachedConfig: ZAIConfig | null = null;
let isInternalAccessible = false;

async function checkInternalAccess(): Promise<boolean> {
  // Try reading local config file first
  try {
    const fs = await import('fs');
    const configPaths = ['/etc/.z-ai-config'];
    for (const configPath of configPaths) {
      try {
        const content = fs.readFileSync(configPath, 'utf-8');
        const config = JSON.parse(content);
        if (config.baseUrl && config.apiKey) {
          cachedConfig = {
            baseUrl: config.baseUrl,
            apiKey: config.apiKey,
            token: config.token,
            userId: config.userId,
            chatId: config.chatId,
          };
          isInternalAccessible = true;
          return true;
        }
      } catch { /* file not found */ }
    }
  } catch { /* fs not available */ }

  // Try to reach internal API directly (quick test)
  const envToken = process.env.ZAI_TOKEN || '';
  const envUserId = process.env.ZAI_USER_ID || '';
  const envChatId = process.env.ZAI_CHAT_ID || '';

  try {
    const response = await fetch(INTERNAL_API_BASE + '/models', {
      method: 'GET',
      headers: {
        'Authorization': 'Bearer Z.ai',
        'X-Token': envToken,
      },
      signal: AbortSignal.timeout(3000),
    });
    if (response.ok || response.status === 401) {
      isInternalAccessible = true;
      return true;
    }
  } catch {
    // internal-api not reachable from this environment
  }

  return false;
}

async function loadConfigAsync(): Promise<ZAIConfig> {
  if (cachedConfig) return cachedConfig;

  const canUseInternal = await checkInternalAccess();

  if (canUseInternal && cachedConfig) {
    return cachedConfig;
  }

  // Use environment variables for credentials
  const envToken = process.env.ZAI_TOKEN || '';
  const envUserId = process.env.ZAI_USER_ID || '';
  const envChatId = process.env.ZAI_CHAT_ID || '';

  // Use public API endpoint for Vercel/serverless environments
  cachedConfig = {
    baseUrl: PUBLIC_API_BASE,
    apiKey: 'Z.ai',
    token: envToken,
    userId: envUserId,
    chatId: envChatId,
  };

  // Set headers on osint-scanner for direct API calls
  if (envToken) {
    setZAIHeaders({
      'Authorization': 'Bearer Z.ai',
      'X-Z-AI-From': 'Z',
      'X-Chat-Id': envChatId,
      'X-User-Id': envUserId,
      'X-Token': envToken,
    });
  }

  return cachedConfig;
}

/**
 * Create a ZAI instance with proper authentication.
 * Uses internal API if reachable, otherwise public API.
 */
export async function createZAIInstanceAsync(): Promise<InstanceType<typeof ZAI>> {
  const config = await loadConfigAsync();
  return new ZAI(config);
}

/**
 * Create ZAI instance synchronously (best effort).
 */
export function createZAIInstance(): InstanceType<typeof ZAI> {
  const baseUrl = isInternalAccessible ? INTERNAL_API_BASE : PUBLIC_API_BASE;
  const envToken = process.env.ZAI_TOKEN || '';
  const envUserId = process.env.ZAI_USER_ID || '';
  const envChatId = process.env.ZAI_CHAT_ID || '';

  const config = cachedConfig || {
    baseUrl,
    apiKey: 'Z.ai',
    token: envToken,
    userId: envUserId,
    chatId: envChatId,
  };
  return new ZAI(config);
}

/**
 * Get the raw ZAI config.
 */
export function getZAIConfig(): ZAIConfig {
  if (cachedConfig) return cachedConfig;
  const envToken = process.env.ZAI_TOKEN || '';
  const envUserId = process.env.ZAI_USER_ID || '';
  const envChatId = process.env.ZAI_CHAT_ID || '';

  return {
    baseUrl: isInternalAccessible ? INTERNAL_API_BASE : PUBLIC_API_BASE,
    apiKey: 'Z.ai',
    token: envToken,
    userId: envUserId,
    chatId: envChatId,
  };
}

/**
 * Initialize config — call this at the start of API route handlers.
 * Determines which API endpoint is reachable and sets up auth headers.
 */
export async function initZAIConfig(): Promise<void> {
  await loadConfigAsync();
}

/**
 * Check if the internal API is accessible from this environment.
 */
export function isInternalAPIAvailable(): boolean {
  return isInternalAccessible;
}
