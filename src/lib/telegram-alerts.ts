/**
 * Telegram Bot Alert Service — Sends real-time OSINT alerts via Telegram Bot API
 *
 * Configuration via env vars:
 *   TELEGRAM_BOT_TOKEN — Bot token from @BotFather
 *   TELEGRAM_CHAT_ID  — Channel/chat ID for alerts
 *
 * Uses Telegram Bot API (free tier): https://api.telegram.org/bot{TOKEN}/sendMessage
 * Supports rich HTML formatting for structured alert messages.
 */

// ── Alert Payload Interface ──

export interface TelegramAlert {
  // Alert classification
  alertType: 'KEYWORD_MATCH';
  severity: 'critical' | 'high' | 'medium' | 'low';
  timestamp: string; // ISO 8601

  // Keyword detection details
  keyword: string;           // The matched keyword (e.g., "Bancolombia")
  matchedContext: string;    // Text surrounding the match (±50 chars)

  // Source identification — CRITICAL: differentiate Channel vs Chat (Group)
  sourceType: 'channel' | 'chat' | 'group' | 'user' | 'bot' | 'web' | 'unknown';
  sourceId: string;          // ID of the channel/chat/group
  sourceName: string;        // Display name of the community
  sourceUsername?: string;   // Public username (if available)
  sourceUrl: string;         // Direct link to the message or group

  // Investigation context
  scanId?: string;           // OSINT scan ID that triggered the alert
  subjectName: string;       // Name of the person being investigated
  subjectIdentifiers?: {     // Additional identifiers
    email?: string;
    cedula?: string;
    phone?: string;
  };

  // Raw finding data
  findingTitle: string;      // Title of the OSINT finding
  findingDescription: string; // Description of the finding
  findingCategory: string;   // Category (e.g., 'telegram_channels', 'credential_breach')
  findingUrl?: string;       // URL of the original finding
}

// ── Configuration Check ──

export function isTelegramConfigured(): boolean {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  return !!(token && token.trim().length > 0 && chatId && chatId.trim().length > 0);
}

// ── Severity Emoji ──

function getSeverityEmoji(severity: TelegramAlert['severity']): string {
  switch (severity) {
    case 'critical': return '🔴';
    case 'high': return '🟠';
    case 'medium': return '🟡';
    case 'low': return '🟢';
    default: return '⚪';
  }
}

// ── Source Type Badge ──

function getSourceBadge(sourceType: TelegramAlert['sourceType']): string {
  switch (sourceType) {
    case 'channel': return '[CANAL]';
    case 'chat': return '[CHAT]';
    case 'group': return '[CHAT/GROUP]';
    case 'user': return '[USUARIO]';
    case 'bot': return '[BOT]';
    case 'web': return '[WEB]';
    default: return '[DESCONOCIDO]';
  }
}

// ── Format Telegram HTML Message ──

