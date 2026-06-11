'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Shield, Search, AlertTriangle, Eye, Globe, Database,
  ChevronDown, ChevronUp, ExternalLink, Loader2, Trash2,
  ShieldAlert, ShieldCheck, Info, User, Mail, Phone, FileText,
  ScanLine, BarChart3, Clock, Upload, Download, FileSpreadsheet,
  CheckCircle2, XCircle, FileDown, Users, AlertOctagon, Link2,
  Building2, Heart, Briefcase, MapPin, Network, FileDigit, GitBranch,
  MessageCircle, Send, Bot, X, Sparkles, Settings, Check, Wifi, WifiOff,
  Music2, Camera, Play, AtSign, Pin, LogOut, Fingerprint, Bell, Zap
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { ThemeSelector } from '@/components/theme-selector';

// ── Interfaces ──

interface SocialScanResultItem {
  platform: string;
  platformId: string;
  profileFound: boolean;
  profileUrl?: string;
  username?: string;
  profileVerified?: boolean;
  profileStatusCode?: number;
  findings: ScanResult[];
  searchResultsCount: number;
}

interface SocialScanResponse {
  scanId: string;
  searchMode: string;
  searchQuery: string;
  totalPlatforms: number;
  platformsScanned: string[];
  results: SocialScanResultItem[];
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

interface ScanResult {
  source: string;
  category: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  title: string;
  description?: string;
  url?: string;
  dataFound?: string;
}

interface ScanSummary {
  critical: number;
  high: number;
  medium: number;
  low: number;
  info: number;
}

interface ScanResponse {
  scanId: string;
  totalResults: number;
  results: ScanResult[];
  summary: ScanSummary;
  reportFileName?: string;
}

interface PastScan {
  id: string;
  fullName: string;
  cedula: string | null;
  email: string | null;
  phone: string | null;
  status: string;
  scanType: 'data_intelligence' | 'social_media';
  createdAt: string;
  results: { id: string; severity: string; source?: string; category?: string; title?: string; description?: string; url?: string; dataFound?: string }[];
  reports: { id: string; fileName: string; format?: string }[];
}

interface BatchResult {
  scanId: string;
  fullName: string;
  totalResults: number;
  reportGenerated: boolean;
  reportFileName: string | null;
  summary: ScanSummary;
  sheetName?: string;
  rowCount?: number;
  personsInvestigated?: Array<{ name: string; identifiers: Record<string, string>; findingsCount: number }>;
}

interface RelationshipLink {
  type: string;
  confidence: string;
  description: string;
  sheet1Person: string;
  sheet2Person: string;
  matchedField: string;
  matchedValue: string;
}

interface RelationshipAnalysis {
  sheet1Name: string;
  sheet2Name: string;
  sheet1RowCount: number;
  sheet2RowCount: number;
  totalLinks: number;
  summary: {
    empresariales: number;
    personales: number;
    familiares: number;
    laborales: number;
    contacto: number;
    ubicacion: number;
    dato_compartido: number;
  };
  links: RelationshipLink[];
  networkMap: { person: string; connections: number; types: string[] }[];
}

// ── Constants ──

const severityConfig = {
  critical: { color: 'bg-sev-critical-bg text-sev-critical-text border border-sev-critical-text/20', icon: ShieldAlert, label: 'Critico', barColor: 'bg-sev-critical-bar' },
  high: { color: 'bg-sev-high-bg text-sev-high-text border border-sev-high-text/20', icon: AlertTriangle, label: 'Alto', barColor: 'bg-sev-high-bar' },
  medium: { color: 'bg-sev-medium-bg text-sev-medium-text border border-sev-medium-text/20', icon: Eye, label: 'Medio', barColor: 'bg-sev-medium-bar' },
  low: { color: 'bg-sev-low-bg text-sev-low-text border border-sev-low-text/20', icon: Info, label: 'Bajo', barColor: 'bg-sev-low-bar' },
  info: { color: 'bg-sev-info-bg text-sev-info-text border border-sev-info-text/20', icon: Info, label: 'Info', barColor: 'bg-sev-info-bar' },
};

const severityBadgeConfig = {
  critical: { color: 'bg-sev-critical-bg text-sev-critical-text', icon: ShieldAlert, label: 'Critico' },
  high: { color: 'bg-sev-high-bg text-sev-high-text', icon: AlertTriangle, label: 'Alto' },
  medium: { color: 'bg-sev-medium-bg text-sev-medium-text', icon: Eye, label: 'Medio' },
  low: { color: 'bg-sev-low-bg text-sev-low-text', icon: Info, label: 'Bajo' },
  info: { color: 'bg-sev-info-bg text-sev-info-text', icon: Info, label: 'Info' },
};

const categoryLabels: Record<string, string> = {
  credential_breach: 'Filtracion de Credenciales',
  password_exposure: 'Exposicion de Contrasena',
  personal_exposure: 'Exposicion Personal',
  social_media: 'Redes Sociales',
  data_broker: 'Broker de Datos',
  dark_web_mention: 'Mencion en Dark Web',
  paste_site: 'Sitio de Paste',
  document_exposure: 'Exposicion de Documentos',
  judicial: 'Registros Judiciales',
  error: 'Error',
};

const linkTypeConfig: Record<string, { icon: typeof Building2; label: string; color: string; bgColor: string }> = {
  empresarial: { icon: Building2, label: 'Empresarial', color: 'text-app-text-dim', bgColor: 'bg-app-surface-hover border border-app-border' },
  personal: { icon: User, label: 'Personal', color: 'text-app-text-dim', bgColor: 'bg-app-surface-hover border border-app-border' },
  familiar: { icon: Heart, label: 'Familiar', color: 'text-app-text-dim', bgColor: 'bg-app-surface-hover border border-app-border' },
  laboral: { icon: Briefcase, label: 'Laboral', color: 'text-app-text-dim', bgColor: 'bg-app-surface-hover border border-app-border' },
  contacto: { icon: Phone, label: 'Contacto', color: 'text-app-text-dim', bgColor: 'bg-app-surface-hover border border-app-border' },
  ubicacion: { icon: MapPin, label: 'Ubicacion', color: 'text-app-text-dim', bgColor: 'bg-app-surface-hover border border-app-border' },
  dato_compartido: { icon: Database, label: 'Dato Compartido', color: 'text-app-text-dim', bgColor: 'bg-app-surface-hover border border-app-border' },
};

const engineCategories = [
  {
    id: 'breaches',
    label: 'Brechas y Credenciales',
    color: 'slate',
    engines: [
      { name: 'Have I Been Pwned', desc: 'Verifica filtraciones de credenciales', icon: ShieldAlert },
      { name: 'Pwned Passwords', desc: 'Contraseñas comprometidas', icon: AlertTriangle },
      { name: 'HIBP Deep Check', desc: 'Verificación profunda de brechas', icon: ShieldAlert },
      { name: 'Dehashed', desc: 'Credenciales filtradas en BD', icon: ShieldAlert },
      { name: 'LeakIX', desc: 'Bases de datos expuestas', icon: Database },
    ],
  },
  {
    id: 'darkweb',
    label: 'Dark Web y Filtraciones',
    color: 'slate',
    engines: [
      { name: 'Dark Web / Leak Scan', desc: 'Menciones en filtraciones', icon: Eye },
      { name: 'LeakRadar', desc: 'Filtraciones masivas de datos', icon: ShieldAlert },
    ],
  },
  {
    id: 'social',
    label: 'Redes Sociales',
    color: 'slate',
    engines: [
      { name: 'Social Media Scan', desc: 'Perfiles en redes sociales', icon: Globe },
      { name: 'DeepFind Profile Analyzer', desc: 'Análisis de perfil en redes', icon: User },
      { name: 'Telegram XTEA', desc: 'Telegram vía xtea.io (canales, grupos, bots)', icon: Send },
    ],
  },
  {
    id: 'search',
    label: 'Búsqueda Avanzada',
    color: 'slate',
    engines: [
      { name: 'Google Dorking', desc: 'Búsqueda avanzada con operadores', icon: Search },
      { name: 'Document Exposure', desc: 'Documentos PDF/DOC expuestos', icon: FileText },
    ],
  },
  {
    id: 'identity',
    label: 'Identidad y Datos',
    color: 'slate',
    engines: [
      { name: 'Data Broker Scan', desc: 'Directorios y brokers de datos', icon: Database },
      { name: 'Pipl', desc: 'Búsqueda de identidades', icon: Search },
      { name: 'DeepFind Deep Search', desc: 'Búsqueda profunda de personas', icon: Eye },
    ],
  },
  {
    id: 'judicial',
    label: 'Judicial y Oficial',
    color: 'slate',
    engines: [
      { name: 'Policía Nacional Colombia', desc: 'Antecedentes judiciales', icon: Shield },
      { name: 'Aleph / OCCRP', desc: 'Documentos de investigación', icon: FileDigit },
    ],
  },
  {
    id: 'email-validation',
    label: 'Validación de Correo',
    color: 'slate',
    engines: [
      { name: 'Email Validator', desc: 'Sintaxis, DNS, desechables, SPF/DMARC', icon: Mail },
    ],
  },
];

// ── Helper: get all engine names ──
const allEngineNames: string[] = engineCategories.flatMap(c => c.engines.map(e => e.name));
const TOTAL_ENGINES = allEngineNames.length;

// ── Social Media Platforms Config (MUTED colors) ──
const socialPlatforms = [
  { id: 'tiktok', name: 'TikTok', domain: 'tiktok.com', color: 'text-app-text-dim', bgColor: 'bg-app-surface-hover', borderColor: 'border-app-border', icon: Music2, desc: 'Perfiles y contenido viral', accentHex: '#6b7a8d', verifyUrl: 'https://www.tiktok.com/search?q=', searchUrl: 'https://www.tiktok.com/search?q=' },
  { id: 'instagram', name: 'Instagram', domain: 'instagram.com', color: 'text-app-text-dim', bgColor: 'bg-app-surface-hover', borderColor: 'border-app-border', icon: Camera, desc: 'Perfiles, fotos y stories', accentHex: '#6b7a8d', verifyUrl: 'https://www.instagram.com/', searchUrl: 'https://www.instagram.com/' },
  { id: 'youtube', name: 'YouTube', domain: 'youtube.com', color: 'text-app-text-dim', bgColor: 'bg-app-surface-hover', borderColor: 'border-app-border', icon: Play, desc: 'Canales y videos', accentHex: '#6b7a8d', verifyUrl: 'https://www.youtube.com/results?search_query=', searchUrl: 'https://www.youtube.com/results?search_query=' },
  { id: 'whatsapp', name: 'WhatsApp', domain: 'whatsapp.com', color: 'text-app-text-dim', bgColor: 'bg-app-surface-hover', borderColor: 'border-app-border', icon: MessageCircle, desc: 'Numeros y grupos publicos', accentHex: '#6b7a8d', verifyUrl: 'https://wa.me/', searchUrl: 'https://web.whatsapp.com/' },
  { id: 'facebook', name: 'Facebook', domain: 'facebook.com', color: 'text-app-text-dim', bgColor: 'bg-app-surface-hover', borderColor: 'border-app-border', icon: Users, desc: 'Perfiles, paginas y grupos', accentHex: '#6b7a8d', verifyUrl: 'https://www.facebook.com/search/top?q=', searchUrl: 'https://www.facebook.com/search/top?q=' },
  { id: 'twitter', name: 'X (Twitter)', domain: 'x.com', color: 'text-app-text-dim', bgColor: 'bg-app-surface-hover', borderColor: 'border-app-border', icon: AtSign, desc: 'Perfiles y tweets', accentHex: '#6b7a8d', verifyUrl: 'https://twitter.com/search?q=', searchUrl: 'https://twitter.com/search?q=' },
  { id: 'linkedin', name: 'LinkedIn', domain: 'linkedin.com', color: 'text-app-text-dim', bgColor: 'bg-app-surface-hover', borderColor: 'border-app-border', icon: Briefcase, desc: 'Perfiles profesionales', accentHex: '#6b7a8d', verifyUrl: 'https://www.linkedin.com/search/results/people/?keywords=', searchUrl: 'https://www.linkedin.com/search/results/people/?keywords=' },
  { id: 'telegram', name: 'Telegram', domain: 't.me', color: 'text-app-text-dim', bgColor: 'bg-app-surface-hover', borderColor: 'border-app-border', icon: Send, desc: 'Canales y grupos', accentHex: '#6b7a8d', verifyUrl: 'https://t.me/', searchUrl: 'https://t.me/' },
  { id: 'snapchat', name: 'Snapchat', domain: 'snapchat.com', color: 'text-app-text-dim', bgColor: 'bg-app-surface-hover', borderColor: 'border-app-border', icon: Camera, desc: 'Perfiles y snaps', accentHex: '#6b7a8d', verifyUrl: 'https://story.snapchat.com/s/', searchUrl: 'https://www.snapchat.com/add/' },
  { id: 'pinterest', name: 'Pinterest', domain: 'pinterest.com', color: 'text-app-text-dim', bgColor: 'bg-app-surface-hover', borderColor: 'border-app-border', icon: Pin, desc: 'Tableros y pines', accentHex: '#6b7a8d', verifyUrl: 'https://www.pinterest.com/search/pins/?q=', searchUrl: 'https://www.pinterest.com/search/pins/?q=' },
];

// ── Helper: category color classes ──
function getCategoryColor(color: string, type: 'text' | 'bg' | 'border' | 'hoverBg' = 'text') {
  const corporate: Record<string, Record<string, string>> = {
    slate: { text: 'text-app-text-dim', bg: 'bg-app-surface-hover', border: 'border-app-border', hoverBg: 'hover:bg-app-surface-active' },
  };
  return corporate.slate[type] || '';
}

// ── Simple Markdown renderer for chat messages ──
function renderMarkdown(text: string) {
  const lines = text.split('\n');
  return lines.map((line, i) => {
    let processed = line
      .replace(/\*\*(.+?)\*\*/g, '<strong class="text-accent-primary">$1</strong>')
      .replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '<em>$1</em>')
      .replace(/`(.+?)`/g, '<code class="bg-slate-700 px-1 rounded text-xs text-sev-low-text">$1</code>')
      .replace(/^[-•]\s+(.*)/, '<span class="flex gap-1"><span class="text-sev-low-text shrink-0">•</span><span>$1</span></span>')
      .replace(/^(\d+)\.\s+(.*)/, '<span class="flex gap-1"><span class="text-sev-low-text shrink-0 font-mono text-xs">$1.</span><span>$2</span></span>');

    return (
      <span key={i}>
        {i > 0 && <br />}
        <span dangerouslySetInnerHTML={{ __html: processed }} />
      </span>
    );
  });
}

// ── Risk Gauge Component ──
function RiskGauge({ score, label, color }: { score: number; label: string; color: string }) {
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (score / 100) * circumference;
  const gaugeColor = score >= 70 ? 'var(--sev-critical-bar)' : score >= 40 ? 'var(--sev-high-bar)' : score >= 15 ? 'var(--sev-medium-bar)' : 'var(--accent-success)';

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative w-32 h-32">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 120 120">
          <circle cx="60" cy="60" r={radius} fill="none" stroke="var(--app-border)" strokeWidth="8" />
          <circle
            cx="60" cy="60" r={radius} fill="none"
            stroke={gaugeColor} strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            className="transition-colors duration-1000 ease-out"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={`text-2xl font-bold ${color}`}>{score}</span>
          <span className="text-[10px] text-slate-500 font-medium">/100</span>
        </div>
      </div>
      <span className={`text-xs font-bold ${color}`}>{label}</span>
    </div>
  );
}

// ══════════════════════════════════════════════════════════
// ── MAIN COMPONENT ──
// ══════════════════════════════════════════════════════════

