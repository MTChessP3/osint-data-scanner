/**
 * Ciberte Phishing Monitor API
 *
 * Endpoints:
 *  GET  — returns current phishing queue, trusted domains, agent status
 *  POST — actions: search, activate_agent, deactivate_agent,
 *         dismiss_phishing, add_trusted_domain, remove_trusted_domain, mark_trusted
 */

import { NextRequest, NextResponse } from 'next/server';
import { performWebSearch, type WebSearchResult } from '@/lib/osint-scanner';

// ── In-memory state (per serverless instance) ──
let agentOnline = false;

interface PhishingItem {
  id: string;
  url: string;
  domain: string;
  snippet: string;
  riskLevel: 'critical' | 'high' | 'medium' | 'low';
  engine: string;
  timestamp: string;
  indicators: string[];
}

const phishingQueue: PhishingItem[] = [];
const trustedDomains: Set<string> = new Set([
  'bancolombia.com',
  'grupobancolombia.com',
  'nequi.com.co',
  'wompi.com',
  'banistmo.com',
  'bancoagricola.com.sv',
  'wenia.com',
  'bancolombia.com.co',
  'sucursalelectronica.com',
  'grupocibest.com',
]);

// ── Phishing indicators ──
const PHISHING_INDICATORS: Record<string, 'critical' | 'high' | 'medium' | 'low'> = {
  'phishing': 'critical',
  'estafa': 'critical',
  'apk mod': 'high',
  'falso': 'high',
  'hack': 'high',
  'crack': 'high',
  'bypass': 'high',
  'clone': 'high',
  'filtración': 'high',
  'filtracion': 'high',
  'combo': 'medium',
  'dump': 'medium',
  'credentials': 'medium',
  'leak': 'medium',
  'mod apk': 'high',
  'fraude': 'high',
  'scam': 'high',
  'fake': 'high',
  'imitación': 'medium',
  'imitacion': 'medium',
  'suplantación': 'high',
  'suplantacion': 'high',
  'robo de datos': 'high',
  'credential stuffing': 'critical',
  'carding': 'critical',
  'skimming': 'critical',
};

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url.replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/^www\./, '');
  }
}

function isTrusted(domain: string): boolean {
  // Check if domain or any parent domain is trusted
  const parts = domain.split('.');
  for (let i = 0; i < parts.length; i++) {
    const candidate = parts.slice(i).join('.');
    if (trustedDomains.has(candidate)) return true;
  }
  return false;
}

function analyzeResult(result: WebSearchResult, engine: string): PhishingItem | null {
  const domain = extractDomain(result.url);

  // Skip trusted domains
  if (isTrusted(domain)) return null;

  const textToAnalyze = `${result.name} ${result.snippet}`.toLowerCase();
  const foundIndicators: string[] = [];
  let maxRisk: 'critical' | 'high' | 'medium' | 'low' | null = null;

  for (const [indicator, risk] of Object.entries(PHISHING_INDICATORS)) {
    if (textToAnalyze.includes(indicator.toLowerCase())) {
      foundIndicators.push(indicator);
      if (!maxRisk || riskLevelOrder(risk) > riskLevelOrder(maxRisk)) {
        maxRisk = risk;
      }
    }
  }

  if (foundIndicators.length === 0) return null;

  return {
    id: `phish-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
    url: result.url,
    domain,
    snippet: result.snippet || result.name,
    riskLevel: maxRisk || 'low',
    engine,
    timestamp: new Date().toISOString(),
    indicators: foundIndicators,
  };
}

function riskLevelOrder(level: string): number {
  const order: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 };
  return order[level] || 0;
}

// ── GET handler ──
export async function GET() {
  return NextResponse.json({
    agentOnline,
    phishingQueue: phishingQueue.sort((a, b) => riskLevelOrder(b.riskLevel) - riskLevelOrder(a.riskLevel)),
    trustedDomains: Array.from(trustedDomains),
    queueCount: phishingQueue.length,
  });
}

// ── POST handler ──
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action } = body;

    switch (action) {
      case 'search': {
        const { query, engines } = body as { query: string; engines: string[] };
        if (!query?.trim()) {
          return NextResponse.json({ error: 'Query is required' }, { status: 400 });
        }

        const searchEngines = engines?.length > 0 ? engines : ['google'];
        const allNewPhishing: PhishingItem[] = [];
        const seenIds = new Set(phishingQueue.map(p => p.url));

        // Build search queries with engine-specific modifiers
        for (const engine of searchEngines) {
          let searchQuery = query;
          // Add engine-specific search context
          if (engine === 'yandex') {
            searchQuery = `${query} фишинг OR estafa OR hack`;
          } else if (engine === 'duckduckgo') {
            searchQuery = `${query} phishing OR estafa OR apk mod`;
          } else if (engine === 'bing') {
            searchQuery = `${query} fake OR clone OR fraud`;
          }

          try {
            const results = await performWebSearch(searchQuery, 10);

            for (const result of results) {
              if (seenIds.has(result.url)) continue;
              seenIds.add(result.url);

              const phishingItem = analyzeResult(result, engine);
              if (phishingItem) {
                phishingQueue.push(phishingItem);
                allNewPhishing.push(phishingItem);
              }
            }
          } catch (err) {
            console.error(`[Ciberte] Search error for ${engine}:`, err);
          }
        }

        return NextResponse.json({
          success: true,
          newPhishing: allNewPhishing,
          totalQueue: phishingQueue.length,
          phishingQueue: phishingQueue.sort((a, b) => riskLevelOrder(b.riskLevel) - riskLevelOrder(a.riskLevel)),
        });
      }

      case 'activate_agent': {
        agentOnline = true;
        return NextResponse.json({ success: true, agentOnline: true });
      }

      case 'deactivate_agent': {
        agentOnline = false;
        return NextResponse.json({ success: true, agentOnline: false });
      }

      case 'dismiss_phishing': {
        const { id } = body as { id: string };
        const idx = phishingQueue.findIndex(p => p.id === id);
        if (idx >= 0) {
          phishingQueue.splice(idx, 1);
        }
        return NextResponse.json({
          success: true,
          phishingQueue: phishingQueue.sort((a, b) => riskLevelOrder(b.riskLevel) - riskLevelOrder(a.riskLevel)),
        });
      }

      case 'add_trusted_domain': {
        const { domain } = body as { domain: string };
        if (domain?.trim()) {
          trustedDomains.add(domain.trim().toLowerCase());
        }
        return NextResponse.json({ success: true, trustedDomains: Array.from(trustedDomains) });
      }

      case 'remove_trusted_domain': {
        const { domain } = body as { domain: string };
        trustedDomains.delete(domain?.trim()?.toLowerCase());
        return NextResponse.json({ success: true, trustedDomains: Array.from(trustedDomains) });
      }

      case 'mark_trusted': {
        const { id } = body as { id: string };
        const item = phishingQueue.find(p => p.id === id);
        if (item) {
          trustedDomains.add(item.domain);
          const idx = phishingQueue.findIndex(p => p.id === id);
          if (idx >= 0) phishingQueue.splice(idx, 1);
        }
        return NextResponse.json({
          success: true,
          trustedDomains: Array.from(trustedDomains),
          phishingQueue: phishingQueue.sort((a, b) => riskLevelOrder(b.riskLevel) - riskLevelOrder(a.riskLevel)),
        });
      }

      default:
        return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
    }
  } catch (err) {
    console.error('[Ciberte API Error]:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
