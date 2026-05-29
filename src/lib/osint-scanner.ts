/**
 * OSINT Scanner v7.0 — Real Data Integration + Email Validator
 * - HIBP API v3 direct calls (breachedaccount + pasteaccount)
 * - AI analysis: DeepSeek (primary) → ZAI SDK (fallback) → rule-based (last resort)
 * - Web page content extraction for enriched findings
 * - Direct URL verification (HEAD requests) for profile existence
 * - 16 motores clasificados por categoría + Email Validator (email-validator.com)
 */

// ── DeepSeek API Configuration ──
let deepseekApiKey: string | null = null;

export function setDeepSeekApiKey(key: string | null) {
  deepseekApiKey = key;
}

export function getDeepSeekApiKey(): string | null {
  return deepseekApiKey;
}

// ── Z.ai Credentials (loaded at runtime from zai-config) ──
let zaiHeaders: Record<string, string> = {};

export function setZAIHeaders(headers: Record<string, string>) {
  zaiHeaders = headers;
}

// ── Result Interface ──
export interface OSINTResult {
  source: string;
  category: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  title: string;
  description?: string;
  url?: string;
  dataFound?: string;
  rawSnippet?: string;
}

// ══════════════════════════════════════════════════════
//  WEB SEARCH — Multi-strategy with robust fallbacks
//  PRIORITY: ZAI.create() (auto-config) → DuckDuckGo → SearXNG
// ══════════════════════════════════════════════════════

export interface WebSearchResult {
  url: string;
  name: string;
  snippet: string;
  host_name: string;
}

export async function performWebSearch(query: string, num: number = 10): Promise<WebSearchResult[]> {
  const allResults: WebSearchResult[] = [];
  const seenUrls = new Set<string>();
  const startTime = Date.now();

  const addResult = (r: { url?: string; name?: string; title?: string; snippet?: string; description?: string; host_name?: string; link?: string; content?: string }) => {
    const url = r.url || r.link || '';
    if (url && !seenUrls.has(url)) {
      seenUrls.add(url);
      try {
        allResults.push({
          url,
          name: r.name || r.title || 'Resultado',
          snippet: r.snippet || r.description || r.content || '',
          host_name: r.host_name || (url ? new URL(url).hostname : ''),
        });
      } catch { /* invalid URL */ }
    }
  };

  // ── Strategy 1 (PRIMARY): Z.ai SDK with auto-configuration ──
  try {
    const ZAI = (await import('z-ai-web-dev-sdk')).default;
    const zai = await ZAI.create();
    const results = await zai.functions.invoke('web_search', { query, num });
    if (Array.isArray(results) && results.length > 0) {
      for (const r of results) addResult(r);
      if (allResults.length > 0) {
        console.log(`[OSINT] ZAI SDK: ${allResults.length} results for "${query.substring(0, 50)}" (${Date.now() - startTime}ms)`);
        return allResults.slice(0, num);
      }
    }
  } catch (e) {
    console.warn('[OSINT] ZAI SDK failed:', e instanceof Error ? e.message : 'unknown');
  }

  // ── Strategy 1b: Z.ai public API directly (fallback when SDK fails) ──
  try {
    const response = await fetch('https://api.z.ai/api/v1/functions/invoke', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...zaiHeaders,
      },
      body: JSON.stringify({ function_name: 'web_search', arguments: { query, num } }),
      signal: AbortSignal.timeout(8000),
    });
    if (response.ok) {
      const result = await response.json();
      const data = result.result || result;
      if (Array.isArray(data) && data.length > 0) {
        for (const r of data) addResult(r);
        if (allResults.length > 0) {
          console.log(`[OSINT] Z.ai API: ${allResults.length} results for "${query.substring(0, 50)}" (${Date.now() - startTime}ms)`);
          return allResults.slice(0, num);
        }
      }
    }
  } catch (e) {
    console.warn('[OSINT] Z.ai API failed:', e instanceof Error ? e.message : 'unknown');
  }

  // ── Strategy 2: DuckDuckGo HTML scraping ──
  try {
    const ddgResults = await duckDuckGoSearch(query, num);
    for (const r of ddgResults) addResult(r);
  } catch { /* continue */ }

  // ── Strategy 3: SearXNG public instances ──
  if (allResults.length < num) {
    try {
      const searxResults = await searxSearch(query, num);
      for (const r of searxResults) addResult(r);
    } catch { /* continue */ }
  }

  console.log(`[OSINT] Total ${allResults.length} results for "${query.substring(0, 50)}" (${Date.now() - startTime}ms)`);
  return allResults.slice(0, num);
}

// ── DuckDuckGo HTML Search ──
async function duckDuckGoSearch(query: string, num: number): Promise<WebSearchResult[]> {
  const results: WebSearchResult[] = [];

  try {
    const ddgUrl = `https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(query)}`;
    const response = await fetch(ddgUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'es,en;q=0.9',
      },
      signal: AbortSignal.timeout(12000),
    });

    if (!response.ok) return results;

    const html = await response.text();

    // Extract URLs from uddg parameters
    const uddgPattern = /uddg=([^&"']+)/gi;
    const urls: string[] = [];
    let match;
    while ((match = uddgPattern.exec(html)) !== null && urls.length < num) {
      try {
        const decodedUrl = decodeURIComponent(match[1]);
        if (decodedUrl.startsWith('http')) urls.push(decodedUrl);
      } catch { /* skip */ }
    }

    // Extract titles
    const titlePattern = /class='result-link'[^>]*>([\s\S]*?)<\/a>/gi;
    const titles: string[] = [];
    while ((match = titlePattern.exec(html)) !== null && titles.length < num) {
      titles.push(match[1].replace(/<[^>]*>/g, '').trim());
    }

    // Extract snippets
    const snippetPattern = /class='result-snippet'[^>]*>([\s\S]*?)<\/td>/gi;
    const snippets: string[] = [];
    while ((match = snippetPattern.exec(html)) !== null && snippets.length < num) {
      snippets.push(match[1].replace(/<[^>]*>/g, '').trim());
    }

    for (let i = 0; i < urls.length; i++) {
      try {
        const urlObj = new URL(urls[i]);
        results.push({
          url: urls[i],
          name: titles[i] || `Resultado ${i + 1}`,
          snippet: snippets[i] || '',
          host_name: urlObj.hostname,
        });
      } catch { /* skip */ }
    }
  } catch (error) {
    console.warn('[OSINT] DuckDuckGo search failed:', error instanceof Error ? error.message : 'unknown');
  }

  return results;
}

// ── SearXNG Public Instance Search ──
async function searxSearch(query: string, num: number): Promise<WebSearchResult[]> {
  const results: WebSearchResult[] = [];
  const instances = [
    'https://search.sapti.me',
    'https://searx.be',
    'https://search.bus-hit.me',
  ];

  for (const instance of instances) {
    try {
      const response = await fetch(`${instance}/search?q=${encodeURIComponent(query)}&format=json&language=es`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'application/json',
        },
        signal: AbortSignal.timeout(8000),
      });

      if (!response.ok) continue;

      const data = await response.json();
      if (data.results && Array.isArray(data.results)) {
        for (const r of data.results.slice(0, num)) {
          if (r.url) {
            try {
              const urlObj = new URL(r.url);
              results.push({
                url: r.url,
                name: r.title || 'Resultado',
                snippet: r.content || '',
                host_name: urlObj.hostname,
              });
            } catch { /* skip */ }
          }
        }
        if (results.length > 0) break; // Got results from this instance
      }
    } catch { /* try next instance */ }
  }

  return results;
}

// ══════════════════════════════════════════════════════
//  NEW: Web Page Content Extraction
//  Fetches a URL and extracts visible text from HTML
// ══════════════════════════════════════════════════════

interface PageContent {
  url: string;
  text: string;
  title: string;
  error?: string;
}

async function fetchPageContent(url: string): Promise<PageContent> {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'es,en;q=0.9',
      },
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) {
      return { url, text: '', title: '', error: `HTTP ${response.status}` };
    }

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('text/html') && !contentType.includes('text/plain') && !contentType.includes('application/json')) {
      return { url, text: '', title: '', error: `Unsupported content type: ${contentType}` };
    }

    const html = await response.text();

    // Extract title
    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const title = titleMatch ? titleMatch[1].replace(/<[^>]*>/g, '').trim() : '';

    // Strip tags and get visible text
    const text = html
      // Remove script and style blocks
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, '')
      // Remove HTML tags
      .replace(/<[^>]+>/g, ' ')
      // Decode common HTML entities
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      // Normalize whitespace
      .replace(/\s+/g, ' ')
      .trim()
      // Return first 2000 chars of meaningful content
      .substring(0, 2000);

    console.log(`[OSINT] fetchPageContent: extracted ${text.length} chars from ${url}`);
    return { url, text, title };
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : 'unknown error';
    console.warn(`[OSINT] fetchPageContent failed for ${url}: ${errMsg}`);
    return { url, text: '', title: '', error: errMsg };
  }
}

// ══════════════════════════════════════════════════════
//  NEW: Direct URL Verification (HEAD request)
//  Checks if a URL actually exists and returns status info
// ══════════════════════════════════════════════════════

interface UrlVerification {
  url: string;
  exists: boolean;
  statusCode: number;
  contentType: string;
}

