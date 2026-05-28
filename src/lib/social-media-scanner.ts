/**
 * Social Media OSINT Scanner v3.0 — FAST & RELIABLE
 * - 10 plataformas: TikTok, Instagram, YouTube, WhatsApp, Facebook, X (Twitter), LinkedIn, Telegram, Snapchat, Pinterest
 * - 3 search modes: nickname, email, name
 * - PARALLEL scanning with per-platform timeout
 * - Direct profile URL verification (HEAD requests, fast)
 * - Web search via ZAI SDK for name mode
 * - AI analysis (ZAI SDK) for aggregate findings
 * - Optimized for Vercel serverless (completes within 50s)
 */

import { performWebSearch, analyzeWithDeepSeek, AIFinding, OSINTResult, WebSearchResult } from './osint-scanner';

// ── Platform Configuration ──

export interface SocialPlatform {
  id: string;
  name: string;
  domain: string;
  color: string;
  bgColor: string;
  borderColor: string;
  icon: string;
  description: string;
  profileUrlTemplates: {
    nickname: (nick: string) => string;
    email: (email: string) => string;
    name: (first: string, last: string) => string;
  };
  /** Can we reliably verify profiles by checking the URL? */
  verifiableByHead: boolean;
  /** Domains that indicate a profile on this platform */
  profilePatterns: string[];
}