function formatAlertMessage(alert: TelegramAlert): string {
  const emoji = getSeverityEmoji(alert.severity);
  const badge = getSourceBadge(alert.sourceType);
  const severityLabel = alert.severity.toUpperCase();

  const lines: string[] = [
    `${emoji} <b>ALERTA OSINT — ${severityLabel}</b> ${emoji}`,
    `<b>Tipo:</b> ${alert.alertType}`,
    `<b>Palabra clave:</b> <code>${escapeHtml(alert.keyword)}</code>`,
    '',
    `━━━━━━━━━━━━━━━━━━━━━━`,
    `${badge} <b>Fuente</b>`,
    `<b>Nombre:</b> ${escapeHtml(alert.sourceName)}`,
    `<b>Tipo:</b> ${alert.sourceType}`,
    `<b>ID:</b> <code>${escapeHtml(alert.sourceId)}</code>`,
  ];

  if (alert.sourceUsername) {
    lines.push(`<b>Username:</b> @${escapeHtml(alert.sourceUsername)}`);
  }

  lines.push(`<b>Enlace:</b> ${alert.sourceUrl}`);
  lines.push('');
  lines.push(`━━━━━━━━━━━━━━━━━━━━━━`);
  lines.push(`👤 <b>Sujeto investigado</b>`);
  lines.push(`<b>Nombre:</b> ${escapeHtml(alert.subjectName)}`);

  if (alert.subjectIdentifiers) {
    if (alert.subjectIdentifiers.email) {
      lines.push(`<b>Email:</b> <code>${escapeHtml(alert.subjectIdentifiers.email)}</code>`);
    }
    if (alert.subjectIdentifiers.cedula) {
      lines.push(`<b>Cédula:</b> <code>${escapeHtml(alert.subjectIdentifiers.cedula)}</code>`);
    }
    if (alert.subjectIdentifiers.phone) {
      lines.push(`<b>Teléfono:</b> <code>${escapeHtml(alert.subjectIdentifiers.phone)}</code>`);
    }
  }

  lines.push('');
  lines.push(`━━━━━━━━━━━━━━━━━━━━━━`);
  lines.push(`🔍 <b>Hallazgo</b>`);
  lines.push(`<b>Título:</b> ${escapeHtml(alert.findingTitle)}`);

  const shortDesc = alert.findingDescription.length > 300
    ? alert.findingDescription.substring(0, 300) + '...'
    : alert.findingDescription;
  lines.push(`<b>Descripción:</b> ${escapeHtml(shortDesc)}`);
  lines.push(`<b>Categoría:</b> ${escapeHtml(alert.findingCategory)}`);

  if (alert.findingUrl) {
    lines.push(`<b>URL hallazgo:</b> ${alert.findingUrl}`);
  }

  lines.push('');
  lines.push(`━━━━━━━━━━━━━━━━━━━━━━`);
  lines.push(`📝 <b>Contexto detectado</b>`);
  lines.push(`<i>${escapeHtml(alert.matchedContext)}</i>`);

  if (alert.scanId) {
    lines.push('');
    lines.push(`🆔 Scan ID: <code>${escapeHtml(alert.scanId)}</code>`);
  }

  lines.push('');
  lines.push(`🕐 ${alert.timestamp}`);

  return lines.join('\n');
}

// ── HTML Escaping ──

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Send Telegram Alert ──

export async function sendTelegramAlert(alert: TelegramAlert): Promise<boolean> {
  if (!isTelegramConfigured()) {
    console.warn('[TelegramAlert] Not configured — skipping alert');
    return false;
  }

  const token = process.env.TELEGRAM_BOT_TOKEN!;
  const chatId = process.env.TELEGRAM_CHAT_ID!;
  const apiUrl = `https://api.telegram.org/bot${token}/sendMessage`;

  const message = formatAlertMessage(alert);

  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
      signal: AbortSignal.timeout(15000), // 15s timeout
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => 'unknown');
      console.error(`[TelegramAlert] API error ${response.status}: ${errorBody}`);
      return false;
    }

    const data = await response.json();
    if (!data.ok) {
      console.error(`[TelegramAlert] API returned not ok:`, data);
      return false;
    }

    console.log(`[TelegramAlert] Alert sent successfully — keyword: "${alert.keyword}", source: ${alert.sourceName}`);
    return true;
  } catch (error) {
    console.error('[TelegramAlert] Failed to send alert:', error instanceof Error ? error.message : 'unknown');
    return false;
  }
}

// ── Test Telegram Alert ──

export async function testTelegramAlert(): Promise<boolean> {
  if (!isTelegramConfigured()) {
    console.warn('[TelegramAlert] Cannot test — not configured');
    return false;
  }

  const testAlert: TelegramAlert = {
    alertType: 'KEYWORD_MATCH',
    severity: 'medium',
    timestamp: new Date().toISOString(),
    keyword: 'bancolombia',
    matchedContext: 'Se detectó mención de "bancolombia" en resultados de escaneo de prueba...',
    sourceType: 'channel',
    sourceId: 'test_channel_001',
    sourceName: 'Canal de Prueba OSINT',
    sourceUsername: 'test_osint_channel',
    sourceUrl: 'https://t.me/test_osint_channel',
    subjectName: 'Sujeto de Prueba',
    subjectIdentifiers: {
      email: 'prueba@ejemplo.com',
    },
    findingTitle: 'Alerta de prueba — Verificación de conexión',
    findingDescription: 'Esta es una alerta de prueba para verificar que la integración con Telegram Bot está funcionando correctamente. Si recibes este mensaje, la configuración es exitosa.',
    findingCategory: 'test_alert',
    findingUrl: 'https://t.me/test_osint_channel',
  };

  return sendTelegramAlert(testAlert);
}