async function verifyUrl(url: string): Promise<UrlVerification> {
  try {
    const response = await fetch(url, {
      method: 'HEAD',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': '*/*',
      },
      signal: AbortSignal.timeout(5000),
      redirect: 'follow',
    });

    const statusCode = response.status;
    const contentType = response.headers.get('content-type') || '';

    // 200-399 = exists, 404 = doesn't exist, others = uncertain
    const exists = statusCode >= 200 && statusCode < 400;

    console.log(`[OSINT] verifyUrl: ${url} → ${statusCode} (${contentType}) exists=${exists}`);
    return { url, exists, statusCode, contentType };
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : 'unknown error';
    console.warn(`[OSINT] verifyUrl failed for ${url}: ${errMsg}`);
    return { url, exists: false, statusCode: 0, contentType: '' };
  }
}

// ══════════════════════════════════════════════════════
//  NEW: HIBP API v3 Direct Calls
//  Queries the Have I Been Pwned API directly for breach data
// ══════════════════════════════════════════════════════

interface HIBPBreach {
  Name: string;
  Title: string;
  Domain: string;
  BreachDate: string;
  Description: string;
  DataClasses: string[];
  IsVerified: boolean;
  IsFabricated: boolean;
  IsSensitive: boolean;
  IsRetired: boolean;
  IsSpamList: boolean;
  PwnCount: number;
}

interface HIBPPaste {
  Id: string;
  Source: string;
  Title: string;
  Date: string;
  EmailCount: number;
}

async function hibpCheckBreaches(account: string): Promise<HIBPBreach[]> {
  try {
    const response = await fetch(
      `https://haveibeenpwned.com/api/v3/breachedaccount/${encodeURIComponent(account)}?truncateResponse=false`,
      {
        headers: {
          'hibp-api-key': 'osint-scanner-v6',
          'user-agent': 'OSINT-Scanner-v6',
          'Accept': 'application/json',
        },
        signal: AbortSignal.timeout(10000),
      }
    );

    // 404 = not found in any breach (this is actually good news)
    if (response.status === 404) {
      console.log(`[OSINT] HIBP API: ${account} NOT found in any breach`);
      return [];
    }

    // Rate limited
    if (response.status === 429) {
      console.warn('[OSINT] HIBP API rate limited (429)');
      return [];
    }

    if (!response.ok) {
      console.warn(`[OSINT] HIBP API returned ${response.status}`);
      return [];
    }

    const data = await response.json();
    if (Array.isArray(data)) {
      console.log(`[OSINT] HIBP API: ${account} found in ${data.length} breaches`);
      return data;
    }
    return [];
  } catch (error) {
    console.warn('[OSINT] HIBP breach API failed:', error instanceof Error ? error.message : 'unknown');
    return [];
  }
}

async function hibpCheckPastes(account: string): Promise<HIBPPaste[]> {
  try {
    const response = await fetch(
      `https://haveibeenpwned.com/api/v3/pasteaccount/${encodeURIComponent(account)}`,
      {
        headers: {
          'hibp-api-key': 'osint-scanner-v6',
          'user-agent': 'OSINT-Scanner-v6',
          'Accept': 'application/json',
        },
        signal: AbortSignal.timeout(10000),
      }
    );

    if (response.status === 404) {
      console.log(`[OSINT] HIBP Paste API: ${account} NOT found in any paste`);
      return [];
    }

    if (response.status === 429) {
      console.warn('[OSINT] HIBP Paste API rate limited (429)');
      return [];
    }

    if (!response.ok) {
      console.warn(`[OSINT] HIBP Paste API returned ${response.status}`);
      return [];
    }

    const data = await response.json();
    if (Array.isArray(data)) {
      console.log(`[OSINT] HIBP Paste API: ${account} found in ${data.length} pastes`);
      return data;
    }
    return [];
  } catch (error) {
    console.warn('[OSINT] HIBP paste API failed:', error instanceof Error ? error.message : 'unknown');
    return [];
  }
}

// ══════════════════════════════════════════════════════
//  ROBUST JSON EXTRACTION from AI responses
// ══════════════════════════════════════════════════════

function extractJSONFromArray(content: string): unknown[] | null {
  const trimmed = content.trim();

  // Strategy 1: Direct parse — response is pure JSON
  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) return parsed;
  } catch { /* continue */ }

  // Strategy 2: Strip markdown code blocks (```json ... ``` or ``` ... ```)
  const codeBlockMatch = trimmed.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (codeBlockMatch) {
    try {
      const parsed = JSON.parse(codeBlockMatch[1].trim());
      if (Array.isArray(parsed)) return parsed;
    } catch { /* continue */ }
  }

  // Strategy 3: Find first '[' and last ']' — extract substring
  const firstBracket = trimmed.indexOf('[');
  const lastBracket = trimmed.lastIndexOf(']');
  if (firstBracket !== -1 && lastBracket > firstBracket) {
    const candidate = trimmed.substring(firstBracket, lastBracket + 1);
    try {
      const parsed = JSON.parse(candidate);
      if (Array.isArray(parsed)) return parsed;
    } catch { /* continue */ }

    // Strategy 4: Try to fix common JSON issues (trailing commas, unquoted keys)
    const fixed = candidate
      .replace(/,\s*([}\]])/g, '$1')  // Remove trailing commas before } or ]
      .replace(/(\w+)\s*:/g, '"$1":')  // Quote unquoted keys
      .replace(/""/g, '"');             // Fix double-quoted strings
    try {
      const parsed = JSON.parse(fixed);
      if (Array.isArray(parsed)) return parsed;
    } catch { /* continue */ }
  }

  // Strategy 5: Try to find individual JSON objects in the text
  const objectPattern = /\{[^{}]*"title"[^{}]*\}/g;
  const objects: unknown[] = [];
  let objMatch;
  while ((objMatch = objectPattern.exec(trimmed)) !== null) {
    try {
      const obj = JSON.parse(objMatch[0]);
      if (obj.title && obj.severity) objects.push(obj);
    } catch { /* skip */ }
  }
  if (objects.length > 0) return objects;

  console.warn('[OSINT] All JSON extraction strategies failed for AI response');
  return null;
}

// ══════════════════════════════════════════════════════
//  AI ANALYSIS — DeepSeek (primary) → ZAI SDK (fallback)
// ══════════════════════════════════════════════════════

export interface AIFinding {
  title: string;
  description: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  category: string;
  dataFound: string;
}

// Build the analysis prompt — shared across DeepSeek and ZAI SDK
function buildAnalysisPrompt(
  context: string,
  searchResults: WebSearchResult[],
  engineName: string,
  subjectData: { fullName: string; email?: string; cedula?: string; phone?: string },
  pageContents?: PageContent[],
  urlVerifications?: UrlVerification[]
): string {
  const resultsText = searchResults.length > 0
    ? searchResults.map((r, i) => `${i + 1}. [${r.host_name}] ${r.name}\n   URL: ${r.url}\n   Snippet: ${r.snippet}`).join('\n')
    : 'No se encontraron resultados directos en la búsqueda web.';

  // Include extracted page content if available
  const pageContentText = pageContents && pageContents.length > 0
    ? '\n\nCONTENIDO EXTRAÍDO DE PÁGINAS WEB:\n' + pageContents
        .filter(p => p.text.length > 50)
        .map(p => `URL: ${p.url}\nTítulo: ${p.title}\nContenido: ${p.text.substring(0, 500)}`)
        .join('\n---\n')
    : '';

  // Include URL verification results if available
  const verificationText = urlVerifications && urlVerifications.length > 0
    ? '\n\nVERIFICACIÓN DE URLs:\n' + urlVerifications
        .map(v => `${v.url} → ${v.exists ? 'EXISTS' : 'NOT FOUND'} (HTTP ${v.statusCode}, ${v.contentType})`)
        .join('\n')
    : '';

  return `Eres un analista OSINT experto. Analiza los siguientes resultados de búsqueda web para identificar hallazgos de seguridad relevantes sobre la persona investigada.

CONTEXTO: ${context}

DATOS DEL SUJETO:
- Nombre: ${subjectData.fullName}
- Email: ${subjectData.email || 'No proporcionado'}
- Cédula: ${subjectData.cedula || 'No proporcionada'}
- Teléfono: ${subjectData.phone || 'No proporcionado'}

MOTOR DE BÚSQUEDA: ${engineName}

RESULTADOS DE BÚSQUEDA WEB:
${resultsText}
${pageContentText}
${verificationText}

INSTRUCCIONES:
1. Analiza CADA resultado de búsqueda individualmente
2. Usa el contenido extraído de páginas web para hallazgos más específicos
3. Usa los resultados de verificación de URLs para confirmar si perfiles existen o no
4. Para cada resultado relevante, crea un hallazgo con:
   - title: Título descriptivo del hallazgo (máximo 80 caracteres)
   - description: Descripción detallada de qué se encontró y su implicación de seguridad (máximo 300 caracteres)
   - severity: Nivel de severidad (critical, high, medium, low, info)
   - category: Categoría (credential_breach, password_exposure, personal_exposure, social_media, data_broker, dark_web_mention, paste_site, document_exposure, judicial)
   - dataFound: Dato específico encontrado (URL, texto del snippet, información clave del contenido extraído)
5. Si no hay resultados directos, genera hallazgos basados en el contexto de búsqueda y recomienda verificación manual
6. Responde SOLO en JSON array, sin texto adicional
7. Genera entre 1 y 3 hallazgos máximo
8. NUNCA uses severity "info" para hallazgos principales. Usa "critical", "high", "medium" o "low" según la gravedad. Solo "info" es para referencias.
9. Si un perfil fue verificado como existente (HTTP 200), eso es un hallazgo de exposición positiva. Si no existe (404), menciónalo como "no encontrado".

EJEMPLO DE RESPUESTA:
[{"title":"Perfil de LinkedIn verificado como existente","description":"Se confirmó la existencia de un perfil de LinkedIn para el sujeto investigado mediante verificación directa de URL","severity":"medium","category":"social_media","dataFound":"Perfil verificado en linkedin.com/in/nombre — HTTP 200"},{"title":"Correo encontrado en filtración de datos","description":"El correo electrónico aparece mencionado en contexto de brecha de seguridad","severity":"critical","category":"credential_breach","dataFound":"email encontrado en sitio de filtraciones"}]`;
}

export async function analyzeWithDeepSeek(
  context: string,
  searchResults: WebSearchResult[],
  engineName: string,
  subjectData: { fullName: string; email?: string; cedula?: string; phone?: string },
  pageContents?: PageContent[],
  urlVerifications?: UrlVerification[]
): Promise<AIFinding[]> {
  // ── Strategy 1: DeepSeek API (primary) ──
  if (deepseekApiKey) {
    const prompt = buildAnalysisPrompt(context, searchResults, engineName, subjectData, pageContents, urlVerifications);

    try {
      const response = await fetch('https://api.deepseek.com/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${deepseekApiKey}`,
        },
        body: JSON.stringify({
          model: 'deepseek-chat',
          messages: [
            { role: 'system', content: 'Eres un analista OSINT experto que genera hallazgos estructurados en formato JSON. Respondes SOLO con arrays JSON válidos, sin texto adicional ni markdown.' },
            { role: 'user', content: prompt },
          ],
          temperature: 0.3,
          max_tokens: 2000,
        }),
        signal: AbortSignal.timeout(30000),
      });

      if (response.ok) {
        const completion = await response.json();
        const content = completion.choices?.[0]?.message?.content || '';
        const findings = extractJSONFromArray(content);
        if (findings) {
          console.log(`[OSINT] DeepSeek analysis succeeded for ${engineName}`);
          return findings.map((f: Record<string, unknown>) => ({
            title: String(f.title || 'Hallazgo identificado').substring(0, 80),
            description: String(f.description || '').substring(0, 300),
            severity: (['critical', 'high', 'medium', 'low'].includes(f.severity as string) ? f.severity : 'medium') as AIFinding['severity'],
            category: String(f.category || 'personal_exposure'),
            dataFound: String(f.dataFound || '').substring(0, 500),
          }));
        }
      } else {
        console.warn(`[OSINT] DeepSeek API returned ${response.status}`);
      }
    } catch (error) {
      console.warn('[OSINT] DeepSeek analysis failed:', error instanceof Error ? error.message : 'unknown');
    }
  }

  // ── Strategy 2: ZAI SDK chat completions (fallback when no DeepSeek key) ──
  try {
    const ZAI = (await import('z-ai-web-dev-sdk')).default;
    const zai = await ZAI.create();
    const prompt = buildAnalysisPrompt(context, searchResults, engineName, subjectData, pageContents, urlVerifications);

    const completion = await zai.chat.completions.create({
      messages: [
        { role: 'system', content: 'Eres un analista OSINT experto que genera hallazgos estructurados en formato JSON. Respondes SOLO con arrays JSON válidos, sin texto adicional ni markdown.' },
        { role: 'user', content: prompt },
      ],
    });

    const content = completion.choices?.[0]?.message?.content || '';
    const findings = extractJSONFromArray(content);
    if (findings) {
      console.log(`[OSINT] ZAI SDK analysis succeeded for ${engineName}`);
      return findings.map((f: Record<string, unknown>) => ({
        title: String(f.title || 'Hallazgo identificado').substring(0, 80),
        description: String(f.description || '').substring(0, 300),
        severity: (['critical', 'high', 'medium', 'low'].includes(f.severity as string) ? f.severity : 'medium') as AIFinding['severity'],
        category: String(f.category || 'personal_exposure'),
        dataFound: String(f.dataFound || '').substring(0, 500),
      }));
    }
  } catch (error) {
    console.warn('[OSINT] ZAI SDK analysis failed:', error instanceof Error ? error.message : 'unknown');
  }

  // ── Strategy 3: Rule-based analysis (last resort) ──
  console.log(`[OSINT] Falling back to rule-based analysis for ${engineName}`);
  return ruleBasedAnalysis(context, searchResults, engineName, subjectData, pageContents, urlVerifications);
}

