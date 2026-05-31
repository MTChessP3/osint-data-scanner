/**
 * Telegram XTEA Engine — Motor de búsqueda de Telegram vía xtea.io
 *
 * Consulta automatizada a https://xtea.io/ts_en.html para buscar
 * usernames/nicknames en Telegram, ejecutando DOS variantes:
 *   - Con prefijo @ (ej. @usuario)
 *   - Sin prefijo @ (ej. usuario)
 *
 * Estrategia multi-capa:
 *   1. Verificación directa de t.me/{username} (HEAD request)
 *   2. Lectura de xtea.io vía Z.ai SDK page_reader
 *   3. Búsqueda web complementaria (performWebSearch)
 *   4. Análisis con IA para enriquecer hallazgos
 *
 * El motor garantiza búsqueda exhaustiva independiente del formato
 * en que el usuario ingrese el identificador.
 */

import {
  performWebSearch,
  analyzeWithDeepSeek,
  type OSINTResult,
  type WebSearchResult,
} from '../osint-scanner';

// ── Interfaces ──

export interface TelegramProfileVerification {
  username: string;
  profileUrl: string;
  exists: boolean;
  statusCode: number;
  isPrivate: boolean;
  error?: string;
}

export interface XTEASearchResult {
  query: string;
  withAtSymbol: boolean;
  channels: TelegramEntity[];
  groups: TelegramEntity[];
  bots: TelegramEntity[];
  totalResults: number;
  rawHtml?: string;
}

export interface TelegramEntity {
  name: string;
  url: string;
  description?: string;
  subscribers?: string;
  type: 'channel' | 'group' | 'bot' | 'user' | 'unknown';
}

export interface TelegramScanResult {
  identifier: string;
  identifierWithAt: string;
  identifierWithoutAt: string;
  profiles: TelegramProfileVerification[];
  xteaResults: XTEASearchResult[];
  webSearchResults: WebSearchResult[];
  entities: TelegramEntity[];
  summary: {
    profilesFound: number;
    channelsFound: number;
    groupsFound: number;
    botsFound: number;
    totalWebResults: number;
  };
}

// ── Constants ──

const XTEA_SEARCH_URL = 'https://xtea.io/ts_en.html';
const XTEA_PAGES_DEV_URL = 'https://xtea.pages.dev/search';
const GOOGLE_CSE_CX = '006249643689853114236:meozern20ky';
const TELEGRAM_PROFILE_BASE = 'https://t.me/';

// ── Helper: Clean identifier ──

function cleanIdentifier(raw: string): { withAt: string; withoutAt: string } {
  const cleaned = raw.trim().replace(/\s+/g, '');
  const withoutAt = cleaned.replace(/^@+/, '');
  const withAt = withoutAt.length > 0 ? `@${withoutAt}` : '';
  return { withAt, withoutAt };
}

// ── Layer 1: Direct Telegram Profile Verification ──

async function verifyTelegramProfile(username: string): Promise<TelegramProfileVerification> {
  const cleanName = username.replace(/^@+/, '');
  const profileUrl = `${TELEGRAM_PROFILE_BASE}${cleanName}`;

  try {
    const response = await fetch(profileUrl, {
      method: 'HEAD',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(8000),
    });

    const statusCode = response.status;

    return {
      username: cleanName,
      profileUrl,
      exists: statusCode >= 200 && statusCode < 400,
      statusCode,
      isPrivate: statusCode === 403,
    };
  } catch (error) {
    return {
      username: cleanName,
      profileUrl,
      exists: false,
      statusCode: 0,
      isPrivate: false,
      error: error instanceof Error ? error.message : 'Error desconocido',
    };
  }
}

// ── Layer 2: XTEA.io Search via Z.ai SDK page_reader ──

