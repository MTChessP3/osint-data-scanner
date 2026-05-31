/**
 * Alert Interceptor Engine — Scans OSINT results for keyword matches and fires Telegram alerts
 *
 * Main function: interceptAndAlert(results, scanContext)
 * - For each OSINT result, checks if title + description + dataFound matches any keyword
 * - If matched, extracts source metadata (Telegram channel/group, web source, etc.)
 * - Sends Telegram alert with full metadata
 * - Returns list of fired alerts
 *
 * Non-blocking: If Telegram API fails, the scan still completes.
 */

import { matchKeyword } from '../alert-keywords';
import { sendTelegramAlert, isTelegramConfigured, type TelegramAlert } from '../telegram-alerts';
import type { OSINTResult } from '../osint-scanner';

// ── Interfaces ──

export interface ScanContext {
  scanId?: string;
  fullName: string;
  email?: string;
  cedula?: string;
  phone?: string;
}

export interface AlertResult {
  fired: boolean;
  keyword: string;
  sourceType: string;
  sourceName: string;
  telegramSent: boolean;
  error?: string;
}

// ── In-memory alert history (last 50 alerts) ──

const alertHistory: Array<{
  keyword: string;
  sourceType: string;
  sourceName: string;
  timestamp: string;
  telegramSent: boolean;
}> = [];

export function getAlertHistory() {
  return [...alertHistory];
}

// ── Source Metadata Extraction ──

interface SourceMetadata {
  sourceType: TelegramAlert['sourceType'];
  sourceId: string;
  sourceName: string;
  sourceUsername?: string;
  sourceUrl: string;
}

function extractSourceMetadata(result: OSINTResult): SourceMetadata {
  const url = result.url || '';
  const dataFound = result.dataFound || '';
  const title = result.title || '';
  const source = result.source || '';
  const category = result.category || '';

  const isTelegramSource =
    source.toLowerCase().includes('telegram') ||
    category.toLowerCase().includes('telegram_') ||
    url.includes('t.me') ||
    url.includes('telegram.me');

  if (isTelegramSource) {
    return extractTelegramMetadata(result, url, dataFound, title);
  }

  return extractWebMetadata(result, url, dataFound, title, category, source);
}

function extractTelegramMetadata(
  result: OSINTResult,
  url: string,
  dataFound: string,
  title: string
): SourceMetadata {
  // Parse t.me links for channel/group username
  const tmeMatch = url.match(/(?:t\.me|telegram\.me)\/([a-zA-Z0-9_]{5,32})/);
  const username = tmeMatch ? tmeMatch[1] : undefined;

  // Skip common non-entity paths
  const skipUsernames = ['s', 'login', 'joinchat', 'addstickers', 'proxy', 'iv', 'confirmphone', 'setlanguage'];
  const cleanUsername = username && !skipUsernames.includes(username.toLowerCase()) ? username : undefined;

  // Determine entity type from dataFound and title
  const combinedText = `${dataFound} ${title} ${result.description || ''}`.toLowerCase();
  let sourceType: TelegramAlert['sourceType'] = 'unknown';

  if (combinedText.includes('canal') || combinedText.includes('channel') || result.category === 'telegram_channels') {
    sourceType = 'channel';
  } else if (combinedText.includes('grupo') || combinedText.includes('group') || combinedText.includes('chat') || result.category === 'telegram_groups') {
    sourceType = 'group';
  } else if (combinedText.includes('bot') || result.category === 'telegram_bots') {
    sourceType = 'bot';
  } else if (combinedText.includes('usuario') || combinedText.includes('user') || result.category === 'telegram_profile_verified') {
    sourceType = 'user';
  } else if (result.category === 'telegram_presence' || result.category === 'telegram_search') {
    // Default to channel for general telegram presence findings
    sourceType = 'channel';
  }

  // Extract channel/group name from title or dataFound
  const sourceName = extractTelegramName(title, dataFound, cleanUsername);

  return {
    sourceType,
    sourceId: cleanUsername || url || result.source || 'telegram_unknown',
    sourceName,
    sourceUsername: cleanUsername,
    sourceUrl: url || (cleanUsername ? `https://t.me/${cleanUsername}` : 'https://t.me'),
  };
}