export default function Home() {
  // ── Helper: highlight keyword in text with React span ──
  function highlightKeywordInText(text: string, keyword: string): JSX.Element | string {
    if (!keyword || !text) return text;
    const normText = text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9\s]/g, ' ');
    const normKw = keyword.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9\s]/g, ' ').trim();
    const idx = normText.indexOf(normKw);
    if (idx === -1) return text;

    // Map normalized index back to original text (approximate)
    let origStart = -1;
    let normPos = 0;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i].toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9\s]/g, '');
      if (normPos === idx) { origStart = i; break; }
      normPos += ch.length;
    }
    if (origStart === -1) return text;

    // Find end position
    let origEnd = origStart;
    let matchLen = 0;
    while (origEnd < text.length && matchLen < normKw.length) {
      const ch = text[origEnd].toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9\s]/g, ' ');
      matchLen += ch.length || (normKw[matchLen] === ' ' ? 1 : 0);
      origEnd++;
    }

    return (
      <>
        {text.substring(0, origStart)}
        <span className="bg-accent-primary/15 text-accent-primary font-semibold px-0.5 rounded">{text.substring(origStart, origEnd)}</span>
        {text.substring(origEnd)}
      </>
    );
  }

  // ── Auth session state ──
  const [authUser, setAuthUser] = useState<{ username: string; email?: string; role: string } | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const logoutCalled = useRef(false);

  useEffect(() => {
    fetch('/api/auth/session')
      .then(res => res.json())
      .then(data => {
        if (data.authenticated && data.user) {
          setAuthUser(data.user);
        } else {
          // Not authenticated — redirect to login
          window.location.href = '/login';
          return;
        }
        setAuthLoading(false);
      })
      .catch(() => {
        setAuthLoading(false);
        window.location.href = '/login';
      });
  }, []);

  async function handleLogout() {
    if (logoutCalled.current) return;
    logoutCalled.current = true;
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch { /* ignore */ }
    window.location.href = '/login';
  }

  // ── Scan states ──
  const [fullName, setFullName] = useState('');
  const [cedula, setCedula] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [scanData, setScanData] = useState<ScanResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [expandedResult, setExpandedResult] = useState<string | null>(null);
  const [filterSeverity, setFilterSeverity] = useState<string>('all');
  const [pastScans, setPastScans] = useState<PastScan[]>([]);
  const [activeTab, setActiveTab] = useState('scan');
  const [reportFormat, setReportFormat] = useState<'docx' | 'pdf'>('pdf');

  // ── Engine selection states ──
  const [selectedEngines, setSelectedEngines] = useState<Set<string>>(() => new Set(allEngineNames));
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  // ── Settings modal states ──
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [testKeyLoading, setTestKeyLoading] = useState(false);
  const [testKeyStatus, setTestKeyStatus] = useState<'idle' | 'success' | 'error'>('idle');

  // ── File upload states ──
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadLoading, setUploadLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStage, setUploadStage] = useState<string>('');
  const [batchResults, setBatchResults] = useState<BatchResult[] | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // ── TXT analysis state ──
  const [txtAnalysis, setTxtAnalysis] = useState<{
    format: string;
    totalLines: number;
    totalEntities: { names: number; emails: number; phones: number; cedulas: number; ips: number; urls: number; usernames: number; addresses: number; companies: number };
    persons: Array<{
      fullName: string; email: string; phone: string; cedula: string;
      address: string; usernames: string[]; ips: string[]; urls: string[];
      companies: string[]; confidence: string; lineNumber: number;
    }>;
    unlinkedEntities: { ips: string[]; urls: string[]; usernames: string[]; emails: string[]; companies: string[] };
    intelligenceSummary: string;
  } | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // ── Relationship analysis states ──
  const [relationshipAnalysis, setRelationshipAnalysis] = useState<RelationshipAnalysis | null>(null);
  const [jointAnalysisId, setJointAnalysisId] = useState<string | null>(null);
  const [jointReportFileName, setJointReportFileName] = useState<string | null>(null);
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [linkFilter, setLinkFilter] = useState<string>('all');
  const [expandedLink, setExpandedLink] = useState<string | null>(null);

  // ── Social media states ──
  const [selectedSocialPlatforms, setSelectedSocialPlatforms] = useState<Set<string>>(new Set());
  const [socialSearchMode, setSocialSearchMode] = useState<'nickname' | 'email' | 'name'>('name');
  const [socialNickname, setSocialNickname] = useState('');
  const [socialEmail, setSocialEmail] = useState('');
  const [socialName, setSocialName] = useState('');
  const [socialScanLoading, setSocialScanLoading] = useState(false);
  const [socialScanProgress, setSocialScanProgress] = useState(0);
  const [socialScanData, setSocialScanData] = useState<SocialScanResponse | null>(null);
  const [socialScanError, setSocialScanError] = useState<string | null>(null);
  const [expandedSocialPlatform, setExpandedSocialPlatform] = useState<string | null>(null);

  // ── Social report download state ──
  const [socialReportLoading, setSocialReportLoading] = useState(false);

  // ── Detail modal state ──
  const [detailModal, setDetailModal] = useState<{
    open: boolean;
    title: string;
    items: Array<{ title: string; description: string; source?: string; platform?: string }>;
  }>({ open: false, title: '', items: [] });

  // ── Delete confirmation states ──
  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; scanId: string | null; scanName: string; deleteAll: boolean }>({
    open: false, scanId: null, scanName: '', deleteAll: false,
  });

  // ── Alert states ──
  const [alertKeywords, setAlertKeywords] = useState<string[]>([]);
  const [newKeyword, setNewKeyword] = useState('');
  const [bulkKeywordInput, setBulkKeywordInput] = useState('');
  const [bulkKeywordLoading, setBulkKeywordLoading] = useState(false);
  const [telegramConfigured, setTelegramConfigured] = useState(false);
  const [telegramHasBotToken, setTelegramHasBotToken] = useState(false);
  const [telegramHasChatId, setTelegramHasChatId] = useState(false);
  const [alertLoading, setAlertLoading] = useState(false);
  const [alertHistory, setAlertHistory] = useState<Array<{ keyword: string; sourceType: string; sourceName: string; timestamp: string; telegramSent: boolean }>>([]);

  // ── Alert selection & sorting states ──
  const [selectedAlertIndices, setSelectedAlertIndices] = useState<Set<number>>(new Set());
  const [alertsSortOrder, setAlertsSortOrder] = useState<'desc' | 'asc'>('desc');
  const [selectedHistoryIndices, setSelectedHistoryIndices] = useState<Set<number>>(new Set());
  const [historySortOrder, setHistorySortOrder] = useState<'desc' | 'asc'>('desc');
  const [showDeleteHistoryModal, setShowDeleteHistoryModal] = useState(false);
  const [deleteHistoryLoading, setDeleteHistoryLoading] = useState(false);

  // ── Telegram Avanzado states (dedicated tab) ──
  const [telegramBotInfo, setTelegramBotInfo] = useState<{ username: string; firstName: string; id: number } | null>(null);
  const [telegramDetecting, setTelegramDetecting] = useState(false);
  const [telegramDetectedChats, setTelegramDetectedChats] = useState<Array<{ chatId: number; type: string; title?: string; username?: string; firstName?: string }>>([]);
  const [telegramDetectError, setTelegramDetectError] = useState<string | null>(null);
  const [telegramTestSending, setTelegramTestSending] = useState(false);
  const [telegramBotTokenInput, setTelegramBotTokenInput] = useState('');
  const [telegramSavingToken, setTelegramSavingToken] = useState(false);
  const [telegramSaveTokenError, setTelegramSaveTokenError] = useState<string | null>(null);
  const [telegramBotTokenSource, setTelegramBotTokenSource] = useState<'env' | 'runtime' | 'none'>('none');
  const [telegramChatIdSource, setTelegramChatIdSource] = useState<'env' | 'runtime' | 'none'>('none');

  // ── Chat states ──
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<{ role: 'user' | 'assistant'; content: string }[]>([
    { role: 'assistant', content: '¡Hola! Soy **SOFIA**, tu asistente OSINT. Puedo ayudarte a entender los resultados de escaneo, recomendar acciones de seguridad, orientarte sobre legislación colombiana y explicarte cómo usar el portal. ¿En qué te puedo ayudar?' }
  ]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);

  // ── Escáner de Grupos (Telegram Group Scanner) states ──
  const [groupScanLoading, setGroupScanLoading] = useState(false);
  const [groupScanResults, setGroupScanResults] = useState<{
    totalGroups: number;
    totalBotMessages: number;
    keywordsProcessed: number;
    totalKeywords: number;
    maxKeywordsPerScan: number;
    channelsDiscovered?: number;
    channelsScraped?: number;
    channelsWithMessages?: number;
    zaiSearchUsed?: boolean;
    technicalIssues?: boolean;
    partialSuccess?: boolean;
    diagnostics?: Array<{ phase: string; status: string; details: string }>;
    detectedAlerts: Array<{
      keyword: string;
      sourceType: string;
      sourceName: string;
      sourceUrl: string;
      messageText: string;
      chatType: string;
      timestamp: string;
      telegramSent: boolean;
      matchedKeyword?: string;
      matchedContext?: string;
      messageId?: string;
      riskLevel?: 'high' | 'medium' | 'low';
      isOfficial?: boolean;
      riskTags?: string[];
      discoverySource?: string;
      channelUsername?: string;
      subscriberCount?: number;
      messageDate?: string;
    }>;
    riskBreakdown?: {
      high: number;
      medium: number;
      low: number;
      official: number;
      nonOfficial: number;
    };
    suspiciousChannels?: string[];
  } | null>(null);
  const [groupScanError, setGroupScanError] = useState<string | null>(null);

  // ── Keywords localStorage persistence ──
  const KEYWORDS_STORAGE_KEY = 'osint_alert_keywords';

  function saveKeywordsToStorage() {
    try {
      localStorage.setItem(KEYWORDS_STORAGE_KEY, JSON.stringify(alertKeywords));
    } catch { /* ignore */ }
  }

  function loadKeywordsFromStorage(): string[] {
    try {
      const stored = localStorage.getItem(KEYWORDS_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch { /* ignore */ }
    return [];
  }

  // ── Fetch alert configuration ──
  // ── Delete selected history entries ──
  async function handleDeleteHistoryEntries() {
    if (selectedHistoryIndices.size === 0) return;
    setDeleteHistoryLoading(true);
    try {
      const res = await fetch('/api/alerts', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ indices: Array.from(selectedHistoryIndices) }),
      });
      if (res.ok) {
        const data = await res.json();
        setAlertHistory(data.alertHistory || []);
        setSelectedHistoryIndices(new Set());
        setShowDeleteHistoryModal(false);
      }
    } catch {
      alert('Error al eliminar los registros del historial');
    }
    setDeleteHistoryLoading(false);
  }

  // ── Delete selected found alerts (client-side) ──
  function handleDeleteSelectedAlerts() {
    if (!groupScanResults || selectedAlertIndices.size === 0) return;
    const remaining = groupScanResults.detectedAlerts.filter((_, i) => !selectedAlertIndices.has(i));
    setGroupScanResults({ ...groupScanResults, detectedAlerts: remaining });
    setSelectedAlertIndices(new Set());
  }

  async function fetchAlertConfig() {
    let serverKeywords: string[] = [];
    try {
      const res = await fetch('/api/alerts');
      if (res.ok) {
        const data = await res.json();
        serverKeywords = data.keywords || [];
        setTelegramConfigured(data.telegram?.configured || false);
        setTelegramHasBotToken(data.telegram?.hasBotToken || false);
        setTelegramHasChatId(data.telegram?.hasChatId || false);
        setAlertHistory(data.alertHistory || []);
        setSelectedHistoryIndices(new Set());
      }
    } catch { /* ignore */ }

    // Sync: if server has fewer keywords than localStorage (cold start reset),
    // merge localStorage keywords into server and use the merged list
    const storedKeywords = loadKeywordsFromStorage();
    if (storedKeywords.length > 0 && storedKeywords.length > serverKeywords.length) {
      const merged = [...new Set([...serverKeywords, ...storedKeywords])];
      setAlertKeywords(merged);
      // Sync merged keywords back to server
      try {
        await fetch('/api/alerts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'set_keywords', keywords: merged }),
        });
      } catch { /* ignore */ }
      // Save merged list to localStorage
      try { localStorage.setItem(KEYWORDS_STORAGE_KEY, JSON.stringify(merged)); } catch { /* ignore */ }
    } else if (serverKeywords.length > 0) {
      setAlertKeywords(serverKeywords);
      // Update localStorage with server keywords (in case server has newer data)
      try { localStorage.setItem(KEYWORDS_STORAGE_KEY, JSON.stringify(serverKeywords)); } catch { /* ignore */ }
    } else if (storedKeywords.length > 0) {
      // Server has no keywords (cold start) but we have stored ones
      setAlertKeywords(storedKeywords);
      try {
        await fetch('/api/alerts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'set_keywords', keywords: storedKeywords }),
        });
      } catch { /* ignore */ }
    }

    // Also fetch Telegram bot info
    try {
      const tgRes = await fetch('/api/telegram');
      if (tgRes.ok) {
        const tgData = await tgRes.json();
        setTelegramBotInfo(tgData.botInfo || null);
        setTelegramBotTokenSource(tgData.botTokenSource || 'none');
        setTelegramChatIdSource(tgData.chatIdSource || 'none');
      }
    } catch { /* ignore */ }
  }

  async function handleAddKeyword() {
    if (!newKeyword.trim()) return;
    setAlertLoading(true);
    try {
      const res = await fetch('/api/alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'add_keyword', keyword: newKeyword.trim() }),
      });
      if (res.ok) {
        const data = await res.json();
        setAlertKeywords(data.keywords);
        saveKeywordsToStorage();
        setNewKeyword('');
      }
    } catch { /* ignore */ }
    setAlertLoading(false);
  }

  async function handleRemoveKeyword(keyword: string) {
    setAlertLoading(true);
    try {
      const res = await fetch('/api/alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'remove_keyword', keyword }),
      });
      if (res.ok) {
        const data = await res.json();
        setAlertKeywords(data.keywords);
        saveKeywordsToStorage();
      }
    } catch { /* ignore */ }
    setAlertLoading(false);
  }

  async function handleBulkAddKeywords() {
    if (!bulkKeywordInput.trim()) return;
    setBulkKeywordLoading(true);
    try {
      // Parse: split by newlines OR commas, trim, deduplicate, filter empty
      const rawKeywords = bulkKeywordInput
        .split(/[\n,]+/)
        .map(k => k.trim().toLowerCase())
        .filter(k => k.length > 0);
      const uniqueKeywords = [...new Set(rawKeywords)];

      if (uniqueKeywords.length === 0) {
        setBulkKeywordLoading(false);
        return;
      }

      // Get current keywords and merge
      const merged = [...new Set([...alertKeywords, ...uniqueKeywords])];

      const res = await fetch('/api/alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'set_keywords', keywords: merged }),
      });
      if (res.ok) {
        const data = await res.json();
        setAlertKeywords(data.keywords);
        saveKeywordsToStorage();
        setBulkKeywordInput('');
      }
    } catch { /* ignore */ }
    setBulkKeywordLoading(false);
  }

  // ── Escáner de Grupos: Scan Telegram groups for keyword matches ──
  async function handleScanGroups() {
    setGroupScanLoading(true);
    setGroupScanError(null);
    try {
      const res = await fetch('/api/telegram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'scan_groups' }),
      });
      const data = await res.json().catch(() => ({}));

      // Always set results if diagnostics data is present (even on partial failures)
      if (data.diagnostics || data.detectedAlerts || data.totalGroups !== undefined) {
        setGroupScanResults(data);
        setSelectedAlertIndices(new Set());
        // Also update alert history from the scan
        if (data.alertHistory) {
          setAlertHistory(data.alertHistory);
          setSelectedHistoryIndices(new Set());
        }
        // If there's also an error message, show it alongside the diagnostics
        if (!data.success && data.error) {
          setGroupScanError(data.error);
        }
      } else if (!res.ok || !data.success) {
        setGroupScanError(data.error || 'Error al escanear grupos');
      }
    } catch {
      setGroupScanError('Error de conexión con el servidor');
    }
    setGroupScanLoading(false);
  }

  async function handleTestAlert() {
    setTelegramTestSending(true);
    try {
      const res = await fetch('/api/telegram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'test_alert' }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          alert('✅ Alerta de prueba enviada exitosamente a Telegram');
        } else {
          alert(`❌ Error: ${data.error || data.message || 'No se pudo enviar la alerta'}`);
        }
      }
    } catch {
      alert('❌ Error de conexión al enviar alerta de prueba');
    }
    setTelegramTestSending(false);
  }

  async function handleTelegramDetectChatId() {
    setTelegramDetecting(true);
    setTelegramDetectError(null);
    setTelegramDetectedChats([]);
    try {
      const res = await fetch('/api/telegram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'detect_chat_id' }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.detectedChats?.length > 0) {
          setTelegramDetectedChats(data.detectedChats);
          if (data.message) {
            // CHAT_ID was already configured — refresh config
            fetchAlertConfig();
          }
        } else {
          const errorParts = [data.error || 'No se detectaron chats'];
          if (data.hints && Array.isArray(data.hints)) {
            errorParts.push(...data.hints);
          }
          if (data.alternative) {
            errorParts.push(data.alternative);
          }
          setTelegramDetectError(errorParts.join('\n'));
        }
      } else {
        const errData = await res.json().catch(() => ({}));
        setTelegramDetectError(errData.error || 'Error al detectar Chat ID');
      }
    } catch {
      setTelegramDetectError('Error de conexión con el servidor');
    }
    setTelegramDetecting(false);
  }

  async function handleTelegramVerifyToken() {
    try {
      const res = await fetch('/api/telegram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'verify_token' }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.botInfo) {
          setTelegramBotInfo(data.botInfo);
        }
      }
    } catch { /* ignore */ }
  }

  async function handleSaveBotToken() {
    if (!telegramBotTokenInput.trim()) return;
    setTelegramSavingToken(true);
    setTelegramSaveTokenError(null);
    try {
      const res = await fetch('/api/telegram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'save_bot_token', botToken: telegramBotTokenInput.trim() }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setTelegramHasBotToken(true);
          setTelegramBotTokenInput('');
          setTelegramBotInfo(data.botInfo || null);
          setTelegramBotTokenSource('runtime');
          // Refresh full config
          fetchAlertConfig();
        } else {
          setTelegramSaveTokenError(data.error || 'Error al guardar el token');
        }
      } else {
        const errData = await res.json().catch(() => ({}));
        setTelegramSaveTokenError(errData.error || 'Error al guardar el token');
      }
    } catch {
      setTelegramSaveTokenError('Error de conexión con el servidor');
    }
    setTelegramSavingToken(false);
  }

  async function handleSelectChat(chatId: number) {
    try {
      const res = await fetch('/api/telegram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'save_chat_id', chatId }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setTelegramHasChatId(true);
          setTelegramConfigured(true);
          setTelegramChatIdSource('runtime');
          fetchAlertConfig();
        }
      }
    } catch { /* ignore */ }
  }

  useEffect(() => {
    fetchPastScans();
    fetchAlertConfig();
  }, []);

  // ── Test DeepSeek connection (server-side key) ──
  async function handleTestConnection() {
    setTestKeyLoading(true);
    setTestKeyStatus('idle');
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'user', content: 'Responde solo con "OK" para verificar la conexión.' }],
        }),
      });
      if (res.ok) {
        setTestKeyStatus('success');
      } else {
        setTestKeyStatus('error');
      }
    } catch {
      setTestKeyStatus('error');
    } finally {
      setTestKeyLoading(false);
    }
  }

  // ── Engine selection helpers ──
  const toggleEngine = (name: string) => {
    setSelectedEngines(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const toggleAllEngines = () => {
    if (selectedEngines.size === TOTAL_ENGINES) {
      setSelectedEngines(new Set());
    } else {
      setSelectedEngines(new Set(allEngineNames));
    }
  };

  const toggleCategory = (engineNames: string[]) => {
    const allSelected = engineNames.every(n => selectedEngines.has(n));
    setSelectedEngines(prev => {
      const next = new Set(prev);
      engineNames.forEach(n => {
        if (allSelected) next.delete(n);
        else next.add(n);
      });
      return next;
    });
  };

  // ── Fetch past scans ──
  async function fetchPastScans() {
    try {
      const res = await fetch('/api/scan');
      if (res.ok) {
        const data = await res.json();
        setPastScans(data);
      }
    } catch { /* ignore */ }
  }

  // ── Scan handler ──
  async function handleScan() {
    if (!fullName.trim()) {
      setError('El nombre completo es obligatorio');
      return;
    }
    if (!email.trim() && !phone.trim() && !cedula.trim()) {
      setError('Proporciona al menos un dato adicional (correo, telefono o cedula)');
      return;
    }
    if (selectedEngines.size === 0) {
      setError('Selecciona al menos un motor de búsqueda');
      return;
    }

    setLoading(true);
    setError(null);
    setScanData(null);
    setProgress(5);

    // Step-based progress: no fake timers
    // Step 1: Conectando (5%) — already set
    setProgress(15); // Step 2: Enviando consulta

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 90000); // 90s timeout

      const res = await fetch('/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName, cedula, email, phone, reportFormat,
          selectedEngines: Array.from(selectedEngines),
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      setProgress(85); // Step 3: Recibiendo resultados

      if (!res.ok) {
        // Safely parse error — server might return non-JSON (e.g., Vercel timeout page)
        let errorMsg = 'Error en el escaneo';
        try {
          const errData = await res.json();
          errorMsg = errData.error || errorMsg;
        } catch {
          // Response was not JSON — try reading as text
          try {
            const errText = await res.text();
            if (errText.includes('timeout') || errText.includes('Timed out')) {
              errorMsg = 'El escaneo excedió el tiempo límite del servidor. Intenta con menos motores de búsqueda.';
            } else if (errText.length > 0 && errText.length < 200) {
              errorMsg = `Error del servidor: ${errText}`;
            } else {
              errorMsg = `Error del servidor (HTTP ${res.status}). Intenta nuevamente o usa menos motores.`;
            }
          } catch {
            errorMsg = `Error del servidor (HTTP ${res.status}). Intenta nuevamente.`;
          }
        }
        throw new Error(errorMsg);
      }

      // Safely parse success response
      let data: ScanResponse;
      try {
        data = await res.json();
      } catch {
        throw new Error('El servidor devolvió una respuesta inválida. Intenta nuevamente.');
      }

      setProgress(95); // Step 4: Procesando resultados
      setScanData(data);
      setProgress(100); // Step 5: Completado
      setActiveTab('results');
      fetchPastScans();

      // Save keywords to localStorage after successful scan
      saveKeywordsToStorage();
    } catch (err) {
      setProgress(0);
      if (err instanceof Error && err.name === 'AbortError') {
        setError('El escaneo excedió el tiempo límite (90s). Intenta con menos motores de búsqueda.');
      } else {
        setError(err instanceof Error ? err.message : 'Error desconocido');
      }
    } finally {
      setLoading(false);
      // Progress bar stays visible at 100% — no auto-reset
    }
  }

  // ── Delete scan (with confirmation) ──
  function confirmDeleteScan(scanId: string, scanName: string) {
    setDeleteConfirm({ open: true, scanId, scanName, deleteAll: false });
  }

  function confirmDeleteAll() {
    setDeleteConfirm({ open: true, scanId: null, scanName: '', deleteAll: true });
  }

  async function executeDelete() {
    try {
      if (deleteConfirm.deleteAll) {
        await fetch('/api/scan?all=true', { method: 'DELETE' });
        setPastScans([]);
        setScanData(null);
      } else if (deleteConfirm.scanId) {
        await fetch(`/api/scan?scanId=${deleteConfirm.scanId}`, { method: 'DELETE' });
        fetchPastScans();
        if (scanData?.scanId === deleteConfirm.scanId) setScanData(null);
      }
    } catch { /* ignore */ }
    setDeleteConfirm({ open: false, scanId: null, scanName: '', deleteAll: false });
  }

  // ── View past scan ──
  async function handleViewPastScan(scanId: string) {
    try {
      const res = await fetch(`/api/scan?scanId=${scanId}`);
      if (res.ok) {
        const scan = await res.json();
        const results: ScanResult[] = scan.results.map((r: Record<string, unknown>) => ({
          source: r.source as string,
          category: r.category as string,
          severity: r.severity as ScanResult['severity'],
          title: r.title as string,
          description: r.description as string | undefined,
          url: r.url as string | undefined,
          dataFound: r.dataFound as string | undefined,
        }));
        const summary = {
          critical: results.filter(r => r.severity === 'critical').length,
          high: results.filter(r => r.severity === 'high').length,
          medium: results.filter(r => r.severity === 'medium').length,
          low: results.filter(r => r.severity === 'low').length,
          info: results.filter(r => r.severity === 'info').length,
        };
        const reportFileName = scan.reports?.[0]?.fileName || undefined;
        setScanData({ scanId: scan.id, totalResults: results.length, results, summary, reportFileName });
        setActiveTab('results');
      }
    } catch { /* ignore */ }
  }

  // ── Download report (POST version — fixes Vercel serverless cold start) ──
  async function handleDownloadReport(scanId: string, format?: 'docx' | 'pdf') {
    try {
      const fmt = format || 'pdf';

      // Build results data from current scanData, past scans, or batch results
      let resultsToSend: ScanResult[] = [];
      let fullNameToSend = '';
      let emailToSend = '';
      let phoneToSend = '';
      let cedulaToSend = '';

      if (scanData && scanData.scanId === scanId) {
        resultsToSend = scanData.results;
        fullNameToSend = fullName;
        emailToSend = email;
        phoneToSend = phone;
        cedulaToSend = cedula;
      } else {
        // Try to get from pastScans
        const pastScan = pastScans.find(s => s.id === scanId);
        if (pastScan) {
          fullNameToSend = pastScan.fullName;
          emailToSend = pastScan.email || '';
          phoneToSend = pastScan.phone || '';
          cedulaToSend = pastScan.cedula || '';
          resultsToSend = pastScan.results.map(r => ({
            source: r.source || '',
            category: r.category || '',
            severity: r.severity as ScanResult['severity'],
            title: r.title || '',
            description: r.description ?? undefined,
            url: r.url ?? undefined,
            dataFound: r.dataFound ?? undefined,
          }));
        }

        // Also check batch results as fallback (for batch/Excel scenarios)
        if (resultsToSend.length === 0 && batchResults) {
          const batchResult = batchResults.find(r => r.scanId === scanId);
          if (batchResult) {
            fullNameToSend = batchResult.fullName || '';
          }
        }
      }

      if (!fullNameToSend) {
        alert('No se encontraron datos para generar el informe');
        return;
      }

      const res = await fetch('/api/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scanId,
          fullName: fullNameToSend,
          cedula: cedulaToSend,
          email: emailToSend,
          phone: phoneToSend,
          results: resultsToSend,
          format: fmt,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Error al descargar informe');
      }

      const blob = await res.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      const disposition = res.headers.get('Content-Disposition');
      a.download = disposition?.split('filename=')[1]?.replace(/"/g, '') || `Informe_OSINT.${fmt}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(blobUrl);
      document.body.removeChild(a);
    } catch (err) {
      console.error('Download error:', err);
      alert('Error al descargar el informe. Intente nuevamente.');
    }
  }

  // ── Download both PDF and DOCX reports ──
  async function handleDownloadBothReports(scanId: string) {
    await handleDownloadReport(scanId, 'pdf');
    setTimeout(() => handleDownloadReport(scanId, 'docx'), 500);
  }

  // ── Download both social reports ──
  async function handleDownloadBothSocialReports() {
    await handleDownloadSocialReport();
    setTimeout(() => handleDownloadSocialDocxReport(), 500);
  }

  // ── Download both joint reports ──
  async function handleDownloadBothJointReports(analysisId: string) {
    await handleDownloadJointReport(analysisId, 'pdf');
    setTimeout(() => handleDownloadJointReport(analysisId, 'docx'), 500);
  }

  // ── Download joint report ──
  async function handleDownloadJointReport(analysisId: string, format: 'pdf' | 'docx' = 'pdf') {
    try {
      // Use POST to send analysis data (Vercel serverless cold start fix)
      const res = await fetch('/api/joint-analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          analysisId,
          format,
          analysis: relationshipAnalysis,
          individualScans: batchResults?.map(r => ({
            name: r.fullName,
            results: pastScans.find(s => s.id === r.scanId)?.results || [],
          })) || [],
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Error al descargar informe conjunto');
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const ext = format === 'docx' ? 'docx' : 'pdf';
      a.download = jointReportFileName?.replace(/\.pdf$/, `.${ext}`) || `Informe_Conjunto.${ext}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      console.error('Download error:', err);
      alert('Error al descargar el informe conjunto. Intente nuevamente.');
    }
  }

  // ── Chat handler ──
  async function handleChatSend() {
    if (!chatInput.trim() || chatLoading) return;

    const userMessage = chatInput.trim();
    setChatInput('');
    setChatMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setChatLoading(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [...chatMessages, { role: 'user', content: userMessage }] }),
      });

      if (!res.ok) throw new Error('Error en el chat');

      const data = await res.json();
      setChatMessages(prev => [...prev, { role: 'assistant', content: data.message }]);
    } catch {
      setChatMessages(prev => [...prev, { role: 'assistant', content: 'Lo siento, hubo un error al procesar tu mensaje. Intenta de nuevo.' }]);
    } finally {
      setChatLoading(false);
    }
  }

  // ── Download social media DOCX report ──
  async function handleDownloadSocialDocxReport() {
    if (!socialScanData) return;
    setSocialReportLoading(true);
    try {
      const res = await fetch('/api/social-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          searchMode: socialScanData.searchMode,
          searchQuery: socialScanData.searchQuery,
          results: socialScanData.results,
          summary: socialScanData.summary,
          scanId: socialScanData.scanId,
          format: 'docx',
        }),
      });
      if (!res.ok) throw new Error('Error al descargar informe DOCX');
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Informe_Redes_Sociales_${Date.now()}.docx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      console.error('Download social DOCX report error:', err);
      alert('Error al descargar el informe DOCX de redes sociales.');
    } finally {
      setSocialReportLoading(false);
    }
  }

  // ── Download social media history report (from past scans) ──
  async function handleDownloadSocialHistoryReport(scanId: string, format: 'pdf' | 'docx') {
    try {
      // Get past scan data
      const pastScan = pastScans.find(s => s.id === scanId);
      if (!pastScan) return;

      // Reconstruct social scan results from stored data
      const platformMap = new Map<string, Array<{ source: string; category: string; severity: 'critical' | 'high' | 'medium' | 'low' | 'info'; title: string; description?: string; url?: string; dataFound?: string }>>();
      for (const r of pastScan.results) {
        const platform = r.source || 'Desconocido';
        if (!platformMap.has(platform)) platformMap.set(platform, []);
        platformMap.get(platform)!.push({
          source: r.source || '',
          category: r.category || 'social_media',
          severity: (r.severity as 'critical' | 'high' | 'medium' | 'low' | 'info') || 'info',
          title: r.title || '',
          description: r.description ?? undefined,
          url: r.url ?? undefined,
          dataFound: r.dataFound ?? undefined,
        });
      }

      const socialResults = Array.from(platformMap.entries()).map(([platform, findings]) => ({
        platform,
        platformId: platform.toLowerCase(),
        profileFound: findings.some(f => f.severity === 'info' && f.title.includes('Perfil encontrado')),
        username: undefined,
        profileVerified: false,
        findings,
        searchResultsCount: findings.length,
      }));

      const summary = {
        profilesFound: socialResults.filter(r => r.profileFound).length,
        totalFindings: pastScan.results.length,
        critical: pastScan.results.filter(r => r.severity === 'critical').length,
        high: pastScan.results.filter(r => r.severity === 'high').length,
        medium: pastScan.results.filter(r => r.severity === 'medium').length,
        low: pastScan.results.filter(r => r.severity === 'low').length,
        info: pastScan.results.filter(r => r.severity === 'info').length,
      };

      const res = await fetch('/api/social-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          searchMode: 'name',
          searchQuery: pastScan.fullName,
          results: socialResults,
          summary,
          scanId,
          format,
        }),
      });

      if (!res.ok) throw new Error('Error al descargar informe de redes sociales');
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const ext = format === 'docx' ? 'docx' : 'pdf';
      a.download = `Informe_Redes_Sociales_${pastScan.fullName.replace(/\s+/g, '_')}_${Date.now()}.${ext}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      console.error('Download social history report error:', err);
      alert('Error al descargar el informe de redes sociales.');
    }
  }

  // ── Download social media report ──
  async function handleDownloadSocialReport() {
    if (!socialScanData) return;
    setSocialReportLoading(true);
    try {
      const res = await fetch('/api/social-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          searchMode: socialScanData.searchMode,
          searchQuery: socialScanData.searchQuery,
          results: socialScanData.results,
          summary: socialScanData.summary,
          scanId: socialScanData.scanId,
        }),
      });
      if (!res.ok) throw new Error('Error al descargar informe');
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Informe_Redes_Sociales_${Date.now()}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      console.error('Download social report error:', err);
      alert('Error al descargar el informe de redes sociales.');
    } finally {
      setSocialReportLoading(false);
    }
  }

  // ── Get effective social search value based on mode ──
  const getSocialSearchValue = useCallback((): string => {
    switch (socialSearchMode) {
      case 'nickname': return socialNickname.trim() || '';
      case 'email': return socialEmail.trim() || email.trim() || '';
      case 'name': return socialName.trim() || fullName.trim() || '';
    }
  }, [socialSearchMode, socialNickname, socialEmail, socialName, email, fullName]);

  // ── Search Engine URL generators ──
  const searchEngines = useMemo(() => [
    { id: 'google', name: 'Google', color: 'text-sev-low-text', bgColor: 'bg-sev-low-bg/30', borderColor: 'border-sev-low-text/20', buildUrl: (q: string) => `https://www.google.com/search?q=${encodeURIComponent(q)}` },
    { id: 'bing', name: 'Bing', color: 'text-app-text-dim', bgColor: 'bg-app-surface-hover', borderColor: 'border-app-border', buildUrl: (q: string) => `https://www.bing.com/search?q=${encodeURIComponent(q)}` },
    { id: 'yandex', name: 'Yandex', color: 'text-sev-critical-text', bgColor: 'bg-sev-critical-bg/30', borderColor: 'border-sev-critical-text/20', buildUrl: (q: string) => `https://yandex.com/search/?text=${encodeURIComponent(q)}` },
    { id: 'duckduckgo', name: 'DuckDuckGo', color: 'text-sev-high-text', bgColor: 'bg-sev-high-bg/30', borderColor: 'border-sev-high-text/20', buildUrl: (q: string) => `https://duckduckgo.com/?q=${encodeURIComponent(q)}` },
  ], []);

  // ── Build platform-specific search query ──
  const buildPlatformSearchQuery = useCallback((platform: typeof socialPlatforms[0], engine: typeof searchEngines[0]): string => {
    const searchValue = getSocialSearchValue();
    if (!searchValue) return '';

    switch (socialSearchMode) {
      case 'nickname':
        return `@${searchValue.replace(/^@/, '')} ${platform.name} profile OR account OR perfil`;
      case 'email':
        return `"${searchValue}" site:${platform.domain} OR "${searchValue}" ${platform.name}`;
      case 'name':
        return `"${searchValue}" site:${platform.domain} OR "${searchValue}" ${platform.name} profile`;
    }
  }, [socialSearchMode, getSocialSearchValue]);

  // ── Social media scan handler ──
  async function handleSocialScan() {
    // Only use parameters relevant to the current search mode — clean all others
    const effectiveNickname = socialSearchMode === 'nickname' ? socialNickname.trim() : '';
    const effectiveEmail = socialSearchMode === 'email' ? (socialEmail.trim() || email.trim()) : '';
    const effectiveName = socialSearchMode === 'name' ? (socialName.trim() || fullName.trim()) : '';

    if (socialSearchMode === 'nickname' && !effectiveNickname) {
      setSocialScanError('Ingresa un NickName o nombre de usuario');
      return;
    }
    if (socialSearchMode === 'email' && !effectiveEmail) {
      setSocialScanError('Ingresa un correo electrónico');
      return;
    }
    if (socialSearchMode === 'name' && !effectiveName) {
      setSocialScanError('Ingresa el nombre completo');
      return;
    }
    if (selectedSocialPlatforms.size === 0) {
      setSocialScanError('Selecciona al menos una red social para escanear');
      return;
    }

    setSocialScanLoading(true);
    setSocialScanError(null);
    setSocialScanData(null);
    setSocialScanProgress(5);

    // Step-based progress: no fake timers

    try {
      // Build payload with ONLY the parameters relevant to the active search mode
      const payload: Record<string, unknown> = {
        searchMode: socialSearchMode,
        selectedPlatforms: Array.from(selectedSocialPlatforms),
      };

      setSocialScanProgress(15); // Step 2: Enviando consulta

      if (socialSearchMode === 'nickname') {
        payload.nickname = effectiveNickname;
        payload.fullName = '';
        payload.email = '';
      } else if (socialSearchMode === 'email') {
        payload.email = effectiveEmail;
        payload.fullName = '';
        payload.nickname = '';
      } else if (socialSearchMode === 'name') {
        payload.fullName = effectiveName;
        payload.email = '';
        payload.nickname = '';
      }

      if (phone.trim()) payload.phone = phone.trim();
      if (cedula.trim()) payload.cedula = cedula.trim();

      const res = await fetch('/api/social-scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      setSocialScanProgress(85); // Step 3: Recibiendo resultados

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Error en el escaneo de redes sociales');
      }

      const data: SocialScanResponse = await res.json();
      setSocialScanProgress(100); // Step 4: Completado
      setSocialScanData(data);
      // Refresh history list to include the new social media scan
      fetchPastScans();
    } catch (err) {
      setSocialScanProgress(0);
      setSocialScanError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setSocialScanLoading(false);
      // Progress bar stays visible at 100% — no auto-reset
    }
  }

  const toggleSocialPlatform = (id: string) => {
    setSelectedSocialPlatforms(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAllSocialPlatforms = () => {
    if (selectedSocialPlatforms.size === socialPlatforms.length) {
      setSelectedSocialPlatforms(new Set());
    } else {
      setSelectedSocialPlatforms(new Set(socialPlatforms.map(p => p.id)));
    }
  };

  // ── File upload handler ──
  const handleFileUpload = useCallback(async () => {
    if (!uploadFile) return;

    setUploadLoading(true);
    setUploadError(null);
    setBatchResults(null);
    setTxtAnalysis(null);
    setRelationshipAnalysis(null);
    setJointAnalysisId(null);
    setUploadProgress(5);
    setUploadStage('Iniciando carga...');

    // Step-based progress: no fake timers
    try {
      const fileName = uploadFile.name.toLowerCase();
      const fileLabel = fileName.endsWith('.txt') ? 'TXT' :
                        fileName.endsWith('.xlsx') || fileName.endsWith('.xls') ? 'Excel' : 'CSV';

      // Step 1: Enviando archivo
      const formData = new FormData();
      formData.append('file', uploadFile);
      setUploadStage(`Enviando archivo ${fileLabel} al servidor...`);
      setUploadProgress(15);
      const res = await fetch('/api/upload', { method: 'POST', body: formData });

      // Step 2: Recibiendo respuesta
      setUploadStage('Recibiendo resultados del servidor...');
      setUploadProgress(70);

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        // Check if server detected IRM/Azure RMS protection
        if (errData.isIRM === true) {
          throw new Error(
            errData.error ||
            'El archivo tiene proteccion IRM (Azure Rights Management). Los datos estan cifrados. ' +
            'Solucion: abre el archivo en Excel con tu cuenta autorizada, ve a Archivo > Informacion > ' +
            'Proteger libro > Restringir acceso > "Sin restricciones", guardalo como .xlsx y subelo de nuevo.'
          );
        }
        // Check if server detected genuine file encryption (not just sheet protection)
        if (errData.isEncrypted === true) {
          throw new Error(
            'El archivo tiene cifrado real y no puede ser leido. Abre el archivo en Excel, elimina la protección y guárdalo como .xlsx.'
          );
        }
        // Check if TXT analysis found no entities
        if (errData.txtAnalysis) {
          throw new Error(
            errData.error + `\n\nResumen del análisis: ${errData.txtAnalysis.intelligenceSummary}`
          );
        }
        throw new Error(errData.error || `Error al procesar archivo ${fileLabel} en el servidor`);
      }

      const uploadData = await res.json();

      // Step 3: Procesando resultados
      setUploadStage('Procesando resultados de inteligencia...');
      setUploadProgress(90);

      if (uploadData.type === 'xlsx_multi_sheet') {
        setSheetNames(uploadData.sheetNames || []);
        setBatchResults(uploadData.results);
        setRelationshipAnalysis(uploadData.relationshipAnalysis || null);
        setJointAnalysisId(uploadData.jointAnalysisId || null);
        setJointReportFileName(uploadData.jointReportFileName || null);
      } else if (uploadData.type === 'txt_analysis') {
        setBatchResults(uploadData.results);
        setTxtAnalysis(uploadData.txtAnalysis);
      } else {
        setBatchResults(uploadData.results);
      }

      // Step 4: Completado
      setUploadProgress(100);
      setUploadStage('Procesamiento completado');
      fetchPastScans();
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Error desconocido');
      setUploadStage('Error en el procesamiento');
      setUploadProgress(0);
    } finally {
      setUploadLoading(false);
      // Progress bar stays visible at 100% — no auto-reset
    }
  }, [uploadFile]);

  // ── Drag & drop handlers ──
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files);
    const validFile = files.find(f => f.name.endsWith('.csv') || f.name.endsWith('.xlsx') || f.name.endsWith('.xls') || f.name.endsWith('.txt'));
    if (validFile) { setUploadFile(validFile); setUploadError(null); }
    else setUploadError('Formato no soportado. Use .csv, .xlsx, .xls o .txt');
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); }, []);
  const handleDragLeave = useCallback((e: React.DragEvent) => { e.preventDefault(); setIsDragging(false); }, []);

  // ── Derived data ──
  const filteredResults = scanData?.results.filter(
    r => filterSeverity === 'all' || r.severity === filterSeverity
  ) || [];

  const filteredLinks = relationshipAnalysis?.links.filter(
    l => linkFilter === 'all' || l.type === linkFilter
  ) || [];

  const riskScore = scanData
    ? Math.min(100, scanData.summary.critical * 30 + scanData.summary.high * 15 + scanData.summary.medium * 5 + scanData.summary.low * 2)
    : 0;

  const riskLabel = riskScore >= 70 ? 'CRITICO' : riskScore >= 40 ? 'ALTO' : riskScore >= 15 ? 'MODERADO' : 'BAJO';
  const riskColor = riskScore >= 70 ? 'text-sev-critical-text' : riskScore >= 40 ? 'text-sev-high-text' : riskScore >= 15 ? 'text-sev-medium-text' : 'text-accent-success';

  // ── Group results by source ──
  const groupedResults = useMemo(() => {
    const groups: Record<string, ScanResult[]> = {};
    for (const r of filteredResults) {
      const key = r.source || 'Desconocido';
      if (!groups[key]) groups[key] = [];
      groups[key].push(r);
    }
    return groups;
  }, [filteredResults]);

  const toggleGroup = (source: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(source)) next.delete(source);
      else next.add(source);
      return next;
    });
  };

  // ══════════════════════════════════════════════════════════
  // ── RENDER ──
  // ══════════════════════════════════════════════════════════

  // Show loading state while checking authentication
  if (authLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-app-bg text-app-text-dim gap-4">
        <div className="p-4 bg-app-surface rounded-xl border border-app-border">
          <Loader2 className="w-10 h-10 text-sev-low-text animate-spin" />
        </div>
        <p className="text-sm text-slate-400">Verificando autenticación...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-app-bg text-app-text">

      {/* ── HEADER ── */}
      <header className="border-b border-app-border bg-app-header sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center gap-3">
          <div className="p-2 bg-app-surface rounded-lg border border-app-border">
            <Shield className="w-5 h-5 text-accent-primary" />
          </div>
          <div>
            <h1 className="text-base font-semibold text-app-text tracking-tight">OSINT Data Scanner</h1>
            <p className="text-[10px] text-slate-500 -mt-0.5">Inteligencia de Fuentes Abiertas</p>
          </div>

          <div className="ml-auto flex items-center gap-3">
            {/* Connection status dot */}
            <div className="flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full ${testKeyStatus === 'success' ? 'bg-accent-success' : testKeyStatus === 'error' ? 'bg-sev-critical-bar' : 'bg-slate-600'}`} />
              <span className="text-[10px] text-slate-500 hidden sm:inline">
                {testKeyStatus === 'success' ? 'Conectado' : testKeyStatus === 'error' ? 'Desconectado' : 'Sin verificar'}
              </span>
            </div>

            <Badge variant="outline" className="border-app-border text-slate-400 text-xs bg-app-surface">
              <Globe className="w-3 h-3 mr-1" />
              {selectedEngines.size}/{TOTAL_ENGINES}
            </Badge>

            <ThemeSelector />

            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-slate-400 hover:text-white hover:bg-app-surface-hover rounded-lg"
              onClick={() => { setSettingsOpen(true); setTestKeyStatus('idle'); }}
            >
              <Settings className="w-4 h-4" />
            </Button>

            {/* User session & MFA indicator */}
            {authUser && (
              <>
                <div className="hidden sm:flex items-center gap-1.5 px-2 py-1 rounded-md bg-app-surface border border-app-border">
                  <Mail className="w-3 h-3 text-sev-medium-text" />
                  <span className="text-[10px] text-slate-400 font-medium">{authUser.email || authUser.username}</span>
                  <Badge className="bg-sev-medium-bg/50 text-sev-medium-text text-[8px] px-1 py-0 h-4">
                    {authUser.role}
                  </Badge>
                </div>
                <a href="/setup-mfa" className="h-8 w-8 flex items-center justify-center text-slate-400 hover:text-sev-medium-text hover:bg-app-surface-hover rounded-lg transition-colors" title="Configurar MFA">
                  <Fingerprint className="w-4 h-4" />
                </a>
              </>
            )}

            {/* Logout button */}
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-slate-400 hover:text-sev-critical-text bg-sev-critical-bg'   rounded-lg"
              onClick={handleLogout}
              title="Cerrar Sesión"
            >
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>
        {/* Subtle accent line */}
        <div className="h-[1px] bg-gradient-to-r from-transparent via-blue-700/40 to-transparent" />
      </header>

      {/* ── SETTINGS DIALOG ── */}
      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="bg-app-surface border border-app-border shadow-sm text-app-text sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-app-text flex items-center gap-2">
              <Settings className="w-5 h-5 text-sev-low-text" />
              Configuración
            </DialogTitle>
            <DialogDescription className="text-slate-500">
              Configura las opciones avanzadas del escáner OSINT
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* API Key Status - Server-side only, no input field */}
            <div className="p-4 rounded-lg bg-app-bg border border-app-border space-y-3">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${testKeyStatus === 'success' ? 'bg-app-surface-hover' : testKeyStatus === 'error' ? 'bg-sev-critical-bg/50' : 'bg-slate-800/50'}`}>
                  {testKeyStatus === 'success' ? (
                    <CheckCircle2 className="w-5 h-5 text-accent-success" />
                  ) : testKeyStatus === 'error' ? (
                    <XCircle className="w-5 h-5 text-sev-critical-text" />
                  ) : (
                    <WifiOff className="w-5 h-5 text-slate-500" />
                  )}
                </div>
                <div className="flex-1">
                  <p className={`text-sm font-medium ${testKeyStatus === 'success' ? 'text-accent-success' : testKeyStatus === 'error' ? 'text-sev-critical-text' : 'text-slate-400'}`}>
                    IA DeepSeek
                  </p>
                  <p className="text-xs text-slate-500">
                    La clave API se configura en el servidor. No se requiere configuración manual.
                  </p>
                </div>
                <Badge className={`${testKeyStatus === 'success' ? 'bg-app-surface-hover text-accent-success' : testKeyStatus === 'error' ? 'bg-sev-critical-bg text-sev-critical-text' : 'bg-slate-700 text-slate-300'} text-[10px]`}>
                  {testKeyStatus === 'success' ? 'Conectada' : testKeyStatus === 'error' ? 'Desconectada' : 'Sin verificar'}
                </Badge>
              </div>

              {/* Test Connection Button */}
              <div className="flex items-center gap-3">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleTestConnection}
                  disabled={testKeyLoading}
                  className="border-app-border text-slate-300 hover:bg-app-surface-hover hover:text-white"
                >
                  {testKeyLoading ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Probando...</>
                  ) : (
                    <><Wifi className="w-4 h-4 mr-2" />Probar Conexión</>
                  )}
                </Button>
                {testKeyStatus === 'success' && (
                  <span className="text-sm text-accent-success flex items-center gap-1">
                    <CheckCircle2 className="w-4 h-4" /> Conexión exitosa
                  </span>
                )}
                {testKeyStatus === 'error' && (
                  <span className="text-sm text-sev-critical-text flex items-center gap-1">
                    <XCircle className="w-4 h-4" /> Error de conexión
                  </span>
                )}
              </div>
            </div>

            {/* Info note */}
            <div className="p-3 rounded-lg bg-app-bg border border-app-border">
              <div className="flex items-start gap-2">
                <Info className="w-4 h-4 text-slate-500 mt-0.5 shrink-0" />
                <p className="text-xs text-slate-500 leading-relaxed">
                  El motor de IA DeepSeek se configura mediante variables de entorno en el servidor. Verifica la conexión para confirmar que el servicio está disponible.
                </p>
              </div>
            </div>

            {/* Required Environment Variables Guide */}
            <div className="p-3 rounded-lg bg-sev-medium-bg/30 border border-sev-medium-text/20">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="w-4 h-4 text-sev-medium-text" />
                <p className="text-xs font-medium text-sev-medium-text">Variables de Entorno Requeridas (Vercel)</p>
              </div>
              <p className="text-[10px] text-slate-500 mb-2">Configura estas variables en Vercel → Settings → Environment Variables para que todas las funciones operen:</p>
              <div className="space-y-1.5">
                {[
                  { name: 'AUTH_SECRET', desc: 'Clave de cifrado para autenticación (obligatoria)', required: true },
                  { name: 'DEEPSEEK_API_KEY', desc: 'Clave API de DeepSeek para IA y chat', required: true },
                  { name: 'TELEGRAM_BOT_TOKEN', desc: 'Token del bot de Telegram para alertas', required: false },
                  { name: 'TELEGRAM_CHAT_ID', desc: 'Chat ID para enviar alertas de Telegram', required: false },
                ].map(v => (
                  <div key={v.name} className="flex items-start gap-2 p-1.5 bg-app-bg rounded border border-app-border">
                    <Badge className={`text-[8px] px-1 py-0 h-4 shrink-0 ${v.required ? 'bg-sev-critical-bg text-sev-critical-text' : 'bg-slate-700 text-slate-400'}`}>
                      {v.required ? 'OBLIGATORIA' : 'OPCIONAL'}
                    </Badge>
                    <div>
                      <code className="text-[10px] text-sev-medium-text">{v.name}</code>
                      <p className="text-[9px] text-slate-500">{v.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setSettingsOpen(false)} className="border-app-border text-slate-300">
              Cerrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── MAIN CONTENT ── */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 py-6">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="bg-app-surface border border-app-border flex-wrap h-auto gap-1 p-1">
            <TabsTrigger value="scan" className="data-[state=active]:bg-blue-700 data-[state=active]:text-white text-slate-400">
              <ScanLine className="w-4 h-4 mr-2" />
              Escaneo
            </TabsTrigger>
            <TabsTrigger value="results" className="data-[state=active]:bg-blue-700 data-[state=active]:text-white text-slate-400" disabled={!scanData}>
              <BarChart3 className="w-4 h-4 mr-2" />
              Resultados
            </TabsTrigger>
            <TabsTrigger value="social" className="data-[state=active]:bg-blue-700 data-[state=active]:text-white text-slate-400">
              <Globe className="w-4 h-4 mr-2" />
              Redes Sociales
            </TabsTrigger>
            <TabsTrigger value="telegram" className="data-[state=active]:bg-blue-700 data-[state=active]:text-white text-slate-400">
              <Send className="w-4 h-4 mr-2" />
              Telegram Avanzado
            </TabsTrigger>
            <TabsTrigger value="history" className="data-[state=active]:bg-blue-700 data-[state=active]:text-white text-slate-400">
              <Clock className="w-4 h-4 mr-2" />
              Historial ({pastScans.length})
            </TabsTrigger>
            <TabsTrigger value="alerts" className="data-[state=active]:bg-blue-700 data-[state=active]:text-white text-slate-400">
              <Bell className="w-4 h-4 mr-2" />
              Alertas
            </TabsTrigger>
          </TabsList>

          {/* ────────────────────────────────────────────
              SCAN TAB (includes batch upload section)
          ──────────────────────────────────────────── */}
          <TabsContent value="scan" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

              {/* ── Left Column: Form + Batch Upload ── */}
              <div className="space-y-4">
                {/* Input Form */}
                <Card className="bg-app-surface border border-app-border shadow-sm">
                  <CardHeader>
                    <CardTitle className="text-app-text flex items-center gap-2">
                      <User className="w-5 h-5 text-sev-low-text" />
                      Datos a Escanear
                    </CardTitle>
                    <CardDescription className="text-slate-500">
                      Ingresa los datos que deseas verificar con {selectedEngines.size} motores
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="fullName" className="text-slate-300 text-sm">Nombre Completo *</Label>
                      <div className="relative">
                        <User className="absolute left-3 top-2.5 w-4 h-4 text-slate-600" />
                        <Input id="fullName" placeholder="Juan Perez Garcia" value={fullName} onChange={e => setFullName(e.target.value)} className="pl-10 bg-app-bg border-app-border text-app-text placeholder:text-slate-600 focus:border-sev-low-bar" />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="cedula" className="text-slate-300 text-sm">Cedula / Documento</Label>
                      <div className="relative">
                        <FileText className="absolute left-3 top-2.5 w-4 h-4 text-slate-600" />
                        <Input id="cedula" placeholder="1234567890" value={cedula} onChange={e => setCedula(e.target.value)} className="pl-10 bg-app-bg border-app-border text-app-text placeholder:text-slate-600 focus:border-sev-low-bar" />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="email" className="text-slate-300 text-sm">Correo Electronico</Label>
                      <div className="relative">
                        <Mail className="absolute left-3 top-2.5 w-4 h-4 text-slate-600" />
                        <Input id="email" type="email" placeholder="correo@ejemplo.com" value={email} onChange={e => setEmail(e.target.value)} className="pl-10 bg-app-bg border-app-border text-app-text placeholder:text-slate-600 focus:border-sev-low-bar" />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="phone" className="text-slate-300 text-sm">Numero de Telefono</Label>
                      <div className="relative">
                        <Phone className="absolute left-3 top-2.5 w-4 h-4 text-slate-600" />
                        <Input id="phone" placeholder="+57 300 1234567" value={phone} onChange={e => setPhone(e.target.value)} className="pl-10 bg-app-bg border-app-border text-app-text placeholder:text-slate-600 focus:border-sev-low-bar" />
                      </div>
                    </div>

                    {/* Report Format */}
                    <div className="space-y-2">
                      <Label className="text-slate-300 text-sm">Formato del Informe</Label>
                      <div className="flex gap-2">
                        <Button
                          type="button" size="sm"
                          variant={reportFormat === 'pdf' ? 'default' : 'outline'}
                          onClick={() => setReportFormat('pdf')}
                          className={reportFormat === 'pdf' ? 'bg-blue-700 hover:bg-blue-800 text-white' : 'border-app-border text-slate-400 hover:text-white'}
                        >
                          <FileDown className="w-4 h-4 mr-1" /> PDF
                        </Button>
                        <Button
                          type="button" size="sm"
                          variant={reportFormat === 'docx' ? 'default' : 'outline'}
                          onClick={() => setReportFormat('docx')}
                          className={reportFormat === 'docx' ? 'bg-blue-700 hover:bg-blue-800 text-white' : 'border-app-border text-slate-400 hover:text-white'}
                        >
                          <FileText className="w-4 h-4 mr-1" /> DOCX
                        </Button>
                      </div>
                    </div>

                    {error && (
                      <div className="p-3 bg-sev-critical-bg/50 border border-sev-critical-text/20 rounded-lg text-sev-critical-text text-sm">
                        {error}
                      </div>
                    )}

                    <Button onClick={handleScan} disabled={loading} className="w-full bg-blue-700 hover:bg-blue-800 text-white font-semibold" size="lg">
                      {loading ? (
                        <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Escaneando {selectedEngines.size} motores...</>
                      ) : (
                        <><Search className="w-4 h-4 mr-2" />Escanear y Generar {reportFormat.toUpperCase()}</>
                      )}
                    </Button>

                    {/* ── BARRA DE PROGRESO FIJA — siempre visible ── */}
                    <div className="p-3 bg-app-header rounded-lg border border-app-border space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {loading ? (
                            <div className="relative flex items-center justify-center">
                              <div className="w-2 h-2 rounded-full bg-blue-400" />
                              <div className="absolute w-2 h-2 rounded-full bg-blue-400 animate-ping opacity-75" />
                            </div>
                          ) : progress >= 100 ? (
                            <CheckCircle2 className="w-3.5 h-3.5 text-accent-success" />
                          ) : (
                            <ScanLine className="w-3.5 h-3.5 text-slate-500" />
                          )}
                          <span className="text-[11px] font-semibold tracking-wide">
                            {loading
                              ? (progress < 20 ? 'Conectando motores...' : progress < 90 ? `Escaneando ${selectedEngines.size} motores...` : 'Procesando resultados...')
                              : progress >= 100
                                ? <span className="text-accent-success">Escaneo completado</span>
                                : <span className="text-slate-500">Listo para escanear</span>
                            }
                          </span>
                        </div>
                        <span className={`text-xs font-bold tabular-nums ${
                          progress >= 100 ? 'text-accent-success' : progress > 0 ? 'text-sev-low-text' : 'text-slate-500'
                        }`}>
                          {Math.round(progress)}%
                        </span>
                      </div>
                      <div className="relative h-3 bg-app-surface rounded-full overflow-hidden border border-app-border">
                        <div
                          className="absolute inset-y-0 left-0 rounded-full transition-all duration-700 ease-out"
                          style={{
                            width: progress > 0 ? `${progress}%` : '100%',
                            background: progress >= 100
                              ? 'linear-gradient(90deg, #059669, #10b981, #34d399)'
                              : progress > 0
                                ? 'linear-gradient(90deg, #1d4ed8, #3b82f6, #60a5fa)'
                                : 'linear-gradient(90deg, hsl(var(--app-border)), hsl(var(--app-surface-hover)))',
                            opacity: progress > 0 ? 1 : 0.4,
                          }}
                        >
                          {progress > 0 && progress < 100 && (
                            <div className="absolute inset-0 opacity-30" style={{
                              backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 6px, rgba(255,255,255,0.15) 6px, rgba(255,255,255,0.15) 12px)',
                              backgroundSize: '24px 24px',
                              animation: 'moveStripes 1s linear infinite',
                            }} />
                          )}
                          {progress > 0 && progress < 100 && (
                            <div className="absolute right-0 inset-y-0 w-8 bg-gradient-to-l from-white/30 to-transparent" />
                          )}
                          {progress >= 100 && (
                            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent animate-[shimmer_2s_infinite]" />
                          )}
                        </div>
                      </div>
                      {/* Step indicators */}
                      <div className="flex items-center justify-between px-0.5">
                        {[
                          { label: 'Conectar', threshold: 15 },
                          { label: 'Consultar', threshold: 50 },
                          { label: 'Recibir', threshold: 85 },
                          { label: 'Procesar', threshold: 95 },
                          { label: 'Listo', threshold: 100 },
                        ].map((step, idx) => {
                          const reached = progress >= step.threshold;
                          const current = !reached && progress >= (idx > 0 ? [15, 50, 85, 95, 100][idx - 1] : 0);
                          return (
                            <div key={step.label} className="flex flex-col items-center gap-0.5">
                              <div className={`w-1.5 h-1.5 rounded-full transition-all duration-500 ${
                                reached
                                  ? progress >= 100 ? 'bg-accent-success' : 'bg-sev-low-bar'
                                  : current ? 'bg-accent-primary/30' : 'bg-app-border'
                              }`} />
                              <span className={`text-[8px] leading-none transition-colors duration-300 ${
                                reached ? (progress >= 100 ? 'text-accent-success' : 'text-accent-primary') : 'text-slate-600'
                              }`}>
                                {step.label}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {scanData && (
                      <div className="flex gap-2">
                        <Button onClick={() => handleDownloadReport(scanData.scanId, 'pdf')} className="flex-1 bg-app-surface-hover hover:bg-app-surface-active text-app-text border border-app-border">
                          <Download className="w-4 h-4 mr-2" />PDF
                        </Button>
                        <Button onClick={() => handleDownloadReport(scanData.scanId, 'docx')} className="flex-1 bg-app-surface-hover hover:bg-app-surface-active text-app-text border border-app-border">
                          <Download className="w-4 h-4 mr-2" />DOCX
                        </Button>
                        <Button onClick={() => handleDownloadBothReports(scanData.scanId)} className="flex-1 bg-blue-700 hover:bg-blue-800 text-white">
                          <FileDown className="w-4 h-4 mr-2" />Ambos
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Batch Upload Section (merged into Scan tab) */}
                <Card className="bg-app-surface border border-app-border shadow-sm">
                  <CardHeader>
                    <CardTitle className="text-app-text flex items-center gap-2 text-sm">
                      <Upload className="w-4 h-4 text-sev-low-text" />
                      Zona de análisis de archivos
                    </CardTitle>
                    <CardDescription className="text-slate-500 text-xs">
                      Carga archivos Excel (.xlsx / .xls), CSV o TXT para investigación OSINT individual y cruce de vínculos
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div
                      onDrop={handleDrop}
                      onDragOver={handleDragOver}
                      onDragLeave={handleDragLeave}
                      className={`border-2 border-dashed rounded-lg p-6 text-center transition-all cursor-pointer ${
                        isDragging
                          ? 'border-app-border bg-app-surface-hover'
                          : uploadFile
                            ? 'border-app-border bg-app-surface-hover'
                            : 'border-app-border bg-app-bg hover:border-app-text-muted hover:bg-app-surface'
                      }`}
                      onClick={() => {
                        const input = document.createElement('input');
                        input.type = 'file';
                        input.accept = '.csv,.xlsx,.xls,.txt';
                        input.onchange = (e) => {
                          const file = (e.target as HTMLInputElement).files?.[0];
                          if (file) { setUploadFile(file); setUploadError(null); }
                        };
                        input.click();
                      }}
                    >
                      {uploadFile ? (
                        <div className="space-y-1">
                          <FileSpreadsheet className="w-8 h-8 mx-auto text-sev-low-text" />
                          <p className="text-sm font-medium text-app-text">{uploadFile.name}</p>
                          <p className="text-xs text-slate-500">{(uploadFile.size / 1024).toFixed(1)} KB</p>
                          <Button variant="ghost" size="sm" className="text-sev-critical-text hover:text-sev-critical-text h-6 text-xs" onClick={(e) => { e.stopPropagation(); setUploadFile(null); }}>
                            <XCircle className="w-3 h-3 mr-1" /> Quitar
                          </Button>
                        </div>
                      ) : (
                        <div className="space-y-1">
                          <Upload className="w-8 h-8 mx-auto text-slate-600" />
                          <p className="text-sm text-slate-400">Arrastra tu archivo aquí o haz clic</p>
                          <p className="text-[10px] text-slate-600">.xlsx / .xls / .csv / .txt (máx. 30 personas)</p>
                        </div>
                      )}
                    </div>

                    {uploadError && (
                      <div className="p-2 bg-sev-critical-bg/50 border border-sev-critical-text/20 rounded-lg text-sev-critical-text text-xs">
                        {uploadError}
                      </div>
                    )}

                    <Button onClick={handleFileUpload} disabled={!uploadFile || uploadLoading} className="w-full bg-blue-700 hover:bg-blue-800 text-white font-semibold" size="sm">
                      {uploadLoading ? (
                        <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Procesando...</>
                      ) : (
                        <><Users className="w-4 h-4 mr-2" />Procesar y Analizar</>
                      )}
                    </Button>

                    {/* ── BARRA DE PROGRESO UPLOAD FIJA — siempre visible ── */}
                    <div className="mt-3 p-3 bg-app-header rounded-lg border border-app-border space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {uploadLoading ? (
                            <div className="relative flex items-center justify-center">
                              <div className="w-2 h-2 rounded-full bg-blue-400" />
                              <div className="absolute w-2 h-2 rounded-full bg-blue-400 animate-ping opacity-75" />
                            </div>
                          ) : uploadProgress >= 100 ? (
                            <CheckCircle2 className="w-3.5 h-3.5 text-accent-success" />
                          ) : (
                            <Upload className="w-3.5 h-3.5 text-slate-500" />
                          )}
                          <span className="text-[11px] font-semibold tracking-wide">
                            {uploadLoading
                              ? (uploadStage || 'Procesando...')
                              : uploadProgress >= 100
                                ? <span className="text-accent-success">Procesamiento completado</span>
                                : <span className="text-slate-500">Listo para procesar</span>
                            }
                          </span>
                        </div>
                        <span className={`text-xs font-bold tabular-nums ${
                          uploadProgress >= 100 ? 'text-accent-success' : uploadProgress > 0 ? 'text-sev-low-text' : 'text-slate-500'
                        }`}>
                          {Math.round(uploadProgress)}%
                        </span>
                      </div>

                      <div className="relative h-3 bg-app-surface rounded-full overflow-hidden border border-app-border">
                        <div
                          className="absolute inset-y-0 left-0 rounded-full transition-all duration-700 ease-out"
                          style={{
                            width: uploadProgress > 0 ? `${uploadProgress}%` : '100%',
                            background: uploadProgress >= 100
                              ? 'linear-gradient(90deg, #059669, #10b981, #34d399)'
                              : uploadProgress > 0
                                ? 'linear-gradient(90deg, #1d4ed8, #3b82f6, #60a5fa)'
                                : 'linear-gradient(90deg, hsl(var(--app-border)), hsl(var(--app-surface-hover)))',
                            opacity: uploadProgress > 0 ? 1 : 0.4,
                          }}
                        >
                          {uploadProgress > 0 && uploadProgress < 100 && (
                            <div className="absolute inset-0 opacity-30" style={{
                              backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 6px, rgba(255,255,255,0.15) 6px, rgba(255,255,255,0.15) 12px)',
                              backgroundSize: '24px 24px',
                              animation: 'moveStripes 1s linear infinite',
                            }} />
                          )}
                          {uploadProgress > 0 && uploadProgress < 100 && (
                            <div className="absolute right-0 inset-y-0 w-8 bg-gradient-to-l from-white/30 to-transparent" />
                          )}
                          {uploadProgress >= 100 && (
                            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent animate-[shimmer_2s_infinite]" />
                          )}
                        </div>
                      </div>

                      {/* Stage milestones */}
                      <div className="flex items-center justify-between px-0.5">
                        {[
                          { label: 'Carga', threshold: 10 },
                          { label: 'Análisis', threshold: 30 },
                          { label: 'Escaneo OSINT', threshold: 55 },
                          { label: 'Reportes', threshold: 80 },
                          { label: 'Listo', threshold: 100 },
                        ].map((milestone, idx) => {
                          const reached = uploadProgress >= milestone.threshold;
                          const current = !reached && uploadProgress >= (idx > 0 ? [10, 30, 55, 80, 100][idx - 1] : 0);
                          return (
                            <div key={milestone.label} className="flex flex-col items-center gap-0.5">
                              <div className={`w-1.5 h-1.5 rounded-full transition-all duration-500 ${
                                reached
                                  ? uploadProgress >= 100 ? 'bg-accent-success' : 'bg-sev-low-bar'
                                  : current ? 'bg-accent-primary/30' : 'bg-app-border'
                              }`} />
                              <span className={`text-[8px] leading-none transition-colors duration-300 ${
                                reached ? (uploadProgress >= 100 ? 'text-accent-success' : 'text-accent-primary') : 'text-slate-600'
                              }`}>
                                {milestone.label}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* TXT Analysis Results (entity extraction) */}
                    {txtAnalysis && (
                      <div className="space-y-2 mt-2">
                        <Separator className="bg-app-border" />
                        <div className="p-3 bg-app-surface-hover border border-app-border rounded-lg space-y-2">
                          <div className="flex items-center gap-2">
                            <FileText className="w-4 h-4 text-app-text-dim" />
                            <p className="text-xs font-medium text-app-text-dim">Análisis de Texto — Entidades Extraídas</p>
                          </div>
                          <p className="text-[10px] text-slate-400">{txtAnalysis.intelligenceSummary}</p>

                          {/* Entity stats grid */}
                          <div className="grid grid-cols-5 gap-1.5">
                            {[
                              { label: 'Nombres', value: txtAnalysis.totalEntities.names, icon: User, color: 'text-app-text-dim' },
                              { label: 'Emails', value: txtAnalysis.totalEntities.emails, icon: Mail, color: 'text-sev-low-text' },
                              { label: 'Teléfonos', value: txtAnalysis.totalEntities.phones, icon: Phone, color: 'text-accent-success' },
                              { label: 'Cédulas', value: txtAnalysis.totalEntities.cedulas, icon: Fingerprint, color: 'text-sev-medium-text' },
                              { label: 'IPs', value: txtAnalysis.totalEntities.ips, icon: Globe, color: 'text-sev-critical-text' },
                              { label: 'URLs', value: txtAnalysis.totalEntities.urls, icon: ExternalLink, color: 'text-app-text-dim' },
                              { label: 'Usuarios', value: txtAnalysis.totalEntities.usernames, icon: AtSign, color: 'text-sev-high-text' },
                              { label: 'Direcciones', value: txtAnalysis.totalEntities.addresses, icon: MapPin, color: 'text-app-text-dim' },
                              { label: 'Empresas', value: txtAnalysis.totalEntities.companies, icon: Building2, color: 'text-app-text-dim' },
                              { label: 'Líneas', value: txtAnalysis.totalLines, icon: FileDigit, color: 'text-slate-400' },
                            ].map(stat => (
                              <div key={stat.label} className="flex items-center gap-1 p-1.5 bg-app-bg rounded border border-app-border">
                                <stat.icon className={`w-3 h-3 ${stat.color}`} />
                                <div>
                                  <p className="text-[9px] text-slate-500 leading-none">{stat.label}</p>
                                  <p className={`text-xs font-bold ${stat.color} leading-none`}>{stat.value}</p>
                                </div>
                              </div>
                            ))}
                          </div>

                          {/* Identified persons */}
                          {txtAnalysis.persons.length > 0 && (
                            <ScrollArea className="max-h-40">
                              <div className="space-y-1">
                                {txtAnalysis.persons.map((person, idx) => {
                                  const confColor = person.confidence === 'alta' ? 'text-accent-success bg-app-surface-hover border-app-border' :
                                                    person.confidence === 'media' ? 'text-sev-medium-text bg-sev-medium-bg/50 border-sev-medium-text/20' :
                                                    'text-slate-400 bg-slate-800/20 border-app-border';
                                  return (
                                    <div key={idx} className="p-2 bg-app-bg rounded border border-app-border flex items-center justify-between">
                                      <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-1.5">
                                          <p className="text-[11px] font-medium text-app-text truncate">{person.fullName || 'Sin nombre'}</p>
                                          <span className={`text-[8px] px-1 py-0.5 rounded border ${confColor}`}>{person.confidence}</span>
                                        </div>
                                        <div className="flex items-center gap-2 mt-0.5">
                                          {person.email && <span className="text-[9px] text-sev-low-text truncate">{person.email}</span>}
                                          {person.phone && <span className="text-[9px] text-accent-success">{person.phone}</span>}
                                          {person.cedula && <span className="text-[9px] text-sev-medium-text">{person.cedula}</span>}
                                        </div>
                                        {(person.ips.length > 0 || person.urls.length > 0 || person.usernames.length > 0) && (
                                          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                                            {person.ips.map((ip, i) => <Badge key={i} variant="outline" className="border-sev-critical-text/20 text-sev-critical-text text-[8px] px-1 py-0">{ip}</Badge>)}
                                            {person.usernames.map((u, i) => <Badge key={i} variant="outline" className="border-sev-high-text/20 text-sev-high-text text-[8px] px-1 py-0">{u}</Badge>)}
                                            {person.urls.slice(0, 2).map((u, i) => <Badge key={i} variant="outline" className="border-app-border text-app-text-dim text-[8px] px-1 py-0 truncate max-w-24">{u.replace(/^https?:\/\//, '').substring(0, 25)}</Badge>)}
                                          </div>
                                        )}
                                      </div>
                                      {person.lineNumber > 0 && (
                                        <span className="text-[8px] text-slate-600 ml-1 shrink-0">L{person.lineNumber}</span>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            </ScrollArea>
                          )}

                          {/* Unlinked entities */}
                          {(txtAnalysis.unlinkedEntities.ips.length > 0 || txtAnalysis.unlinkedEntities.urls.length > 0 || txtAnalysis.unlinkedEntities.usernames.length > 0 || txtAnalysis.unlinkedEntities.companies.length > 0) && (
                            <div className="space-y-1">
                              <p className="text-[10px] text-slate-500 font-medium">Entidades sin vincular a persona:</p>
                              <div className="flex flex-wrap gap-1">
                                {txtAnalysis.unlinkedEntities.ips.map((ip, i) => <Badge key={`ip-${i}`} variant="outline" className="border-sev-critical-text/20 text-sev-critical-text text-[9px]">IP: {ip}</Badge>)}
                                {txtAnalysis.unlinkedEntities.urls.map((url, i) => <Badge key={`url-${i}`} variant="outline" className="border-app-border text-app-text-dim text-[9px] truncate max-w-36">URL: {url.replace(/^https?:\/\//, '').substring(0, 30)}</Badge>)}
                                {txtAnalysis.unlinkedEntities.usernames.map((u, i) => <Badge key={`u-${i}`} variant="outline" className="border-sev-high-text/20 text-sev-high-text text-[9px]">{u}</Badge>)}
                                {txtAnalysis.unlinkedEntities.companies.map((c, i) => <Badge key={`c-${i}`} variant="outline" className="border-app-border text-app-text-dim text-[9px]">{c}</Badge>)}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Batch Results (compact inline) */}
                    {batchResults && batchResults.length > 0 && (
                      <div className="space-y-2 mt-2">
                        <Separator className="bg-app-border" />
                        <p className="text-xs font-medium text-slate-400">{batchResults.length} persona(s) procesada(s)</p>
                        <ScrollArea className="max-h-48">
                          <div className="space-y-2">
                            {batchResults.map((result, idx) => {
                              const s = result.summary || { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
                              const totalRisk = Math.min(100, s.critical * 30 + s.high * 15 + s.medium * 5 + s.low * 2);
                              const rLabel = totalRisk >= 70 ? 'CRITICO' : totalRisk >= 40 ? 'ALTO' : totalRisk >= 15 ? 'MODERADO' : 'BAJO';
                              const rColor = totalRisk >= 70 ? 'text-sev-critical-text' : totalRisk >= 40 ? 'text-sev-high-text' : totalRisk >= 15 ? 'text-sev-medium-text' : 'text-accent-success';

                              return (
                                <div key={idx} className="p-3 bg-app-bg rounded-lg border border-app-border">
                                  <div className="flex items-center justify-between">
                                    <div className="flex-1 min-w-0">
                                      <p className="text-xs font-medium text-app-text">{result.fullName || result.sheetName || `Resultado ${idx + 1}`}</p>
                                      <div className="flex items-center gap-2 mt-1">
                                        <Badge variant="outline" className="border-app-border text-slate-400 text-[10px]">{result.totalResults || result.rowCount || 0} hallazgos</Badge>
                                        <span className={`text-[10px] font-bold ${rColor}`}>{rLabel}</span>
                                      </div>
                                    </div>
                                    <div className="flex gap-1.5 ml-2">
                                      <Button size="sm" variant="ghost" className="text-slate-400 hover:text-white h-7 w-7 p-0" onClick={() => handleViewPastScan(result.scanId)}>
                                        <Eye className="w-3.5 h-3.5" />
                                      </Button>
                                      <Button size="sm" className="bg-blue-700 hover:bg-blue-800 text-white h-7 text-[10px] px-2" onClick={() => handleDownloadReport(result.scanId, 'pdf')}>
                                        <Download className="w-3 h-3" />
                                      </Button>
                                      <Button size="sm" variant="outline" className="border-app-border text-slate-400 hover:text-white h-7 text-[10px] px-2" onClick={() => handleDownloadReport(result.scanId, 'docx')}>
                                        <FileText className="w-3 h-3" />
                                      </Button>
                                      <Button size="sm" className="bg-accent-primary hover:bg-accent-primary/90 text-accent-primary-text h-7 text-[10px] px-2" onClick={() => handleDownloadBothReports(result.scanId)}>
                                        <FileDown className="w-3 h-3" />
                                      </Button>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </ScrollArea>

                        {/* Joint Analysis Banner */}
                        {relationshipAnalysis && jointAnalysisId && (
                          <div className="p-3 bg-app-surface-hover border border-app-border rounded-lg">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <GitBranch className="w-4 h-4 text-app-text-dim" />
                                <div>
                                  <p className="text-xs font-medium text-app-text-dim">Vinculos: {relationshipAnalysis.totalLinks}</p>
                                  <p className="text-[10px] text-app-text-dim">{relationshipAnalysis.sheet1Name} ↔ {relationshipAnalysis.sheet2Name}</p>
                                </div>
                              </div>
                              <div className="flex gap-1.5">
                                <Button size="sm" className="bg-accent-primary hover:bg-accent-primary/90 text-accent-primary-text h-7 text-[10px]" onClick={() => handleDownloadJointReport(jointAnalysisId, 'pdf')}>
                                  <Download className="w-3 h-3 mr-1" />PDF
                                </Button>
                                <Button size="sm" className="bg-app-surface-hover hover:bg-app-surface-hover text-app-text-dim border border-app-border h-7 text-[10px]" onClick={() => handleDownloadJointReport(jointAnalysisId, 'docx')}>
                                  <FileSpreadsheet className="w-3 h-3 mr-1" />DOCX
                                </Button>
                                <Button size="sm" className="bg-accent-primary hover:bg-accent-primary/90 text-accent-primary-text h-7 text-[10px]" onClick={() => handleDownloadBothJointReports(jointAnalysisId)}>
                                  <FileDown className="w-3 h-3 mr-1" />Ambos
                                </Button>
                              </div>
                            </div>

                            {/* Relationship links inline (compact) */}
                            {relationshipAnalysis.links.length > 0 && (
                              <ScrollArea className="max-h-48 mt-2">
                                <div className="space-y-1.5">
                                  {filteredLinks.map((link, idx) => {
                                    const config = linkTypeConfig[link.type] || linkTypeConfig.dato_compartido;
                                    const Icon = config.icon;
                                    const isExpanded = expandedLink === `${idx}`;

                                    return (
                                      <div
                                        key={idx}
                                        className={`p-2 rounded-md border cursor-pointer transition-colors ${config.bgColor} hover:bg-app-surface-hover`}
                                        onClick={() => setExpandedLink(isExpanded ? null : `${idx}`)}
                                      >
                                        <div className="flex items-center gap-2">
                                          <Icon className={`w-3 h-3 ${config.color} shrink-0`} />
                                          <p className="text-[10px] text-app-text flex-1 min-w-0 truncate">
                                            <span className="text-sev-low-text">{link.sheet1Person}</span>
                                            <span className="text-slate-500 mx-1">↔</span>
                                            <span className="text-app-text-dim">{link.sheet2Person}</span>
                                          </p>
                                          <Badge className={`${config.color.replace('text-', 'bg-').replace('-400', '-800/40')} text-white text-[8px] px-1`}>
                                            {config.label}
                                          </Badge>
                                        </div>
                                        {isExpanded && (
                                          <div className="mt-1.5 pl-5">
                                            <p className="text-[10px] text-slate-400">{link.description}</p>
                                            <p className="text-[9px] text-slate-500 mt-0.5">Campo: {link.matchedField} | Valor: &quot;{link.matchedValue}&quot;</p>
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              </ScrollArea>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* ── Right Column: Engine Grid ── */}
              <div className="space-y-4">
                <Card className="bg-app-surface border border-app-border shadow-sm">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-app-text flex items-center gap-2">
                        <Database className="w-5 h-5 text-sev-low-text" />
                        Motores de Busqueda
                      </CardTitle>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-500">{selectedEngines.size}/{TOTAL_ENGINES}</span>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={toggleAllEngines}
                          className="border-app-border text-slate-400 hover:bg-app-surface-hover text-xs h-7"
                        >
                          {selectedEngines.size === TOTAL_ENGINES ? 'Ninguno' : 'Todos'}
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {/* Categorized Engines */}
                    {engineCategories.map(category => {
                      const engineNames = category.engines.map(e => e.name);
                      const allCatSelected = engineNames.every(n => selectedEngines.has(n));
                      const someCatSelected = engineNames.some(n => selectedEngines.has(n));

                      return (
                        <div key={category.id} className="mb-4 last:mb-0">
                          {/* Category Header */}
                          <div
                            className="flex items-center gap-2 mb-2 cursor-pointer group"
                            onClick={() => toggleCategory(engineNames)}
                          >
                            <Checkbox
                              checked={allCatSelected ? true : someCatSelected ? 'indeterminate' : false}
                              onCheckedChange={() => toggleCategory(engineNames)}
                              className="border-app-text-muted data-[state=checked]:bg-sev-low-bar data-[state=checked]:border-sev-low-bar"
                            />
                            <span className={`text-xs font-semibold group-hover:brightness-125 transition-colors ${getCategoryColor(category.color)}`}>
                              {category.label.toUpperCase()} ({category.engines.length})
                            </span>
                          </div>

                          {/* Engine Cards */}
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {category.engines.map(engine => {
                              const isSelected = selectedEngines.has(engine.name);
                              const EngineIcon = engine.icon;

                              return (
                                <div
                                  key={engine.name}
                                  className={`group flex items-start gap-2 p-2.5 rounded-lg border cursor-pointer transition-colors duration-200 ${
                                    isSelected
                                      ? `${getCategoryColor(category.color, 'bg')} ${getCategoryColor(category.color, 'border')}`
                                      : 'bg-app-bg border-app-border opacity-50 hover:opacity-80 hover:border-app-text-muted'
                                  }`}
                                  onClick={() => toggleEngine(engine.name)}
                                >
                                  <div className={`mt-0.5 shrink-0 w-7 h-7 rounded-md flex items-center justify-center transition-colors ${
                                    isSelected ? 'bg-app-bg' : 'bg-slate-800/30'
                                  }`}>
                                    <EngineIcon className={`w-3.5 h-3.5 transition-colors ${
                                      isSelected ? getCategoryColor(category.color) : 'text-slate-600 group-hover:text-slate-400'
                                    }`} />
                                  </div>

                                  <div className="min-w-0 flex-1">
                                    <p className={`text-xs font-semibold truncate ${isSelected ? 'text-app-text' : 'text-slate-500'}`}>
                                      {engine.name}
                                    </p>
                                    <p className={`text-[10px] truncate ${isSelected ? 'text-slate-300' : 'text-slate-600'}`}>{engine.desc}</p>
                                  </div>

                                  {/* Check indicator */}
                                  <div className={`mt-0.5 shrink-0 w-4 h-4 rounded border-2 flex items-center justify-center transition-colors ${
                                    isSelected
                                      ? 'bg-sev-low-bar border-sev-low-bar'
                                      : 'border-app-text-muted bg-transparent'
                                  }`}>
                                    {isSelected && <Check className="w-2.5 h-2.5 text-white" />}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </CardContent>
                </Card>
              </div>
            </div>

          </TabsContent>

          {/* ────────────────────────────────────────────
              RESULTS TAB
          ──────────────────────────────────────────── */}
          <TabsContent value="results" className="space-y-6">
            {scanData && (
              <>
                {/* Risk Score + Download Buttons */}
                <Card className="bg-app-surface border border-app-border shadow-sm">
                  <CardContent className="p-6">
                    <div className="flex flex-col sm:flex-row items-center gap-6">
                      {/* Risk Gauge */}
                      <RiskGauge score={riskScore} label={riskLabel} color={riskColor} />

                      {/* Summary Cards */}
                      <div className="flex-1 grid grid-cols-2 sm:grid-cols-3 gap-3 w-full">
                        <div className="p-3 bg-app-bg rounded-lg border border-app-border text-center cursor-pointer hover:opacity-80 transition-opacity" onClick={() => setDetailModal({ open: true, title: 'Todos los Hallazgos', items: scanData.results.map(r => ({ title: r.title, description: r.description || r.dataFound || 'Sin descripción', source: r.source })) })}>
                          <p className="text-2xl font-bold text-app-text">{scanData.totalResults}</p>
                          <p className="text-xs text-slate-500">Total</p>
                        </div>
                        <div className="p-3 bg-sev-critical-bg/50 rounded-lg border border-sev-critical-text/20 text-center cursor-pointer hover:opacity-80 transition-opacity" onClick={() => setDetailModal({ open: true, title: 'Hallazgos Críticos', items: scanData.results.filter(r => r.severity === 'critical').map(r => ({ title: r.title, description: r.description || r.dataFound || 'Sin descripción', source: r.source })) })}>
                          <p className="text-2xl font-bold text-sev-critical-text">{scanData.summary.critical}</p>
                          <p className="text-xs text-slate-500">Criticos</p>
                        </div>
                        <div className="p-3 bg-sev-high-bg/50 rounded-lg border border-sev-high-text/20 text-center cursor-pointer hover:opacity-80 transition-opacity" onClick={() => setDetailModal({ open: true, title: 'Hallazgos Altos', items: scanData.results.filter(r => r.severity === 'high').map(r => ({ title: r.title, description: r.description || r.dataFound || 'Sin descripción', source: r.source })) })}>
                          <p className="text-2xl font-bold text-sev-high-text">{scanData.summary.high}</p>
                          <p className="text-xs text-slate-500">Altos</p>
                        </div>
                        <div className="p-3 bg-sev-medium-bg/50 rounded-lg border border-sev-medium-text/20 text-center cursor-pointer hover:opacity-80 transition-opacity" onClick={() => setDetailModal({ open: true, title: 'Hallazgos Medios', items: scanData.results.filter(r => r.severity === 'medium').map(r => ({ title: r.title, description: r.description || r.dataFound || 'Sin descripción', source: r.source })) })}>
                          <p className="text-2xl font-bold text-sev-medium-text">{scanData.summary.medium}</p>
                          <p className="text-xs text-slate-500">Medios</p>
                        </div>
                        <div className="p-3 bg-sev-low-bg/50 rounded-lg border border-sev-low-text/20 text-center cursor-pointer hover:opacity-80 transition-opacity" onClick={() => setDetailModal({ open: true, title: 'Hallazgos Bajos', items: scanData.results.filter(r => r.severity === 'low').map(r => ({ title: r.title, description: r.description || r.dataFound || 'Sin descripción', source: r.source })) })}>
                          <p className="text-2xl font-bold text-sev-low-text">{scanData.summary.low}</p>
                          <p className="text-xs text-slate-500">Bajos</p>
                        </div>
                        <div className="p-3 bg-slate-800/30 rounded-lg border border-app-border text-center cursor-pointer hover:opacity-80 transition-opacity" onClick={() => setDetailModal({ open: true, title: 'Hallazgos Informativos', items: scanData.results.filter(r => r.severity === 'info').map(r => ({ title: r.title, description: r.description || r.dataFound || 'Sin descripción', source: r.source })) })}>
                          <p className="text-2xl font-bold text-slate-400">{scanData.summary.info}</p>
                          <p className="text-xs text-slate-500">Info</p>
                        </div>
                      </div>
                    </div>

                    {/* Download Buttons */}
                    <div className="flex items-center justify-center gap-3 mt-6 pt-4 border-t border-app-border">
                      <span className="text-sm text-slate-400">Descargar Informe:</span>
                      <Button onClick={() => handleDownloadReport(scanData.scanId, 'pdf')} className="bg-blue-700 hover:bg-blue-800 text-white">
                        <Download className="w-4 h-4 mr-2" />PDF
                      </Button>
                      <Button onClick={() => handleDownloadReport(scanData.scanId, 'docx')} className="bg-app-surface-hover hover:bg-app-surface-active text-app-text border border-app-border">
                        <Download className="w-4 h-4 mr-2" />DOCX
                      </Button>
                      <Button onClick={() => handleDownloadBothReports(scanData.scanId)} className="bg-accent-primary hover:bg-accent-primary/90 text-accent-primary-text">
                        <FileDown className="w-4 h-4 mr-2" />PDF + DOCX
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                {/* Severity Filter Buttons */}
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm text-slate-500">Filtrar:</span>
                  <Button size="sm" variant={filterSeverity === 'all' ? 'default' : 'outline'} onClick={() => setFilterSeverity('all')} className={filterSeverity === 'all' ? 'bg-sev-low-bar text-white' : 'border-app-border text-slate-400'}>
                    Todos ({scanData.totalResults})
                  </Button>
                  {Object.entries(severityBadgeConfig).map(([key, config]) => {
                    const count = scanData.summary[key as keyof ScanSummary];
                    if (count === 0) return null;
                    return (
                      <Button key={key} size="sm" variant={filterSeverity === key ? 'default' : 'outline'} onClick={() => setFilterSeverity(key)} className={filterSeverity === key ? `${config.color} border-0` : 'border-app-border text-slate-400'}>
                        {config.label} ({count})
                      </Button>
                    );
                  })}
                </div>

                {/* Results grouped by source */}
                <ScrollArea className="max-h-[600px]">
                  <div className="space-y-2">
                    {Object.entries(groupedResults).map(([source, results]) => {
                      const isOpen = expandedGroups.has(source);
                      const maxSeverity = results.reduce((max, r) => {
                        const order = ['critical', 'high', 'medium', 'low', 'info'];
                        return order.indexOf(r.severity) < order.indexOf(max) ? r.severity : max;
                      }, 'info' as ScanResult['severity']);
                      const maxConfig = severityBadgeConfig[maxSeverity];

                      return (
                        <Collapsible key={source} open={isOpen} onOpenChange={() => toggleGroup(source)}>
                          <Card className="bg-app-surface border border-app-border shadow-sm overflow-hidden">
                            <CollapsibleTrigger asChild>
                              <div className="p-4 flex items-center gap-3 cursor-pointer hover:bg-app-surface-hover transition-colors">
                                <div className={`p-1.5 rounded-md ${maxConfig.color} shrink-0`}>
                                  <maxConfig.icon className="w-4 h-4" />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2">
                                    <p className="text-sm font-medium text-app-text truncate">{source}</p>
                                    <Badge className={`${maxConfig.color} text-xs`}>{maxConfig.label}</Badge>
                                  </div>
                                  <p className="text-xs text-slate-500">{results.length} hallazgo{results.length !== 1 ? 's' : ''}</p>
                                </div>
                                {isOpen ? <ChevronUp className="w-4 h-4 text-slate-600 shrink-0" /> : <ChevronDown className="w-4 h-4 text-slate-600 shrink-0" />}
                              </div>
                            </CollapsibleTrigger>
                            <CollapsibleContent>
                              <div className="border-t border-app-border">
                                {results.map((result, idx) => {
                                  const config = severityBadgeConfig[result.severity];
                                  const Icon = config.icon;
                                  const isExpanded = expandedResult === `${source}-${idx}`;
                                  return (
                                    <div
                                      key={idx}
                                      className="p-3 pl-6 border-b border-app-border/50 last:border-b-0 cursor-pointer hover:bg-app-surface-hover/50 transition-colors"
                                      onClick={() => setExpandedResult(isExpanded ? null : `${source}-${idx}`)}
                                    >
                                      <div className="flex items-start gap-2">
                                        <Badge className={`${config.color} text-[10px] shrink-0`}>{config.label}</Badge>
                                        <div className="flex-1 min-w-0">
                                          <p className="text-sm text-app-text break-words">{result.title}</p>
                                          {isExpanded && result.description && (
                                            <p className="text-sm text-slate-400 mt-1 break-words">{result.description}</p>
                                          )}
                                          {isExpanded && result.dataFound && (
                                            <p className="text-xs text-slate-500 mt-1 break-words">Datos: {result.dataFound}</p>
                                          )}
                                          <div className="flex items-center gap-2 mt-1">
                                            <Badge variant="outline" className="border-app-border text-slate-500 text-[10px]">
                                              {categoryLabels[result.category] || result.category}
                                            </Badge>
                                            {isExpanded && result.url && (
                                              <a href={result.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-sev-low-text hover:text-accent-primary" onClick={e => e.stopPropagation()}>
                                                <ExternalLink className="w-3 h-3" />Ver fuente
                                              </a>
                                            )}
                                          </div>
                                        </div>
                                        {isExpanded ? <ChevronUp className="w-3 h-3 text-slate-600 shrink-0 mt-1" /> : <ChevronDown className="w-3 h-3 text-slate-600 shrink-0 mt-1" />}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </CollapsibleContent>
                          </Card>
                        </Collapsible>
                      );
                    })}
                    {Object.keys(groupedResults).length === 0 && (
                      <div className="text-center py-12 text-slate-600">
                        <ShieldCheck className="w-12 h-12 mx-auto mb-3 text-accent-success" />
                        <p className="text-lg font-medium">No se encontraron hallazgos</p>
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </>
            )}
          </TabsContent>

          {/* ────────────────────────────────────────────
              SOCIAL MEDIA TAB
          ──────────────────────────────────────────── */}
          <TabsContent value="social" className="space-y-6">
            {/* Summary Header */}
            {socialScanData && (
              <Card className="bg-app-surface border border-app-border shadow-sm">
                <CardContent className="p-6">
                  <div className="flex flex-col md:flex-row items-center gap-6">
                    <div className="flex-1 w-full">
                      <div className="flex items-center gap-3 mb-4">
                        <div className="p-2 bg-app-bg rounded-lg border border-app-border">
                          <Globe className="w-5 h-5 text-sev-low-text" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <h2 className="text-lg font-bold text-app-text">Investigación de Redes Sociales</h2>
                            {socialScanData.searchMode && (
                              <Badge className={`text-[9px] ${
                                socialScanData.searchMode === 'nickname'
                                  ? 'bg-app-surface-hover text-app-text-dim border border-app-border'
                                  : socialScanData.searchMode === 'email'
                                  ? 'bg-app-surface-hover text-app-text-dim border border-app-border'
                                  : 'bg-sev-low-bg text-sev-low-text border border-sev-low-text/20'
                              }`}>
                                {socialScanData.searchMode === 'nickname' && <AtSign className="w-3 h-3" />}
                                {socialScanData.searchMode === 'email' && <Mail className="w-3 h-3" />}
                                {socialScanData.searchMode === 'name' && <User className="w-3 h-3" />}
                                {socialScanData.searchMode === 'nickname' ? 'NickName' : socialScanData.searchMode === 'email' ? 'Correo' : 'Nombre'}
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-slate-400">
                            {socialScanData.platformsScanned.length} plataformas escaneadas
                            {socialScanData.searchQuery && <span className="text-slate-500"> · Consulta: <span className="text-slate-300">{socialScanData.searchQuery}</span></span>}
                          </p>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
                        <div className="p-3 bg-app-bg rounded-lg border border-app-border text-center cursor-pointer hover:opacity-80 transition-opacity" onClick={() => setDetailModal({ open: true, title: 'Perfiles Encontrados', items: socialScanData.results.filter(r => r.profileFound).map(r => ({ title: r.platform, description: r.profileFound ? `Perfil detectado${r.username ? ': @' + r.username : ''}${r.profileVerified ? ' (Verificado)' : ''}` : 'Sin perfil', platform: r.platform })) })}>
                          <p className="text-2xl font-bold text-sev-low-text">{socialScanData.summary.profilesFound}</p>
                          <p className="text-[10px] text-slate-500 font-medium">Perfiles Encontrados</p>
                        </div>
                        <div className="p-3 bg-app-bg rounded-lg border border-app-border text-center cursor-pointer hover:opacity-80 transition-opacity" onClick={() => setDetailModal({ open: true, title: 'Hallazgos Totales', items: socialScanData.results.flatMap(r => r.findings.map(f => ({ title: f.title, description: f.description || 'Sin descripción', platform: r.platform }))) })}>
                          <p className="text-2xl font-bold text-app-text">{socialScanData.summary.totalFindings}</p>
                          <p className="text-[10px] text-slate-500 font-medium">Hallazgos Totales</p>
                        </div>
                        <div className="p-3 bg-sev-critical-bg/30 rounded-lg border border-sev-critical-text/20 text-center cursor-pointer hover:opacity-80 transition-opacity" onClick={() => setDetailModal({ open: true, title: 'Hallazgos Críticos y Altos', items: socialScanData.results.flatMap(r => r.findings.filter(f => f.severity === 'critical' || f.severity === 'high').map(f => ({ title: f.title, description: f.description || 'Sin descripción', platform: r.platform }))) })}>
                          <p className="text-2xl font-bold text-sev-critical-text">{socialScanData.summary.critical + socialScanData.summary.high}</p>
                          <p className="text-[10px] text-slate-500 font-medium">Críticos</p>
                        </div>
                        <div className="p-3 bg-sev-medium-bg/30 rounded-lg border border-sev-medium-text/20 text-center cursor-pointer hover:opacity-80 transition-opacity" onClick={() => setDetailModal({ open: true, title: 'Hallazgos Medios', items: socialScanData.results.flatMap(r => r.findings.filter(f => f.severity === 'medium').map(f => ({ title: f.title, description: f.description || 'Sin descripción', platform: r.platform }))) })}>
                          <p className="text-2xl font-bold text-sev-medium-text">{socialScanData.summary.medium}</p>
                          <p className="text-[10px] text-slate-500 font-medium">Medios</p>
                        </div>
                      </div>

                      {/* Social Report Download Buttons */}
                      <div className="flex gap-2 mt-3">
                        <Button
                          onClick={handleDownloadSocialReport}
                          disabled={socialReportLoading}
                          className="bg-blue-700 hover:bg-blue-800 text-white text-xs h-8"
                        >
                          {socialReportLoading ? (
                            <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Generando...</>
                          ) : (
                            <><Download className="w-3.5 h-3.5 mr-1.5" />PDF</>
                          )}
                        </Button>
                        <Button
                          onClick={handleDownloadSocialDocxReport}
                          disabled={socialReportLoading}
                          className="bg-app-surface-hover hover:bg-app-surface-active text-app-text border border-app-border text-xs h-8"
                        >
                          {socialReportLoading ? (
                            <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Generando...</>
                          ) : (
                            <><FileSpreadsheet className="w-3.5 h-3.5 mr-1.5" />DOCX</>
                          )}
                        </Button>
                        <Button
                          onClick={handleDownloadBothSocialReports}
                          disabled={socialReportLoading}
                          className="bg-accent-primary hover:bg-accent-primary/90 text-accent-primary-text text-xs h-8"
                        >
                          {socialReportLoading ? (
                            <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Generando...</>
                          ) : (
                            <><FileDown className="w-3.5 h-3.5 mr-1.5" />Ambos</>
                          )}
                        </Button>
                      </div>
                    </div>

                    {/* Social Risk Gauge */}
                    <div className="shrink-0">
                      {(() => {
                        const socialRiskScore = Math.min(100,
                          socialScanData.summary.profilesFound * 12 +
                          socialScanData.summary.critical * 25 +
                          socialScanData.summary.high * 12 +
                          socialScanData.summary.medium * 5 +
                          socialScanData.summary.low * 2
                        );
                        const socialRiskLabel = socialRiskScore >= 70 ? 'CRÍTICO' : socialRiskScore >= 40 ? 'ALTO' : socialRiskScore >= 15 ? 'MODERADO' : 'BAJO';
                        const socialRiskColor = socialRiskScore >= 70 ? 'text-sev-critical-text' : socialRiskScore >= 40 ? 'text-sev-high-text' : socialRiskScore >= 15 ? 'text-sev-medium-text' : 'text-accent-success';
                        return <RiskGauge score={socialRiskScore} label={`Riesgo Social: ${socialRiskLabel}`} color={socialRiskColor} />;
                      })()}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Left Column: Search Form + Platform Selector */}
              <div className="lg:col-span-5 space-y-4">
                <Card className="bg-app-surface border border-app-border shadow-sm">
                  <CardHeader>
                    <CardTitle className="text-app-text flex items-center gap-2">
                      <Globe className="w-5 h-5 text-sev-low-text" />
                      Búsqueda en Redes Sociales
                    </CardTitle>
                    <CardDescription className="text-slate-500">
                      Escanea la presencia digital en {selectedSocialPlatforms.size || 0} plataformas
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {/* Search Mode Selector */}
                    <div className="space-y-2">
                      <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Modo de Búsqueda</p>
                      <div className="grid grid-cols-3 gap-2">
                        <button
                          type="button"
                          onClick={() => { setSocialSearchMode('nickname'); setSocialName(''); setSocialEmail(''); }}
                          className={`flex flex-col items-center gap-1 p-2.5 rounded-lg border transition-colors ${
                            socialSearchMode === 'nickname'
                              ? 'bg-app-surface-hover border-app-border'
                              : 'bg-app-bg border-app-border hover:border-app-border'
                          }`}
                        >
                          <AtSign className={`w-4 h-4 ${socialSearchMode === 'nickname' ? 'text-app-text-dim' : 'text-slate-500'}`} />
                          <span className={`text-[10px] font-bold ${socialSearchMode === 'nickname' ? 'text-app-text-dim' : 'text-slate-500'}`}>NickName</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => { setSocialSearchMode('email'); setSocialNickname(''); setSocialName(''); }}
                          className={`flex flex-col items-center gap-1 p-2.5 rounded-lg border transition-colors ${
                            socialSearchMode === 'email'
                              ? 'bg-app-surface-hover border-app-border'
                              : 'bg-app-bg border-app-border hover:border-app-border'
                          }`}
                        >
                          <Mail className={`w-4 h-4 ${socialSearchMode === 'email' ? 'text-app-text-dim' : 'text-slate-500'}`} />
                          <span className={`text-[10px] font-bold ${socialSearchMode === 'email' ? 'text-app-text-dim' : 'text-slate-500'}`}>Correo</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => { setSocialSearchMode('name'); setSocialNickname(''); setSocialEmail(''); }}
                          className={`flex flex-col items-center gap-1 p-2.5 rounded-lg border transition-colors ${
                            socialSearchMode === 'name'
                              ? 'bg-sev-low-bg/50 border-blue-800/40'
                              : 'bg-app-bg border-app-border hover:border-sev-low-text/20'
                          }`}
                        >
                          <User className={`w-4 h-4 ${socialSearchMode === 'name' ? 'text-sev-low-text' : 'text-slate-500'}`} />
                          <span className={`text-[10px] font-bold ${socialSearchMode === 'name' ? 'text-sev-low-text' : 'text-slate-500'}`}>Nombre</span>
                        </button>
                      </div>
                    </div>

                    {/* Conditional Input based on Search Mode */}
                    {socialSearchMode === 'nickname' && (
                      <div className="space-y-1.5">
                        <Label className="text-xs text-app-text-dim font-medium flex items-center gap-1.5">
                          <AtSign className="w-3.5 h-3.5" /> NickName / Usuario
                        </Label>
                        <Input
                          placeholder="ej: johndoe, @username"
                          value={socialNickname}
                          onChange={(e) => setSocialNickname(e.target.value)}
                          className="bg-app-bg border-app-border focus:border-rose-500 text-app-text placeholder:text-slate-600"
                        />
                      </div>
                    )}
                    {socialSearchMode === 'email' && (
                      <div className="space-y-1.5">
                        <Label className="text-xs text-app-text-dim font-medium flex items-center gap-1.5">
                          <Mail className="w-3.5 h-3.5" /> Correo Electrónico
                        </Label>
                        <Input
                          type="email"
                          placeholder="ej: usuario@correo.com"
                          value={socialEmail}
                          onChange={(e) => setSocialEmail(e.target.value)}
                          className="bg-app-bg border-app-border focus:border-sky-500 text-app-text placeholder:text-slate-600"
                        />
                        {!socialEmail.trim() && email.trim() && (
                          <button
                            type="button"
                            onClick={() => setSocialEmail(email)}
                            className="text-[9px] text-app-text-dim hover:text-accent-primary flex items-center gap-1"
                          >
                            <Sparkles className="w-2.5 h-2.5" /> Usar correo del formulario: {email}
                          </button>
                        )}
                      </div>
                    )}
                    {socialSearchMode === 'name' && (
                      <div className="space-y-1.5">
                        <Label className="text-xs text-sev-low-text font-medium flex items-center gap-1.5">
                          <User className="w-3.5 h-3.5" /> Nombre Completo
                        </Label>
                        <Input
                          placeholder="ej: Juan Pérez García"
                          value={socialName}
                          onChange={(e) => setSocialName(e.target.value)}
                          className="bg-app-bg border-sev-low-text/20 focus:border-app-border text-app-text placeholder:text-slate-600"
                        />
                        {!socialName.trim() && fullName.trim() && (
                          <button
                            type="button"
                            onClick={() => setSocialName(fullName)}
                            className="text-[9px] text-sev-low-text hover:text-accent-primary flex items-center gap-1"
                          >
                            <Sparkles className="w-2.5 h-2.5" /> Usar nombre del formulario: {fullName}
                          </button>
                        )}
                      </div>
                    )}

                    {/* Search Engine Quick Links */}
                    {getSocialSearchValue() && (
                      <div className="space-y-2">
                        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Motores de Búsqueda</p>
                        <div className="grid grid-cols-2 gap-1.5">
                          {searchEngines.map(engine => {
                            const query = buildPlatformSearchQuery(
                              { name: socialSearchMode === 'nickname' ? 'Usuario' : socialSearchMode === 'email' ? 'Email' : 'Persona', domain: '' } as typeof socialPlatforms[0],
                              engine
                            );
                            const url = engine.buildUrl(query || getSocialSearchValue());
                            return (
                              <a
                                key={engine.id}
                                href={url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className={`flex items-center gap-2 px-2.5 py-1.5 rounded-md border text-[10px] font-medium transition-colors ${engine.bgColor} ${engine.borderColor} ${engine.color} hover:bg-app-surface-hover`}
                                onClick={e => e.stopPropagation()}
                              >
                                <ExternalLink className="w-3 h-3 shrink-0" />
                                {engine.name}
                              </a>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {socialScanError && (
                      <div className="p-2.5 bg-sev-critical-bg/50 border border-sev-critical-text/20 rounded-lg text-sev-critical-text text-sm flex items-start gap-2">
                        <AlertOctagon className="w-4 h-4 shrink-0 mt-0.5" />
                        {socialScanError}
                      </div>
                    )}

                    <Button
                      onClick={handleSocialScan}
                      disabled={socialScanLoading || selectedSocialPlatforms.size === 0 || !getSocialSearchValue()}
                      className="w-full bg-blue-700 hover:bg-blue-800 text-white font-semibold"
                      size="lg"
                    >
                      {socialScanLoading ? (
                        <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Escaneando {selectedSocialPlatforms.size} redes...</>
                      ) : (
                        <><Search className="w-4 h-4 mr-2" />Buscar en {selectedSocialPlatforms.size || 0} Redes</>
                      )}
                    </Button>

                    {socialScanProgress > 0 && (
                      <div className="space-y-1.5">
                        <Progress value={socialScanProgress} className="h-2" />
                        <p className="text-[10px] text-slate-500 text-center">Analizando plataformas...</p>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Platform Selector Card */}
                <Card className="bg-app-surface border border-app-border shadow-sm">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-app-text flex items-center gap-2 text-sm">
                        <Database className="w-4 h-4 text-sev-low-text" />
                        Plataformas
                      </CardTitle>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-500">{selectedSocialPlatforms.size}/{socialPlatforms.length}</span>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={toggleAllSocialPlatforms}
                          className="border-app-border text-slate-400 hover:bg-app-surface-hover text-xs h-7"
                        >
                          {selectedSocialPlatforms.size === socialPlatforms.length ? 'Ninguna' : 'Todas'}
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-3 gap-1.5">
                      {socialPlatforms.map(platform => {
                        const isSelected = selectedSocialPlatforms.has(platform.id);
                        const PlatformIcon = platform.icon;
                        return (
                          <div
                            key={platform.id}
                            className={`group flex items-center gap-1.5 p-2 rounded-lg border cursor-pointer transition-colors min-h-[36px] ${
                              isSelected
                                ? `${platform.bgColor} ${platform.borderColor}`
                                : 'bg-app-bg border-app-border opacity-50 hover:opacity-80 hover:border-app-text-muted'
                            }`}
                            onClick={() => toggleSocialPlatform(platform.id)}
                          >
                            <div className={`w-5 h-5 rounded flex items-center justify-center shrink-0 ${
                              isSelected ? 'bg-app-bg' : 'bg-slate-800/30'
                            }`}>
                              <PlatformIcon className={`w-3 h-3 ${
                                isSelected ? platform.color : 'text-slate-600 group-hover:text-slate-400'
                              }`} />
                            </div>
                            <p className={`text-[10px] font-semibold truncate flex-1 min-w-0 ${
                              isSelected ? 'text-app-text' : 'text-slate-500'
                            }`}>
                              {platform.name}
                            </p>
                            <div className={`w-3 h-3 rounded-full border-2 flex items-center justify-center shrink-0 ${
                              isSelected
                                ? 'bg-sev-low-bar border-sev-low-bar'
                                : 'border-app-text-muted bg-transparent'
                            }`}>
                              {isSelected && <Check className="w-1.5 h-1.5 text-white" />}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Right Column: Digital Footprint Map + Results */}
              <div className="lg:col-span-7 space-y-4">

                {/* Digital Footprint Map */}
                <Card className="bg-app-surface border border-app-border shadow-sm">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-app-text flex items-center gap-2 text-sm">
                        <Network className="w-4 h-4 text-sev-low-text" />
                        Mapa de Huella Digital
                      </CardTitle>
                      {socialScanData && (
                        <div className="flex items-center gap-3 text-[10px]">
                          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-accent-success inline-block" /> Perfil</span>
                          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-sev-medium-bar inline-block" /> Menciones</span>
                          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-sev-critical-bar inline-block" /> Sin datos</span>
                          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-slate-700 inline-block" /> No escaneado</span>
                        </div>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-5 gap-2">
                      {socialPlatforms.map(platform => {
                        const PlatformIcon = platform.icon;
                        const result = socialScanData?.results.find(r => r.platformId === platform.id);
                        const wasScanned = !!result;
                        let statusColor = 'bg-app-bg border-app-border';
                        let statusDot = 'bg-slate-700';
                        let statusLabel = '—';
                        let statusTextColor = 'text-slate-600';

                        if (wasScanned) {
                          if (result.profileFound) {
                            statusColor = `${platform.bgColor} border-green-800/40`;
                            statusDot = 'bg-accent-success';
                            statusLabel = 'Perfil';
                            statusTextColor = 'text-accent-success';
                          } else if (result.searchResultsCount > 0 || result.findings.length > 0) {
                            statusColor = `${platform.bgColor} border-app-border`;
                            statusDot = 'bg-sev-medium-bar';
                            statusLabel = `${result.findings.length} men.`;
                            statusTextColor = 'text-sev-medium-text';
                          } else {
                            statusColor = 'bg-app-bg border-sev-critical-text/20';
                            statusDot = 'bg-sev-critical-bar';
                            statusLabel = 'Sin datos';
                            statusTextColor = 'text-sev-critical-text';
                          }
                        }

                        return (
                          <div
                            key={platform.id}
                            className={`relative flex flex-col items-center gap-1 p-2 rounded-lg border transition-colors min-h-[68px] ${statusColor}`}
                          >
                            <div className={`absolute top-1 right-1 w-1.5 h-1.5 rounded-full ${statusDot}`} />
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                              wasScanned && result?.profileFound ? 'bg-app-bg' : 'bg-slate-800/30'
                            }`}>
                              <PlatformIcon className={`w-4 h-4 ${
                                wasScanned && result?.profileFound ? platform.color : wasScanned ? 'text-slate-400' : 'text-slate-700'
                              }`} />
                            </div>
                            <p className={`text-[9px] font-semibold text-center truncate w-full leading-tight ${
                              wasScanned ? 'text-slate-300' : 'text-slate-600'
                            }`}>
                              {platform.name}
                            </p>
                            <p className={`text-[8px] text-center font-medium leading-tight ${statusTextColor}`}>
                              {statusLabel}
                            </p>
                            {wasScanned && result?.username && (
                              <p className="text-[7px] text-slate-400 truncate w-full text-center" title={`@${result.username}`}>
                                @{result.username}
                              </p>
                            )}
                            {socialScanLoading && selectedSocialPlatforms.has(platform.id) && !wasScanned && (
                              <div className="absolute inset-0 rounded-lg border-2 border-app-border/20" />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>

                {/* Per-Platform Detail Cards */}
                {socialScanData && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <BarChart3 className="w-4 h-4 text-sev-low-text" />
                      <h3 className="text-sm font-semibold text-app-text">Resultados por Plataforma</h3>
                      <Badge variant="outline" className="border-app-border text-slate-400 text-[10px]">
                        {socialScanData.results.length} plataformas
                      </Badge>
                    </div>

                    <ScrollArea className="max-h-[600px]">
                      <div className="space-y-3 pr-2">
                        {socialScanData.results.map(result => {
                          const platformConfig = socialPlatforms.find(p => p.id === result.platformId);
                          const isExpanded = expandedSocialPlatform === result.platformId;
                          const PlatformIcon = platformConfig?.icon || Globe;
                          const hasCriticalFindings = result.findings.some(f => f.severity === 'critical' || f.severity === 'high');

                          return (
                            <Card
                              key={result.platformId}
                              className={`bg-app-surface border border-app-border shadow-sm overflow-hidden transition-all hover:border-app-text-muted ${
                                result.profileFound ? `border-l-2 border-l-green-500` : hasCriticalFindings ? 'border-l-2 border-l-orange-500' : ''
                              }`}
                            >
                              {/* Card Header - Compact */}
                              <div
                                className="px-3 py-2.5 flex items-center gap-2.5 cursor-pointer hover:bg-app-surface-hover transition-colors"
                                onClick={() => setExpandedSocialPlatform(isExpanded ? null : result.platformId)}
                              >
                                <div
                                  className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                                  style={{ backgroundColor: `${platformConfig?.accentHex}10`, border: `1px solid ${platformConfig?.accentHex}25` }}
                                >
                                  <PlatformIcon className="w-4 h-4" style={{ color: platformConfig?.accentHex }} />
                                </div>

                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <p className="text-xs font-semibold text-app-text">{result.platform}</p>
                                    {result.profileFound ? (
                                      <Badge className="bg-app-surface-hover text-accent-success text-[8px] gap-0.5 border border-app-border py-0">
                                        <CheckCircle2 className="w-2.5 h-2.5" /> Detectado
                                      </Badge>
                                    ) : result.findings.length > 0 ? (
                                      <Badge className="bg-sev-medium-bg text-sev-medium-text text-[8px] gap-0.5 border border-sev-medium-text/20 py-0">
                                        <Eye className="w-2.5 h-2.5" /> Menciones
                                      </Badge>
                                    ) : (
                                      <Badge variant="outline" className="border-app-border text-slate-500 text-[8px] py-0">
                                        Sin hallazgos
                                      </Badge>
                                    )}
                                    {result.profileVerified && (
                                      <Badge className="bg-app-surface-hover text-accent-success text-[8px] gap-0.5 border border-app-border py-0">
                                        <ShieldCheck className="w-2.5 h-2.5" /> Verificado
                                      </Badge>
                                    )}
                                    {result.username && (
                                      <span className="text-[8px]" style={{ color: platformConfig?.accentHex }}>
                                        @{result.username}
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-[10px] text-slate-500 mt-0.5">
                                    {result.findings.length} hallazgo{result.findings.length !== 1 ? 's' : ''} · {result.searchResultsCount} resultado{result.searchResultsCount !== 1 ? 's' : ''} web
                                  </p>
                                </div>

                                {/* Search Engine buttons per platform - compact */}
                                <div className="hidden sm:flex items-center gap-0.5">
                                  {searchEngines.map(engine => {
                                    const q = platformConfig ? buildPlatformSearchQuery(platformConfig, engine) : getSocialSearchValue();
                                    const url = engine.buildUrl(q || getSocialSearchValue());
                                    return (
                                      <a
                                        key={engine.id}
                                        href={url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className={`text-[8px] px-1 py-0.5 rounded border flex items-center gap-0.5 transition-colors hover:bg-app-surface-hover ${engine.bgColor} ${engine.borderColor} ${engine.color}`}
                                        onClick={e => e.stopPropagation()}
                                        title={`Buscar en ${engine.name}`}
                                      >
                                        <ExternalLink className="w-2 h-2" />
                                        {engine.name.substring(0, 2)}
                                      </a>
                                    );
                                  })}
                                </div>

                                {isExpanded ? <ChevronUp className="w-3.5 h-3.5 text-slate-600 shrink-0" /> : <ChevronDown className="w-3.5 h-3.5 text-slate-600 shrink-0" />}
                              </div>

                              {/* Expanded Content */}
                              {isExpanded && (
                                <div className="border-t border-app-border">
                                  {result.profileUrl && (
                                    <div className="px-3 py-2 bg-app-surface-hover flex items-center gap-2 border-b border-app-border/50">
                                      <div className="w-4 h-4 rounded-md bg-app-surface-hover flex items-center justify-center shrink-0">
                                        <Link2 className="w-2.5 h-2.5 text-accent-success" />
                                      </div>
                                      <div className="flex-1 min-w-0">
                                        <p className="text-[9px] text-accent-success font-medium">Perfil Encontrado</p>
                                        <a href={result.profileUrl} target="_blank" rel="noopener noreferrer" className="text-[10px] text-accent-success hover:text-accent-success truncate block" onClick={e => e.stopPropagation()}>
                                          {result.profileUrl}
                                        </a>
                                      </div>
                                      <a
                                        href={result.profileUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-[9px] px-1.5 py-0.5 rounded-md bg-app-surface-hover text-accent-success hover:bg-app-surface-hover transition-colors shrink-0"
                                        onClick={e => e.stopPropagation()}
                                      >
                                        Abrir <ExternalLink className="w-2.5 h-2.5 inline ml-0.5" />
                                      </a>
                                    </div>
                                  )}

                                  {result.findings.map((finding, idx) => {
                                    const config = severityBadgeConfig[finding.severity];
                                    const Icon = config.icon;
                                    return (
                                      <div key={idx} className="px-3 py-2 border-b border-app-border/50 last:border-b-0 hover:bg-app-surface-hover/30 transition-colors">
                                        <div className="flex items-start gap-2">
                                          <div className={`w-4 h-4 rounded flex items-center justify-center shrink-0 mt-0.5 ${config.color}`}>
                                            <Icon className="w-2.5 h-2.5" />
                                          </div>
                                          <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-1.5 mb-0.5">
                                              <Badge className={`${config.color} text-[8px] py-0 shrink-0`}>{config.label}</Badge>
                                              {finding.category && (
                                                <span className="text-[8px] text-slate-600 uppercase tracking-wider">{categoryLabels[finding.category] || finding.category}</span>
                                              )}
                                            </div>
                                            <p className="text-xs text-app-text break-words">{finding.title}</p>
                                            {finding.description && (
                                              <p className="text-[11px] text-slate-400 mt-0.5 break-words line-clamp-2">{finding.description}</p>
                                            )}
                                            {finding.url && (
                                              <a href={finding.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 text-[10px] text-sev-low-text hover:text-accent-primary mt-1" onClick={e => e.stopPropagation()}>
                                                <ExternalLink className="w-2.5 h-2.5" />Ver fuente
                                              </a>
                                            )}
                                          </div>
                                        </div>
                                      </div>
                                    );
                                  })}
                                  {result.findings.length === 0 && (
                                    <div className="px-3 py-4 text-center">
                                      <ShieldCheck className="w-6 h-6 mx-auto mb-1 text-slate-600" />
                                      <p className="text-[11px] text-slate-500">Sin hallazgos para esta plataforma</p>
                                    </div>
                                  )}
                                </div>
                              )}
                            </Card>
                          );
                        })}
                      </div>
                    </ScrollArea>
                  </div>
                )}

                {/* Empty state */}
                {!socialScanData && !socialScanLoading && (
                  <Card className="bg-app-surface border border-app-border shadow-sm">
                    <CardContent className="py-16 text-center">
                      <div className="w-16 h-16 rounded-full bg-app-bg flex items-center justify-center mx-auto mb-4 border border-app-border">
                        <Globe className="w-8 h-8 text-slate-600" />
                      </div>
                      <p className="text-slate-400 font-medium mb-1">Consola de Investigación Social</p>
                      <p className="text-xs text-slate-600 max-w-sm mx-auto">Selecciona las plataformas que deseas investigar y haz clic en &quot;Buscar en Redes&quot; para mapear la huella digital del objetivo.</p>
                    </CardContent>
                  </Card>
                )}

                {/* Loading state */}
                {socialScanLoading && (
                  <Card className="bg-app-surface border border-app-border shadow-sm">
                    <CardContent className="py-16 text-center">
                      <div className="relative w-16 h-16 mx-auto mb-4">
                        <div className="absolute inset-0 rounded-full border-2 border-app-border" />
                        <div className="absolute inset-0 rounded-full border-2 border-app-border border-t-transparent animate-spin" />
                        <div className="absolute inset-0 flex items-center justify-center">
                          <Globe className="w-6 h-6 text-sev-low-text" />
                        </div>
                      </div>
                      <p className="text-accent-primary font-semibold">Escaneando redes sociales...</p>
                      <p className="text-xs text-slate-500 mt-1">Buscando en {selectedSocialPlatforms.size} plataforma(s)</p>
                    </CardContent>
                  </Card>
                )}
              </div>
            </div>
          </TabsContent>

          {/* ────────────────────────────────────────────
              TELEGRAM AVANZADO TAB — moved to after Social
          ──────────────────────────────────────────── */}
          <TabsContent value="telegram" className="space-y-6">
            <Card className="bg-app-surface border border-app-border shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-app-text text-base">
                  <Send className="w-5 h-5 text-app-text-dim" />
                  Telegram Avanzado
                </CardTitle>
                <CardDescription className="text-slate-400 text-xs">
                  Motor de alertas en tiempo real vía Telegram Bot — configuración y verificación automática
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Status indicator */}
                <div className={`flex items-center gap-3 p-3 rounded-lg border ${
                  telegramConfigured
                    ? 'bg-app-surface-hover border-app-border'
                    : 'bg-sev-critical-bg/50 border-sev-critical-text/20'
                }`}>
                  {telegramConfigured ? (
                    <CheckCircle2 className="w-5 h-5 text-accent-success shrink-0" />
                  ) : (
                    <XCircle className="w-5 h-5 text-sev-critical-text shrink-0" />
                  )}
                  <div className="flex-1">
                    <p className={`text-sm font-medium ${telegramConfigured ? 'text-accent-success' : 'text-sev-critical-text'}`}>
                      {telegramConfigured ? 'Telegram Bot Operativo' : 'Telegram Bot No Configurado'}
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {telegramConfigured
                        ? 'Las alertas OSINT se envían automáticamente cuando se detectan palabras clave'
                        : 'Ingresa el Bot Token para comenzar la configuración'}
                    </p>
                  </div>
                  {telegramBotInfo && (
                    <Badge className="bg-app-surface-hover text-app-text-dim border border-app-border text-[10px]">
                      @{telegramBotInfo.username}
                    </Badge>
                  )}
                </div>

                {/* Config details — status indicators with source */}
                <div className="grid grid-cols-2 gap-2">
                  <div className="flex items-center gap-2 p-2.5 rounded-lg bg-app-bg border border-app-border">
                    {telegramHasBotToken ? (
                      <CheckCircle2 className="w-4 h-4 text-accent-success shrink-0" />
                    ) : (
                      <XCircle className="w-4 h-4 text-sev-critical-text shrink-0" />
                    )}
                    <div>
                      <p className="text-[10px] text-slate-500 leading-none">BOT_TOKEN</p>
                      <p className={`text-[11px] font-medium ${telegramHasBotToken ? 'text-accent-success' : 'text-sev-critical-text'}`}>
                        {telegramHasBotToken ? 'Activo' : 'Falta'}
                      </p>
                      {telegramHasBotToken && (
                        <p className="text-[9px] text-slate-600">
                          {telegramBotTokenSource === 'env' ? 'Vía Vercel Env' : 'Vía Sesión'}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 p-2.5 rounded-lg bg-app-bg border border-app-border">
                    {telegramHasChatId ? (
                      <CheckCircle2 className="w-4 h-4 text-accent-success shrink-0" />
                    ) : (
                      <XCircle className="w-4 h-4 text-sev-critical-text shrink-0" />
                    )}
                    <div>
                      <p className="text-[10px] text-slate-500 leading-none">CHAT_ID</p>
                      <p className={`text-[11px] font-medium ${telegramHasChatId ? 'text-accent-success' : 'text-sev-critical-text'}`}>
                        {telegramHasChatId ? 'Detectado' : 'Pendiente'}
                      </p>
                      {telegramHasChatId && (
                        <p className="text-[9px] text-slate-600">
                          {telegramChatIdSource === 'env' ? 'Vía Vercel Env' : 'Vía Sesión'}
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Step 1: Enter Bot Token (shown only if not configured) */}
                {!telegramHasBotToken && (
                  <div className="p-3 rounded-lg bg-app-bg border border-cyan-900/30 space-y-3">
                    <div className="flex items-center gap-2">
                      <span className="flex items-center justify-center w-5 h-5 rounded-full bg-app-surface-hover text-app-text-dim text-[10px] font-bold">1</span>
                      <span className="text-xs font-medium text-app-text-dim">Paso 1: Ingresar Bot Token</span>
                    </div>
                    <p className="text-[10px] text-slate-500">
                      Obten tu token desde <code className="text-app-text-dim">@BotFather</code> en Telegram. Envía <code className="text-app-text-dim">/newbot</code> o <code className="text-app-text-dim">/mybots</code> para obtenerlo.
                    </p>
                    <div className="flex gap-2">
                      <Input
                        placeholder="1234567890:ABCdefGHIjklMNOpqrsTUVwxyz"
                        value={telegramBotTokenInput}
                        onChange={e => setTelegramBotTokenInput(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') handleSaveBotToken(); }}
                        className="bg-app-surface border border-app-border shadow-sm text-app-text placeholder:text-slate-600 text-xs font-mono focus:border-cyan-600"
                        disabled={telegramSavingToken}
                      />
                      <Button
                        size="sm"
                        onClick={handleSaveBotToken}
                        disabled={!telegramBotTokenInput.trim() || telegramSavingToken}
                        className="bg-accent-primary hover:bg-accent-primary/90 text-accent-primary-text text-[11px] h-9 disabled:opacity-50 shrink-0"
                      >
                        {telegramSavingToken ? (
                          <><Loader2 className="w-3 h-3 mr-1.5 animate-spin" />Verificando...</>
                        ) : (
                          <><Check className="w-3 h-3 mr-1.5" />Guardar</>
                        )}
                      </Button>
                    </div>
                    {telegramSaveTokenError && (
                      <div className="flex items-start gap-2 p-2 rounded bg-sev-critical-bg/30 border border-sev-critical-text/20">
                        <AlertTriangle className="w-3 h-3 text-sev-critical-text shrink-0 mt-0.5" />
                        <p className="text-[10px] text-sev-critical-text">{telegramSaveTokenError}</p>
                      </div>
                    )}
                  </div>
                )}

                {/* Step 2: Detect Chat ID — Only shown when CHAT_ID is NOT yet configured */}
                {!telegramHasChatId ? (
                  <div className="p-3 rounded-lg bg-app-bg border border-app-border space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className={`flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold ${telegramHasBotToken ? 'bg-app-surface-hover text-app-text-dim' : 'bg-slate-800 text-slate-500'}`}>2</span>
                        <span className={`text-xs font-medium ${telegramHasBotToken ? 'text-app-text-dim' : 'text-slate-500'}`}>
                          Paso 2: Detectar Chat ID
                        </span>
                      </div>
                      <Button
                        size="sm"
                        onClick={handleTelegramDetectChatId}
                        disabled={telegramDetecting || !telegramHasBotToken}
                        className="bg-accent-primary hover:bg-accent-primary/90 text-accent-primary-text text-[11px] h-7 disabled:opacity-50"
                      >
                        {telegramDetecting ? (
                          <><Loader2 className="w-3 h-3 mr-1.5 animate-spin" />Detectando...</>
                        ) : (
                          <><ScanLine className="w-3 h-3 mr-1.5" />Detectar Chat ID</>
                        )}
                      </Button>
                    </div>

                    {!telegramHasBotToken && (
                      <p className="text-[10px] text-slate-600">
                        Completa el Paso 1 primero para habilitar la detección
                      </p>
                    )}

                    {telegramHasBotToken && !telegramHasChatId && (
                      <p className="text-[10px] text-sev-medium-text bg-sev-medium-bg/30 border border-amber-800/20 rounded p-2">
                        Envía <code className="text-sev-medium-text">/start</code> a tu bot en Telegram antes de detectar. Busca <code className="text-sev-medium-text">@{telegramBotInfo?.username || 'tu_bot'}</code> y envíale un mensaje.
                      </p>
                    )}

                    {/* Detected chats — selectable! */}
                    {telegramDetectedChats.length > 0 && (
                      <div className="space-y-1.5">
                        <p className="text-[10px] text-slate-400">Chats detectados — haz clic para seleccionar como destino de alertas:</p>
                        {telegramDetectedChats.map((chat, idx) => (
                          <button
                            key={idx}
                            onClick={() => handleSelectChat(chat.chatId)}
                            className="w-full flex items-center gap-2 p-2 rounded bg-app-surface border border-app-border hover:border-app-border hover:bg-app-surface-hover transition-colors text-left cursor-pointer group"
                          >
                            <div className={`w-2 h-2 rounded-full ${chat.type === 'private' ? 'bg-accent-success' : chat.type === 'group' || chat.type === 'supergroup' ? 'bg-app-text-dim' : 'bg-app-text-dim'}`} />
                            <div className="flex-1 min-w-0">
                              <p className="text-[11px] text-app-text font-medium truncate group-hover:text-app-text-dim transition-colors">
                                {chat.firstName || chat.title || chat.username || 'Sin nombre'}
                              </p>
                              <p className="text-[9px] text-slate-500">
                                Tipo: {chat.type} · ID: <code className="text-sev-medium-text">{chat.chatId}</code>
                              </p>
                            </div>
                            <Badge className={`text-[8px] px-1 py-0 h-4 ${
                              chat.type === 'private' ? 'bg-app-surface-hover text-accent-success' :
                              chat.type === 'group' || chat.type === 'supergroup' ? 'bg-app-surface-hover text-app-text-dim' :
                              'bg-app-surface-hover text-app-text-dim'
                            }`}>
                              {chat.type}
                            </Badge>
                            <Check className="w-3.5 h-3.5 text-slate-600 group-hover:text-app-text-dim transition-colors shrink-0" />
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Detection error */}
                    {telegramDetectError && (
                      <div className="flex items-start gap-2 p-2 rounded bg-sev-critical-bg/30 border border-sev-critical-text/20">
                        <AlertTriangle className="w-3 h-3 text-sev-critical-text shrink-0 mt-0.5" />
                        <div className="text-[10px] text-sev-critical-text whitespace-pre-line leading-relaxed">{telegramDetectError}</div>
                      </div>
                    )}
                  </div>
                ) : (
                  /* Chat ID already configured — show confirmation */
                  <div className="p-3 rounded-lg bg-app-surface-hover border border-app-border space-y-2">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-accent-success shrink-0" />
                      <span className="text-xs font-medium text-accent-success">Chat ID Configurado</span>
                      <Badge className="bg-app-surface-hover text-accent-success border border-app-border text-[9px] ml-auto">
                        {telegramChatIdSource === 'env' ? 'Vía Vercel Env' : 'Vía Sesión'}
                      </Badge>
                    </div>
                    <p className="text-[10px] text-slate-500">
                      Las alertas se enviarán automáticamente al chat configurado cuando se detecten coincidencias de palabras clave.
                    </p>
                  </div>
                )}

                {/* Action buttons */}
                <div className="flex gap-2">
                  <Button
                    onClick={handleTelegramVerifyToken}
                    disabled={!telegramHasBotToken}
                    className="flex-1 bg-app-surface-hover hover:bg-app-surface-active text-app-text border border-app-border text-xs disabled:opacity-50"
                    size="sm"
                  >
                    <Wifi className="w-3.5 h-3.5 mr-1.5" />Verificar Token
                  </Button>
                  <Button
                    onClick={handleTestAlert}
                    disabled={!telegramConfigured || telegramTestSending}
                    className="flex-1 bg-accent-primary hover:bg-accent-primary/90 text-accent-primary-text text-xs disabled:opacity-50"
                    size="sm"
                  >
                    {telegramTestSending ? (
                      <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Enviando...</>
                    ) : (
                      <><Zap className="w-3.5 h-3.5 mr-1.5" />Enviar Alerta de Prueba</>
                    )}
                  </Button>
                </div>

                {/* Keywords quick-add in Telegram Avanzado */}
                {telegramConfigured && (
                  <div className="p-3 rounded-lg bg-app-bg border border-cyan-900/30 space-y-3">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-sev-medium-text" />
                      <span className="text-xs font-medium text-sev-medium-text">Palabras Clave para Alertas</span>
                      <Badge variant="outline" className="text-[9px] text-slate-500 border-app-border ml-auto">
                        {alertKeywords.length} activa{alertKeywords.length !== 1 ? 's' : ''}
                      </Badge>
                    </div>
                    <textarea
                      placeholder="Introduce tus palabras clave (una por línea o separadas por comas)&#10;&#10;Ejemplo:&#10;bancolombia&#10;contraseña filtrada&#10;datos personales, credenciales"
                      value={bulkKeywordInput}
                      onChange={e => setBulkKeywordInput(e.target.value)}
                      className="w-full min-h-[80px] bg-app-surface border border-app-border text-app-text placeholder:text-slate-600 text-xs focus:border-cyan-600 rounded-lg p-2.5 resize-y font-mono leading-relaxed"
                      disabled={bulkKeywordLoading}
                      onKeyDown={e => {
                        if (e.key === 'Enter' && e.ctrlKey) handleBulkAddKeywords();
                      }}
                    />
                    <div className="flex items-center justify-between">
                      <p className="text-[9px] text-slate-600">Ctrl+Enter para agregar</p>
                      <Button
                        onClick={handleBulkAddKeywords}
                        disabled={!bulkKeywordInput.trim() || bulkKeywordLoading}
                        className="bg-app-surface-active hover:bg-accent-primary/80 text-app-text text-[11px] h-7 disabled:opacity-50"
                        size="sm"
                      >
                        {bulkKeywordLoading ? (
                          <><Loader2 className="w-3 h-3 mr-1.5 animate-spin" />Agregando...</>
                        ) : (
                          <><AlertTriangle className="w-3 h-3 mr-1.5" />Agregar</>
                        )}
                      </Button>
                    </div>
                    {/* Quick view of current keywords */}
                    {alertKeywords.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 pt-2 border-t border-app-border">
                        {alertKeywords.map((kw, idx) => (
                          <Badge key={idx} className="bg-sev-medium-bg text-sev-medium-text border border-sev-medium-text/20 text-[10px] font-mono cursor-pointer hover:bg-sev-critical-bg hover:text-sev-critical-text hover:border-sev-critical-text/20 transition-colors group" onClick={() => handleRemoveKeyword(kw)}>
                            {kw}
                            <X className="w-2.5 h-2.5 ml-1 opacity-0 group-hover:opacity-100 transition-opacity" />
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* ── ESCANEAR GRUPOS AHORA — Trigger scan directly from Telegram Avanzado ── */}
                {telegramConfigured && (
                  <div className="p-3 rounded-lg bg-app-bg border border-emerald-900/30 space-y-3">
                    <div className="flex items-center gap-2">
                      <Send className="w-4 h-4 text-accent-success" />
                      <span className="text-xs font-medium text-accent-success">Consulta contra Telegram</span>
                      <Badge variant="outline" className="text-[9px] text-slate-500 border-app-border ml-auto">
                        {alertKeywords.length} palabra{alertKeywords.length !== 1 ? 's' : ''} clave
                      </Badge>
                    </div>
                    <p className="text-[10px] text-slate-500">
                      Escanea grupos y canales de Telegram buscando menciones de las palabras clave configuradas. 3 fases: (1) Búsqueda web inteligente para descubrir canales, (2) Scraping de vistas previas públicas para leer mensajes, (3) Bot polling. La palabra clave se resalta en los hallazgos.
                    </p>
                    <Button
                      onClick={handleScanGroups}
                      disabled={groupScanLoading || alertKeywords.length === 0}
                      className="w-full bg-accent-primary hover:bg-accent-primary/90 text-accent-primary-text text-sm h-10"
                    >
                      {groupScanLoading ? (
                        <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Escaneando Grupos...</>
                      ) : (
                        <><Search className="w-4 h-4 mr-2" />Escanear Grupos Ahora</>
                      )}
                    </Button>

                    {/* Scan error */}
                    {groupScanError && !groupScanResults?.technicalIssues && (
                      <div className="flex items-center gap-2 bg-sev-critical-bg/50 border border-sev-critical-text/20 rounded-lg p-2">
                        <AlertTriangle className="w-3 h-3 text-sev-critical-text shrink-0" />
                        <p className="text-[10px] text-sev-critical-text">{groupScanError}</p>
                      </div>
                    )}
                    {/* Technical issues warning with diagnostics link */}
                    {groupScanResults?.technicalIssues && !groupScanResults?.detectedAlerts?.length && (
                      <div className={`space-y-1.5 rounded-lg p-2 ${groupScanResults.partialSuccess ? 'bg-sev-medium-bg/50 border border-sev-medium-text/20' : 'bg-sev-critical-bg/50 border border-sev-critical-text/20'}`}>
                        <div className="flex items-center gap-2">
                          <AlertTriangle className={`w-3 h-3 shrink-0 ${groupScanResults.partialSuccess ? 'text-sev-medium-text' : 'text-sev-critical-text'}`} />
                          <p className={`text-[10px] font-medium ${groupScanResults.partialSuccess ? 'text-sev-medium-text' : 'text-sev-critical-text'}`}>
                            {groupScanResults.partialSuccess
                              ? 'Escaneo parcial — algunos métodos no estuvieron disponibles'
                              : 'Problemas técnicos detectados'}
                          </p>
                        </div>
                        {groupScanResults.diagnostics?.map((diag, di) => (
                          <div key={di} className={`text-[9px] px-2 py-1 rounded ${diag.status === 'ok' ? 'bg-app-surface-hover text-accent-success/80' : diag.status === 'error' ? 'bg-sev-critical-bg/30 text-sev-critical-text' : diag.status === 'skipped' ? 'bg-slate-800/30 text-slate-500' : 'bg-app-surface-hover text-sev-medium-text/80'}`}>
                            <span className="font-mono font-bold">{diag.phase}</span>: {diag.details}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Scan Results Summary */}
                    {groupScanResults && (
                      <div className="space-y-2">
                        <div className={`flex items-center gap-2 p-2.5 rounded-lg border ${
                          groupScanResults.detectedAlerts.length > 0
                            ? 'bg-sev-medium-bg/30 border-sev-medium-text/20'
                            : 'bg-app-surface-hover border-app-border'
                        }`}>
                          {groupScanResults.detectedAlerts.length > 0 ? (
                            <AlertTriangle className="w-4 h-4 text-sev-medium-text shrink-0" />
                          ) : (
                            <CheckCircle2 className="w-4 h-4 text-accent-success shrink-0" />
                          )}
                          <div className="flex-1">
                            <p className={`text-xs font-medium ${groupScanResults.detectedAlerts.length > 0 ? 'text-sev-medium-text' : 'text-accent-success'}`}>
                              {groupScanResults.detectedAlerts.length > 0
                                ? `${groupScanResults.detectedAlerts.length} alerta${groupScanResults.detectedAlerts.length !== 1 ? 's' : ''} encontrada${groupScanResults.detectedAlerts.length !== 1 ? 's' : ''}`
                                : 'Sin alertas — ningún grupo mencionó las palabras clave'}
                            </p>
                            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                              <span className="text-[10px] text-slate-500">{groupScanResults.totalGroups} grupo{groupScanResults.totalGroups !== 1 ? 's' : ''}</span>
                              <span className="text-[10px] text-slate-600">•</span>
                              <span className="text-[10px] text-slate-500">{groupScanResults.keywordsProcessed}/{groupScanResults.totalKeywords} palabras procesadas</span>
                            </div>
                          </div>
                        </div>

                        {/* Detected alerts list */}
                        {groupScanResults.detectedAlerts.length > 0 && (
                          <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1" style={{ scrollbarWidth: 'thin', scrollbarColor: 'hsl(var(--app-border)) transparent' }}>
                            {groupScanResults.detectedAlerts.map((alert, idx) => {
                              const sourceBadge = alert.sourceType === 'channel' ? 'CANAL'
                                : alert.sourceType === 'group' || alert.sourceType === 'chat' || alert.sourceType === 'supergroup' ? 'CHAT/GROUP'
                                : alert.sourceType === 'bot' ? 'BOT'
                                : alert.sourceType === 'web' ? 'WEB' : 'OTRO';
                              const badgeColor = alert.sourceType === 'channel' ? 'bg-app-surface-hover text-app-text-dim border-app-border'
                                : alert.sourceType === 'group' || alert.sourceType === 'chat' || alert.sourceType === 'supergroup' ? 'bg-app-surface-hover text-app-text-dim border-app-border'
                                : alert.sourceType === 'bot' ? 'bg-sev-high-bg text-sev-high-text border-sev-high-text/20'
                                : alert.sourceType === 'web' ? 'bg-sev-medium-bg text-sev-medium-text border-sev-medium-text/20'
                                : 'bg-sev-info-bg text-sev-info-text border-app-border';
                              const kw = alert.matchedKeyword || alert.keyword;
                              return (
                                <div key={idx} className="p-2 rounded-lg bg-app-surface border border-app-border hover:border-app-border transition-colors">
                                  <div className="flex items-center gap-1.5 mb-1">
                                    {alert.telegramSent ? (
                                      <CheckCircle2 className="w-3 h-3 text-accent-success shrink-0" />
                                    ) : (
                                      <XCircle className="w-3 h-3 text-sev-critical-text shrink-0" />
                                    )}
                                    <span className="bg-accent-primary/10 text-accent-primary font-mono font-semibold text-[10px] px-1 py-0.5 rounded">{kw}</span>
                                    <Badge variant="outline" className={`text-[9px] px-1 py-0 h-4 ${badgeColor}`}>
                                      {sourceBadge}
                                    </Badge>
                                    <span className="text-[9px] text-slate-600 ml-auto">
                                      {new Date(alert.timestamp).toLocaleString('es-CO', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                    </span>
                                  </div>
                                  <p className="text-[10px] text-slate-400 truncate">{alert.sourceName}</p>
                                  {alert.messageText && (
                                    <p className="text-[10px] text-slate-500 line-clamp-2">{highlightKeywordInText(alert.messageText.substring(0, 200), kw)}</p>
                                  )}
                                  {alert.sourceUrl && (
                                    <a href={alert.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-[9px] text-app-text-dim hover:text-app-text-dim truncate block mt-0.5">
                                      <ExternalLink className="w-2 h-2 inline mr-0.5" />{alert.sourceUrl}
                                    </a>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Info about how it works */}
                <div className="p-3 rounded-lg bg-slate-900/30 border border-app-border">
                  <p className="text-[10px] text-slate-500 leading-relaxed">
                    <strong className="text-slate-400">¿Cómo funciona?</strong> El escaneo usa 3 fases: (1) <strong className="text-app-text-dim/80">Búsqueda web inteligente</strong> — busca cada palabra clave en la web para descubrir canales de Telegram relevantes; (2) <strong className="text-app-text-dim/80">Scraping de canales</strong> — accede a las páginas de vista previa públicas (t.me/s/) de los canales descubiertos y conocidos para extraer mensajes reales; (3) <strong className="text-app-text-dim/80">Bot polling</strong> — lee mensajes de grupos donde el bot es miembro. La palabra clave encontrada se resalta en los resultados.
                  </p>
                  <p className="text-[10px] text-slate-600 mt-1.5">
                    <strong>Configuración persistente:</strong> Para que la configuración sobreviva reinicios del servidor, agrega <code className="text-app-text-dim">TELEGRAM_BOT_TOKEN</code> y <code className="text-app-text-dim">TELEGRAM_CHAT_ID</code> como Environment Variables en Vercel Dashboard → Settings.
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ────────────────────────────────────────────
              HISTORY TAB
          ──────────────────────────────────────────── */}
          <TabsContent value="history" className="space-y-4">
            {pastScans.length === 0 ? (
              <Card className="bg-app-surface border border-app-border shadow-sm">
                <CardContent className="py-12 text-center">
                  <Clock className="w-12 h-12 mx-auto mb-3 text-slate-700" />
                  <p className="text-slate-400">No hay escaneos previos</p>
                  <p className="text-sm text-slate-600">Realiza tu primer escaneo para ver el historial aqui.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {/* ── Delete All Button ── */}
                <div className="flex items-center justify-between">
                  <p className="text-sm text-slate-400">{pastScans.length} escaneo(s) en el historial</p>
                  <Button size="sm" variant="outline" className="border-sev-critical-text/30 text-sev-critical-text hover:text-sev-critical-text hover:bg-sev-critical-bg" onClick={confirmDeleteAll}>
                    <Trash2 className="w-3.5 h-3.5 mr-1.5" />Eliminar todo
                  </Button>
                </div>
                {pastScans.map(scan => {
                  const criticals = scan.results.filter(r => r.severity === 'critical').length;
                  const isSocial = scan.scanType === 'social_media';
                  const TypeIcon = isSocial ? Users : Shield;
                  return (
                    <Card key={scan.id} className="bg-app-surface border border-app-border shadow-sm hover:border-app-text-muted transition-colors">
                      <CardContent className="p-4 flex items-center justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <TypeIcon className={`w-4 h-4 shrink-0 ${isSocial ? 'text-app-text-dim' : 'text-sev-low-text'}`} />
                            <p className="text-sm font-medium text-app-text">{scan.fullName}</p>
                          </div>
                          <div className="flex items-center gap-3 mt-1 text-xs text-slate-500">
                            {scan.email && <span>{scan.email}</span>}
                            {scan.cedula && <span>CC: {scan.cedula}</span>}
                            {scan.phone && <span>Tel: {scan.phone}</span>}
                          </div>
                          <div className="flex items-center gap-2 mt-2 flex-wrap">
                            <Badge className={
                              isSocial
                                ? 'bg-app-surface-hover text-app-text-dim border border-app-border text-xs'
                                : 'bg-blue-900/40 text-sev-low-text border border-sev-low-text/20 text-xs'
                            }>
                              {isSocial ? 'Social Media' : 'Data Intelligence'}
                            </Badge>
                            <Badge variant="outline" className="border-app-border text-slate-400 text-xs">
                              {new Date(scan.createdAt).toLocaleDateString('es-CO', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                            </Badge>
                            <Badge variant="outline" className="border-app-border text-slate-400 text-xs">
                              {scan.results.length} resultados
                            </Badge>
                            {criticals > 0 && <Badge className="bg-sev-critical-bg text-sev-critical-text text-xs border border-sev-critical-text/20">{criticals} criticos</Badge>}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 ml-4">
                          {!isSocial && (
                            <Button size="sm" variant="outline" className="border-app-border text-slate-400 hover:text-white hover:bg-app-surface-hover" onClick={() => handleViewPastScan(scan.id)}>
                              <Eye className="w-3.5 h-3.5 mr-1" />Ver
                            </Button>
                          )}
                          {isSocial ? (
                            <>
                              <Button size="sm" className="bg-blue-700 hover:bg-blue-800 text-white" onClick={() => handleDownloadSocialHistoryReport(scan.id, 'pdf')}>
                                <Download className="w-3.5 h-3.5 mr-1" />PDF
                              </Button>
                              <Button size="sm" variant="outline" className="border-app-border text-slate-400 hover:text-white hover:bg-app-surface-hover" onClick={() => handleDownloadSocialHistoryReport(scan.id, 'docx')}>
                                <FileSpreadsheet className="w-3.5 h-3.5 mr-1" />DOCX
                              </Button>
                              <Button size="sm" className="bg-accent-primary hover:bg-accent-primary/90 text-accent-primary-text" onClick={async () => { await handleDownloadSocialHistoryReport(scan.id, 'pdf'); setTimeout(() => handleDownloadSocialHistoryReport(scan.id, 'docx'), 500); }}>
                                <FileDown className="w-3.5 h-3.5 mr-1" />Ambos
                              </Button>
                            </>
                          ) : (
                            <>
                              <Button size="sm" className="bg-blue-700 hover:bg-blue-800 text-white" onClick={() => handleDownloadReport(scan.id, 'pdf')}>
                                <Download className="w-3.5 h-3.5 mr-1" />PDF
                              </Button>
                              <Button size="sm" variant="outline" className="border-app-border text-slate-400 hover:text-white hover:bg-app-surface-hover" onClick={() => handleDownloadReport(scan.id, 'docx')}>
                                <Download className="w-3.5 h-3.5 mr-1" />DOCX
                              </Button>
                              <Button size="sm" className="bg-accent-primary hover:bg-accent-primary/90 text-accent-primary-text" onClick={() => handleDownloadBothReports(scan.id)}>
                                <FileDown className="w-3.5 h-3.5 mr-1" />Ambos
                              </Button>
                            </>
                          )}
                          <Button size="sm" variant="outline" className="border-app-border text-sev-critical-text hover:text-sev-critical-text hover:bg-app-surface-hover" onClick={() => confirmDeleteScan(scan.id, scan.fullName)}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>

          {/* ────────────────────────────────────────────
              ALERTS TAB — Keyword Management + Alert Results + History
          ──────────────────────────────────────────── */}
          <TabsContent value="alerts" className="space-y-6">

            {/* ══════════════════════════════════════════
                PALABRAS CLAVE — Keyword Management
            ══════════════════════════════════════════ */}
            <Card className="bg-app-surface border border-app-border shadow-sm">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2 text-app-text text-base">
                    <AlertTriangle className="w-5 h-5 text-sev-medium-text" />
                    Palabras Clave
                  </CardTitle>
                  <Badge className="bg-sev-medium-bg text-sev-medium-text text-xs">
                    {alertKeywords.length} activa{alertKeywords.length !== 1 ? 's' : ''}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Bulk keyword textarea */}
                <div className="space-y-2">
                  <textarea
                    placeholder="Palabras clave (una por línea o separadas por comas)"
                    value={bulkKeywordInput}
                    onChange={e => setBulkKeywordInput(e.target.value)}
                    className="w-full min-h-[80px] bg-app-bg border border-app-border text-app-text placeholder:text-slate-600 text-sm focus:border-amber-600 rounded-lg p-3 resize-y font-mono leading-relaxed"
                    disabled={bulkKeywordLoading}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && e.ctrlKey) handleBulkAddKeywords();
                    }}
                  />
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] text-slate-600">
                      Ctrl+Enter para agregar
                    </p>
                    <Button
                      onClick={handleBulkAddKeywords}
                      disabled={!bulkKeywordInput.trim() || bulkKeywordLoading}
                      className="bg-app-surface-active hover:bg-accent-primary/80 text-app-text text-xs h-7"
                      size="sm"
                    >
                      {bulkKeywordLoading ? (
                        <><Loader2 className="w-3 h-3 mr-1 animate-spin" />Agregando...</>
                      ) : (
                        <><AlertTriangle className="w-3 h-3 mr-1" />Agregar</>
                      )}
                    </Button>
                  </div>
                </div>

                {/* Keywords as pills */}
                <div className="flex flex-wrap gap-1.5 max-h-48 overflow-y-auto">
                  {alertKeywords.length === 0 ? (
                    <p className="text-xs text-slate-500 text-center w-full py-4">No hay palabras clave configuradas</p>
                  ) : (
                    alertKeywords.map((keyword, idx) => (
                      <span
                        key={idx}
                        className="group inline-flex items-center gap-1 px-2 py-1 rounded-md bg-sev-medium-bg/50 border border-sev-medium-text/20 text-xs font-mono text-sev-medium-text hover:border-sev-medium-text/30 transition-colors cursor-default"
                      >
                        <AlertTriangle className="w-2.5 h-2.5 text-sev-medium-text" />
                        {keyword}
                        <button
                          className="ml-0.5 opacity-0 group-hover:opacity-100 text-sev-critical-text hover:text-sev-critical-text transition-opacity"
                          onClick={() => handleRemoveKeyword(keyword)}
                          title="Eliminar"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))
                  )}
                </div>

                {/* Keyword count footer */}
                <div className="flex items-center justify-between pt-2 border-t border-app-border">
                  <span className="text-[10px] text-slate-600">
                    {alertKeywords.length} palabra{alertKeywords.length !== 1 ? 's' : ''} clave activa{alertKeywords.length !== 1 ? 's' : ''}
                  </span>
                  <Badge variant="outline" className="text-sev-medium-text border-amber-800/50 text-[10px]">
                    Coincidencia sin mayúsculas/minúsculas
                  </Badge>
                </div>
              </CardContent>
            </Card>

            {/* ══════════════════════════════════════════
                ALERTAS ENCONTRADAS — Detected Alerts from Group Scan
            ══════════════════════════════════════════ */}
            <Card className="bg-app-surface border border-app-border shadow-sm">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2 text-app-text text-base">
                    <Bell className="w-5 h-5 text-sev-critical-text" />
                    Alertas Encontradas
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    {groupScanResults?.channelsDiscovered !== undefined && (
                      <Badge className="bg-app-surface-hover text-app-text-dim text-[10px]">
                        {groupScanResults.channelsDiscovered} canales descubiertos
                      </Badge>
                    )}
                    {groupScanResults?.riskBreakdown && (
                      <>
                        {groupScanResults.riskBreakdown.high > 0 && (
                          <Badge className="bg-sev-critical-bg text-sev-critical-text text-[10px]">
                            {groupScanResults.riskBreakdown.high} alto riesgo
                          </Badge>
                        )}
                        {groupScanResults.riskBreakdown.nonOfficial > 0 && (
                          <Badge className="bg-sev-medium-bg text-sev-medium-text text-[10px]">
                            {groupScanResults.riskBreakdown.nonOfficial} no oficiales
                          </Badge>
                        )}
                        {groupScanResults.riskBreakdown.official > 0 && (
                          <Badge className="bg-sev-info-bg text-sev-info-text text-[10px]">
                            {groupScanResults.riskBreakdown.official} oficiales
                          </Badge>
                        )}
                      </>
                    )}
                    {groupScanResults && groupScanResults.detectedAlerts.length > 0 && (
                      <Badge className="bg-sev-critical-bg text-sev-critical-text text-[10px]">
                        {groupScanResults.detectedAlerts.length}
                      </Badge>
                    )}
                  </div>
                </div>
                {/* Toolbar: Sort + Bulk Delete — only when alerts exist */}
                {groupScanResults && groupScanResults.detectedAlerts.length > 0 && (
                  <div className="flex items-center justify-between mt-2 pt-2 border-t border-app-border">
                    <div className="flex items-center gap-2">
                      <Checkbox
                        checked={selectedAlertIndices.size === 0 ? false : selectedAlertIndices.size === groupScanResults.detectedAlerts.length ? true : 'indeterminate'}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setSelectedAlertIndices(new Set(groupScanResults.detectedAlerts.map((_, i) => i)));
                          } else {
                            setSelectedAlertIndices(new Set());
                          }
                        }}
                        className="border-app-text-muted data-[state=checked]:bg-accent-primary data-[state=checked]:border-accent-primary"
                      />
                      <span className="text-[10px] text-slate-500">
                        {selectedAlertIndices.size > 0 ? `${selectedAlertIndices.size} seleccionada${selectedAlertIndices.size !== 1 ? 's' : ''}` : 'Seleccionar todas'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 text-[10px] text-slate-400 hover:text-white gap-1 px-2"
                        onClick={() => setAlertsSortOrder(prev => prev === 'desc' ? 'asc' : 'desc')}
                      >
                        {alertsSortOrder === 'desc' ? <ChevronDown className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />}
                        Fecha {alertsSortOrder === 'desc' ? '↓' : '↑'}
                      </Button>
                      {selectedAlertIndices.size > 0 && (
                        <Button
                          variant="destructive"
                          size="sm"
                          className="h-6 text-[10px] gap-1 px-2"
                          onClick={handleDeleteSelectedAlerts}
                        >
                          <Trash2 className="w-3 h-3" />
                          Eliminar ({selectedAlertIndices.size})
                        </Button>
                      )}
                    </div>
                  </div>
                )}
              </CardHeader>
              <CardContent>
                {!groupScanResults || groupScanResults.detectedAlerts.length === 0 ? (
                  <div className="text-center py-6">
                    <Bell className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                    <p className="text-sm text-slate-500">
                      {!groupScanResults
                        ? 'Sin alertas aún. Haz clic en "Escanear Grupos" para buscar menciones de palabras clave.'
                        : groupScanResults.technicalIssues
                          ? 'Escaneo completado con problemas técnicos. Revisa los diagnósticos abajo.'
                          : 'No se encontraron menciones de palabras clave en este escaneo.'}
                    </p>
                    {groupScanResults && (
                      <div className="mt-3 text-left space-y-2">
                        <p className="text-xs text-slate-500 text-center">
                          Se buscaron {groupScanResults.totalKeywords} palabras clave en {groupScanResults.totalGroups} grupo(s).
                          {groupScanResults.channelsDiscovered !== undefined && ` ${groupScanResults.channelsDiscovered} canales descubiertos, ${groupScanResults.channelsScraped ?? 0} escaneados, ${groupScanResults.channelsWithMessages ?? 0} con mensajes.`}
                        </p>
                        {groupScanResults.diagnostics && groupScanResults.diagnostics.length > 0 && (
                          <div className="space-y-1">
                            {groupScanResults.diagnostics.map((diag, di) => (
                              <div key={di} className={`text-[10px] p-1.5 rounded ${diag.status === 'ok' ? 'bg-app-surface-hover text-accent-success/70' : diag.status === 'error' ? 'bg-sev-critical-bg/30 text-sev-critical-text/80' : diag.status === 'skipped' ? 'bg-slate-800/30 text-slate-500' : 'bg-app-surface-hover text-sev-medium-text/70'}`}>
                                <span className="font-mono font-bold">{diag.phase}</span>: <span className={diag.status === 'error' ? 'text-sev-critical-text' : 'text-slate-400'}>{diag.details}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1" style={{ scrollbarWidth: 'thin', scrollbarColor: 'hsl(var(--app-border)) transparent' }}>
                    {[...groupScanResults.detectedAlerts]
                      .map((alert, originalIdx) => ({ alert, originalIdx }))
                      .sort((a, b) => {
                        const dateA = new Date(a.alert.timestamp).getTime();
                        const dateB = new Date(b.alert.timestamp).getTime();
                        return alertsSortOrder === 'desc' ? dateB - dateA : dateA - dateB;
                      })
                      .map(({ alert, originalIdx }) => {
                        const sourceBadge = alert.sourceType === 'channel' ? 'CANAL'
                          : alert.sourceType === 'group' || alert.sourceType === 'chat' || alert.sourceType === 'supergroup' ? 'CHAT/GROUP'
                          : alert.sourceType === 'bot' ? 'BOT'
                          : alert.sourceType === 'user' ? 'USUARIO'
                          : alert.sourceType === 'web' ? 'WEB' : 'OTRO';
                        const badgeColor = alert.sourceType === 'channel' ? 'bg-app-surface-hover text-app-text-dim border-app-border'
                          : alert.sourceType === 'group' || alert.sourceType === 'chat' || alert.sourceType === 'supergroup' ? 'bg-app-surface-hover text-app-text-dim border-app-border'
                          : alert.sourceType === 'bot' ? 'bg-sev-high-bg text-sev-high-text border-sev-high-text/20'
                          : alert.sourceType === 'web' ? 'bg-sev-medium-bg text-sev-medium-text border-sev-medium-text/20'
                          : 'bg-sev-info-bg text-sev-info-text border-app-border';
                        const kw = alert.matchedKeyword || alert.keyword;
                        const isSelected = selectedAlertIndices.has(originalIdx);
                        // Risk level visual config
                        const riskConfig = alert.riskLevel === 'high' ? { label: 'Riesgo Alto', color: 'bg-sev-critical-bg text-sev-critical-text border-sev-critical-text/20', dot: 'bg-sev-critical-bar' }
                          : alert.riskLevel === 'low' || alert.isOfficial ? { label: 'Oficial', color: 'bg-sev-info-bg text-sev-info-text border-app-border', dot: 'bg-sev-info-bar' }
                          : { label: 'Moderado', color: 'bg-sev-medium-bg text-sev-medium-text border-sev-medium-text/20', dot: 'bg-sev-medium-bar' };
                        return (
                          <div key={originalIdx} className={`flex gap-2 p-3 rounded-lg bg-app-bg border transition-colors ${isSelected ? 'border-sev-critical-text/30 bg-sev-critical-bg/50' : alert.riskLevel === 'high' ? 'border-sev-critical-text/20' : alert.isOfficial ? 'border-app-border' : 'border-app-border hover:border-app-text-muted'}`}>
                            <div className="shrink-0 pt-0.5">
                              <Checkbox
                                checked={isSelected}
                                onCheckedChange={(checked) => {
                                  setSelectedAlertIndices(prev => {
                                    const next = new Set(prev);
                                    if (checked) next.add(originalIdx);
                                    else next.delete(originalIdx);
                                    return next;
                                  });
                                }}
                                className="border-app-text-muted data-[state=checked]:bg-accent-primary data-[state=checked]:border-accent-primary"
                              />
                            </div>
                            <div className="flex-1 min-w-0">
                              {/* Header row with keyword highlighted + risk badge */}
                              <div className="flex items-center gap-2 mb-2 flex-wrap">
                                <div className="shrink-0">
                                  {alert.telegramSent ? (
                                    <CheckCircle2 className="w-4 h-4 text-accent-success" />
                                  ) : (
                                    <XCircle className="w-4 h-4 text-sev-critical-text" />
                                  )}
                                </div>
                                <span className="bg-accent-primary/10 text-accent-primary font-mono font-semibold text-xs px-1.5 py-0.5 rounded">
                                  {kw}
                                </span>
                                <Badge variant="outline" className={`text-[10px] ${badgeColor}`}>
                                  {sourceBadge}
                                </Badge>
                                {/* Risk level badge */}
                                <Badge variant="outline" className={`text-[9px] ${riskConfig.color}`}>
                                  <span className={`w-1.5 h-1.5 rounded-full ${riskConfig.dot} mr-1`} />
                                  {riskConfig.label}
                                </Badge>
                                {alert.messageId && (
                                  <Badge variant="outline" className="text-[9px] bg-sev-info-bg text-sev-info-text border-app-border">
                                    #{alert.messageId}
                                  </Badge>
                                )}
                                {/* Discovery source indicator */}
                                {alert.discoverySource && (
                                  <span className="text-[9px] text-app-text-faint">
                                    {alert.discoverySource === 'web_search' ? 'Búsqueda global' : alert.discoverySource === 'bot_polling' ? 'Bot polling' : alert.discoverySource === 'monitoring_list' ? 'Monitoreo' : 'Conocido'}
                                  </span>
                                )}
                                <span className="text-[10px] text-app-text-muted ml-auto">
                                  {new Date(alert.timestamp).toLocaleString('es-CO', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                </span>
                              </div>
                              {/* Risk tags */}
                              {alert.riskTags && alert.riskTags.length > 0 && (
                                <div className="flex items-center gap-1 mb-1.5 flex-wrap">
                                  <span className="text-[9px] text-app-text-faint">Indicadores:</span>
                                  {alert.riskTags.slice(0, 4).map((tag, ti) => (
                                    <span key={ti} className="text-[9px] px-1 py-0.5 rounded bg-sev-critical-bg/50 text-sev-critical-text">{tag}</span>
                                  ))}
                                  {alert.riskTags.length > 4 && <span className="text-[9px] text-app-text-faint">+{alert.riskTags.length - 4}</span>}
                                </div>
                              )}
                              {/* Channel info line: name, @username, subscriber count */}
                              <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                                <p className="text-xs text-app-text font-medium truncate max-w-[60%]">
                                  {alert.sourceName}
                                  {alert.isOfficial && <span className="ml-1.5 text-[9px] text-accent-success">(canal oficial)</span>}
                                </p>
                                {alert.channelUsername && (
                                  <span className="text-[10px] font-mono text-accent-primary bg-accent-primary/10 px-1.5 py-0.5 rounded">
                                    @{alert.channelUsername}
                                  </span>
                                )}
                                {alert.subscriberCount !== undefined && alert.subscriberCount > 0 && (
                                  <span className="text-[9px] text-app-text-faint">
                                    {alert.subscriberCount.toLocaleString('es-CO')} suscriptores
                                  </span>
                                )}
                                {alert.messageDate && (
                                  <span className="text-[9px] text-app-text-faint ml-auto">
                                    Msg: {alert.messageDate}
                                  </span>
                                )}
                              </div>
                              {/* Message text with keyword highlighted */}
                              {alert.messageText && (
                                <div className="p-2 bg-app-deep rounded border border-app-border mb-1.5">
                                  <p className="text-[11px] text-slate-300 leading-relaxed whitespace-pre-wrap break-words" style={{ maxHeight: '120px', overflow: 'auto' }}>
                                    {highlightKeywordInText(alert.messageText, kw)}
                                  </p>
                                </div>
                              )}
                              {/* Matched context snippet */}
                              {alert.matchedContext && alert.matchedContext !== alert.messageText?.substring(0, 150) && (
                                <div className="mb-1.5">
                                  <p className="text-[10px] text-slate-600">
                                    <span className="text-slate-500">Contexto:</span> {highlightKeywordInText(alert.matchedContext, kw)}
                                  </p>
                                </div>
                              )}
                              {/* Action row: View in Telegram + source URL */}
                              <div className="flex items-center gap-3">
                                {alert.sourceUrl && (
                                  <a
                                    href={alert.sourceUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 text-[10px] px-2 py-1 rounded bg-accent-primary/10 text-accent-primary hover:bg-accent-primary/20 transition-colors font-medium"
                                  >
                                    <ExternalLink className="w-3 h-3" />
                                    Ver en Telegram
                                  </a>
                                )}
                                {alert.sourceUrl && (
                                  <span className="text-[9px] text-app-text-faint truncate">
                                    {alert.sourceUrl}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* ══════════════════════════════════════════
                HISTORIAL DE ALERTAS — OSINT Alert History
            ══════════════════════════════════════════ */}
            <Card className="bg-app-surface border border-app-border shadow-sm">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2 text-app-text text-base">
                      <Clock className="w-5 h-5 text-sev-low-text" />
                      Historial de Alertas
                    </CardTitle>
                    <CardDescription className="text-slate-400 text-xs">
                      Últimas alertas disparadas por el interceptor de palabras clave
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="border-app-border text-slate-400 hover:text-white hover:bg-app-surface-hover"
                      onClick={() => fetchAlertConfig()}
                    >
                      <ScanLine className="w-3.5 h-3.5 mr-1.5" />
                      Actualizar
                    </Button>
                  </div>
                </div>
                {/* Toolbar: Sort + Bulk Delete — only when history exists */}
                {alertHistory.length > 0 && (
                  <div className="flex items-center justify-between mt-2 pt-2 border-t border-app-border">
                    <div className="flex items-center gap-2">
                      <Checkbox
                        checked={selectedHistoryIndices.size === 0 ? false : selectedHistoryIndices.size === alertHistory.length ? true : 'indeterminate'}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setSelectedHistoryIndices(new Set(alertHistory.map((_, i) => i)));
                          } else {
                            setSelectedHistoryIndices(new Set());
                          }
                        }}
                        className="border-app-text-muted data-[state=checked]:bg-accent-primary data-[state=checked]:border-accent-primary"
                      />
                      <span className="text-[10px] text-slate-500">
                        {selectedHistoryIndices.size > 0 ? `${selectedHistoryIndices.size} seleccionada${selectedHistoryIndices.size !== 1 ? 's' : ''}` : 'Seleccionar todas'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 text-[10px] text-slate-400 hover:text-white gap-1 px-2"
                        onClick={() => setHistorySortOrder(prev => prev === 'desc' ? 'asc' : 'desc')}
                      >
                        {historySortOrder === 'desc' ? <ChevronDown className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />}
                        Fecha {historySortOrder === 'desc' ? '↓' : '↑'}
                      </Button>
                      {selectedHistoryIndices.size > 0 && (
                        <Button
                          variant="destructive"
                          size="sm"
                          className="h-6 text-[10px] gap-1 px-2"
                          onClick={() => setShowDeleteHistoryModal(true)}
                        >
                          <Trash2 className="w-3 h-3" />
                          Eliminar ({selectedHistoryIndices.size})
                        </Button>
                      )}
                    </div>
                  </div>
                )}
              </CardHeader>
              <CardContent>
                {alertHistory.length === 0 ? (
                  <div className="text-center py-8">
                    <Bell className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                    <p className="text-sm text-slate-500">No se han disparado alertas todavía</p>
                    <p className="text-xs text-slate-600 mt-1">Las alertas se activarán automáticamente cuando un escaneo OSINT detecte una palabra clave de la lista negra</p>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-80 overflow-y-auto">
                    {[...alertHistory]
                      .map((alert, originalIdx) => ({ alert, originalIdx }))
                      .sort((a, b) => {
                        const dateA = new Date(a.alert.timestamp).getTime();
                        const dateB = new Date(b.alert.timestamp).getTime();
                        return historySortOrder === 'desc' ? dateB - dateA : dateA - dateB;
                      })
                      .map(({ alert, originalIdx }) => {
                        const sourceBadge = alert.sourceType === 'channel' ? 'CANAL'
                          : alert.sourceType === 'group' || alert.sourceType === 'chat' ? 'CHAT/GROUP'
                          : alert.sourceType === 'bot' ? 'BOT'
                          : alert.sourceType === 'user' ? 'USUARIO'
                          : alert.sourceType === 'web' ? 'WEB' : 'OTRO';
                        const badgeColor = alert.sourceType === 'channel' ? 'bg-app-surface-hover text-app-text-dim border-app-border'
                          : alert.sourceType === 'group' || alert.sourceType === 'chat' ? 'bg-app-surface-hover text-app-text-dim border-app-border'
                          : alert.sourceType === 'web' ? 'bg-sev-medium-bg text-sev-medium-text border-sev-medium-text/20'
                          : 'bg-sev-info-bg text-sev-info-text border-app-border';
                        const isSelected = selectedHistoryIndices.has(originalIdx);
                        return (
                          <div key={originalIdx} className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${isSelected ? 'bg-sev-critical-bg/50 border-sev-critical-text/30' : 'bg-app-bg border-app-border hover:border-app-border'}`}>
                            <div className="shrink-0">
                              <Checkbox
                                checked={isSelected}
                                onCheckedChange={(checked) => {
                                  setSelectedHistoryIndices(prev => {
                                    const next = new Set(prev);
                                    if (checked) next.add(originalIdx);
                                    else next.delete(originalIdx);
                                    return next;
                                  });
                                }}
                                className="border-app-text-muted data-[state=checked]:bg-accent-primary data-[state=checked]:border-accent-primary"
                              />
                            </div>
                            <div className="shrink-0">
                              {alert.telegramSent ? (
                                <CheckCircle2 className="w-4 h-4 text-accent-success" />
                              ) : (
                                <XCircle className="w-4 h-4 text-sev-critical-text" />
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-sm font-mono text-sev-medium-text font-medium">{alert.keyword}</span>
                                <Badge variant="outline" className={`text-[10px] ${badgeColor}`}>
                                  {sourceBadge}
                                </Badge>
                              </div>
                              <p className="text-xs text-slate-500 truncate mt-0.5">{alert.sourceName}</p>
                            </div>
                            <div className="shrink-0 text-right">
                              <p className="text-[10px] text-slate-600">
                                {new Date(alert.timestamp).toLocaleString('es-CO', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* ── Delete History Confirmation Modal ── */}
            <Dialog open={showDeleteHistoryModal} onOpenChange={setShowDeleteHistoryModal}>
              <DialogContent className="bg-app-surface border border-app-border shadow-sm text-app-text">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2 text-sev-critical-text">
                    <AlertTriangle className="w-5 h-5" />
                    Confirmar Eliminación
                  </DialogTitle>
                  <DialogDescription className="text-slate-400">
                    ¿Está seguro de que desea eliminar permanentemente {selectedHistoryIndices.size} registro{selectedHistoryIndices.size !== 1 ? 's' : ''} del historial?
                    Esta acción no se puede deshacer.
                  </DialogDescription>
                </DialogHeader>
                <div className="py-2">
                  <p className="text-xs text-slate-500">
                    Se eliminarán las alertas seleccionadas del historial de forma permanente. Los registros de alertas enviadas a Telegram no se verán afectados.
                  </p>
                </div>
                <DialogFooter className="gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-app-border text-slate-400 hover:text-white"
                    onClick={() => setShowDeleteHistoryModal(false)}
                    disabled={deleteHistoryLoading}
                  >
                    Cancelar
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={handleDeleteHistoryEntries}
                    disabled={deleteHistoryLoading}
                  >
                    {deleteHistoryLoading ? (
                      <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Eliminando...</>
                    ) : (
                      <><Trash2 className="w-3.5 h-3.5 mr-1.5" />Eliminar Definitivamente</>
                    )}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            {/* ── How It Works Card ── */}
            <Card className="bg-app-surface border border-app-border shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-app-text text-base">
                  <Info className="w-5 h-5 text-slate-400" />
                  Cómo Funciona
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="p-3 rounded-lg bg-app-bg border border-app-border">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="flex items-center justify-center w-6 h-6 rounded-full bg-sev-medium-bg text-sev-medium-text text-xs font-bold">1</span>
                      <span className="text-sm font-medium text-slate-200">Detección</span>
                    </div>
                    <p className="text-xs text-slate-500">El escáner analiza mensajes de grupos Telegram y resultados web buscando coincidencias con las palabras clave</p>
                  </div>
                  <div className="p-3 rounded-lg bg-app-bg border border-app-border">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="flex items-center justify-center w-6 h-6 rounded-full bg-app-surface-hover text-app-text-dim text-xs font-bold">2</span>
                      <span className="text-sm font-medium text-slate-200">Clasificación</span>
                    </div>
                    <p className="text-xs text-slate-500">Se extrae metadata de la fuente (canal, grupo, bot, web) y se determina la severidad del hallazgo</p>
                  </div>
                  <div className="p-3 rounded-lg bg-app-bg border border-app-border">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="flex items-center justify-center w-6 h-6 rounded-full bg-app-surface-hover text-accent-success text-xs font-bold">3</span>
                      <span className="text-sm font-medium text-slate-200">Alerta</span>
                    </div>
                    <p className="text-xs text-slate-500">Se envía una alerta formateada a Telegram con toda la información del hallazgo y la fuente</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>

      {/* ── Delete Confirmation Dialog ── */}
      <Dialog open={deleteConfirm.open} onOpenChange={(open) => { if (!open) setDeleteConfirm({ open: false, scanId: null, scanName: '', deleteAll: false }); }}>
        <DialogContent className="bg-app-surface border border-app-border shadow-sm text-app-text">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertOctagon className="w-5 h-5 text-sev-critical-text" />
              {deleteConfirm.deleteAll ? 'Eliminar todo el historial' : 'Eliminar escaneo'}
            </DialogTitle>
            <DialogDescription className="text-slate-400">
              {deleteConfirm.deleteAll
                ? `¿Estás seguro de que deseas eliminar los ${pastScans.length} escaneos del historial? Esta acción no se puede deshacer.`
                : `¿Estás seguro de que deseas eliminar el escaneo de "${deleteConfirm.scanName}"? Esta acción no se puede deshacer.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" className="border-app-border text-slate-400 hover:text-white hover:bg-app-surface-hover" onClick={() => setDeleteConfirm({ open: false, scanId: null, scanName: '', deleteAll: false })}>
              Cancelar
            </Button>
            <Button className="bg-accent-danger hover:bg-accent-danger/90 text-white" onClick={executeDelete}>
              <Trash2 className="w-3.5 h-3.5 mr-1.5" />
              {deleteConfirm.deleteAll ? 'Eliminar todo' : 'Eliminar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── AI CHATBOT ── */}
      {chatOpen && (
        <div className="fixed bottom-20 right-4 sm:right-6 w-[360px] max-w-[calc(100vw-2rem)] h-[500px] bg-app-surface border border-app-border rounded-xl z-50 flex flex-col overflow-hidden">
          {/* Chat Header */}
          <div className="flex items-center justify-between p-3 bg-app-bg border-b border-app-border">
            <div className="flex items-center gap-2">
              <div className="p-1 bg-app-surface-hover rounded-md">
                <Bot className="w-4 h-4 text-sev-low-text" />
              </div>
              <div>
                <p className="text-sm font-medium text-app-text">Asistente OSINT</p>
                <p className="text-[10px] text-slate-500">IA especializada en ciberseguridad</p>
              </div>
            </div>
            <Button variant="ghost" size="sm" className="text-slate-400 hover:text-white h-7 w-7 p-0" onClick={() => setChatOpen(false)}>
              <X className="w-4 h-4" />
            </Button>
          </div>

          {/* Chat Messages */}
          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {chatMessages.map((msg, idx) => (
              <div key={idx} className={`flex gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                {msg.role === 'assistant' && (
                  <div className="w-6 h-6 bg-app-surface-hover rounded-full flex items-center justify-center shrink-0 mt-1">
                    <Sparkles className="w-3 h-3 text-sev-low-text" />
                  </div>
                )}
                <div className={`max-w-[85%] px-3 py-2 rounded-lg text-sm leading-relaxed ${
                  msg.role === 'user'
                    ? 'bg-sev-low-bar text-white rounded-br-sm'
                    : 'bg-app-bg text-slate-200 rounded-bl-sm border border-app-border'
                }`}>
                  {msg.role === 'assistant' ? renderMarkdown(msg.content) : msg.content}
                </div>
              </div>
            ))}
            {chatLoading && (
              <div className="flex gap-2 justify-start">
                <div className="w-6 h-6 bg-app-surface-hover rounded-full flex items-center justify-center shrink-0 mt-1">
                  <Sparkles className="w-3 h-3 text-sev-low-text" />
                </div>
                <div className="bg-app-bg text-slate-400 px-3 py-2 rounded-lg rounded-bl-sm border border-app-border text-sm">
                  <Loader2 className="w-4 h-4 animate-spin" />
                </div>
              </div>
            )}
          </div>

          {/* Chat Input */}
          <div className="p-3 border-t border-app-border bg-app-surface">
            <div className="flex gap-2">
              <Input
                placeholder="Pregunta sobre OSINT, seguridad..."
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && chatInput.trim()) handleChatSend(); }}
                className="bg-app-bg border-app-border text-app-text placeholder:text-slate-600 text-sm focus:border-sev-low-bar"
                disabled={chatLoading}
              />
              <Button
                onClick={handleChatSend}
                disabled={!chatInput.trim() || chatLoading}
                className="bg-blue-700 hover:bg-blue-800 text-white shrink-0"
                size="icon"
              >
                <Send className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Chat FAB */}
      <Button
        onClick={() => setChatOpen(!chatOpen)}
        className={`fixed bottom-4 right-4 sm:right-6 z-50 rounded-full w-12 h-12 transition-all ${
          chatOpen ? 'bg-slate-700 hover:bg-slate-600' : 'bg-blue-700 hover:bg-blue-800'
        } text-white`}
      >
        {chatOpen ? <X className="w-5 h-5" /> : <MessageCircle className="w-5 h-5" />}
      </Button>

      {/* ── DETAIL MODAL ── */}
      <Dialog open={detailModal.open} onOpenChange={(open) => setDetailModal(prev => ({ ...prev, open }))}>
        <DialogContent className="bg-app-surface border border-app-border shadow-sm text-app-text max-w-lg max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="text-app-text">{detailModal.title}</DialogTitle>
            <DialogDescription className="text-slate-400">
              {detailModal.items.length} elemento{detailModal.items.length !== 1 ? 's' : ''} encontrado{detailModal.items.length !== 1 ? 's' : ''}
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[50vh]">
            <div className="space-y-2 pr-2">
              {detailModal.items.length === 0 ? (
                <p className="text-sm text-slate-500 text-center py-4">Sin hallazgos en esta categoría</p>
              ) : (
                detailModal.items.map((item, i) => (
                  <div key={i} className="p-2.5 bg-app-bg rounded-lg border border-app-border">
                    <div className="flex items-start gap-2">
                      {item.platform && <Badge className="bg-app-surface-hover text-app-text-dim text-[9px] shrink-0">{item.platform}</Badge>}
                      <p className="text-sm font-medium text-app-text">{item.title}</p>
                    </div>
                    <p className="text-xs text-slate-400 mt-1">{item.description}</p>
                    {item.source && <p className="text-[10px] text-slate-600 mt-1">Fuente: {item.source}</p>}
                  </div>
                ))
              )}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* ── FOOTER ── */}
      <footer className="border-t border-app-border mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex flex-col sm:flex-row items-center justify-between gap-2">
          <p className="text-xs text-slate-600">OSINT Data Scanner — Inteligencia de Fuentes Abiertas | Informes PDF + DOCX</p>
          <div className="flex items-center gap-3">
            <Badge variant="outline" className="border-app-border text-slate-500 text-[10px]">
              <Shield className="w-3 h-3 mr-1" /> CONFIDENCIAL
            </Badge>
            <Badge variant="outline" className="border-app-border text-slate-500 text-[10px]">
              <FileDown className="w-3 h-3 mr-1" /> PDF + DOCX
            </Badge>
          </div>
        </div>
      </footer>
    </div>
  );
}
