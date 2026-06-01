/**
 * Alert Keywords Module — Dynamic keyword blacklist for OSINT alert interception
 *
 * Extensible, parametrizable, decoupled keyword list that supports:
 * - Default keywords: ['bancolombia'] (case-insensitive matching)
 * - Runtime management: addKeyword(), removeKeyword(), getKeywords(), setKeywords()
 * - Environment variable override: ALERT_KEYWORDS (comma-separated)
 * - Context extraction: matchKeyword() returns surrounding ±50 chars
 */

// ── In-memory keyword storage ──

const DEFAULT_KEYWORDS = ['bancolombia'];

let keywords: string[] = loadInitialKeywords();

function loadInitialKeywords(): string[] {
  const envKeywords = process.env.ALERT_KEYWORDS;
  if (envKeywords && envKeywords.trim().length > 0) {
    const parsed = envKeywords
      .split(',')
      .map(k => k.trim().toLowerCase())
      .filter(k => k.length > 0);
    if (parsed.length > 0) return parsed;
  }
  return [...DEFAULT_KEYWORDS];
}

// ── Public API ──

export function getKeywords(): string[] {
  return [...keywords];
}

export function addKeyword(keyword: string): string[] {
  const normalized = keyword.trim().toLowerCase();
  if (normalized.length === 0) return getKeywords();
  if (!keywords.includes(normalized)) {
    keywords.push(normalized);
  }
  return getKeywords();
}

export function removeKeyword(keyword: string): string[] {
  const normalized = keyword.trim().toLowerCase();
  keywords = keywords.filter(k => k !== normalized);
  return getKeywords();
}

export function setKeywords(newKeywords: string[]): string[] {
  keywords = newKeywords
    .map(k => k.trim().toLowerCase())
    .filter(k => k.length > 0);
  // Deduplicate
  keywords = [...new Set(keywords)];
  return getKeywords();
}

/**
 * Match any keyword against the given text.
 * Case-insensitive matching.
 * Returns the matched keyword and surrounding context (±50 chars), or null if no match.
 */
export function matchKeyword(text: string): { matched: boolean; keyword: string; context: string } | null {
  if (!text || text.length === 0) return null;

  const textLower = text.toLowerCase();

  for (const keyword of keywords) {
    const idx = textLower.indexOf(keyword);
    if (idx !== -1) {
      // Extract context: ±50 chars around the match
      const contextStart = Math.max(0, idx - 50);
      const contextEnd = Math.min(text.length, idx + keyword.length + 50);
      const context = text.substring(contextStart, contextEnd);

      return {
        matched: true,
        keyword,
        context,
      };
    }
  }

  return null;
}