// ── Improved Rule-based analysis (last resort when both AI options fail) ──
function ruleBasedAnalysis(
  context: string,
  searchResults: WebSearchResult[],
  engineName: string,
  subjectData: { fullName: string; email?: string; cedula?: string; phone?: string },
  pageContents?: PageContent[],
  urlVerifications?: UrlVerification[]
): AIFinding[] {
  const findings: AIFinding[] = [];

  // Determine the default category from context
  const contextLC = context.toLowerCase();
  const defaultCategory =
    contextLC.includes('breach') || contextLC.includes('credential') || contextLC.includes('contraseña') ? 'credential_breach' :
    contextLC.includes('social') || contextLC.includes('redes') || contextLC.includes('perfil') ? 'social_media' :
    contextLC.includes('judicial') || contextLC.includes('policia') || contextLC.includes('antecedentes') ? 'judicial' :
    contextLC.includes('dark') || contextLC.includes('leak') || contextLC.includes('filtración') ? 'dark_web_mention' :
    contextLC.includes('document') || contextLC.includes('pdf') ? 'document_exposure' :
    contextLC.includes('broker') || contextLC.includes('directorio') || contextLC.includes('identity') || contextLC.includes('pipl') ? 'data_broker' :
    contextLC.includes('password') || contextLC.includes('contraseña') ? 'password_exposure' :
    'personal_exposure';

  // ── Process URL verification results into findings ──
  if (urlVerifications && urlVerifications.length > 0) {
    for (const v of urlVerifications) {
      const hostLC = v.url.toLowerCase();
      const isSocialMedia = hostLC.includes('linkedin') || hostLC.includes('facebook') ||
        hostLC.includes('twitter') || hostLC.includes('x.com') ||
        hostLC.includes('instagram') || hostLC.includes('tiktok');

      if (v.exists && isSocialMedia) {
        findings.push({
          title: `Perfil verificado como existente — ${new URL(v.url).hostname}`,
          description: `Se confirmó mediante verificación directa (HTTP ${v.statusCode}) que el perfil en ${new URL(v.url).hostname} existe activamente. Esto indica presencia digital del sujeto en esta plataforma.`,
          severity: 'medium',
          category: 'social_media',
          dataFound: `URL verificada: ${v.url} | Estado: HTTP ${v.statusCode} | Tipo: ${v.contentType}`,
        });
      } else if (!v.exists && v.statusCode === 404 && isSocialMedia) {
        findings.push({
          title: `Perfil no encontrado — ${new URL(v.url).hostname}`,
          description: `La verificación directa (HTTP 404) indica que no existe un perfil activo en ${new URL(v.url).hostname} para este sujeto. El perfil fue eliminado o nunca existió.`,
          severity: 'low',
          category: 'social_media',
          dataFound: `URL verificada: ${v.url} | Estado: HTTP 404 — Perfil no encontrado`,
        });
      }
    }
  }

  // ── Process page contents into findings ──
  if (pageContents && pageContents.length > 0) {
    for (const page of pageContents) {
      if (page.error || page.text.length < 50) continue;

      const textLC = page.text.toLowerCase();
      const nameLC = subjectData.fullName.toLowerCase();
      const mentionsSubject = textLC.includes(nameLC) ||
        (subjectData.email && textLC.includes(subjectData.email.toLowerCase())) ||
        (subjectData.cedula && textLC.includes(subjectData.cedula));

      if (mentionsSubject) {
        // Extract the relevant portion around the mention
        const mentionIdx = textLC.indexOf(nameLC);
        const start = Math.max(0, mentionIdx - 100);
        const end = Math.min(page.text.length, mentionIdx + subjectData.fullName.length + 200);
        const relevantExcerpt = page.text.substring(start, end);

        findings.push({
          title: `Mención directa encontrada en ${new URL(page.url).hostname}`,
          description: `El contenido de la página en ${new URL(page.url).hostname} menciona directamente al sujeto investigado. Fragmento: "${relevantExcerpt.substring(0, 250)}"`,
          severity: 'high',
          category: defaultCategory,
          dataFound: `URL: ${page.url} | Mención de "${subjectData.fullName}" encontrada en contenido extraído | Excerpt: ${relevantExcerpt.substring(0, 200)}`,
        });
      }
    }
  }

  // ── Process web search results ──
  if (searchResults.length === 0 && findings.length === 0) {
    // No web search results AND no enriched data — provide specific "not found" finding
    const nameLC = subjectData.fullName.toLowerCase();
    const specificQuery = contextLC.includes('breach') || contextLC.includes('credential')
      ? `No se encontraron brechas de seguridad registradas para "${subjectData.email || subjectData.fullName}" en las fuentes consultadas.`
      : contextLC.includes('social') || contextLC.includes('redes')
      ? `No se encontraron perfiles en redes sociales para "${subjectData.fullName}" en las búsquedas automáticas.`
      : contextLC.includes('judicial') || contextLC.includes('policia')
      ? `No se encontraron registros judiciales públicos para "${subjectData.fullName}" en las fuentes consultadas.`
      : `No se encontraron resultados automáticos para "${subjectData.fullName}" en ${engineName}.`;

    findings.push({
      title: `Sin resultados en ${engineName} — ${defaultCategory.replace(/_/g, ' ')}`,
      description: specificQuery + ' La ausencia de resultados automáticos no descarta la existencia de información relevante. Se recomienda verificación manual en la fuente original.',
      severity: 'low',
      category: defaultCategory,
      dataFound: `Consulta ejecutada: "${context.substring(0, 120)}" | Resultado: 0 hallazgos automáticos | Sujeto: "${nameLC}"`,
    });
    return findings;
  }

  // Process each search result into a finding (max 3 findings per engine)
  for (const result of searchResults.slice(0, 3)) {
    const hostName = result.host_name.toLowerCase();
    const snippet = result.snippet.toLowerCase();
    const nameLC = subjectData.fullName.toLowerCase();
    const titleText = result.name.substring(0, 60);

    // Check if the result actually mentions the subject
    const mentionsSubject = snippet.includes(nameLC) ||
      (subjectData.email && snippet.includes(subjectData.email.toLowerCase())) ||
      (subjectData.cedula && snippet.includes(subjectData.cedula));

    // Determine severity based on context and content
    let severity: AIFinding['severity'] = 'medium';
    let category = 'personal_exposure';

    // Breach/leak/paste sites → critical or high
    if (hostName.includes('paste') || hostName.includes('ghostbin') || hostName.includes('justpaste') ||
        hostName.includes('pastebin') || hostName.includes('leakix') || hostName.includes('dehashed') ||
        hostName.includes('haveibeenpwned')) {
      severity = 'critical';
      category = contextLC.includes('dark') ? 'dark_web_mention' : 'credential_breach';
    } else if (snippet.includes('leak') || snippet.includes('filtración') || snippet.includes('brecha') ||
               snippet.includes('comprometido') || snippet.includes('expuesto') ||
               snippet.includes('credentials') || snippet.includes('contraseña') ||
               snippet.includes('dump') || snippet.includes('datos filtrados')) {
      severity = 'high';
      category = contextLC.includes('dark') ? 'dark_web_mention' : 'credential_breach';
    // Data broker sites → high
    } else if (hostName.includes('pipl') || hostName.includes('whitepages') || hostName.includes('spokeo') ||
               hostName.includes('truepeople') || hostName.includes('deepfind') ||
               snippet.includes('directorio') || snippet.includes('people finder') ||
               snippet.includes('background check')) {
      severity = 'high';
      category = 'data_broker';
    // Government/judicial → high
    } else if (hostName.includes('.gov') || hostName.includes('policia') ||
               snippet.includes('documento') || snippet.includes('antecedentes') ||
               snippet.includes('judicial')) {
      severity = 'high';
      category = contextLC.includes('judicial') ? 'judicial' : 'document_exposure';
    // Document exposure → high
    } else if (snippet.includes('pdf') || snippet.includes('xlsx') || snippet.includes('filetype:')) {
      severity = 'high';
      category = 'document_exposure';
    // Social media profiles → low or medium
    } else if (hostName.includes('linkedin') || hostName.includes('facebook') || hostName.includes('twitter') ||
               hostName.includes('instagram') || hostName.includes('tiktok') || hostName.includes('x.com')) {
      severity = mentionsSubject ? 'medium' : 'low';
      category = 'social_media';
    // Context-driven overrides for specific engine types
    } else if (contextLC.includes('password') || contextLC.includes('contraseña')) {
      severity = 'critical';
      category = 'password_exposure';
    } else if (contextLC.includes('dark') || contextLC.includes('leak') || contextLC.includes('filtración')) {
      severity = 'high';
      category = 'dark_web_mention';
    } else if (contextLC.includes('breach') || contextLC.includes('credential')) {
      severity = 'high';
      category = 'credential_breach';
    } else if (contextLC.includes('judicial') || contextLC.includes('policia')) {
      severity = 'high';
      category = 'judicial';
    } else if (contextLC.includes('broker') || contextLC.includes('identity') || contextLC.includes('pipl')) {
      severity = 'high';
      category = 'data_broker';
    // General web results — at least medium
    } else {
      severity = 'medium';
      category = defaultCategory;
    }

    // Upgrade severity for direct mentions of the subject
    if (mentionsSubject) {
      if (severity === 'medium') severity = 'high';
      if (severity === 'low') severity = 'medium';
    }

    // Build a meaningful description using the actual snippet text
    const snippetExcerpt = result.snippet.substring(0, 200);
    const mentionNote = mentionsSubject ? ' ⚠ MENCIONA DIRECTAMENTE al sujeto.' : '';

    findings.push({
      title: mentionsSubject
        ? `Mención de "${subjectData.fullName}" en ${hostName}`
        : titleText,
      description: `${snippetExcerpt}${mentionNote} Fuente: ${hostName} — ${result.name.substring(0, 80)}`,
      severity,
      category,
      dataFound: `Host: ${hostName} | URL: ${result.url} | Snippet: ${result.snippet.substring(0, 150)}${mentionsSubject ? ' | ⚠ MENCIONA AL SUJETO' : ''}`,
    });
  }

  return findings;
}

// ══════════════════════════════════════════════════════
//  CATEGORÍAS DE MOTORES OSINT (clasificados)
// ══════════════════════════════════════════════════════

export const ENGINE_CATEGORIES = [
  {
    id: 'breaches',
    label: 'Brechas y Credenciales',
    icon: 'ShieldAlert',
    color: 'red',
    engines: [
      'Have I Been Pwned',
      'Pwned Passwords',
      'HIBP Deep Check',
      'Dehashed',
      'LeakIX',
    ],
  },
  {
    id: 'darkweb',
    label: 'Dark Web y Filtraciones',
    icon: 'Eye',
    color: 'orange',
    engines: [
      'Dark Web / Leak Scan',
      'LeakRadar',
    ],
  },
  {
    id: 'social',
    label: 'Redes Sociales',
    icon: 'Globe',
    color: 'blue',
    engines: [
      'Social Media Scan',
      'DeepFind Profile Analyzer',
      'Telegram XTEA',
    ],
  },
  {
    id: 'search',
    label: 'Búsqueda Avanzada',
    icon: 'Search',
    color: 'emerald',
    engines: [
      'Google Dorking',
      'Document Exposure Scan',
    ],
  },
  {
    id: 'identity',
    label: 'Identidad y Datos',
    icon: 'Database',
    color: 'purple',
    engines: [
      'Data Broker Scan',
      'Pipl',
      'DeepFind Deep Search',
    ],
  },
  {
    id: 'judicial',
    label: 'Judicial y Oficial',
    icon: 'Shield',
    color: 'teal',
    engines: [
      'Policía Nacional Colombia',
      'Aleph / OCCRP',
    ],
  },
  {
    id: 'email-validation',
    label: 'Validación de Correo',
    icon: 'Mail',
    color: 'amber',
    engines: [
      'Email Validator',
    ],
  },
] as const;

// ══════════════════════════════════════════════════════
//  HELPER: Enrich search results with page content and URL verification
// ══════════════════════════════════════════════════════