export const SOCIAL_PLATFORMS: SocialPlatform[] = [
  {
    id: 'tiktok',
    name: 'TikTok',
    domain: 'tiktok.com',
    color: 'text-pink-400',
    bgColor: 'bg-pink-900/20',
    borderColor: 'border-pink-800/50',
    icon: 'Music2',
    description: 'Busqueda de perfiles y contenido en TikTok',
    verifiableByHead: true,
    profilePatterns: ['tiktok.com/@'],
    profileUrlTemplates: {
      nickname: (nick: string) => `https://www.tiktok.com/@${nick}`,
      email: (email: string) => `https://www.tiktok.com/@${email.split('@')[0].replace(/[^a-zA-Z0-9._-]/g, '')}`,
      name: (first: string, last: string) => `https://www.tiktok.com/search?q=${encodeURIComponent(first + ' ' + last)}`,
    },
  },
  {
    id: 'instagram',
    name: 'Instagram',
    domain: 'instagram.com',
    color: 'text-purple-400',
    bgColor: 'bg-purple-900/20',
    borderColor: 'border-purple-800/50',
    icon: 'Camera',
    description: 'Busqueda de perfiles, fotos y publicaciones en Instagram',
    verifiableByHead: false, // Instagram redirects everything to login
    profilePatterns: ['instagram.com/'],
    profileUrlTemplates: {
      nickname: (nick: string) => `https://www.instagram.com/${nick}`,
      email: (email: string) => `https://www.instagram.com/${email.split('@')[0].replace(/[^a-zA-Z0-9._-]/g, '')}`,
      name: (first: string, last: string) => `https://www.instagram.com/search/users/?q=${encodeURIComponent(first + ' ' + last)}`,
    },
  },
  {
    id: 'youtube',
    name: 'YouTube',
    domain: 'youtube.com',
    color: 'text-red-400',
    bgColor: 'bg-red-900/20',
    borderColor: 'border-red-800/50',
    icon: 'Play',
    description: 'Busqueda de canales, videos y listas de reproduccion en YouTube',
    verifiableByHead: true,
    profilePatterns: ['youtube.com/@', 'youtube.com/c/', 'youtube.com/channel/'],
    profileUrlTemplates: {
      nickname: (nick: string) => `https://www.youtube.com/@${nick}`,
      email: (email: string) => `https://www.youtube.com/@${email.split('@')[0].replace(/[^a-zA-Z0-9._-]/g, '')}`,
      name: (first: string, last: string) => `https://www.youtube.com/results?search_query=${encodeURIComponent(first + ' ' + last)}`,
    },
  },
  {
    id: 'whatsapp',
    name: 'WhatsApp',
    domain: 'whatsapp.com',
    color: 'text-green-400',
    bgColor: 'bg-green-900/20',
    borderColor: 'border-green-800/50',
    icon: 'MessageCircle',
    description: 'Busqueda de numeros asociados y grupos publicos en WhatsApp',
    verifiableByHead: false,
    profilePatterns: ['wa.me/', 'whatsapp.com/'],
    profileUrlTemplates: {
      nickname: (nick: string) => `https://wa.me/${nick.replace(/[^0-9+]/g, '')}`,
      email: (_email: string) => '',
      name: (first: string, last: string) => `https://www.google.com/search?q=${encodeURIComponent('"' + first + ' ' + last + '" whatsapp')}`,
    },
  },
  {
    id: 'facebook',
    name: 'Facebook',
    domain: 'facebook.com',
    color: 'text-blue-400',
    bgColor: 'bg-blue-900/20',
    borderColor: 'border-blue-800/50',
    icon: 'Users',
    description: 'Busqueda de perfiles, paginas y grupos en Facebook',
    verifiableByHead: false, // Facebook redirects to login
    profilePatterns: ['facebook.com/', 'fb.com/'],
    profileUrlTemplates: {
      nickname: (nick: string) => `https://www.facebook.com/${nick}`,
      email: (email: string) => `https://www.facebook.com/search/people/?q=${encodeURIComponent(email)}`,
      name: (first: string, last: string) => `https://www.facebook.com/search/people/?q=${encodeURIComponent(first + ' ' + last)}`,
    },
  },
  {
    id: 'twitter',
    name: 'X (Twitter)',
    domain: 'x.com',
    color: 'text-gray-300',
    bgColor: 'bg-gray-800/20',
    borderColor: 'border-gray-700/50',
    icon: 'AtSign',
    description: 'Busqueda de perfiles, tweets y actividad en X (Twitter)',
    verifiableByHead: false, // X requires login
    profilePatterns: ['x.com/', 'twitter.com/'],
    profileUrlTemplates: {
      nickname: (nick: string) => `https://x.com/${nick}`,
      email: (email: string) => `https://x.com/${email.split('@')[0].replace(/[^a-zA-Z0-9._-]/g, '')}`,
      name: (first: string, last: string) => `https://x.com/search?q=${encodeURIComponent(first + ' ' + last)}&f=user`,
    },
  },
  {
    id: 'linkedin',
    name: 'LinkedIn',
    domain: 'linkedin.com',
    color: 'text-sky-400',
    bgColor: 'bg-sky-900/20',
    borderColor: 'border-sky-800/50',
    icon: 'Briefcase',
    description: 'Busqueda de perfiles profesionales y empresas en LinkedIn',
    verifiableByHead: false, // LinkedIn requires login
    profilePatterns: ['linkedin.com/in/', 'linkedin.com/company/'],
    profileUrlTemplates: {
      nickname: (nick: string) => `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(nick)}`,
      email: (email: string) => `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(email)}`,
      name: (first: string, last: string) => `https://www.linkedin.com/pub/dir?firstName=${encodeURIComponent(first)}&lastName=${encodeURIComponent(last)}`,
    },
  },
  {
    id: 'telegram',
    name: 'Telegram',
    domain: 't.me',
    color: 'text-sky-300',
    bgColor: 'bg-sky-900/20',
    borderColor: 'border-sky-800/50',
    icon: 'Send',
    description: 'Busqueda de canales, grupos y perfiles en Telegram',
    verifiableByHead: true, // t.me profiles are publicly accessible
    profilePatterns: ['t.me/', 'telegram.me/'],
    profileUrlTemplates: {
      nickname: (nick: string) => `https://t.me/${nick}`,
      email: (email: string) => `https://t.me/${email.split('@')[0].replace(/[^a-zA-Z0-9._-]/g, '')}`,
      name: (first: string, last: string) => `https://t.me/s/search?query=${encodeURIComponent(first + ' ' + last)}`,
    },
  },
  {
    id: 'snapchat',
    name: 'Snapchat',
    domain: 'snapchat.com',
    color: 'text-yellow-400',
    bgColor: 'bg-yellow-900/20',
    borderColor: 'border-yellow-800/50',
    icon: 'Camera',
    description: 'Busqueda de perfiles y contenido en Snapchat',
    verifiableByHead: true,
    profilePatterns: ['snapchat.com/add/'],
    profileUrlTemplates: {
      nickname: (nick: string) => `https://www.snapchat.com/add/${nick}`,
      email: (email: string) => `https://www.snapchat.com/add/${email.split('@')[0].replace(/[^a-zA-Z0-9._-]/g, '')}`,
      name: (first: string, last: string) => `https://www.snapchat.com/add/${(first + last).toLowerCase().replace(/[^a-zA-Z0-9]/g, '')}`,
    },
  },
  {
    id: 'pinterest',
    name: 'Pinterest',
    domain: 'pinterest.com',
    color: 'text-red-300',
    bgColor: 'bg-red-900/20',
    borderColor: 'border-red-800/50',
    icon: 'Pin',
    description: 'Busqueda de perfiles, tableros y pines en Pinterest',
    verifiableByHead: true,
    profilePatterns: ['pinterest.com/', 'pinterest.es/'],
    profileUrlTemplates: {
      nickname: (nick: string) => `https://www.pinterest.com/${nick}`,
      email: (email: string) => `https://www.pinterest.com/${email.split('@')[0].replace(/[^a-zA-Z0-9._-]/g, '')}`,
      name: (first: string, last: string) => `https://www.pinterest.com/search/people/?q=${encodeURIComponent(first + ' ' + last)}`,
    },
  },
];