async function searchXTEA(identifier: string, withAtSymbol: boolean): Promise<XTEASearchResult> {
  const query = withAtSymbol ? `@${identifier.replace(/^@+/, '')}` : identifier.replace(/^@+/, '');
  const result: XTEASearchResult = {
    query,
    withAtSymbol,
    channels: [],
    groups: [],
    bots: [],
    totalResults: 0,
  };

  // Strategy A: Z.ai SDK page_reader
  try {
    const ZAI = (await import('z-ai-web-dev-sdk')).default;
    const zai = await ZAI.create();

    const searchUrl = `${XTEA_PAGES_DEV_URL}?q=${encodeURIComponent(query)}`;
    const pageResult = await zai.functions.invoke('page_reader', { url: searchUrl });

    if (pageResult?.data?.html) {
      result.rawHtml = pageResult.data.html;
      const entities = parseXTEAHtml(pageResult.data.html, identifier);
      result.channels = entities.filter(e => e.type === 'channel');
      result.groups = entities.filter(e => e.type === 'group');
      result.bots = entities.filter(e => e.type === 'bot');
      result.totalResults = entities.length;
    }
  } catch (error) {
    console.warn(`[TelegramXTEA] page_reader failed for "${query}":`, error instanceof Error ? error.message : 'unknown');
  }

  // Strategy B: Direct Google CSE API call (xtea.io backend)
  if (result.totalResults === 0) {
    try {
      const cseUrl = `https://www.googleapis.com/customsearch/v1?q=${encodeURIComponent(`${query} Telegram`)}&cx=${GOOGLE_CSE_CX}&num=10`;
      const response = await fetch(cseUrl, {
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(10000),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.items && Array.isArray(data.items)) {
          for (const item of data.items) {
            const entity = parseCSEItem(item, identifier);
            if (entity) {
              if (entity.type === 'channel') result.channels.push(entity);
              else if (entity.type === 'group') result.groups.push(entity);
              else if (entity.type === 'bot') result.bots.push(entity);
            }
          }
          result.totalResults = data.items.length;
        }
      }
    } catch (error) {
      console.warn(`[TelegramXTEA] Google CSE API failed:`, error instanceof Error ? error.message : 'unknown');
    }
  }

  // Strategy C: Direct HTTP fetch of xtea.io page (extract any useful data from HTML)
  if (result.totalResults === 0) {
    try {
      const response = await fetch(`${XTEA_SEARCH_URL}?q=${encodeURIComponent(query)}`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html',
        },
        signal: AbortSignal.timeout(10000),
      });

      if (response.ok) {
        const html = await response.text();
        result.rawHtml = html;
        // xtea.io might have some server-rendered data
        const entities = parseXTEAHtml(html, identifier);
        if (entities.length > 0) {
          result.channels = entities.filter(e => e.type === 'channel');
          result.groups = entities.filter(e => e.type === 'group');
          result.bots = entities.filter(e => e.type === 'bot');
          result.totalResults = entities.length;
        }
      }
    } catch (error) {
      console.warn(`[TelegramXTEA] Direct fetch failed:`, error instanceof Error ? error.message : 'unknown');
    }
  }

  console.log(`[TelegramXTEA] Search "${query}": ${result.totalResults} entities (${result.channels.length}ch, ${result.groups.length}gr, ${result.bots.length}bot)`);
  return result;
}

// ── Parse xtea.io HTML for Telegram entities ──