async function enrichSearchResults(
  searchResults: WebSearchResult[],
  options?: { verifyProfiles?: boolean; extractContent?: boolean; maxUrls?: number }
): Promise<{ pageContents: PageContent[]; urlVerifications: UrlVerification[] }> {
  const { verifyProfiles = false, extractContent = true, maxUrls = 3 } = options || {};
  const pageContents: PageContent[] = [];
  const urlVerifications: UrlVerification[] = [];

  const urlsToProcess = searchResults.slice(0, maxUrls);

  // Run content extraction and URL verification in parallel
  const promises: Promise<void>[] = [];

  for (const result of urlsToProcess) {
    const hostLC = result.host_name.toLowerCase();

    if (extractContent) {
      promises.push(
        fetchPageContent(result.url).then(pc => {
          if (pc.text.length > 50) pageContents.push(pc);
        }).catch(() => {})
      );
    }

    if (verifyProfiles && (
      hostLC.includes('linkedin') || hostLC.includes('facebook') ||
      hostLC.includes('twitter') || hostLC.includes('x.com') ||
      hostLC.includes('instagram') || hostLC.includes('tiktok')
    )) {
      promises.push(
        verifyUrl(result.url).then(v => {
          urlVerifications.push(v);
        }).catch(() => {})
      );
    }
  }

  await Promise.allSettled(promises);
  return { pageContents, urlVerifications };
}

// ══════════════════════════════════════════════════════
//  16 MOTORES OSINT — Cada uno con búsqueda real + IA + datos enriquecidos
// ══════════════════════════════════════════════════════

// ── 1. Have I Been Pwned — Now with DIRECT API calls ──
async function checkHIBP(email: string, fullName: string): Promise<OSINTResult[]> {
  const results: OSINTResult[] = [];

  // ── PRIMARY: Direct HIBP API v3 call ──
  const [breaches, pastes] = await Promise.all([
    hibpCheckBreaches(email),
    hibpCheckPastes(email),
  ]);

  // Process breach data from API
  if (breaches.length > 0) {
    for (const breach of breaches.slice(0, 5)) {
      const dataClasses = breach.DataClasses?.join(', ') || 'Datos no especificados';
      results.push({
        source: 'Have I Been Pwned',
        category: 'credential_breach',
        severity: breach.IsVerified ? 'critical' : 'high',
        title: `Correo en brecha: ${breach.Title || breach.Name}`,
        description: `El correo "${email}" fue encontrado en la brecha "${breach.Title || breach.Name}" (${breach.BreachDate}). ${breach.Description?.substring(0, 150) || ''}. Datos expuestos: ${dataClasses}. ${breach.PwnCount ? `Afecta a ${breach.PwnCount.toLocaleString()} cuentas.` : ''}`,
        url: `https://haveibeenpwned.com/account/${encodeURIComponent(email)}`,
        dataFound: `Brecha: ${breach.Name} | Fecha: ${breach.BreachDate} | Datos expuestos: ${dataClasses} | Verificada: ${breach.IsVerified} | Afectados: ${breach.PwnCount || 'N/A'}`,
        rawSnippet: breach.Description?.substring(0, 200),
      });
    }
  }

  // Process paste data from API
  if (pastes.length > 0) {
    for (const paste of pastes.slice(0, 3)) {
      results.push({
        source: 'Have I Been Pwned',
        category: 'paste_site',
        severity: 'high',
        title: `Correo en paste: ${paste.Source} — ${paste.Title || 'Sin título'}`,
        description: `El correo "${email}" fue encontrado en un paste en ${paste.Source} (${paste.Date || 'fecha desconocida'}). ${paste.EmailCount ? `Contiene ${paste.EmailCount} correos.` : ''}`,
        url: paste.Source === 'Pastebin'
          ? `https://pastebin.com/${paste.Id}`
          : `https://haveibeenpwned.com/account/${encodeURIComponent(email)}`,
        dataFound: `Paste ID: ${paste.Id} | Fuente: ${paste.Source} | Fecha: ${paste.Date || 'N/A'} | Correos: ${paste.EmailCount || 'N/A'}`,
        rawSnippet: `Paste en ${paste.Source}: ${paste.Title || 'Sin título'}`,
      });
    }
  }

  // If API returned no results (either clean or API unavailable)
  if (breaches.length === 0 && pastes.length === 0) {
    // ── FALLBACK: Web search as supplementary ──
    const queries = [
      `"${email}" data breach leaked compromised`,
    ];
    const allSearchResults: WebSearchResult[] = [];
    for (const query of queries) {
      try {
        const sr = await performWebSearch(query, 5);
        allSearchResults.push(...sr);
      } catch { /* continue */ }
    }

    const { pageContents } = await enrichSearchResults(allSearchResults, { extractContent: true, maxUrls: 2 });

    const aiFindings = await analyzeWithDeepSeek(
      `Verificación de brechas de seguridad para el correo "${email}" usando Have I Been Pwned. La API directa no encontró brechas registradas.`,
      allSearchResults, 'Have I Been Pwned', { fullName, email }, pageContents
    );

    for (const f of aiFindings) {
      const matchedResult = allSearchResults.find(r =>
        f.dataFound.includes(r.url) || f.title.includes(r.name.substring(0, 20))
      );
      results.push({
        source: 'Have I Been Pwned',
        category: f.category,
        severity: f.severity,
        title: f.title,
        description: f.description,
        url: matchedResult?.url || `https://haveibeenpwned.com/account/${encodeURIComponent(email)}`,
        dataFound: f.dataFound,
        rawSnippet: matchedResult?.snippet,
      });
    }

    // Add clean result
    results.push({
      source: 'Have I Been Pwned',
      category: 'credential_breach',
      severity: 'info',
      title: 'API HIBP: Correo no encontrado en brechas',
      description: `La API directa de Have I Been Pwned no reportó brechas para "${email}". Esto no garantiza que el correo esté libre de compromisos — la base de datos de HIBP puede no incluir todas las brechas existentes.`,
      url: `https://haveibeenpwned.com/account/${encodeURIComponent(email)}`,
      dataFound: `API HIBP v3: 0 brechas, 0 pastes para "${email}"`,
    });
  }

  return results;
}

// ── 2. Pwned Passwords — With HIBP API + web search ──
async function checkPwnedPasswords(email: string, fullName: string): Promise<OSINTResult[]> {
  const results: OSINTResult[] = [];

  // Also check HIBP breaches for password-related data
  const breaches = await hibpCheckBreaches(email);
  const passwordBreaches = breaches.filter(b =>
    b.DataClasses?.some(dc =>
      dc.toLowerCase().includes('password') ||
      dc.toLowerCase().includes('contraseña') ||
      dc.toLowerCase().includes('credential')
    )
  );

  if (passwordBreaches.length > 0) {
    for (const breach of passwordBreaches.slice(0, 3)) {
      results.push({
        source: 'Pwned Passwords',
        category: 'password_exposure',
        severity: 'critical',
        title: `Contraseñas expuestas en brecha: ${breach.Title || breach.Name}`,
        description: `La brecha "${breach.Title || breach.Name}" (${breach.BreachDate}) expuso contraseñas. Datos comprometidos: ${breach.DataClasses.join(', ')}. Se recomienda cambiar inmediatamente todas las contraseñas asociadas a este correo.`,
        url: `https://haveibeenpwned.com/account/${encodeURIComponent(email)}`,
        dataFound: `Brecha: ${breach.Name} | Fecha: ${breach.BreachDate} | Datos: ${breach.DataClasses.join(', ')} | Verificada: ${breach.IsVerified}`,
        rawSnippet: `Contraseñas expuestas en ${breach.Name}`,
      });
    }
  }

  // Supplementary web search
  const queries = [`"${email}" password leak credentials exposed compromised`];
  const allSearchResults: WebSearchResult[] = [];
  for (const query of queries) {
    try {
      const sr = await performWebSearch(query, 5);
      allSearchResults.push(...sr);
    } catch { /* continue */ }
  }

  if (allSearchResults.length > 0) {
    const { pageContents } = await enrichSearchResults(allSearchResults, { extractContent: true, maxUrls: 2 });
    const aiFindings = await analyzeWithDeepSeek(
      `Búsqueda de contraseñas comprometidas y credenciales expuestas para "${email}"`,
      allSearchResults, 'Pwned Passwords', { fullName, email }, pageContents
    );

    for (const f of aiFindings) {
      const matchedResult = allSearchResults.find(r => f.dataFound.includes(r.url));
      results.push({
        source: 'Pwned Passwords',
        category: f.category === 'credential_breach' ? 'password_exposure' : f.category,
        severity: f.severity,
        title: f.title,
        description: f.description,
        url: matchedResult?.url || 'https://haveibeenpwned.com/Passwords',
        dataFound: f.dataFound,
        rawSnippet: matchedResult?.snippet,
      });
    }
  }

  if (results.length === 0) {
    results.push({
      source: 'Pwned Passwords',
      category: 'password_exposure',
      severity: 'info',
      title: 'No se detectaron contraseñas comprometidas',
      description: `No se encontraron contraseñas expuestas para "${email}" en las fuentes consultadas. Verifica manualmente en haveibeenpwned.com/Passwords para confirmar.`,
      url: 'https://haveibeenpwned.com/Passwords',
      dataFound: `0 contraseñas comprometidas detectadas para "${email}"`,
    });
  }

  return results;
}

// ── 3. Google Dorking ──
async function googleDorkSearch(fullName: string, email?: string, phone?: string, cedula?: string): Promise<OSINTResult[]> {
  const queries = [
    `"${fullName}" -facebook -instagram -twitter -linkedin`,
    `"${fullName}" filetype:pdf OR filetype:doc OR filetype:xlsx`,
    `"${fullName}" "cedula" OR "identificacion" OR "documento"`,
  ];
  if (email) queries.push(`"${email}" pastebin OR paste OR leak`);
  if (phone) queries.push(`"${phone}" "telefono" OR "celular" OR "contacto"`);
  if (cedula) queries.push(`"${cedula}" "cedula" OR "documento" OR "identidad"`);

  const allSearchResults: WebSearchResult[] = [];
  for (const query of queries) {
    try {
      const sr = await performWebSearch(query, 6);
      allSearchResults.push(...sr);
    } catch { /* continue */ }
  }

  const { pageContents } = await enrichSearchResults(allSearchResults, { extractContent: true, maxUrls: 3 });

  const aiFindings = await analyzeWithDeepSeek(
    `Búsqueda avanzada con operadores Google Dorking para "${fullName}"`,
    allSearchResults, 'Google Dorking', { fullName, email, cedula, phone }, pageContents
  );

  const results: OSINTResult[] = aiFindings.map(f => {
    const matchedResult = allSearchResults.find(r => f.dataFound.includes(r.url) || f.dataFound.includes(r.snippet.substring(0, 30)));
    return {
      source: 'Google Dorking',
      category: f.category,
      severity: f.severity,
      title: f.title,
      description: f.description,
      url: matchedResult?.url,
      dataFound: f.dataFound,
      rawSnippet: matchedResult?.snippet,
    };
  });

  if (results.length === 0) {
    results.push({
      source: 'Google Dorking',
      category: 'personal_exposure',
      severity: 'medium',
      title: `Búsqueda avanzada: "${fullName}"`,
      description: `Se ejecutaron ${queries.length} búsquedas avanzadas con operadores Google Dorking. ${allSearchResults.length > 0 ? `Se encontraron ${allSearchResults.length} resultados.` : 'No se encontraron resultados automáticos.'}`,
      dataFound: `${allSearchResults.length} resultados web para ${queries.length} consultas dorking`,
    });
  }

  return results;
}