// ── Social Media Scan Result ──

export interface SocialScanResult {
  platform: string;
  platformId: string;
  profileFound: boolean;
  profileUrl?: string;
  username?: string;
  profileVerified?: boolean;
  profileStatusCode?: number;
  findings: OSINTResult[];
  searchResultsCount: number;
  rawResults: WebSearchResult[];
}

export interface SocialScanResponse {
  scanId: string;
  searchMode: string;
  searchQuery: string;
  totalPlatforms: number;
  platformsScanned: string[];
  results: SocialScanResult[];
  summary: {
    profilesFound: number;
    totalFindings: number;
    critical: number;
    high: number;
    medium: number;
    low: number;
    info: number;
  };
}

// ── Username extraction from email ──

function extractUsername(email?: string): string {
  if (!email) return '';
  return email.split('@')[0].replace(/[^a-zA-Z0-9._-]/g, '');
}

// ── Generate username permutations for better matching ──

function generateUsernamePermutations(fullName: string, email?: string, nickname?: string): string[] {
  const usernames: string[] = [];
  const parts = fullName.toLowerCase().split(/\s+/).filter(Boolean);
  const emailUser = extractUsername(email);

  if (nickname) {
    const cleanNick = nickname.toLowerCase().replace(/^@/, '');
    usernames.push(cleanNick);
  }

  if (emailUser) usernames.push(emailUser);

  if (parts.length >= 2) {
    const [first, ...rest] = parts;
    const last = rest[rest.length - 1];
    usernames.push(first + last);
    usernames.push(first + '.' + last);
    usernames.push(first + '_' + last);
    usernames.push(first[0] + last);
    if (rest.length > 1) {
      const middle = rest[0];
      usernames.push(first[0] + middle[0] + last);
    }
  } else if (parts.length === 1) {
    usernames.push(parts[0]);
  }

  return Array.from(new Set(usernames));
}

// ══════════════════════════════════════════════════════
//  FAST PROFILE VERIFICATION — HEAD requests only
// ══════════════════════════════════════════════════════

interface ProfileVerification {
  exists: boolean;
  statusCode: number;
  title?: string;
  isPrivate?: boolean;
  error?: string;
}

async function verifyProfileFast(url: string, timeoutMs: number = 6000): Promise<ProfileVerification> {
  try {
    const response = await fetch(url, {
      method: 'HEAD',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(timeoutMs),
    });

    const statusCode = response.status;

    if (statusCode === 200) {
      // For some platforms, a 200 might still mean "login required"
      // But for verifiableByHead platforms, this is reliable
      return { exists: true, statusCode };
    }
    if (statusCode === 404) {
      return { exists: false, statusCode };
    }
    if (statusCode === 403) {
      return { exists: true, statusCode, isPrivate: true };
    }
    // 301/302 redirects — profile likely exists
    if (statusCode >= 300 && statusCode < 400) {
      return { exists: true, statusCode };
    }
    return { exists: false, statusCode };
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : 'unknown';
    return { exists: false, statusCode: 0, error: errMsg };
  }
}

// ══════════════════════════════════════════════════════
//  ROBUST JSON EXTRACTION from AI responses
// ══════════════════════════════════════════════════════