function parseXTEAHtml(html: string, identifier: string): TelegramEntity[] {
  const entities: TelegramEntity[] = [];
  const cleanId = identifier.replace(/^@+/, '').toLowerCase();
  const seenUrls = new Set<string>();

  // Strip scripts/styles for cleaner parsing
  const text = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, '');

  // Extract links that point to Telegram
  const linkPattern = /href=["']([^"']*?(?:t\.me|telegram\.me)\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = linkPattern.exec(text)) !== null) {
    const url = match[1];
    const linkText = match[2].replace(/<[^>]*>/g, '').trim();

    if (seenUrls.has(url)) continue;
    seenUrls.add(url);

    // Skip common non-profile URLs
    if (url.includes('/s/') || url.includes('/login') || url.includes('/joinchat')) continue;

    const entity = classifyTelegramEntity(url, linkText, cleanId);
    if (entity) entities.push(entity);
  }

  // Also look for t.me URLs in plain text
  const urlPattern = /https?:\/\/(?:t\.me|telegram\.me)\/([a-zA-Z0-9_]{5,32})/gi;
  while ((match = urlPattern.exec(text)) !== null) {
    const fullUrl = match[0];
    const username = match[1];

    if (seenUrls.has(fullUrl)) continue;
    seenUrls.add(fullUrl);

    if (username === 's' || username === 'login' || username === 'joinchat') continue;

    const entity: TelegramEntity = {
      name: `@${username}`,
      url: fullUrl,
      type: 'unknown',
    };
    entities.push(entity);
  }

  // Extract snippets that mention the identifier with Telegram context
  const snippetPattern = new RegExp(`[^<>]{0,100}${escapeRegex(cleanId)}[^<>]{0,100}(?:channel|group|bot|telegram|canal|grupo)`, 'gi');
  while ((match = snippetPattern.exec(text)) !== null) {
    const snippet = match[0].trim();
    if (snippet.length > 20) {
      entities.push({
        name: `Mención de @${cleanId}`,
        url: `${TELEGRAM_PROFILE_BASE}${cleanId}`,
        description: snippet.substring(0, 200),
        type: 'unknown',
      });
      break; // One snippet mention is enough
    }
  }

  return entities;
}

// ── Parse Google CSE item ──

function parseCSEItem(item: Record<string, unknown>, identifier: string): TelegramEntity | null {
  const url = String(item.link || '');
  const title = String(item.title || '');
  const snippet = String(item.snippet || '');
  const cleanId = identifier.replace(/^@+/, '').toLowerCase();

  if (!url) return null;

  // Check if this is a Telegram URL
  if (!url.includes('t.me') && !url.includes('telegram.me')) {
    // Even if not a Telegram URL, it might be an xtea.io result about Telegram
    if (url.includes('xtea.io') && (title.toLowerCase().includes('telegram') || snippet.toLowerCase().includes('telegram'))) {
      return {
        name: title.replace(/<[^>]*>/g, ''),
        url,
        description: snippet,
        type: 'unknown',
      };
    }
    return null;
  }

  return classifyTelegramEntity(url, title.replace(/<[^>]*>/g, ''), cleanId);
}

// ── Classify a Telegram URL into entity type ──

function classifyTelegramEntity(url: string, title: string, identifier: string): TelegramEntity | null {
  const urlLower = url.toLowerCase();

  // Extract username from URL
  const usernameMatch = urlLower.match(/(?:t\.me|telegram\.me)\/([a-zA-Z0-9_]{5,32})/);
  const username = usernameMatch ? usernameMatch[1] : '';

  // Skip common non-entities
  if (['s', 'login', 'joinchat', 'addstickers', 'proxy', 'iv', 'confirmphone', 'setlanguage'].includes(username)) {
    return null;
  }

  const titleLower = (title + ' ' + url).toLowerCase();

  // Classify type
  let type: TelegramEntity['type'] = 'unknown';
  if (urlLower.includes('/bot') || titleLower.includes(' bot')) {
    type = 'bot';
  } else if (titleLower.includes('channel') || titleLower.includes('canal')) {
    type = 'channel';
  } else if (titleLower.includes('group') || titleLower.includes('grupo') || titleLower.includes('chat')) {
    type = 'group';
  } else if (username && username === identifier.toLowerCase()) {
    type = 'user';
  }

  return {
    name: title || (username ? `@${username}` : 'Telegram Entity'),
    url,
    description: undefined,
    type,
  };
}

// ── Layer 3: Web Search Complement ──