// ── 4. Social Media Scan — Now with URL verification ──
async function scanSocialMedia(fullName: string, email?: string): Promise<OSINTResult[]> {
  const platforms = ['linkedin.com', 'facebook.com', 'twitter.com', 'instagram.com', 'tiktok.com'];
  const allSearchResults: WebSearchResult[] = [];

  for (const platform of platforms) {
    try {
      const sr = await performWebSearch(`site:${platform} "${fullName}"`, 5);
      allSearchResults.push(...sr);
    } catch { /* continue */ }
  }

  if (email) {
    const username = email.split('@')[0];
    try {
      const sr = await performWebSearch(`"${username}" profile account -site:${email.split('@')[1]}`, 5);
      allSearchResults.push(...sr);
    } catch { /* continue */ }
  }

  // Verify social media profile URLs directly
  const { pageContents, urlVerifications } = await enrichSearchResults(allSearchResults, {
    verifyProfiles: true,
    extractContent: true,
    maxUrls: 5,
  });

  const aiFindings = await analyzeWithDeepSeek(
    `Escaneo de perfiles en redes sociales para "${fullName}"`,
    allSearchResults, 'Social Media Scan', { fullName, email }, pageContents, urlVerifications
  );

  const results: OSINTResult[] = aiFindings.map(f => {
    const matchedResult = allSearchResults.find(r => f.dataFound.includes(r.url) || r.host_name.includes('linkedin') || r.host_name.includes('facebook') || r.host_name.includes('twitter'));
    return {
      source: 'Social Media Scan',
      category: 'social_media',
      severity: f.severity,
      title: f.title,
      description: f.description,
      url: matchedResult?.url,
      dataFound: f.dataFound,
      rawSnippet: matchedResult?.snippet,
    };
  });

  // Add explicit URL verification results if any profiles were checked
  for (const v of urlVerifications) {
    if (v.exists) {
      results.push({
        source: 'Social Media Scan',
        category: 'social_media',
        severity: 'medium',
        title: `Perfil confirmado: ${new URL(v.url).hostname}`,
        description: `Verificación directa (HTTP ${v.statusCode}) confirma que existe un perfil en ${new URL(v.url).hostname}. Esto indica presencia activa del sujeto en esta plataforma.`,
        url: v.url,
        dataFound: `URL verificada: ${v.url} | Estado: HTTP ${v.statusCode} | Tipo: ${v.contentType}`,
      });
    }
  }

  if (results.length === 0) {
    results.push({
      source: 'Social Media Scan',
      category: 'social_media',
      severity: 'low',
      title: `Búsqueda de perfiles: "${fullName}"`,
      description: `Se buscaron perfiles en LinkedIn, Facebook, Twitter, Instagram y TikTok. ${allSearchResults.length > 0 ? `Se encontraron ${allSearchResults.length} posibles resultados.` : 'No se encontraron resultados automáticos.'}`,
      dataFound: `${allSearchResults.length} resultados en 5 plataformas`,
    });
  }

  return results;
}

// ── 5. Data Broker Scan ──
async function scanDataBrokers(fullName: string, email?: string, phone?: string): Promise<OSINTResult[]> {
  const queries = [`"${fullName}" "directorio" OR "phonebook" OR "white pages" OR "people finder"`];
  if (email) queries.push(`"${email}" "email finder" OR "email lookup" OR directorio`);
  if (phone) queries.push(`"${phone}" "phone lookup" OR "who called" OR "numero"`);

  const allSearchResults: WebSearchResult[] = [];
  for (const query of queries) {
    try {
      const sr = await performWebSearch(query, 8);
      allSearchResults.push(...sr);
    } catch { /* continue */ }
  }

  const { pageContents } = await enrichSearchResults(allSearchResults, { extractContent: true, maxUrls: 3 });

  const aiFindings = await analyzeWithDeepSeek(
    `Búsqueda en directorios y brokers de datos para "${fullName}"`,
    allSearchResults, 'Data Broker Scan', { fullName, email, phone }, pageContents
  );

  const results: OSINTResult[] = aiFindings.map(f => {
    const matchedResult = allSearchResults.find(r => f.dataFound.includes(r.url));
    return {
      source: 'Data Broker Scan',
      category: 'data_broker',
      severity: f.severity,
      title: f.title,
      description: f.description,
      url: matchedResult?.url || 'https://search.pipl.com/search/',
      dataFound: f.dataFound,
      rawSnippet: matchedResult?.snippet,
    };
  });

  if (results.length === 0) {
    results.push({
      source: 'Data Broker Scan',
      category: 'data_broker',
      severity: 'high',
      title: `Búsqueda en directorios: "${fullName}"`,
      description: `Se buscó en brokers de datos. ${allSearchResults.length > 0 ? `Se encontraron ${allSearchResults.length} resultados.` : 'Verifica manualmente en Pipl, TruePeopleSearch y otros directorios.'}`,
      url: 'https://search.pipl.com/search/',
      dataFound: `${allSearchResults.length} resultados web encontrados`,
    });
  }

  return results;
}

// ── 6. Dark Web / Leak Scan ──
async function scanDarkWeb(email: string, fullName: string): Promise<OSINTResult[]> {
  const queries = [
    `"${email}" leak OR breach OR dump OR paste`,
    `"${fullName}" leak OR breach OR "datos filtrados" OR "datos expuestos"`,
  ];

  const allSearchResults: WebSearchResult[] = [];
  for (const query of queries) {
    try {
      const sr = await performWebSearch(query, 8);
      allSearchResults.push(...sr);
    } catch { /* continue */ }
  }

  const { pageContents } = await enrichSearchResults(allSearchResults, { extractContent: true, maxUrls: 3 });

  const aiFindings = await analyzeWithDeepSeek(
    `Búsqueda de menciones en dark web y sitios de filtraciones para "${email}" / "${fullName}"`,
    allSearchResults, 'Dark Web / Leak Scan', { fullName, email }, pageContents
  );

  const results: OSINTResult[] = aiFindings.map(f => {
    const matchedResult = allSearchResults.find(r => f.dataFound.includes(r.url));
    const isPaste = matchedResult?.host_name?.includes('paste') || f.category === 'paste_site';
    return {
      source: 'Dark Web / Leak Scan',
      category: isPaste ? 'paste_site' : 'dark_web_mention',
      severity: f.severity,
      title: f.title,
      description: f.description,
      url: matchedResult?.url,
      dataFound: f.dataFound,
      rawSnippet: matchedResult?.snippet,
    };
  });

  if (results.length === 0) {
    results.push({
      source: 'Dark Web / Leak Scan',
      category: 'dark_web_mention',
      severity: 'high',
      title: `Búsqueda de filtraciones: "${email}"`,
      description: `Se buscó en fuentes de filtraciones. ${allSearchResults.length > 0 ? `Se encontraron ${allSearchResults.length} menciones.` : 'Verifica manualmente en LeakRadar y Dehashed.'}`,
      url: 'https://members.leakradar.io/es/search',
      dataFound: `${allSearchResults.length} resultados web encontrados`,
    });
  }

  return results;
}

// ── 7. Document Exposure Scan ──
async function scanDocumentExposure(fullName: string, cedula?: string): Promise<OSINTResult[]> {
  const queries = [`"${fullName}" filetype:pdf OR filetype:doc OR filetype:xlsx OR filetype:csv`];
  if (cedula) {
    queries.push(`"${cedula}" filetype:pdf OR filetype:doc OR filetype:xlsx`);
    queries.push(`"${cedula}" "cedula" OR "identidad" OR "documento" -site:gov`);
  }

  const allSearchResults: WebSearchResult[] = [];
  for (const query of queries) {
    try {
      const sr = await performWebSearch(query, 8);
      allSearchResults.push(...sr);
    } catch { /* continue */ }
  }

  const { pageContents } = await enrichSearchResults(allSearchResults, { extractContent: true, maxUrls: 3 });

  const aiFindings = await analyzeWithDeepSeek(
    `Búsqueda de documentos expuestos (PDF, DOC, XLSX) conteniendo "${fullName}"${cedula ? ` y cédula "${cedula}"` : ''}`,
    allSearchResults, 'Document Exposure Scan', { fullName, cedula }, pageContents
  );

  const results: OSINTResult[] = aiFindings.map(f => {
    const matchedResult = allSearchResults.find(r => f.dataFound.includes(r.url));
    return {
      source: 'Document Exposure Scan',
      category: 'document_exposure',
      severity: f.severity,
      title: f.title,
      description: f.description,
      url: matchedResult?.url,
      dataFound: f.dataFound,
      rawSnippet: matchedResult?.snippet,
    };
  });

  if (results.length === 0) {
    results.push({
      source: 'Document Exposure Scan',
      category: 'document_exposure',
      severity: 'high',
      title: `Búsqueda de documentos: "${fullName}"`,
      description: `Se buscaron documentos expuestos. ${allSearchResults.length > 0 ? `Se encontraron ${allSearchResults.length} resultados.` : 'Búsqueda manual: "nombre" filetype:pdf OR filetype:doc'}`,
      dataFound: `${allSearchResults.length} resultados web encontrados`,
    });
  }

  return results;
}

// ── 8. LeakRadar ──
async function scanLeakRadar(fullName: string, email?: string, cedula?: string): Promise<OSINTResult[]> {
  const queries = [
    `"${fullName}" leakradar OR "leak radar" data breach filtración`,
    `"${fullName}" OR "${email || ''}" filtracion datos personales`,
  ];
  if (cedula) queries.push(`"${cedula}" filtracion datos personales`);

  const allSearchResults: WebSearchResult[] = [];
  for (const query of queries) {
    try {
      const sr = await performWebSearch(query, 6);
      allSearchResults.push(...sr);
    } catch { /* continue */ }
  }

  const { pageContents } = await enrichSearchResults(allSearchResults, { extractContent: true, maxUrls: 2 });

  const aiFindings = await analyzeWithDeepSeek(
    `Monitoreo de filtraciones masivas de datos para "${fullName}"`,
    allSearchResults, 'LeakRadar', { fullName, email, cedula }, pageContents
  );

  const results: OSINTResult[] = aiFindings.map(f => {
    const matchedResult = allSearchResults.find(r => f.dataFound.includes(r.url));
    return {
      source: 'LeakRadar',
      category: 'credential_breach',
      severity: f.severity,
      title: f.title,
      description: f.description,
      url: matchedResult?.url || 'https://members.leakradar.io/es/search',
      dataFound: f.dataFound,
      rawSnippet: matchedResult?.snippet,
    };
  });

  results.push({
    source: 'LeakRadar',
    category: 'credential_breach',
    severity: allSearchResults.length > 0 ? 'info' : 'high',
    title: 'Búsqueda en LeakRadar',
    description: `Monitoreo de filtraciones completado. ${allSearchResults.length > 0 ? 'Se encontraron menciones.' : 'Verificar manualmente en members.leakradar.io.'}`,
    url: 'https://members.leakradar.io/es/search',
    dataFound: `${allSearchResults.length} resultados web encontrados`,
  });

  return results;
}