function extractJSONFromAIResponse(content: string): unknown[] | null {
  const trimmed = content.trim();

  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) return parsed;
  } catch { /* continue */ }

  const codeBlockMatch = trimmed.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (codeBlockMatch) {
    try {
      const parsed = JSON.parse(codeBlockMatch[1].trim());
      if (Array.isArray(parsed)) return parsed;
    } catch { /* continue */ }
  }

  const firstBracket = trimmed.indexOf('[');
  const lastBracket = trimmed.lastIndexOf(']');
  if (firstBracket !== -1 && lastBracket > firstBracket) {
    const candidate = trimmed.substring(firstBracket, lastBracket + 1);
    try {
      const parsed = JSON.parse(candidate);
      if (Array.isArray(parsed)) return parsed;
    } catch { /* continue */ }
  }

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

  return null;
}

// ══════════════════════════════════════════════════════
//  ZAI SDK AI ANALYSIS (for social media findings)
// ══════════════════════════════════════════════════════

async function analyzeSocialWithAI(
  context: string,
  searchResults: WebSearchResult[],
  engineName: string,
  subjectData: { fullName?: string; email?: string; cedula?: string; phone?: string; nickname?: string }
): Promise<AIFinding[]> {
  // Try DeepSeek first
  try {
    const aiFindings = await analyzeWithDeepSeek(
      context,
      searchResults,
      engineName,
      { fullName: subjectData.fullName || '', email: subjectData.email, cedula: subjectData.cedula, phone: subjectData.phone }
    );
    if (aiFindings.length > 0) return aiFindings;
  } catch { /* DeepSeek failed */ }

  // Try ZAI SDK as fallback
  try {
    const ZAI = (await import('z-ai-web-dev-sdk')).default;
    const zai = await ZAI.create();

    const resultsText = searchResults.length > 0
      ? searchResults.slice(0, 8).map((r, i) => `${i + 1}. [${r.host_name}] ${r.name}\n   URL: ${r.url}\n   Snippet: ${r.snippet}`).join('\n')
      : 'No se encontraron resultados directos en la busqueda web.';

    const prompt = `Eres un analista OSINT experto. Analiza los siguientes resultados para identificar hallazgos de seguridad sobre la persona investigada.

CONTEXTO: ${context}

DATOS DEL SUJETO:
- Nombre: ${subjectData.fullName || 'No proporcionado'}
- Email: ${subjectData.email || 'No proporcionado'}
- Nickname: ${subjectData.nickname || 'No proporcionado'}

MOTOR: ${engineName}

RESULTADOS WEB:
${resultsText}

INSTRUCCIONES:
1. Para cada resultado relevante, crea un hallazgo con: title, description, severity, category, dataFound
2. Responde SOLO en JSON array, sin texto adicional
3. Genera entre 1 y 3 hallazgos maximo`;

    const completion = await zai.chat.completions.create({
      messages: [
        { role: 'system', content: 'Eres un analista OSINT experto que genera hallazgos estructurados en formato JSON. Respondes SOLO con arrays JSON validos.' },
        { role: 'user', content: prompt },
      ],
    });

    const content = completion.choices?.[0]?.message?.content || '';
    if (!content) return [];

    const findings = extractJSONFromAIResponse(content);
    if (!findings) return [];

    return findings.map((f: Record<string, unknown>) => ({
      title: String(f.title || 'Hallazgo identificado').substring(0, 80),
      description: String(f.description || '').substring(0, 300),
      severity: (['critical', 'high', 'medium', 'low'].includes(f.severity as string) ? f.severity : 'medium') as AIFinding['severity'],
      category: String(f.category || 'social_media'),
      dataFound: String(f.dataFound || '').substring(0, 500),
    }));
  } catch (error) {
    console.warn('[SocialScanner] AI analysis failed:', error instanceof Error ? error.message : 'unknown');
    return [];
  }
}

// ══════════════════════════════════════════════════════
//  FAST PLATFORM SCAN — optimized for speed
// ══════════════════════════════════════════════════════

interface ScanContext {
  fullName?: string;
  email?: string;
  phone?: string;
  cedula?: string;
  nickname?: string;
  searchMode: 'nickname' | 'email' | 'name';
  primaryUsername: string;
  allUsernames: string[];
}

