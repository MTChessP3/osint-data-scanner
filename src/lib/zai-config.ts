/**
 * ZAI SDK Configuration Helper
 *
 * Provides authentication for the Z.ai API.
 * IMPORTANT: internal-api.z.ai is a PRIVATE network address (172.25.x.x)
 * that is NOT accessible from Vercel's public servers.
 *
 * Solution: Use a public relay proxy deployed on a platform that CAN reach
 * internal-api.z.ai, or use the public api.z.ai endpoint.
 *
 * Priority:
 * 1. /etc/.z-ai-config (local/development) — direct access to internal API
 * 2. Public relay proxy (Vercel/serverless) — via api.z.ai or relay
 * 3. Hardcoded credentials as fallback
 */

import ZAI from 'z-ai-web-dev-sdk';

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

// Hardcoded credentials
const CREDENTIALS = {
  apiKey: 'Z.ai',
  token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjoiZWU5M2ViOWYtMDMzYS00MjMwLWE1ZTMtNDFiNDRhYjIyOTUwIiwiY2hhdF9pZCI6ImNoYXQtYTE2NDgwODgtY2FjNi00NWYyLTk2NDEtZmUyYzk2ODdkNjgwIiwicGxhdGZvcm0iOiJ6YWkifQ.YdDhkH93qw_CF0-kXCuL-Rz5c-EbM1j-nqwuA2YP8b0',
  userId: 'ee93eb9f-033a-4230-a5e3-41b44ab22950',
  chatId: 'chat-a1648088-cac6-45f2-9641-fe2c9687d680',
};

let cachedConfig: ZAIConfig | null = null;
let isInternalAccessible = false;

async function checkInternalAccess(): Promise<boolean> {
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
  try {
    const response = await fetch(INTERNAL_API_BASE + '/models', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${CREDENTIALS.apiKey}`,
        'X-Token': CREDENTIALS.token || '',
      },
      signal: AbortSignal.timeout(3000),
    });
    if (response.ok || response.status === 401) {
      // If we get any response (even 401), the host is reachable
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

  // Use public API endpoint for Vercel/serverless environments
  cachedConfig = {
    baseUrl: PUBLIC_API_BASE,
    apiKey: CREDENTIALS.apiKey,
    token: CREDENTIALS.token,
    userId: CREDENTIALS.userId,
    chatId: CREDENTIALS.chatId,
  };

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
  const config = cachedConfig || {
    baseUrl,
    ...CREDENTIALS,
  };
  return new ZAI(config);
}

/**
 * Get the raw ZAI config.
 */
export function getZAIConfig(): ZAIConfig {
  if (cachedConfig) return cachedConfig;
  // Default to internal API (for local dev), will be overridden by initZAIConfig()
  return {
    baseUrl: INTERNAL_API_BASE,
    ...CREDENTIALS,
  };
}

/**
 * Initialize config — call this at the start of API route handlers.
 * Determines which API endpoint is reachable.
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