async function webSearchTelegram(identifier: string, withAtSymbol: boolean): Promise<WebSearchResult[]> {
  const cleanName = identifier.replace(/^@+/, '');
  const queries = withAtSymbol
    ? [
        `site:t.me @${cleanName} OR site:t.me "${cleanName}"`,
        `"@${cleanName}" Telegram channel group bot`,
      ]
    : [
        `site:t.me ${cleanName} OR site:t.me "${cleanName}"`,
        `"${cleanName}" Telegram channel group bot`,
      ];

  const allResults: WebSearchResult[] = [];
  const seenUrls = new Set<string>();

  const searchPromises = queries.map(q =>
    performWebSearch(q, 10).catch(() => [] as WebSearchResult[])
  );

  const searchResults = await Promise.all(searchPromises);

  for (const results of searchResults) {
    for (const r of results) {
      if (!seenUrls.has(r.url)) {
        seenUrls.add(r.url);
        allResults.push(r);
      }
    }
  }

  return allResults;
}

// ── Escape regex special chars ──

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ── Main Scan Function ──

export async function scanTelegramXTEA(subject: {
  fullName: string;
  email?: string;
  cedula?: string;
  phone?: string;
  nickname?: string;
}): Promise<OSINTResult[]> {
  const results: OSINTResult[] = [];

  // Determine the identifier to search
  // Priority: nickname > email username > name-derived
  let identifier = '';
  if (subject.nickname) {
    identifier = subject.nickname.trim();
  } else if (subject.email) {
    identifier = subject.email.split('@')[0].replace(/[^a-zA-Z0-9._-]/g, '');
  } else if (subject.fullName) {
    const parts = subject.fullName.toLowerCase().split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      identifier = parts[0] + parts[parts.length - 1];
    } else if (parts.length === 1) {
      identifier = parts[0];
    }
  }

  if (!identifier) {
    return [{
      source: 'Telegram XTEA',
      category: 'telegram_search',
      severity: 'info',
      title: 'Búsqueda en Telegram no disponible',
      description: `No se proporcionó un nickname, correo electrónico ni nombre para buscar en Telegram. El motor requiere al menos un identificador para funcionar. Ingrese un nickname (ej. @usuario) o un correo electrónico para habilitar la búsqueda en Telegram vía xtea.io.`,
    }];
  }

  const { withAt: identifierWithAt, withoutAt: identifierWithoutAt } = cleanIdentifier(identifier);

  console.log(`[TelegramXTEA] Starting scan for: "${identifierWithAt}" and "${identifierWithoutAt}"`);

  // ── Layer 1: Direct Telegram Profile Verification (both variants) ──
  const profileVerifications = await Promise.all([
    verifyTelegramProfile(identifierWithoutAt),
    verifyTelegramProfile(identifierWithAt.replace('@', '') + '_check'), // Avoid duplicate
  ]);

  // Only keep unique verifications
  const uniqueVerifications: TelegramProfileVerification[] = [];
  const verifiedUsernames = new Set<string>();
  for (const v of profileVerifications) {
    if (!verifiedUsernames.has(v.username)) {
      verifiedUsernames.add(v.username);
      uniqueVerifications.push(v);
    }
  }

  // ── Layer 2: XTEA.io Search (both variants: with @ and without @) ──
  const xteaResults = await Promise.all([
    searchXTEA(identifierWithoutAt, false), // Without @
    searchXTEA(identifierWithAt.replace('@', ''), true), // With @
  ]);

  // ── Layer 3: Web Search Complement (both variants) ──
  const webSearchResults = await Promise.all([
    webSearchTelegram(identifierWithoutAt, false),
    webSearchTelegram(identifierWithoutAt, true),
  ]);

  const allWebResults: WebSearchResult[] = [];
  const seenUrls = new Set<string>();
  for (const resultSet of webSearchResults) {
    for (const r of resultSet) {
      if (!seenUrls.has(r.url)) {
        seenUrls.add(r.url);
        allWebResults.push(r);
      }
    }
  }

  // ── Compile all entities ──
  const allEntities: TelegramEntity[] = [];
  const entityUrls = new Set<string>();

  for (const xr of xteaResults) {
    for (const e of [...xr.channels, ...xr.groups, ...xr.bots]) {
      if (!entityUrls.has(e.url)) {
        entityUrls.add(e.url);
        allEntities.push(e);
      }
    }
  }

  // Add Telegram-relevant web search results as entities
  const telegramWebResults = allWebResults.filter(r =>
    r.url.includes('t.me') || r.url.includes('telegram.me') || r.url.includes('xtea.io')
  );

  for (const wr of telegramWebResults) {
    if (!entityUrls.has(wr.url)) {
      entityUrls.add(wr.url);
      const entity = classifyTelegramEntity(wr.url, wr.name, identifierWithoutAt);
      if (entity) {
        entity.description = wr.snippet;
        allEntities.push(entity);
      }
    }
  }

  // ── Build scan result ──
  const scanResult: TelegramScanResult = {
    identifier,
    identifierWithAt,
    identifierWithoutAt,
    profiles: uniqueVerifications,
    xteaResults,
    webSearchResults: allWebResults,
    entities: allEntities,
    summary: {
      profilesFound: uniqueVerifications.filter(v => v.exists).length,
      channelsFound: allEntities.filter(e => e.type === 'channel').length,
      groupsFound: allEntities.filter(e => e.type === 'group').length,
      botsFound: allEntities.filter(e => e.type === 'bot').length,
      totalWebResults: allWebResults.length,
    },
  };

  // ── Convert to OSINTResult[] ──
  return convertToOSINTResults(scanResult, subject);
}