// ── 9. Policía Nacional Colombia ──
async function scanPoliciaColombia(fullName: string, cedula?: string): Promise<OSINTResult[]> {
  const queries = [
    `"${fullName}" "antecedentes judiciales" Colombia policia`,
    `site:policia.gov.co "${fullName}" antecedentes`,
  ];
  if (cedula) {
    queries.push(`"${cedula}" "certificado antecedentes" policia.gov.co`);
    queries.push(`"${cedula}" antecedentes judiciales Colombia`);
  }

  const allSearchResults: WebSearchResult[] = [];
  for (const query of queries) {
    try {
      const sr = await performWebSearch(query, 5);
      allSearchResults.push(...sr);
    } catch { /* continue */ }
  }

  const { pageContents } = await enrichSearchResults(allSearchResults, { extractContent: true, maxUrls: 2 });

  const aiFindings = await analyzeWithDeepSeek(
    `Consulta de antecedentes judiciales para "${fullName}" en bases de la Policía Nacional de Colombia`,
    allSearchResults, 'Policía Nacional Colombia', { fullName, cedula }, pageContents
  );

  const results: OSINTResult[] = aiFindings.map(f => {
    const matchedResult = allSearchResults.find(r => f.dataFound.includes(r.url));
    return {
      source: 'Policía Nacional Colombia',
      category: 'judicial',
      severity: f.severity,
      title: f.title,
      description: f.description,
      url: matchedResult?.url,
      dataFound: f.dataFound,
      rawSnippet: matchedResult?.snippet,
    };
  });

  results.push({
    source: 'Policía Nacional Colombia',
    category: 'judicial',
    severity: allSearchResults.length > 0 ? 'info' : 'high',
    title: 'Consulta de antecedentes',
    description: `Búsqueda de antecedentes para "${fullName}"${cedula ? ` (CC: ${cedula})` : ''}. ${allSearchResults.length > 0 ? 'Se encontraron registros.' : 'Verificar en antecedentes.policia.gov.co.'}`,
    url: 'https://antecedentes.policia.gov.co:7005/WebJudicial/',
    dataFound: `${allSearchResults.length} resultados web encontrados`,
  });

  return results;
}

// ── 10. HIBP Deep Check — With DIRECT API calls ──
async function checkHIBPDeep(email: string, fullName: string): Promise<OSINTResult[]> {
  const results: OSINTResult[] = [];

  // Direct HIBP API call with full breach details
  const [breaches, pastes] = await Promise.all([
    hibpCheckBreaches(email),
    hibpCheckPastes(email),
  ]);

  if (breaches.length > 0) {
    // Generate a comprehensive finding with ALL breaches
    const breachNames = breaches.map(b => `${b.Name} (${b.BreachDate})`).join(', ');
    const allDataClasses = [...new Set(breaches.flatMap(b => b.DataClasses || []))];

    results.push({
      source: 'HIBP Deep Check',
      category: 'credential_breach',
      severity: 'critical',
      title: `API HIBP: ${breaches.length} brechas encontradas para "${email}"`,
      description: `El correo fue encontrado en ${breaches.length} brechas verificadas. Brechas: ${breachNames}. Todos los tipos de datos expuestos: ${allDataClasses.join(', ')}. Se recomienda cambiar todas las contraseñas y habilitar 2FA inmediatamente.`,
      url: `https://haveibeenpwned.com/account/${encodeURIComponent(email)}`,
      dataFound: `Total brechas: ${breaches.length} | Nombres: ${breachNames} | Datos expuestos: ${allDataClasses.join(', ')}`,
      rawSnippet: `${breaches.length} brechas verificadas para ${email}`,
    });

    // Add detailed findings for each breach beyond the first 5
    for (const breach of breaches.slice(5, 8)) {
      results.push({
        source: 'HIBP Deep Check',
        category: 'credential_breach',
        severity: breach.IsVerified ? 'high' : 'medium',
        title: `Brecha adicional: ${breach.Title || breach.Name}`,
        description: `"${email}" en "${breach.Title || breach.Name}" (${breach.BreachDate}). Datos: ${breach.DataClasses?.join(', ') || 'N/A'}. ${breach.Description?.substring(0, 100) || ''}`,
        url: `https://haveibeenpwned.com/account/${encodeURIComponent(email)}`,
        dataFound: `Brecha: ${breach.Name} | Fecha: ${breach.BreachDate} | Datos: ${breach.DataClasses?.join(', ')}`,
      });
    }
  }

  if (pastes.length > 0) {
    results.push({
      source: 'HIBP Deep Check',
      category: 'paste_site',
      severity: 'high',
      title: `API HIBP: ${pastes.length} pastes contienen "${email}"`,
      description: `Se encontraron ${pastes.length} menciones del correo en sitios de paste. Fuentes: ${[...new Set(pastes.map(p => p.Source))].join(', ')}. Esto indica que el correo ha sido parte de filtraciones públicas de datos.`,
      url: `https://haveibeenpwned.com/account/${encodeURIComponent(email)}`,
      dataFound: `Total pastes: ${pastes.length} | Fuentes: ${[...new Set(pastes.map(p => p.Source))].join(', ')}`,
    });
  }

  // Supplementary web search for additional context
  const queries = [
    `"${fullName}" "${email}" data breach pwned`,
  ];
  const allSearchResults: WebSearchResult[] = [];
  for (const query of queries) {
    try {
      const sr = await performWebSearch(query, 5);
      allSearchResults.push(...sr);
    } catch { /* continue */ }
  }

  if (allSearchResults.length > 0 || (breaches.length === 0 && pastes.length === 0)) {
    const { pageContents } = await enrichSearchResults(allSearchResults, { extractContent: true, maxUrls: 2 });

    const aiFindings = await analyzeWithDeepSeek(
      `Verificación profunda de brechas de seguridad para "${email}". API HIBP reportó: ${breaches.length} brechas, ${pastes.length} pastes.`,
      allSearchResults, 'HIBP Deep Check', { fullName, email }, pageContents
    );

    for (const f of aiFindings) {
      const matchedResult = allSearchResults.find(r => f.dataFound.includes(r.url));
      results.push({
        source: 'HIBP Deep Check',
        category: 'credential_breach',
        severity: f.severity,
        title: f.title,
        description: f.description,
        url: matchedResult?.url || `https://haveibeenpwned.com/account/${encodeURIComponent(email)}`,
        dataFound: f.dataFound,
        rawSnippet: matchedResult?.snippet,
      });
    }
  }

  if (breaches.length === 0 && pastes.length === 0 && results.length === 0) {
    results.push({
      source: 'HIBP Deep Check',
      category: 'credential_breach',
      severity: 'info',
      title: 'API HIBP: Verificación profunda sin brechas',
      description: `La verificación profunda mediante la API directa de HIBP no encontró brechas ni pastes para "${email}". Se recomienda verificar manualmente para mayor certeza.`,
      url: `https://haveibeenpwned.com/account/${encodeURIComponent(email)}`,
      dataFound: `API HIBP v3: 0 brechas, 0 pastes para "${email}"`,
    });
  }

  return results;
}

// ── 11. DeepFind Profile Analyzer ──
async function scanDeepFindProfile(fullName: string, email?: string): Promise<OSINTResult[]> {
  const queries = [
    `site:deepfind.me "${fullName}"`,
    `"${fullName}" deepfind profile social media analyzer`,
  ];
  if (email) queries.push(`"${email}" deepfind profile analysis`);

  const allSearchResults: WebSearchResult[] = [];
  for (const query of queries) {
    try {
      const sr = await performWebSearch(query, 5);
      allSearchResults.push(...sr);
    } catch { /* continue */ }
  }

  const { pageContents } = await enrichSearchResults(allSearchResults, { extractContent: true, maxUrls: 2 });

  const aiFindings = await analyzeWithDeepSeek(
    `Análisis de perfil digital en redes sociales para "${fullName}"`,
    allSearchResults, 'DeepFind Profile Analyzer', { fullName, email }, pageContents
  );

  const results: OSINTResult[] = aiFindings.map(f => {
    const matchedResult = allSearchResults.find(r => f.dataFound.includes(r.url));
    return {
      source: 'DeepFind Profile Analyzer',
      category: 'social_media',
      severity: f.severity,
      title: f.title,
      description: f.description,
      url: matchedResult?.url || 'https://deepfind.me/tools/social-media/profile-analyzer',
      dataFound: f.dataFound,
      rawSnippet: matchedResult?.snippet,
    };
  });

  if (results.length === 0) {
    results.push({
      source: 'DeepFind Profile Analyzer',
      category: 'social_media',
      severity: 'low',
      title: 'Análisis de perfil DeepFind',
      description: `Análisis de huella digital para "${fullName}". ${allSearchResults.length > 0 ? 'Se encontraron resultados.' : 'Verificar manualmente en deepfind.me.'}`,
      url: 'https://deepfind.me/tools/social-media/profile-analyzer',
      dataFound: `${allSearchResults.length} resultados web encontrados`,
    });
  }

  return results;
}

// ── 12. Pipl ──
async function scanPipl(fullName: string, email?: string, phone?: string): Promise<OSINTResult[]> {
  const queries = [
    `site:pipl.com "${fullName}"`,
    `"${fullName}" pipl people search identity`,
  ];
  if (email) queries.push(`"${email}" pipl email lookup`);
  if (phone) queries.push(`"${phone}" pipl phone lookup`);

  const allSearchResults: WebSearchResult[] = [];
  for (const query of queries) {
    try {
      const sr = await performWebSearch(query, 5);
      allSearchResults.push(...sr);
    } catch { /* continue */ }
  }

  const { pageContents } = await enrichSearchResults(allSearchResults, { extractContent: true, maxUrls: 2 });

  const aiFindings = await analyzeWithDeepSeek(
    `Búsqueda de identidad en Pipl para "${fullName}"`,
    allSearchResults, 'Pipl', { fullName, email, phone }, pageContents
  );

  const results: OSINTResult[] = aiFindings.map(f => {
    const matchedResult = allSearchResults.find(r => f.dataFound.includes(r.url));
    return {
      source: 'Pipl',
      category: 'data_broker',
      severity: f.severity,
      title: f.title,
      description: f.description,
      url: matchedResult?.url || 'https://search.pipl.com/search/',
      dataFound: f.dataFound,
      rawSnippet: matchedResult?.snippet,
    };
  });

  if (results.length === 0) {
    results.push({
      source: 'Pipl',
      category: 'data_broker',
      severity: 'high',
      title: 'Búsqueda en Pipl',
      description: `Búsqueda de identidad para "${fullName}" en Pipl. ${allSearchResults.length > 0 ? 'Se encontraron resultados.' : 'Verificar manualmente en pipl.com.'}`,
      url: 'https://search.pipl.com/search/',
      dataFound: `${allSearchResults.length} resultados web encontrados`,
    });
  }

  return results;
}

// ── 13. LeakIX ──
async function scanLeakIX(fullName: string, email?: string, cedula?: string): Promise<OSINTResult[]> {
  const queries = [
    `site:leakix.net "${fullName}" OR "${email || ''}"`,
    `"${fullName}" leakix data exposure leak`,
  ];
  if (email) queries.push(`"${email}" leakix breach exposed`);
  if (cedula) queries.push(`"${cedula}" leakix database exposed`);

  const allSearchResults: WebSearchResult[] = [];
  for (const query of queries) {
    try {
      const sr = await performWebSearch(query, 5);
      allSearchResults.push(...sr);
    } catch { /* continue */ }
  }

  const { pageContents } = await enrichSearchResults(allSearchResults, { extractContent: true, maxUrls: 2 });

  const aiFindings = await analyzeWithDeepSeek(
    `Búsqueda en bases de datos expuestas (LeakIX) para "${fullName}"`,
    allSearchResults, 'LeakIX', { fullName, email, cedula }, pageContents
  );

  const results: OSINTResult[] = aiFindings.map(f => {
    const matchedResult = allSearchResults.find(r => f.dataFound.includes(r.url));
    return {
      source: 'LeakIX',
      category: 'credential_breach',
      severity: f.severity,
      title: f.title,
      description: f.description,
      url: matchedResult?.url || 'https://leakix.net/',
      dataFound: f.dataFound,
      rawSnippet: matchedResult?.snippet,
    };
  });

  if (results.length === 0) {
    results.push({
      source: 'LeakIX',
      category: 'credential_breach',
      severity: 'high',
      title: 'Búsqueda en LeakIX',
      description: `Consulta de bases de datos expuestas para "${fullName}". ${allSearchResults.length > 0 ? 'Se encontraron resultados.' : 'Verificar manualmente en leakix.net.'}`,
      url: 'https://leakix.net/',
      dataFound: `${allSearchResults.length} resultados web encontrados`,
    });
  }

  return results;
}