function buildScanContext(params: {
  fullName?: string;
  email?: string;
  phone?: string;
  cedula?: string;
  nickname?: string;
  searchMode: 'nickname' | 'email' | 'name';
}): ScanContext {
  const { fullName, email, phone, cedula, nickname, searchMode } = params;
  const allUsernames: string[] = [];

  switch (searchMode) {
    case 'nickname': {
      const cleanNick = (nickname || '').toLowerCase().replace(/^@/, '');
      allUsernames.push(cleanNick);
      if (email) {
        const emailUser = extractUsername(email);
        if (emailUser) allUsernames.push(emailUser);
      }
      break;
    }
    case 'email': {
      const emailUser = extractUsername(email);
      if (emailUser) allUsernames.push(emailUser);
      if (fullName) {
        const namePerms = generateUsernamePermutations(fullName);
        allUsernames.push(...namePerms);
      }
      break;
    }
    case 'name': {
      const namePerms = generateUsernamePermutations(fullName || '', email, nickname);
      allUsernames.push(...namePerms);
      break;
    }
  }

  const unique = Array.from(new Set(allUsernames));
  return {
    fullName,
    email,
    phone,
    cedula,
    nickname,
    searchMode,
    primaryUsername: unique[0] || '',
    allUsernames: unique,
  };
}