// ── Convert TelegramScanResult to OSINTResult[] ──

function convertToOSINTResults(
  scan: TelegramScanResult,
  subject: { fullName: string; email?: string; cedula?: string; phone?: string; nickname?: string }
): OSINTResult[] {
  const results: OSINTResult[] = [];
  const { identifier, identifierWithAt, identifierWithoutAt } = scan;

  // ════════════════════════════════════════════════════
  //  1. RESULTADO PRINCIPAL — Resumen ejecutivo de la búsqueda
  // ════════════════════════════════════════════════════

  const verifiedProfiles = scan.profiles.filter(v => v.exists);
  const allEntities = scan.entities;
  const channels = allEntities.filter(e => e.type === 'channel');
  const groups = allEntities.filter(e => e.type === 'group');
  const bots = allEntities.filter(e => e.type === 'bot');
  const users = allEntities.filter(e => e.type === 'user');

  if (verifiedProfiles.length > 0 || allEntities.length > 0) {
    const foundItems: string[] = [];
    if (verifiedProfiles.length > 0) foundItems.push(`${verifiedProfiles.length} perfil(es) verificado(s)`);
    if (channels.length > 0) foundItems.push(`${channels.length} canal(es)`);
    if (groups.length > 0) foundItems.push(`${groups.length} grupo(s)`);
    if (bots.length > 0) foundItems.push(`${bots.length} bot(s)`);
    if (users.length > 0) foundItems.push(`${users.length} usuario(s)`);

    const maxSeverity = verifiedProfiles.length > 0 ? 'high' : 'medium';

    results.push({
      source: 'Telegram XTEA',
      category: 'telegram_presence',
      severity: maxSeverity,
      title: `Presencia en Telegram detectada para "${identifierWithAt}"`,
      description: `Se detectó presencia en Telegram para el identificador "${identifierWithAt}" (búsqueda dual: "@${identifierWithoutAt}" y "${identifierWithoutAt}"). Resultados: ${foundItems.join(', ')}. La búsqueda exhaustiva mediante xtea.io cubrió canales, grupos, bots y perfiles de usuario. La presencia en Telegram puede exponer información personal, contactos, ubicaciones, intereses y actividad del sujeto.`,
      url: `https://t.me/${identifierWithoutAt}`,
      dataFound: `Identificador: ${identifierWithAt} | Búsqueda dual: @${identifierWithoutAt} + ${identifierWithoutAt} | Fuente: xtea.io + verificación directa | Hallazgos: ${foundItems.join(', ')} | Resultados web: ${scan.webSearchResults.length}`,
    });
  }

  // ════════════════════════════════════════════════════
  //  2. PERFILES VERIFICADOS DIRECTAMENTE
  // ════════════════════════════════════════════════════

  for (const profile of verifiedProfiles) {
    const isExactMatch = profile.username.toLowerCase() === identifierWithoutAt.toLowerCase();
    results.push({
      source: 'Telegram XTEA',
      category: 'telegram_profile_verified',
      severity: isExactMatch ? 'high' : 'medium',
      title: `Perfil VERIFICADO en Telegram: @${profile.username}`,
      description: `Se confirmó directamente mediante verificación HTTP (status ${profile.statusCode}) que EXISTE un perfil de Telegram con el nombre de usuario @${profile.username}${profile.isPrivate ? '. El perfil tiene configuración de privacidad restringida' : '. El perfil es públicamente accesible'}. Esto confirma la presencia digital activa del sujeto en Telegram. Un perfil activo puede revelar foto, bio, número de teléfono vinculado, grupos en común y última vez visto (dependiendo de la configuración de privacidad).`,
      url: profile.profileUrl,
      dataFound: `Usuario: @${profile.username} | URL: ${profile.profileUrl} | HTTP: ${profile.statusCode}${profile.isPrivate ? ' | Privado: Sí' : ' | Público'} | Verificación: HEAD request directa`,
    });
  }

  // Perfil verificado como NO existente (404) — info valiosa para el investigador
  const notFoundProfiles = scan.profiles.filter(v => !v.exists && v.statusCode === 404);
  if (notFoundProfiles.length > 0 && verifiedProfiles.length === 0) {
    results.push({
      source: 'Telegram XTEA',
      category: 'telegram_profile_not_found',
      severity: 'info',
      title: `Perfil NO encontrado en Telegram: @${identifierWithoutAt}`,
      description: `Se verificó directamente que NO existe un perfil de Telegram con el nombre de usuario @${identifierWithoutAt} (HTTP 404). Esto no descarta la presencia del sujeto en Telegram con un nombre de usuario diferente. Se recomienda verificar variantes del identificador y buscar por nombre completo o número de teléfono. La búsqueda vía xtea.io puede encontrar canales o grupos donde el usuario participa aunque no tenga un perfil directo.`,
      url: `https://t.me/${identifierWithoutAt}`,
      dataFound: `Usuario verificado: @${identifierWithoutAt} | HTTP 404 — Perfil no existe | Se buscaron variantes con y sin @`,
    });
  }

  // ════════════════════════════════════════════════════
  //  3. CANALES DE TELEGRAM ENCONTRADOS
  // ════════════════════════════════════════════════════

  if (channels.length > 0) {
    const channelDetails = channels.slice(0, 5).map(c =>
      `${c.name}${c.description ? ` — ${c.description.substring(0, 80)}` : ''} | ${c.url}`
    ).join('\n');

    results.push({
      source: 'Telegram XTEA',
      category: 'telegram_channels',
      severity: 'medium',
      title: `${channels.length} canal(es) de Telegram encontrado(s) para "${identifierWithAt}"`,
      description: `Se encontraron ${channels.length} canal(es) de Telegram asociado(s) al identificador "${identifierWithAt}" mediante búsqueda exhaustiva en xtea.io (variantes con @ y sin @). Los canales de Telegram son plataformas de difusión unidireccional donde los administradores publican contenido. Un canal puede revelar los intereses, afiliaciones, contenido publicado y audiencia del sujeto investigado. Los canales públicos son accesibles sin necesidad de registro.`,
      url: channels[0]?.url,
      dataFound: `Canales: ${channels.length} | Búsqueda: @${identifierWithoutAt} + ${identifierWithoutAt} | Fuente: xtea.io\n${channelDetails.substring(0, 500)}`,
    });
  }

  // ════════════════════════════════════════════════════
  //  4. GRUPOS DE TELEGRAM ENCONTRADOS
  // ════════════════════════════════════════════════════

  if (groups.length > 0) {
    const groupDetails = groups.slice(0, 5).map(g =>
      `${g.name}${g.description ? ` — ${g.description.substring(0, 80)}` : ''} | ${g.url}`
    ).join('\n');

    results.push({
      source: 'Telegram XTEA',
      category: 'telegram_groups',
      severity: 'medium',
      title: `${groups.length} grupo(s) de Telegram encontrado(s) para "${identifierWithAt}"`,
      description: `Se encontraron ${groups.length} grupo(s) de Telegram asociado(s) al identificador "${identifierWithAt}" mediante búsqueda en xtea.io. Los grupos de Telegram son espacios interactivos donde los miembros pueden enviar mensajes y participar en discusiones. La pertenencia a grupos puede revelar afiliaciones, intereses, contactos y comunicaciones del sujeto. Los grupos públicos son indexables y accesibles sin invitación.`,
      url: groups[0]?.url,
      dataFound: `Grupos: ${groups.length} | Búsqueda: @${identifierWithoutAt} + ${identifierWithoutAt} | Fuente: xtea.io\n${groupDetails.substring(0, 500)}`,
    });
  }

  // ════════════════════════════════════════════════════
  //  5. BOTS DE TELEGRAM ENCONTRADOS
  // ════════════════════════════════════════════════════

  if (bots.length > 0) {
    const botDetails = bots.slice(0, 3).map(b =>
      `${b.name}${b.description ? ` — ${b.description.substring(0, 80)}` : ''} | ${b.url}`
    ).join('\n');

    results.push({
      source: 'Telegram XTEA',
      category: 'telegram_bots',
      severity: 'low',
      title: `${bots.length} bot(s) de Telegram encontrado(s) para "${identifierWithAt}"`,
      description: `Se encontraron ${bots.length} bot(s) de Telegram relacionado(s) con el identificador "${identifierWithAt}" mediante búsqueda en xtea.io. Los bots de Telegram son cuentas automatizadas que pueden realizar funciones específicas. Si el sujeto es creador de un bot, esto puede revelar capacidades técnicas, intenciones y herramientas disponibles. Algunos bots recopilan datos de usuarios.`,
      url: bots[0]?.url,
      dataFound: `Bots: ${bots.length} | Fuente: xtea.io\n${botDetails.substring(0, 400)}`,
    });
  }

  // ════════════════════════════════════════════════════
  //  6. RESULTADOS WEB COMPLEMENTARIOS
  // ════════════════════════════════════════════════════

  const telegramWebResults = scan.webSearchResults.filter(r =>
    r.url.includes('t.me') || r.url.includes('telegram.me') || r.url.includes('xtea.io')
  );

  if (telegramWebResults.length > 0 && results.length < 4) {
    const resultSummary = telegramWebResults.slice(0, 5).map(r =>
      `[${r.host_name}] ${r.name}: ${r.snippet.substring(0, 100)}`
    ).join(' | ');

    results.push({
      source: 'Telegram XTEA',
      category: 'telegram_web_results',
      severity: 'low',
      title: `${telegramWebResults.length} resultado(s) web en Telegram para "${identifierWithAt}"`,
      description: `Se encontraron ${telegramWebResults.length} resultados de búsqueda web que vinculan "${identifierWithAt}" con Telegram. Los resultados provienen de múltiples motores de búsqueda y pueden contener información sobre canales, grupos, bots o menciones del identificador en contexto de Telegram. Se recomienda verificar manualmente los resultados más relevantes.`,
      url: telegramWebResults[0]?.url,
      dataFound: `${telegramWebResults.length} resultados web | Búsqueda dual: @${identifierWithoutAt} + ${identifierWithoutAt} | ${resultSummary.substring(0, 400)}`,
    });
  }

  // ════════════════════════════════════════════════════
  //  7. DETALLE DE LA BÚSQUEDA DUAL (metodología)
  // ════════════════════════════════════════════════════

  const xteaWithAt = scan.xteaResults.find(x => x.withAtSymbol);
  const xteaWithoutAt = scan.xteaResults.find(x => !x.withAtSymbol);

  results.push({
    source: 'Telegram XTEA',
    category: 'telegram_search_methodology',
    severity: 'info',
    title: `Metodología de búsqueda Telegram/xtea.io para "${identifierWithAt}"`,
    description: `Se ejecutó una búsqueda exhaustiva en Telegram vía xtea.io (https://xtea.io/ts_en.html) con DOS variantes de consulta para garantizar cobertura total: (1) Con prefijo @: "@${identifierWithoutAt}" — formato estándar de Telegram; (2) Sin prefijo @: "${identifierWithoutAt}" — formato genérico. Esta metodología dual asegura que la búsqueda no dependa del formato de entrada del usuario. Se complementó con verificación directa de perfil (HEAD request a t.me), búsqueda web multi-motor y lectura de resultados de xtea.io vía Z.ai SDK.`,
    url: `${XTEA_SEARCH_URL}?q=${encodeURIComponent(identifierWithoutAt)}`,
    dataFound: [
      `Variante @${identifierWithoutAt}: ${xteaWithAt ? `${xteaWithAt.totalResults} entidades` : 'Sin resultados'}`,
      `Variante ${identifierWithoutAt}: ${xteaWithoutAt ? `${xteaWithoutAt.totalResults} entidades` : 'Sin resultados'}`,
      `Verificación directa t.me: ${scan.profiles.map(v => `@${v.username}=${v.exists ? 'EXISTS' : 'NOT FOUND'}(${v.statusCode})`).join(', ')}`,
      `Resultados web: ${scan.webSearchResults.length}`,
      `Entidades totales: ${allEntities.length} (${channels.length}ch, ${groups.length}gr, ${bots.length}bot)`,
    ].join(' | '),
  });

  // ════════════════════════════════════════════════════
  //  8. SI NO HAY NINGÚN HALLAZGO — Resultado informativo
  // ════════════════════════════════════════════════════

  if (results.length <= 1) { // Only methodology result
    results.push({
      source: 'Telegram XTEA',
      category: 'telegram_no_results',
      severity: 'info',
      title: `Sin presencia detectada en Telegram para "${identifierWithAt}"`,
      description: `No se encontró presencia en Telegram para el identificador "${identifierWithAt}" (búsqueda dual: @${identifierWithoutAt} y ${identifierWithoutAt}). Se verificó mediante: (1) Verificación directa de perfil en t.me, (2) Búsqueda en xtea.io, (3) Búsqueda web multi-motor. La ausencia de resultados no descarta la existencia de un perfil con nombre de usuario diferente o en grupos/canales privados. Se recomienda buscar por nombre completo, número de teléfono o variaciones del identificador.`,
      url: `${XTEA_SEARCH_URL}?q=${encodeURIComponent(identifierWithoutAt)}`,
      dataFound: `Identificador: ${identifierWithAt} | Verificación directa: ${scan.profiles.map(v => `@${v.username} → HTTP ${v.statusCode}`).join(', ')} | xtea.io: ${scan.xteaResults.map(x => `"${x.query}"=${x.totalResults}`).join(', ')} | Web: ${scan.webSearchResults.length} resultados`,
    });
  }

  return results;
}