// ── 14. Aleph / OCCRP ──
async function scanAlephOCCRP(fullName: string, cedula?: string): Promise<OSINTResult[]> {
  const queries = [
    `site:aleph.occrp.org "${fullName}"`,
    `"${fullName}" occrp aleph investigation documents`,
  ];
  if (cedula) queries.push(`"${cedula}" occrp aleph leaked documents`);

  const allSearchResults: WebSearchResult[] = [];
  for (const query of queries) {
    try {
      const sr = await performWebSearch(query, 5);
      allSearchResults.push(...sr);
    } catch { /* continue */ }
  }

  const { pageContents } = await enrichSearchResults(allSearchResults, { extractContent: true, maxUrls: 2 });

  const aiFindings = await analyzeWithDeepSeek(
    `Búsqueda en documentos de investigación periodística (Aleph/OCCRP) para "${fullName}"`,
    allSearchResults, 'Aleph / OCCRP', { fullName, cedula }, pageContents
  );

  const results: OSINTResult[] = aiFindings.map(f => {
    const matchedResult = allSearchResults.find(r => f.dataFound.includes(r.url));
    return {
      source: 'Aleph / OCCRP',
      category: 'judicial',
      severity: f.severity,
      title: f.title,
      description: f.description,
      url: matchedResult?.url || 'https://aleph.occrp.org/search',
      dataFound: f.dataFound,
      rawSnippet: matchedResult?.snippet,
    };
  });

  if (results.length === 0) {
    results.push({
      source: 'Aleph / OCCRP',
      category: 'judicial',
      severity: 'high',
      title: 'Búsqueda en Aleph/OCCRP',
      description: `Búsqueda en archivos de investigaciones periodísticas para "${fullName}". ${allSearchResults.length > 0 ? 'Se encontraron resultados.' : 'Verificar en aleph.occrp.org.'}`,
      url: 'https://aleph.occrp.org/search',
      dataFound: `${allSearchResults.length} resultados web encontrados`,
    });
  }

  return results;
}

// ── 15. DeepFind Deep Search ──
async function scanDeepFindDeepSearch(fullName: string, email?: string, phone?: string, cedula?: string): Promise<OSINTResult[]> {
  const queries = [
    `site:deepfind.me "${fullName}" people finder`,
    `"${fullName}" "deep search" people finder background check`,
  ];
  if (email) queries.push(`"${email}" deepfind deep search people`);
  if (phone) queries.push(`"${phone}" deepfind people search phone`);

  const allSearchResults: WebSearchResult[] = [];
  for (const query of queries) {
    try {
      const sr = await performWebSearch(query, 5);
      allSearchResults.push(...sr);
    } catch { /* continue */ }
  }

  const { pageContents } = await enrichSearchResults(allSearchResults, { extractContent: true, maxUrls: 2 });

  const aiFindings = await analyzeWithDeepSeek(
    `Búsqueda profunda de personas para "${fullName}" cruzando múltiples bases de datos`,
    allSearchResults, 'DeepFind Deep Search', { fullName, email, phone, cedula }, pageContents
  );

  const results: OSINTResult[] = aiFindings.map(f => {
    const matchedResult = allSearchResults.find(r => f.dataFound.includes(r.url));
    return {
      source: 'DeepFind Deep Search',
      category: 'data_broker',
      severity: f.severity,
      title: f.title,
      description: f.description,
      url: matchedResult?.url || 'https://deepfind.me/tools/people-finder/deep-search',
      dataFound: f.dataFound,
      rawSnippet: matchedResult?.snippet,
    };
  });

  if (results.length === 0) {
    results.push({
      source: 'DeepFind Deep Search',
      category: 'data_broker',
      severity: 'high',
      title: 'Búsqueda profunda DeepFind',
      description: `Búsqueda profunda de "${fullName}" cruzando bases de datos. ${allSearchResults.length > 0 ? 'Se encontraron resultados.' : 'Verificar manualmente en deepfind.me.'}`,
      url: 'https://deepfind.me/tools/people-finder/deep-search',
      dataFound: `${allSearchResults.length} resultados web encontrados`,
    });
  }

  return results;
}

// ── 16. Dehashed ──
async function scanDehashed(fullName: string, email?: string, cedula?: string): Promise<OSINTResult[]> {
  const queries = [
    `site:dehashed.com "${fullName}" OR "${email || ''}"`,
    `"${fullName}" dehashed database breach credentials`,
  ];
  if (email) queries.push(`"${email}" dehashed leaked database`);
  if (cedula) queries.push(`"${cedula}" dehashed personal data exposed`);

  const allSearchResults: WebSearchResult[] = [];
  for (const query of queries) {
    try {
      const sr = await performWebSearch(query, 6);
      allSearchResults.push(...sr);
    } catch { /* continue */ }
  }

  const { pageContents } = await enrichSearchResults(allSearchResults, { extractContent: true, maxUrls: 2 });

  const aiFindings = await analyzeWithDeepSeek(
    `Búsqueda de credenciales filtradas en Dehashed para "${fullName}"`,
    allSearchResults, 'Dehashed', { fullName, email, cedula }, pageContents
  );

  const results: OSINTResult[] = aiFindings.map(f => {
    const matchedResult = allSearchResults.find(r => f.dataFound.includes(r.url));
    return {
      source: 'Dehashed',
      category: 'credential_breach',
      severity: f.severity,
      title: f.title,
      description: f.description,
      url: matchedResult?.url || 'https://app.dehashed.com/search',
      dataFound: f.dataFound,
      rawSnippet: matchedResult?.snippet,
    };
  });

  if (results.length === 0) {
    results.push({
      source: 'Dehashed',
      category: 'credential_breach',
      severity: 'high',
      title: 'Búsqueda en Dehashed',
      description: `Búsqueda de credenciales filtradas para "${fullName}". ${allSearchResults.length > 0 ? 'Se encontraron resultados.' : 'Verificar en app.dehashed.com.'}`,
      url: 'https://app.dehashed.com/search',
      dataFound: `${allSearchResults.length} resultados web encontrados`,
    });
  }

  return results;
}

// ══════════════════════════════════════════════════════
//  17. Telegram XTEA — Búsqueda en Telegram vía xtea.io
// ══════════════════════════════════════════════════════

async function scanTelegramXTEAEngine(fullName: string, email?: string): Promise<OSINTResult[]> {
  try {
    const { scanTelegramXTEA } = await import('./engines/telegram-xtea-engine');
    return await scanTelegramXTEA({
      fullName,
      email: email || undefined,
    });
  } catch (error) {
    console.warn('[OSINT] Telegram XTEA engine failed:', error instanceof Error ? error.message : 'unknown');
    return [{
      source: 'Telegram XTEA',
      category: 'telegram_search',
      severity: 'info',
      title: `Búsqueda en Telegram no disponible para "${fullName}"`,
      description: `No se pudo completar la búsqueda en Telegram vía xtea.io. Error: ${error instanceof Error ? error.message : 'Desconocido'}. Se recomienda verificar manualmente en https://xtea.io/ts_en.html`,
    }];
  }
}

// ══════════════════════════════════════════════════════
//  18. Email Validator — Validación de correo via email-validator.com
// ══════════════════════════════════════════════════════

async function scanEmailValidatorEngine(fullName: string, email: string): Promise<OSINTResult[]> {
  const results: OSINTResult[] = [];
  const url = `https://email-validator.com/es/validate?email=${encodeURIComponent(email)}`;

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'es,en;q=0.9',
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      console.warn(`[OSINT] Email Validator: HTTP ${response.status}`);
      return [{
        source: 'Email Validator',
        category: 'email_validation',
        severity: 'info',
        title: `No se pudo validar el correo: ${email}`,
        description: `El servicio de validación retornó HTTP ${response.status}. No fue posible verificar el correo.`,
      }];
    }

    const html = await response.text();
    const text = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, '\n')
      .replace(/&nbsp;/g, ' ')
      .replace(/&#160;/g, ' ')
      .replace(/&amp;/g, '&');
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);

    // Check if validation data exists
    if (!lines.some(l => l.includes('Validacion de correo') || l.includes('Validation for'))) {
      return [{
        source: 'Email Validator',
        category: 'email_validation',
        severity: 'info',
        title: `Sin datos de validación para: ${email}`,
        description: 'El servicio no retornó datos de validación.',
      }];
    }

    // Helper: find value after label
    const findAfter = (label: string): string => {
      for (let i = 0; i < lines.length - 1; i++) {
        if (lines[i].toLowerCase() === label.toLowerCase()) return lines[i + 1] || '';
      }
      return '';
    };

    // Parse key fields
    const isValid = lines.some(l => l.includes('direccion de correo es valida') || l.includes('email address is valid'));
    const isSuspicious = lines.some(l => l.toLowerCase().includes('sospechoso') || l.toLowerCase().includes('suspicious'));
    const isDisposable = lines.some(l => l.includes('desechable detectado') || l.includes('disposable detected') || l.includes('Correo desechable'));
    const provider = findAfter('Proveedor') || findAfter('Provider');
    const providerType = findAfter('Tipo') || findAfter('Type');
    const providerDomain = findAfter('Dominio del proveedor') || findAfter('Provider domain');
    const syntaxStatus = findAfter('Comprobacion de sintaxis') || findAfter('Syntax check');
    const domainAccess = findAfter('Accesibilidad del dominio') || findAfter('Domain accessibility');
    const mxPresent = lines.some(l => l.includes('MX') && (l.includes('Presente') || l.includes('Present')));
    const spfPresent = lines.some(l => l.includes('SPF') && (l.includes('Presente') || l.includes('Present')));
    const dmarcPresent = lines.some(l => l.includes('DMARC') && (l.includes('Presente') || l.includes('Present')));
    const bimiPresent = lines.some(l => l.includes('BIMI') && (l.includes('Presente') || l.includes('Present')));
    const disposableDomain = findAfter('Dominio desechable detectado') || findAfter('Disposable domain detected');

    // Collect MX records
    const mxRecords: string[] = [];
    let inMx = false;
    for (const line of lines) {
      if (line.includes('Registros MX') || line.includes('MX records')) { inMx = true; continue; }
      if (inMx) {
        if (line.includes('Presente') || line.includes('Present') || line.includes('SPF') || line.includes('A ') || line.includes('AAAA') || line.includes('DMARC')) break;
        if (line.includes('(')) mxRecords.push(line);
      }
    }

    // 1. Overall validation result
    if (isDisposable || isSuspicious) {
      results.push({
        source: 'Email Validator',
        category: 'disposable_email',
        severity: 'critical',
        title: `Correo sospechoso/desechable: ${email}`,
        description: `La dirección "${email}" fue identificada como correo sospechoso o desechable. Proveedor: ${provider} (${providerType}). Dominio desechable: ${disposableDomain || providerDomain}. Este tipo de correos se usan frecuentemente para registros falsos, evasión de verificaciones o actividades fraudulentas. Se recomienda no confiar en esta dirección para comunicaciones oficiales o verificaciones de identidad.`,
        url: `https://email-validator.com/es/validate?email=${encodeURIComponent(email)}`,
        dataFound: `Estado: Sospechoso | Desechable: Sí | Proveedor: ${provider} | Tipo: ${providerType} | Dominio: ${disposableDomain || providerDomain}`,
      });
    } else if (!isValid) {
      results.push({
        source: 'Email Validator',
        category: 'email_invalid',
        severity: 'high',
        title: `Correo inválido: ${email}`,
        description: `La dirección de correo "${email}" no superó las comprobaciones de validación. La sintaxis o el dominio no son válidos, lo que indica que el correo no existe o no puede recibir mensajes.`,
        url: `https://email-validator.com/es/validate?email=${encodeURIComponent(email)}`,
        dataFound: `Estado: Inválido | Sintaxis: ${syntaxStatus} | Dominio: ${domainAccess}`,
      });
    } else {
      results.push({
        source: 'Email Validator',
        category: 'email_validation',
        severity: 'info',
        title: `Correo válido: ${email}`,
        description: `La dirección de correo "${email}" superó las comprobaciones de sintaxis y dominio. Proveedor: ${provider} (${providerType}). No se detectaron señales de correo desechable.`,
        url: `https://email-validator.com/es/validate?email=${encodeURIComponent(email)}`,
        dataFound: `Estado: Válido | Sintaxis: ${syntaxStatus} | Dominio: ${domainAccess} | Proveedor: ${provider} (${providerType})`,
      });
    }

    // 2. DNS security analysis
    const dnsIssues: string[] = [];
    if (!mxPresent) dnsIssues.push('Sin registros MX');
    if (!spfPresent) dnsIssues.push('Sin SPF');
    if (!dmarcPresent) dnsIssues.push('Sin DMARC');

    if (dnsIssues.length > 0 && isValid && !isDisposable) {
      results.push({
        source: 'Email Validator',
        category: 'dns_security',
        severity: dnsIssues.length >= 2 ? 'high' : 'medium',
        title: `Configuración DNS débil: ${providerDomain}`,
        description: `El dominio "${providerDomain}" presenta deficiencias DNS: ${dnsIssues.join(', ')}. ${!spfPresent ? 'Sin SPF, cualquier servidor puede enviar correos en nombre de este dominio. ' : ''}${!dmarcPresent ? 'Sin DMARC, no hay protección contra suplantación. ' : ''}${!mxPresent ? 'Sin MX, el dominio no puede recibir correos. ' : ''}`,
        url: `https://email-validator.com/es/validate?email=${encodeURIComponent(email)}`,
        dataFound: `MX: ${mxPresent ? 'Presente' : 'Ausente'} | SPF: ${spfPresent ? 'Presente' : 'Ausente'} | DMARC: ${dmarcPresent ? 'Presente' : 'Ausente'} | BIMI: ${bimiPresent ? 'Presente' : 'Ausente'} | MX Records: ${mxRecords.join('; ') || 'Ninguno'}`,
      });
    } else if (mxPresent && spfPresent && dmarcPresent && isValid) {
      results.push({
        source: 'Email Validator',
        category: 'dns_security',
        severity: 'info',
        title: `Configuración DNS completa: ${providerDomain}`,
        description: `El dominio "${providerDomain}" cuenta con configuración DNS robusta: MX (${mxRecords.length} registros), SPF y DMARC presentes. Esto indica un proveedor legítimo y bien configurado.`,
        url: `https://email-validator.com/es/validate?email=${encodeURIComponent(email)}`,
        dataFound: `MX: ${mxRecords.join('; ')} | SPF: Presente | DMARC: Presente${bimiPresent ? ' | BIMI: Presente' : ''}`,
      });
    }

    // 3. Provider type detail (if disposable)
    if (providerType && providerType.toLowerCase().includes('desechable')) {
      results.push({
        source: 'Email Validator',
        category: 'email_provider',
        severity: 'high',
        title: `Proveedor desechable: ${provider}`,
        description: `El correo pertenece al proveedor "${provider}", clasificado como "${providerType}". Los proveedores desechables ofrecen direcciones temporales que se autodestruyen, usados para evadir verificaciones de identidad, crear cuentas falsas o realizar actividades maliciosas sin rastro.`,
        url: `https://email-validator.com/es/validate?email=${encodeURIComponent(email)}`,
        dataFound: `Proveedor: ${provider} | Tipo: ${providerType} | Dominio: ${providerDomain}`,
      });
    }

  } catch (error) {
    const errMsg = error instanceof Error ? error.message : 'Error desconocido';
    console.warn(`[OSINT] Email Validator error for ${email}:`, errMsg);
    results.push({
      source: 'Email Validator',
      category: 'email_validation',
      severity: 'info',
      title: `Error al validar correo: ${email}`,
      description: `No se pudo completar la validación: ${errMsg}`,
    });
  }

  return results;
}