function extractTelegramName(title: string, dataFound: string, username?: string): string {
  // Try to extract from title: "3 canal(es) de Telegram encontrado(s) para "@user""
  const titleMatch = title.match(/(?:canal|grupo|bot|perfil)[^"]*"(@?\w+)"/i);
  if (titleMatch) return titleMatch[1];

  // Try to extract from title directly
  const presenceMatch = title.match(/para\s+"(@?[^"]+)"/i);
  if (presenceMatch) return presenceMatch[1];

  // Try from dataFound
  const dataNameMatch = dataFound.match(/(?:Nombre|Canal|Grupo):\s*([^\n|]+)/i);
  if (dataNameMatch) return dataNameMatch[1].trim();

  // Fall back to username
  if (username) return `@${username}`;

  return 'Telegram Entity';
}

function extractWebMetadata(
  result: OSINTResult,
  url: string,
  dataFound: string,
  title: string,
  category: string,
  source: string
): SourceMetadata {
  let sourceType: TelegramAlert['sourceType'] = 'unknown';
  let sourceName = source || 'Web Source';
  let sourceUrl = url;

  // Classify based on category and source
  if (category.includes('credential') || category.includes('breach') || category.includes('password')) {
    sourceType = 'web';
    sourceName = source || 'Credential Breach';
  } else if (category.includes('dark_web') || category.includes('paste')) {
    sourceType = 'web';
    sourceName = source || 'Dark Web';
  } else if (category.includes('social_media')) {
    sourceType = 'web';
    sourceName = source || 'Social Media';
  } else if (category.includes('document') || category.includes('judicial')) {
    sourceType = 'web';
    sourceName = source || 'Document/Judicial';
  } else {
    sourceType = 'web';
  }

  // Try to extract host from URL
  if (url) {
    try {
      const host = new URL(url).hostname;
      if (sourceName === 'Web Source' || sourceName === source) {
        sourceName = host;
      }
    } catch { /* invalid URL */ }
  }

  return {
    sourceType,
    sourceId: url || source || 'web_unknown',
    sourceName,
    sourceUrl: sourceUrl || url || '',
  };
}

// ── Severity Determination ──

function determineSeverity(result: OSINTResult): TelegramAlert['severity'] {
  // Map OSINT severity to alert severity
  switch (result.severity) {
    case 'critical': return 'critical';
    case 'high': return 'high';
    case 'medium': return 'medium';
    case 'low':
    case 'info': return 'low';
    default: return 'medium';
  }
}

// ── Main Interceptor Function ──

export async function interceptAndAlert(
  results: OSINTResult[],
  scanContext: ScanContext
): Promise<AlertResult[]> {
  const alertResults: AlertResult[] = [];
  const telegramAvailable = isTelegramConfigured();

  for (const result of results) {
    // Combine all text fields for keyword matching
    const combinedText = [
      result.title,
      result.description || '',
      result.dataFound || '',
    ].join(' ');

    const match = matchKeyword(combinedText);
    if (!match) continue;

    // Extract source metadata
    const metadata = extractSourceMetadata(result);
    const severity = determineSeverity(result);

    // Build the Telegram alert
    const alert: TelegramAlert = {
      alertType: 'KEYWORD_MATCH',
      severity,
      timestamp: new Date().toISOString(),
      keyword: match.keyword,
      matchedContext: match.context,
      sourceType: metadata.sourceType,
      sourceId: metadata.sourceId,
      sourceName: metadata.sourceName,
      sourceUsername: metadata.sourceUsername,
      sourceUrl: metadata.sourceUrl,
      scanId: scanContext.scanId,
      subjectName: scanContext.fullName,
      subjectIdentifiers: {
        email: scanContext.email,
        cedula: scanContext.cedula,
        phone: scanContext.phone,
      },
      findingTitle: result.title,
      findingDescription: result.description || result.dataFound || '',
      findingCategory: result.category,
      findingUrl: result.url,
    };

    // Send Telegram alert (non-blocking if it fails)
    let telegramSent = false;
    let error: string | undefined;

    if (telegramAvailable) {
      try {
        telegramSent = await sendTelegramAlert(alert);
      } catch (err) {
        error = err instanceof Error ? err.message : 'Unknown error';
        console.warn('[AlertInterceptor] Telegram send failed:', error);
      }
    } else {
      error = 'Telegram not configured';
    }

    // Record in history
    const historyEntry = {
      keyword: match.keyword,
      sourceType: metadata.sourceType,
      sourceName: metadata.sourceName,
      timestamp: new Date().toISOString(),
      telegramSent,
    };
    alertHistory.unshift(historyEntry);
    if (alertHistory.length > 50) alertHistory.pop();

    alertResults.push({
      fired: true,
      keyword: match.keyword,
      sourceType: metadata.sourceType,
      sourceName: metadata.sourceName,
      telegramSent,
      error,
    });
  }

  if (alertResults.length > 0) {
    console.log(`[AlertInterceptor] ${alertResults.length} alert(s) fired (${alertResults.filter(a => a.telegramSent).length} Telegram sent)`);
  }

  return alertResults;
}