async function scanPlatformFast(
  platform: SocialPlatform,
  ctx: ScanContext,
): Promise<SocialScanResult> {
  const fullName = ctx.fullName || '';
  const primaryUsername = ctx.primaryUsername;
  const nameParts = fullName.split(/\s+/);
  const firstName = nameParts[0] || '';
  const lastName = nameParts.slice(1).join(' ') || '';

  const searchQuery = ctx.searchMode === 'nickname' ? ctx.nickname :
                      ctx.searchMode === 'email' ? ctx.email :
                      fullName;

  const findings: OSINTResult[] = [];
  const allSearchResults: WebSearchResult[] = [];
  let profileFound = false;
  let profileVerified = false;
  let profileUrl: string | undefined;
  let profileStatusCode: number | undefined;
  let detectedUsername: string | undefined;

  // ── STEP 1: Direct profile URL verification (for verifiable platforms) ──
  if (platform.verifiableByHead && primaryUsername) {
    const usernamesToCheck = ctx.allUsernames.slice(0, 3);
    const verificationPromises = usernamesToCheck.map(async (username) => {
      const url = platform.profileUrlTemplates.nickname(username);
      if (!url) return null;
      const verification = await verifyProfileFast(url, 5000);
      return { username, url, verification };
    });

    const verificationResults = await Promise.allSettled(verificationPromises);

    for (const result of verificationResults) {
      if (result.status !== 'fulfilled' || !result.value) continue;
      const { username, url, verification } = result.value;

      if (verification.exists) {
        profileFound = true;
        profileVerified = true;
        profileUrl = url;
        profileStatusCode = verification.statusCode;
        detectedUsername = username;
        break;
      } else if (verification.statusCode === 404) {
        // Profile doesn't exist with this username — note it
        profileStatusCode = verification.statusCode;
      }
    }
  }

  // ── STEP 2: Web search (for name mode, or to find more info) ──
  // Only do 1-2 focused searches per platform to stay fast
  const shouldWebSearch = ctx.searchMode === 'name' || !profileFound;

  if (shouldWebSearch) {
    const queries: string[] = [];

    switch (ctx.searchMode) {
      case 'nickname':
        queries.push(`@${ctx.nickname} ${platform.name} profile OR account OR perfil`);
        break;
      case 'email':
        queries.push(`"${ctx.email}" ${platform.name} OR site:${platform.domain}`);
        if (primaryUsername) {
          queries.push(`@${primaryUsername} ${platform.name} profile OR account`);
        }
        break;
      case 'name':
        queries.push(`"${fullName}" ${platform.name} OR site:${platform.domain}`);
        if (primaryUsername) {
          queries.push(`@${primaryUsername} ${platform.name} profile OR account`);
        }
        break;
    }

    // Execute only 1-2 searches, not all
    const searchPromises = queries.slice(0, 2).map(q =>
      performWebSearch(q, 5).catch(() => [] as WebSearchResult[])
    );
    const searchResults = await Promise.all(searchPromises);

    const seenUrls = new Set<string>();
    for (const results of searchResults) {
      for (const r of results) {
        if (!seenUrls.has(r.url)) {
          seenUrls.add(r.url);
          allSearchResults.push(r);
        }
      }
    }

    // Check if search results point to profiles on this platform
    const platformResults = allSearchResults.filter(r =>
      r.url.includes(platform.domain) ||
      r.host_name.includes(platform.domain) ||
      r.host_name.includes(platform.id)
    );

    if (platformResults.length > 0 && !profileFound) {
      profileFound = true;
      profileUrl = platformResults[0].url;

      // Extract username from URL
      for (const pattern of platform.profilePatterns) {
        const urlStr = platformResults[0].url;
        if (urlStr.includes(pattern)) {
          const afterPattern = urlStr.split(pattern)[1]?.split(/[/?#]/)[0];
          if (afterPattern && afterPattern.length > 1) {
            detectedUsername = afterPattern;
            break;
          }
        }
      }
    }

    // Also check for mentions of person + platform in snippets
    const mentionResults = allSearchResults.filter(r => {
      const text = (r.snippet + ' ' + r.name).toLowerCase();
      const queryLC = (searchQuery || '').toLowerCase();
      const queryParts = queryLC.split(/\s+/).filter(Boolean);
      const matchesQuery = queryParts.length >= 1 && queryParts.some(p => text.includes(p));
      const matchesPlatform = text.includes(platform.name.toLowerCase()) || text.includes(platform.domain);
      return matchesQuery && matchesPlatform;
    });

    if (mentionResults.length > 0 && !profileFound) {
      // At least found mentions — not a direct profile but worth noting
      findings.push({
        source: `${platform.name} Scanner`,
        category: 'social_media',
        severity: 'low',
        title: `Menciones de "${searchQuery}" en ${platform.name}`,
        description: `Se encontraron ${mentionResults.length} menciones de "${searchQuery}" en contexto de ${platform.name}. La persona podria tener presencia en esta plataforma. Verificar manualmente.`,
        dataFound: `${mentionResults.length} menciones en contexto de ${platform.name}`,
        url: mentionResults[0]?.url,
      });
    }
  }

  // ── STEP 3: Build findings ──

  if (profileVerified) {
    findings.unshift({
      source: `${platform.name} Scanner`,
      category: 'social_media',
      severity: 'high',
      title: `Perfil VERIFICADO en ${platform.name}`,
      description: `Se verifico directamente que EXISTE un perfil en ${platform.name}${detectedUsername ? ` con usuario @${detectedUsername}` : ''}. El perfil es accesible publicamente y su informacion puede ser visible. Esto confirma presencia digital activa en esta plataforma.`,
      url: profileUrl,
      dataFound: `Perfil verificado en ${platform.name}${detectedUsername ? ` | Usuario: @${detectedUsername}` : ''} | URL: ${profileUrl} | HTTP ${profileStatusCode}`,
    });
  } else if (profileFound && allSearchResults.length > 0) {
    findings.unshift({
      source: `${platform.name} Scanner`,
      category: 'social_media',
      severity: 'medium',
      title: `Perfil detectado en ${platform.name}`,
      description: `Se encontro un perfil que coincide con "${searchQuery}" en ${platform.name}${detectedUsername ? ` con usuario @${detectedUsername}` : ''}. Verificar manualmente y revisar la configuracion de privacidad. Los perfiles publicos pueden exponer informacion personal, fotos, contactos y ubicaciones.`,
      url: profileUrl,
      dataFound: `Perfil en ${platform.name}${detectedUsername ? ` | Usuario: @${detectedUsername}` : ''} | URL: ${profileUrl}`,
    });
  }

  // ── STEP 4: AI analysis for search results (only if we have results) ──
  if (allSearchResults.length > 0 && findings.length < 2) {
    try {
      const aiFindings = await analyzeSocialWithAI(
        `Escaneo de presencia en ${platform.name} para "${searchQuery}"${primaryUsername ? ` (posible usuario: @${primaryUsername})` : ''} [modo: ${ctx.searchMode}]`,
        allSearchResults,
        `${platform.name} Scanner`,
        { fullName, email: ctx.email, cedula: ctx.cedula, phone: ctx.phone, nickname: ctx.nickname }
      );

      for (const f of aiFindings) {
        findings.push({
          source: `${platform.name} Scanner`,
          category: 'social_media',
          severity: f.severity,
          title: f.title,
          description: f.description,
          url: profileUrl,
          dataFound: f.dataFound,
        });
      }
    } catch { /* AI analysis is optional */ }
  }

  // ── STEP 5: If no findings at all, provide useful info ──
  if (findings.length === 0) {
    const directUrl = (() => {
      switch (ctx.searchMode) {
        case 'nickname':
          return platform.profileUrlTemplates.nickname(ctx.nickname || primaryUsername);
        case 'email':
          return platform.profileUrlTemplates.email(ctx.email || '');
        case 'name':
          return platform.profileUrlTemplates.name(firstName, lastName);
      }
    })();

    if (profileStatusCode === 404) {
      findings.push({
        source: `${platform.name} Scanner`,
        category: 'social_media',
        severity: 'info',
        title: `Perfil NO encontrado en ${platform.name}`,
        description: `Se verifico directamente y el perfil con el nombre de usuario @${primaryUsername} NO existe en ${platform.name} (HTTP 404). El usuario podria usar un nombre diferente o no tener cuenta en esta plataforma.`,
        url: directUrl || undefined,
        dataFound: `Verificacion directa: HTTP 404 | Usuario verificado: @${primaryUsername} | URL: ${directUrl}`,
      });
    } else {
      findings.push({
        source: `${platform.name} Scanner`,
        category: 'social_media',
        severity: 'info',
        title: `Sin resultados en ${platform.name} — Verificar manualmente`,
        description: `No se encontraron resultados automaticos para "${searchQuery}" en ${platform.name}. Esto no descarta la existencia de un perfil. Se recomienda buscar directamente en la plataforma${primaryUsername ? ` usando el posible nombre de usuario @${primaryUsername}` : ''}.`,
        url: directUrl || undefined,
        dataFound: `Sin resultados automaticos | Posible usuario: @${primaryUsername}${directUrl ? ` | URL sugerida: ${directUrl}` : ''}`,
      });
    }
  }

  return {
    platform: platform.name,
    platformId: platform.id,
    profileFound,
    profileUrl,
    username: detectedUsername || (primaryUsername ? primaryUsername : undefined),
    profileVerified,
    profileStatusCode,
    findings,
    searchResultsCount: allSearchResults.length,
    rawResults: allSearchResults,
  };
}

// ══════════════════════════════════════════════════════
//  MAIN SCAN — Parallel execution with timeout
// ══════════════════════════════════════════════════════

export async function runSocialMediaScan(params: {
  fullName?: string;
  email?: string;
  phone?: string;
  cedula?: string;
  nickname?: string;
  searchMode: 'nickname' | 'email' | 'name';
  selectedPlatforms: string[];
  deepseekKey?: string;
}): Promise<SocialScanResponse> {
  const { fullName, email, phone, cedula, nickname, searchMode, selectedPlatforms, deepseekKey } = params;
  const startTime = Date.now();
  const MAX_SCAN_TIME = 55000; // 55 seconds max (Vercel default is 60s)

  // Set DeepSeek API key if provided
  if (deepseekKey) {
    const { setDeepSeekApiKey } = await import('./osint-scanner');
    setDeepSeekApiKey(deepseekKey);
  }

  // Validate required fields per search mode
  if (searchMode === 'nickname' && !nickname?.trim()) {
    throw new Error('El nickname es requerido para el modo de busqueda por nickname');
  }
  if (searchMode === 'email' && !email?.trim()) {
    throw new Error('El email es requerido para el modo de busqueda por email');
  }
  if (searchMode === 'name' && !fullName?.trim()) {
    throw new Error('El nombre completo es requerido para el modo de busqueda por nombre');
  }

  // Filter to selected platforms
  const platforms = SOCIAL_PLATFORMS.filter(p => selectedPlatforms.includes(p.id));

  if (platforms.length === 0) {
    throw new Error('Selecciona al menos una red social para escanear');
  }

  // Build scan context
  const ctx = buildScanContext({
    fullName: fullName?.trim(),
    email: email?.trim(),
    phone: phone?.trim(),
    cedula: cedula?.trim(),
    nickname: nickname?.trim(),
    searchMode,
  });

  const searchQuery = searchMode === 'nickname' ? nickname!.trim() :
                      searchMode === 'email' ? email!.trim() :
                      fullName!.trim();

  // ── PARALLEL SCANNING — Process platforms in parallel ──
  console.log(`[SocialScanner] Starting parallel scan of ${platforms.length} platforms [mode: ${searchMode}, query: ${searchQuery}]`);

  const results: SocialScanResult[] = [];

  // Scan platforms in parallel batches (3 at a time to avoid overwhelming the API)
  const BATCH_SIZE = 3;
  for (let i = 0; i < platforms.length; i += BATCH_SIZE) {
    // Check if we've exceeded the time limit
    if (Date.now() - startTime > MAX_SCAN_TIME) {
      console.warn(`[SocialScanner] Time limit reached, skipping remaining platforms`);
      // Add remaining platforms as "not scanned"
      for (let j = i; j < platforms.length; j++) {
        results.push({
          platform: platforms[j].name,
          platformId: platforms[j].id,
          profileFound: false,
          profileVerified: false,
          profileStatusCode: 0,
          findings: [{
            source: `${platforms[j].name} Scanner`,
            category: 'social_media',
            severity: 'info',
            title: `Escaneo omitido por tiempo en ${platforms[j].name}`,
            description: `El escaneo de ${platforms[j].name} fue omitido debido al tiempo limite. Verificar manualmente.`,
            dataFound: `Escaneo omitido | Verificar manualmente en ${platforms[j].domain}`,
          }],
          searchResultsCount: 0,
          rawResults: [],
        });
      }
      break;
    }

    const batch = platforms.slice(i, i + BATCH_SIZE);

    // Add per-platform timeout
    const batchPromises = batch.map(platform =>
      Promise.race([
        scanPlatformFast(platform, ctx),
        new Promise<SocialScanResult>((resolve) =>
          setTimeout(() => resolve({
            platform: platform.name,
            platformId: platform.id,
            profileFound: false,
            profileVerified: false,
            profileStatusCode: 0,
            findings: [{
              source: `${platform.name} Scanner`,
              category: 'social_media',
              severity: 'info',
              title: `Timeout al escanear ${platform.name}`,
              description: `El escaneo de ${platform.name} excedio el tiempo limite. Verificar manualmente.`,
              dataFound: `Timeout | Verificar manualmente en ${platform.domain}`,
            }],
            searchResultsCount: 0,
            rawResults: [],
          }), 15000) // 15 second per-platform timeout
        ),
      ])
    );

    const batchResults = await Promise.allSettled(batchPromises);

    for (const result of batchResults) {
      if (result.status === 'fulfilled') {
        results.push(result.value);
      } else {
        // Platform scan errored — add a placeholder
        const platformIdx = batchResults.indexOf(result);
        const platform = batch[platformIdx] || batch[0];
        results.push({
          platform: platform.name,
          platformId: platform.id,
          profileFound: false,
          profileVerified: false,
          profileStatusCode: 0,
          findings: [{
            source: `${platform.name} Scanner`,
            category: 'social_media',
            severity: 'info',
            title: `Error al escanear ${platform.name}`,
            description: `No se pudo completar el escaneo de ${platform.name}. Verificar manualmente.`,
            dataFound: `Error en escaneo | Verificar manualmente en ${platform.domain}`,
          }],
          searchResultsCount: 0,
          rawResults: [],
        });
      }
    }
  }

  // Calculate summary
  const allFindings = results.flatMap(r => r.findings);
  const elapsed = Date.now() - startTime;
  console.log(`[SocialScanner] Completed in ${elapsed}ms — ${results.filter(r => r.profileFound).length} profiles found, ${allFindings.length} findings`);

  return {
    scanId: `social-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
    searchMode,
    searchQuery,
    totalPlatforms: platforms.length,
    platformsScanned: results.map(r => r.platform),
    results,
    summary: {
      profilesFound: results.filter(r => r.profileFound).length,
      totalFindings: allFindings.length,
      critical: allFindings.filter(f => f.severity === 'critical').length,
      high: allFindings.filter(f => f.severity === 'high').length,
      medium: allFindings.filter(f => f.severity === 'medium').length,
      low: allFindings.filter(f => f.severity === 'low').length,
      info: allFindings.filter(f => f.severity === 'info').length,
    },
  };
}