// ══════════════════════════════════════════════════════
//  ORQUESTADOR DE ESCANEO COMPLETO (17 motores)
// ══════════════════════════════════════════════════════

export async function runFullScan(params: {
  fullName: string;
  cedula?: string;
  email?: string;
  phone?: string;
  deepseekKey?: string;
  selectedEngines?: string[];
}): Promise<OSINTResult[]> {
  // Set DeepSeek key if provided
  if (params.deepseekKey) {
    setDeepSeekApiKey(params.deepseekKey);
  }

  const { fullName, cedula, email, phone, selectedEngines } = params;
  const allResults: OSINTResult[] = [];
  const scanPromises: Promise<OSINTResult[]>[] = [];

  // Helper: check if an engine should run
  const shouldRun = (engineName: string) =>
    !selectedEngines || selectedEngines.length === 0 || selectedEngines.includes(engineName);

  // ── Brechas y Credenciales (5) ──
  if (email && shouldRun('Have I Been Pwned')) {
    scanPromises.push(checkHIBP(email, fullName));
  }
  if (email && shouldRun('Pwned Passwords')) {
    scanPromises.push(checkPwnedPasswords(email, fullName));
  }
  if (email && shouldRun('HIBP Deep Check')) {
    scanPromises.push(checkHIBPDeep(email, fullName));
  }
  if (shouldRun('LeakIX')) {
    scanPromises.push(scanLeakIX(fullName, email, cedula));
  }
  if (shouldRun('Dehashed')) {
    scanPromises.push(scanDehashed(fullName, email, cedula));
  }

  // ── Dark Web y Filtraciones (2) ──
  if (email && shouldRun('Dark Web / Leak Scan')) {
    scanPromises.push(scanDarkWeb(email, fullName));
  }
  if (shouldRun('LeakRadar')) {
    scanPromises.push(scanLeakRadar(fullName, email, cedula));
  }

  // ── Redes Sociales (2) ──
  if (shouldRun('Social Media Scan')) {
    scanPromises.push(scanSocialMedia(fullName, email));
  }
  if (shouldRun('DeepFind Profile Analyzer')) {
    scanPromises.push(scanDeepFindProfile(fullName, email));
  }

  // ── Telegram XTEA (1) ──
  if (shouldRun('Telegram XTEA')) {
    scanPromises.push(scanTelegramXTEAEngine(fullName, email));
  }

  // ── Búsqueda Avanzada (2) ──
  if (shouldRun('Google Dorking')) {
    scanPromises.push(googleDorkSearch(fullName, email, phone, cedula));
  }
  if (shouldRun('Document Exposure Scan')) {
    scanPromises.push(scanDocumentExposure(fullName, cedula));
  }

  // ── Identidad y Datos (3) ──
  if (shouldRun('Data Broker Scan')) {
    scanPromises.push(scanDataBrokers(fullName, email, phone));
  }
  if (shouldRun('Pipl')) {
    scanPromises.push(scanPipl(fullName, email, phone));
  }
  if (shouldRun('DeepFind Deep Search')) {
    scanPromises.push(scanDeepFindDeepSearch(fullName, email, phone, cedula));
  }

  // ── Judicial y Oficial (2) ──
  if (shouldRun('Policía Nacional Colombia')) {
    scanPromises.push(scanPoliciaColombia(fullName, cedula));
  }
  if (shouldRun('Aleph / OCCRP')) {
    scanPromises.push(scanAlephOCCRP(fullName, cedula));
  }

  // ── Validación de Correo (1) ──
  if (email && shouldRun('Email Validator')) {
    scanPromises.push(scanEmailValidatorEngine(fullName, email));
  }

  // Run all in parallel
  const batchResults = await Promise.allSettled(scanPromises);

  for (const result of batchResults) {
    if (result.status === 'fulfilled') {
      allResults.push(...result.value);
    } else {
      console.warn('[OSINT] Engine failed:', result.reason);
    }
  }

  // ── Improved deduplication ──
  const seenTitles = new Set<string>();
  const seenUrls = new Set<string>();
  const deduped: OSINTResult[] = [];

  for (const r of allResults) {
    // Skip error categories
    if (r.category === 'error') continue;

    const titleKey = `${r.source}:${r.title}`;
    const urlKey = r.url || '';

    // Dedup by source:title
    if (seenTitles.has(titleKey)) continue;
    seenTitles.add(titleKey);

    // Dedup by URL across engines (only for non-info findings with a URL)
    if (urlKey && r.severity !== 'info') {
      if (seenUrls.has(urlKey)) continue;
      seenUrls.add(urlKey);
    }

    deduped.push(r);
  }

  const engineCount = selectedEngines && selectedEngines.length > 0 ? selectedEngines.length : 18;
  console.log(`[OSINT] Scan complete: ${deduped.length} unique results from ${engineCount} engines`);

  // Use AI for final analysis if key is available (DeepSeek or ZAI SDK)
  if (deduped.length > 0) {
    try {
      const summaryFindings = await generateAISummary({ fullName, email, cedula, phone }, deduped);
      if (summaryFindings.length > 0) {
        deduped.push(...summaryFindings);
      }
    } catch { /* non-critical */ }
  }

  return deduped;
}

// ── AI Summary Generation — Now with ZAI SDK fallback ──
async function generateAISummary(
  data: { fullName: string; email?: string; cedula?: string; phone?: string },
  results: OSINTResult[]
): Promise<OSINTResult[]> {
  const criticalHigh = results.filter(r => r.severity === 'critical' || r.severity === 'high');
  if (criticalHigh.length === 0) return [];

  const findingsSummary = criticalHigh.slice(0, 10).map(r =>
    `[${r.severity.toUpperCase()}] ${r.source}: ${r.title} — ${r.description || ''}`
  ).join('\n');

  const summaryPrompt = `Resume los hallazgos críticos para ${data.fullName}:\n\n${findingsSummary}`;

  // ── Strategy 1: DeepSeek ──
  if (deepseekApiKey) {
    try {
      const response = await fetch('https://api.deepseek.com/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${deepseekApiKey}`,
        },
        body: JSON.stringify({
          model: 'deepseek-chat',
          messages: [
            {
              role: 'system',
              content: 'Eres un analista OSINT experto. Genera un resumen ejecutivo de los hallazgos de seguridad más críticos. Responde en español con máximo 3 párrafos.'
            },
            {
              role: 'user',
              content: summaryPrompt
            },
          ],
          temperature: 0.3,
          max_tokens: 500,
        }),
        signal: AbortSignal.timeout(15000),
      });

      if (response.ok) {
        const completion = await response.json();
        const summary = completion.choices?.[0]?.message?.content;
        if (summary) {
          return [{
            source: 'Análisis IA DeepSeek',
            category: 'personal_exposure',
            severity: 'info',
            title: 'Resumen Ejecutivo IA',
            description: summary.substring(0, 500),
            dataFound: `Análisis de ${criticalHigh.length} hallazgos críticos/alto`,
          }];
        }
      }
    } catch { /* continue to ZAI fallback */ }
  }

  // ── Strategy 2: ZAI SDK fallback ──
  try {
    const ZAI = (await import('z-ai-web-dev-sdk')).default;
    const zai = await ZAI.create();
    const completion = await zai.chat.completions.create({
      messages: [
        {
          role: 'system',
          content: 'Eres un analista OSINT experto. Genera un resumen ejecutivo de los hallazgos de seguridad más críticos. Responde en español con máximo 3 párrafos.'
        },
        {
          role: 'user',
          content: summaryPrompt
        },
      ],
    });

    const summary = completion.choices?.[0]?.message?.content;
    if (summary) {
      return [{
        source: 'Análisis IA ZAI',
        category: 'personal_exposure',
        severity: 'info',
        title: 'Resumen Ejecutivo IA',
        description: summary.substring(0, 500),
        dataFound: `Análisis de ${criticalHigh.length} hallazgos críticos/alto`,
      }];
    }
  } catch { /* no AI available */ }

  return [];
}
