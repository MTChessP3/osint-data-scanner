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
  critical: { color: 'bg-red-900/40 text-red-400 border border-red-800/30', icon: ShieldAlert, label: 'Critico', barColor: 'bg-red-500' },
  high: { color: 'bg-orange-900/30 text-orange-400 border border-orange-800/30', icon: AlertTriangle, label: 'Alto', barColor: 'bg-orange-500' },
  medium: { color: 'bg-amber-900/30 text-amber-400 border border-amber-800/30', icon: Eye, label: 'Medio', barColor: 'bg-amber-500' },
  low: { color: 'bg-blue-900/30 text-blue-400 border border-blue-800/30', icon: Info, label: 'Bajo', barColor: 'bg-blue-500' },
  info: { color: 'bg-slate-800/50 text-slate-400 border border-slate-700/30', icon: Info, label: 'Info', barColor: 'bg-slate-500' },
};

const severityBadgeConfig = {
  critical: { color: 'bg-red-900/40 text-red-400', icon: ShieldAlert, label: 'Critico' },
  high: { color: 'bg-orange-900/30 text-orange-400', icon: AlertTriangle, label: 'Alto' },
  medium: { color: 'bg-amber-900/30 text-amber-400', icon: Eye, label: 'Medio' },
  low: { color: 'bg-blue-900/30 text-blue-400', icon: Info, label: 'Bajo' },
  info: { color: 'bg-slate-800/50 text-slate-400', icon: Info, label: 'Info' },
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
  empresarial: { icon: Building2, label: 'Empresarial', color: 'text-blue-300/70', bgColor: 'bg-blue-950/20 border border-blue-900/30' },
  personal: { icon: User, label: 'Personal', color: 'text-cyan-300/70', bgColor: 'bg-cyan-950/20 border border-cyan-900/30' },
  familiar: { icon: Heart, label: 'Familiar', color: 'text-violet-300/70', bgColor: 'bg-violet-950/20 border border-violet-900/30' },
  laboral: { icon: Briefcase, label: 'Laboral', color: 'text-emerald-300/70', bgColor: 'bg-emerald-950/20 border border-emerald-900/30' },
  contacto: { icon: Phone, label: 'Contacto', color: 'text-amber-300/70', bgColor: 'bg-amber-950/20 border border-amber-900/30' },
  ubicacion: { icon: MapPin, label: 'Ubicacion', color: 'text-orange-300/70', bgColor: 'bg-orange-950/20 border border-orange-900/30' },
  dato_compartido: { icon: Database, label: 'Dato Compartido', color: 'text-slate-300/70', bgColor: 'bg-slate-800/20 border border-slate-700/30' },
};

const engineCategories = [
  {
    id: 'breaches',
    label: 'Brechas y Credenciales',
    color: 'red',
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
    color: 'orange',
    engines: [
      { name: 'Dark Web / Leak Scan', desc: 'Menciones en filtraciones', icon: Eye },
      { name: 'LeakRadar', desc: 'Filtraciones masivas de datos', icon: ShieldAlert },
    ],
  },
  {
    id: 'social',
    label: 'Redes Sociales',
    color: 'blue',
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
    color: 'violet',
    engines: [
      { name: 'Data Broker Scan', desc: 'Directorios y brokers de datos', icon: Database },
      { name: 'Pipl', desc: 'Búsqueda de identidades', icon: Search },
      { name: 'DeepFind Deep Search', desc: 'Búsqueda profunda de personas', icon: Eye },
    ],
  },
  {
    id: 'judicial',
    label: 'Judicial y Oficial',
    color: 'teal',
    engines: [
      { name: 'Policía Nacional Colombia', desc: 'Antecedentes judiciales', icon: Shield },
      { name: 'Aleph / OCCRP', desc: 'Documentos de investigación', icon: FileDigit },
    ],
  },
  {
    id: 'email-validation',
    label: 'Validación de Correo',
    color: 'amber',
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
  { id: 'tiktok', name: 'TikTok', domain: 'tiktok.com', color: 'text-rose-300/70', bgColor: 'bg-rose-950/20', borderColor: 'border-rose-900/30', icon: Music2, desc: 'Perfiles y contenido viral', accentHex: '#9f1239', verifyUrl: 'https://www.tiktok.com/search?q=', searchUrl: 'https://www.tiktok.com/search?q=' },
  { id: 'instagram', name: 'Instagram', domain: 'instagram.com', color: 'text-violet-300/70', bgColor: 'bg-violet-950/20', borderColor: 'border-violet-900/30', icon: Camera, desc: 'Perfiles, fotos y stories', accentHex: '#6d28d9', verifyUrl: 'https://www.instagram.com/', searchUrl: 'https://www.instagram.com/' },
  { id: 'youtube', name: 'YouTube', domain: 'youtube.com', color: 'text-red-300/70', bgColor: 'bg-red-950/20', borderColor: 'border-red-900/30', icon: Play, desc: 'Canales y videos', accentHex: '#991b1b', verifyUrl: 'https://www.youtube.com/results?search_query=', searchUrl: 'https://www.youtube.com/results?search_query=' },
  { id: 'whatsapp', name: 'WhatsApp', domain: 'whatsapp.com', color: 'text-emerald-300/70', bgColor: 'bg-emerald-950/20', borderColor: 'border-emerald-900/30', icon: MessageCircle, desc: 'Numeros y grupos publicos', accentHex: '#065f46', verifyUrl: 'https://wa.me/', searchUrl: 'https://web.whatsapp.com/' },
  { id: 'facebook', name: 'Facebook', domain: 'facebook.com', color: 'text-blue-300/70', bgColor: 'bg-blue-950/20', borderColor: 'border-blue-900/30', icon: Users, desc: 'Perfiles, paginas y grupos', accentHex: '#1e40af', verifyUrl: 'https://www.facebook.com/search/top?q=', searchUrl: 'https://www.facebook.com/search/top?q=' },
  { id: 'twitter', name: 'X (Twitter)', domain: 'x.com', color: 'text-slate-300/70', bgColor: 'bg-slate-800/20', borderColor: 'border-slate-700/30', icon: AtSign, desc: 'Perfiles y tweets', accentHex: '#475569', verifyUrl: 'https://twitter.com/search?q=', searchUrl: 'https://twitter.com/search?q=' },
  { id: 'linkedin', name: 'LinkedIn', domain: 'linkedin.com', color: 'text-sky-300/70', bgColor: 'bg-sky-950/20', borderColor: 'border-sky-900/30', icon: Briefcase, desc: 'Perfiles profesionales', accentHex: '#0c4a6e', verifyUrl: 'https://www.linkedin.com/search/results/people/?keywords=', searchUrl: 'https://www.linkedin.com/search/results/people/?keywords=' },
  { id: 'telegram', name: 'Telegram', domain: 't.me', color: 'text-cyan-300/70', bgColor: 'bg-cyan-950/20', borderColor: 'border-cyan-900/30', icon: Send, desc: 'Canales y grupos', accentHex: '#164e63', verifyUrl: 'https://t.me/', searchUrl: 'https://t.me/' },
  { id: 'snapchat', name: 'Snapchat', domain: 'snapchat.com', color: 'text-amber-300/70', bgColor: 'bg-amber-950/20', borderColor: 'border-amber-900/30', icon: Camera, desc: 'Perfiles y snaps', accentHex: '#92400e', verifyUrl: 'https://story.snapchat.com/s/', searchUrl: 'https://www.snapchat.com/add/' },
  { id: 'pinterest', name: 'Pinterest', domain: 'pinterest.com', color: 'text-pink-300/70', bgColor: 'bg-pink-950/20', borderColor: 'border-pink-900/30', icon: Pin, desc: 'Tableros y pines', accentHex: '#9d174d', verifyUrl: 'https://www.pinterest.com/search/pins/?q=', searchUrl: 'https://www.pinterest.com/search/pins/?q=' },
];

// ── Helper: category color classes ──
function getCategoryColor(color: string, type: 'text' | 'bg' | 'border' | 'hoverBg' = 'text') {
  const map: Record<string, Record<string, string>> = {
    red: { text: 'text-red-400', bg: 'bg-red-900/15', border: 'border-red-800/30', hoverBg: 'hover:bg-red-900/25' },
    orange: { text: 'text-orange-400', bg: 'bg-orange-900/15', border: 'border-orange-800/30', hoverBg: 'hover:bg-orange-900/25' },
    blue: { text: 'text-blue-400', bg: 'bg-blue-900/15', border: 'border-blue-800/30', hoverBg: 'hover:bg-blue-900/25' },
    slate: { text: 'text-slate-300', bg: 'bg-slate-800/15', border: 'border-slate-700/30', hoverBg: 'hover:bg-slate-800/25' },
    violet: { text: 'text-violet-400', bg: 'bg-violet-900/15', border: 'border-violet-800/30', hoverBg: 'hover:bg-violet-900/25' },
    teal: { text: 'text-teal-400', bg: 'bg-teal-900/15', border: 'border-teal-800/30', hoverBg: 'hover:bg-teal-900/25' },
  };
  return map[color]?.[type] || '';
}

// ── Simple Markdown renderer for chat messages ──
function renderMarkdown(text: string) {
  const lines = text.split('\n');
  return lines.map((line, i) => {
    let processed = line
      .replace(/\*\*(.+?)\*\*/g, '<strong class="text-blue-300">$1</strong>')
      .replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '<em>$1</em>')
      .replace(/`(.+?)`/g, '<code class="bg-slate-700 px-1 rounded text-xs text-blue-400">$1</code>')
      .replace(/^[-•]\s+(.*)/, '<span class="flex gap-1"><span class="text-blue-400 shrink-0">•</span><span>$1</span></span>')
      .replace(/^(\d+)\.\s+(.*)/, '<span class="flex gap-1"><span class="text-blue-400 shrink-0 font-mono text-xs">$1.</span><span>$2</span></span>');

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
  const gaugeColor = score >= 70 ? '#dc2626' : score >= 40 ? '#f97316' : score >= 15 ? '#eab308' : '#22c55e';

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative w-32 h-32">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 120 120">
          <circle cx="60" cy="60" r={radius} fill="none" stroke="#1e293b" strokeWidth="8" />
          <circle
            cx="60" cy="60" r={radius} fill="none"
            stroke={gaugeColor} strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            className="transition-all duration-1000 ease-out"
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
  const [batchResults, setBatchResults] = useState<BatchResult[] | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
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
  const [telegramConfigured, setTelegramConfigured] = useState(false);
  const [telegramHasBotToken, setTelegramHasBotToken] = useState(false);
  const [telegramHasChatId, setTelegramHasChatId] = useState(false);
  const [alertLoading, setAlertLoading] = useState(false);
  const [alertHistory, setAlertHistory] = useState<Array<{ keyword: string; sourceType: string; sourceName: string; timestamp: string; telegramSent: boolean }>>([]);

  // ── Chat states ──
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<{ role: 'user' | 'assistant'; content: string }[]>([
    { role: 'assistant', content: '¡Hola! Soy **SOFIA**, tu asistente OSINT. Puedo ayudarte a entender los resultados de escaneo, recomendar acciones de seguridad, orientarte sobre legislación colombiana y explicarte cómo usar el portal. ¿En qué te puedo ayudar?' }
  ]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);

  // ── Scan Cycle Automation states ──
  const [cycleActive, setCycleActive] = useState(false);
  const [cycleNextScan, setCycleNextScan] = useState<number | null>(null); // timestamp of next scan
  const [cycleCountdown, setCycleCountdown] = useState<number>(0); // seconds remaining
  const [activeEngines, setActiveEngines] = useState<Record<string, { active: boolean; endTime: number; countdown: number }>>({});
  const cycleTimerRef = useRef<NodeJS.Timeout | null>(null);
  const cycleCountdownRef = useRef<NodeJS.Timeout | null>(null);
  const engineTimersRef = useRef<Record<string, NodeJS.Timeout>>({});

  // ── Fetch alert configuration ──
  async function fetchAlertConfig() {
    try {
      const res = await fetch('/api/alerts');
      if (res.ok) {
        const data = await res.json();
        setAlertKeywords(data.keywords || []);
        setTelegramConfigured(data.telegram?.configured || false);
        setTelegramHasBotToken(data.telegram?.hasBotToken || false);
        setTelegramHasChatId(data.telegram?.hasChatId || false);
        setAlertHistory(data.alertHistory || []);
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
      }
    } catch { /* ignore */ }
    setAlertLoading(false);
  }

  async function handleTestAlert() {
    setAlertLoading(true);
    try {
      const res = await fetch('/api/alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'test_alert' }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          alert('✅ Alerta de prueba enviada exitosamente');
        } else {
          alert(`❌ Error: ${data.error || data.message || 'No se pudo enviar la alerta'}`);
        }
      }
    } catch {
      alert('❌ Error de conexión al enviar alerta de prueba');
    }
    setAlertLoading(false);
  }

  useEffect(() => {
    fetchPastScans();
    fetchAlertConfig();
  }, []);

  // ── Scan Cycle Automation: Cleanup on unmount ──
  useEffect(() => {
    return () => {
      if (cycleTimerRef.current) clearInterval(cycleTimerRef.current);
      if (cycleCountdownRef.current) clearInterval(cycleCountdownRef.current);
      Object.values(engineTimersRef.current).forEach(t => clearInterval(t));
    };
  }, []);

  // ── Scan Cycle: Countdown updater ──
  useEffect(() => {
    if (!cycleActive || !cycleNextScan) {
      if (cycleCountdownRef.current) clearInterval(cycleCountdownRef.current);
      return;
    }
    cycleCountdownRef.current = setInterval(() => {
      const remaining = Math.max(0, Math.floor((cycleNextScan - Date.now()) / 1000));
      setCycleCountdown(remaining);
      if (remaining <= 0 && cycleCountdownRef.current) {
        clearInterval(cycleCountdownRef.current);
      }
    }, 1000);
    return () => { if (cycleCountdownRef.current) clearInterval(cycleCountdownRef.current); };
  }, [cycleActive, cycleNextScan]);

  // ── Scan Cycle: Engine countdown updater ──
  useEffect(() => {
    const activeKeys = Object.keys(activeEngines).filter(k => activeEngines[k].active);
    if (activeKeys.length === 0) return;

    const interval = setInterval(() => {
      const now = Date.now();
      const updated = { ...activeEngines };
      let changed = false;
      for (const key of activeKeys) {
        const engine = updated[key];
        if (!engine) continue;
        const remaining = Math.max(0, Math.floor((engine.endTime - now) / 1000));
        if (remaining !== engine.countdown) {
          updated[key] = { ...engine, countdown: remaining };
          changed = true;
        }
        if (remaining <= 0) {
          // Auto-deactivate
          updated[key] = { active: false, endTime: 0, countdown: 0 };
          changed = true;
          if (engineTimersRef.current[key]) {
            clearInterval(engineTimersRef.current[key]);
            delete engineTimersRef.current[key];
          }
        }
      }
      if (changed) setActiveEngines(updated);
    }, 1000);

    return () => clearInterval(interval);
  }, [activeEngines]);

  // ── Scan Cycle: Toggle cycle on/off ──
  function toggleCycle() {
    if (cycleActive) {
      // Turn OFF
      setCycleActive(false);
      setCycleNextScan(null);
      setCycleCountdown(0);
      if (cycleTimerRef.current) { clearInterval(cycleTimerRef.current); cycleTimerRef.current = null; }
      if (cycleCountdownRef.current) { clearInterval(cycleCountdownRef.current); cycleCountdownRef.current = null; }
      // Clear all engine timers
      Object.values(engineTimersRef.current).forEach(t => clearInterval(t));
      engineTimersRef.current = {};
      setActiveEngines({});
    } else {
      // Turn ON — start 30-minute cycle
      setCycleActive(true);
      const nextTime = Date.now() + 30 * 60 * 1000;
      setCycleNextScan(nextTime);
      setCycleCountdown(30 * 60);

      // Trigger first scan immediately
      handleSocialScan();

      // Set interval for subsequent scans every 30 minutes
      cycleTimerRef.current = setInterval(() => {
        handleSocialScan();
        const newNextTime = Date.now() + 30 * 60 * 1000;
        setCycleNextScan(newNextTime);
        setCycleCountdown(30 * 60);
      }, 30 * 60 * 1000);
    }
  }

  // ── Scan Cycle: Activate individual engine for 10 minutes ──
  function activateEngine(engineId: string) {
    const searchValue = getSocialSearchValue();
    if (!searchValue) return;

    const engine = searchEngines.find(e => e.id === engineId);
    if (!engine) return;

    const endTime = Date.now() + 10 * 60 * 1000;

    setActiveEngines(prev => ({
      ...prev,
      [engineId]: { active: true, endTime, countdown: 10 * 60 },
    }));

    // Open search in new tab
    const query = buildPlatformSearchQuery(
      { name: socialSearchMode === 'nickname' ? 'Usuario' : socialSearchMode === 'email' ? 'Email' : 'Persona', domain: '' } as typeof socialPlatforms[0],
      engine
    );
    const url = engine.buildUrl(query || searchValue);
    window.open(url, '_blank');

    // Set auto-deactivation timer
    if (engineTimersRef.current[engineId]) {
      clearInterval(engineTimersRef.current[engineId]);
    }
    engineTimersRef.current[engineId] = setInterval(() => {
      setActiveEngines(prev => {
        const entry = prev[engineId];
        if (!entry || !entry.active) {
          if (engineTimersRef.current[engineId]) {
            clearInterval(engineTimersRef.current[engineId]);
            delete engineTimersRef.current[engineId];
          }
          return prev;
        }
        return prev; // countdown is handled by the useEffect above
      });
    }, 10 * 60 * 1000);
  }

  function deactivateEngine(engineId: string) {
    setActiveEngines(prev => {
      const updated = { ...prev };
      delete updated[engineId];
      return updated;
    });
    if (engineTimersRef.current[engineId]) {
      clearInterval(engineTimersRef.current[engineId]);
      delete engineTimersRef.current[engineId];
    }
  }

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
    setProgress(0);

    const progressInterval = setInterval(() => {
      setProgress(prev => {
        if (prev >= 90) { clearInterval(progressInterval); return 90; }
        return prev + Math.random() * 5;
      });
    }, 500);

    try {
      const res = await fetch('/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName, cedula, email, phone, reportFormat,
          selectedEngines: Array.from(selectedEngines),
        }),
      });

      clearInterval(progressInterval);
      setProgress(100);

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Error en el escaneo');
      }

      const data: ScanResponse = await res.json();
      setScanData(data);
      setActiveTab('results');
      fetchPastScans();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setLoading(false);
      setTimeout(() => setProgress(0), 1000);
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
    { id: 'google', name: 'Google', color: 'text-blue-400', bgColor: 'bg-blue-900/15', borderColor: 'border-blue-800/30', buildUrl: (q: string) => `https://www.google.com/search?q=${encodeURIComponent(q)}` },
    { id: 'bing', name: 'Bing', color: 'text-cyan-400', bgColor: 'bg-cyan-900/15', borderColor: 'border-cyan-800/30', buildUrl: (q: string) => `https://www.bing.com/search?q=${encodeURIComponent(q)}` },
    { id: 'yandex', name: 'Yandex', color: 'text-red-400', bgColor: 'bg-red-900/15', borderColor: 'border-red-800/30', buildUrl: (q: string) => `https://yandex.com/search/?text=${encodeURIComponent(q)}` },
    { id: 'duckduckgo', name: 'DuckDuckGo', color: 'text-orange-400', bgColor: 'bg-orange-900/15', borderColor: 'border-orange-800/30', buildUrl: (q: string) => `https://duckduckgo.com/?q=${encodeURIComponent(q)}` },
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
    setSocialScanProgress(0);

    const progressInterval = setInterval(() => {
      setSocialScanProgress(prev => {
        if (prev >= 90) { clearInterval(progressInterval); return 90; }
        return prev + Math.random() * 3;
      });
    }, 600);

    try {
      // Build payload with ONLY the parameters relevant to the active search mode
      const payload: Record<string, unknown> = {
        searchMode: socialSearchMode,
        selectedPlatforms: Array.from(selectedSocialPlatforms),
      };

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

      clearInterval(progressInterval);
      setSocialScanProgress(100);

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Error en el escaneo de redes sociales');
      }

      const data: SocialScanResponse = await res.json();
      setSocialScanData(data);
      // Refresh history list to include the new social media scan
      fetchPastScans();
    } catch (err) {
      setSocialScanError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setSocialScanLoading(false);
      setTimeout(() => setSocialScanProgress(0), 1000);
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
    setRelationshipAnalysis(null);
    setJointAnalysisId(null);
    setUploadProgress(0);

    const progressInterval = setInterval(() => {
      setUploadProgress(prev => {
        if (prev >= 85) { clearInterval(progressInterval); return 85; }
        return prev + Math.random() * 2;
      });
    }, 800);

    try {
      const fileName = uploadFile.name.toLowerCase();
      const isXLSX = fileName.endsWith('.xlsx') || fileName.endsWith('.xls');

      if (isXLSX) {
        // ── Always use server-side parsing — more reliable for .xls and .xlsx ──
        // Client-side xlsx import was causing Application errors on Vercel
        try {
          const formData = new FormData();
          formData.append('file', uploadFile);
          const res = await fetch('/api/upload', { method: 'POST', body: formData });
          clearInterval(progressInterval);
          setUploadProgress(100);

          if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            // Check if server detected genuine file encryption (not just sheet protection)
            if (errData.isEncrypted === true) {
              throw new Error(
                'El archivo tiene cifrado real y no puede ser leido. Abre el archivo en Excel, elimina la protección y guárdalo como .xlsx.'
              );
            }
            throw new Error(errData.error || 'Error al procesar archivo Excel en el servidor');
          }

          const uploadData = await res.json();

          if (uploadData.type === 'xlsx_multi_sheet') {
            setSheetNames(uploadData.sheetNames || []);
            setBatchResults(uploadData.results);
            setRelationshipAnalysis(uploadData.relationshipAnalysis || null);
            setJointAnalysisId(uploadData.jointAnalysisId || null);
            setJointReportFileName(uploadData.jointReportFileName || null);
          } else {
            setBatchResults(uploadData.results);
          }

          fetchPastScans();
        } catch (serverError) {
          const msg = serverError instanceof Error ? serverError.message : 'Error desconocido';
          // Only re-throw as "encrypted" if the server explicitly flagged it with isEncrypted=true
          // This prevents false positives from .xls files that merely have sheet protection
          if (msg.includes('[ENCRYPTED]')) {
            throw new Error('El archivo tiene cifrado real y no puede ser leido. Abre el archivo en Excel, elimina la protección y guárdalo como .xlsx.');
          }
          throw new Error(msg || 'No se pudo leer el archivo Excel. Verifica que el archivo no esté dañado.');
        }
      } else {
        // CSV or other format
        const formData = new FormData();
        formData.append('file', uploadFile);
        const res = await fetch('/api/upload', { method: 'POST', body: formData });
        clearInterval(progressInterval);
        setUploadProgress(100);
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || 'Error al procesar archivo');
        }
        const data = await res.json();
        setBatchResults(data.results);
        fetchPastScans();
      }
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setUploadLoading(false);
      setTimeout(() => setUploadProgress(0), 1000);
    }
  }, [uploadFile]);

  // ── Drag & drop handlers ──
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files);
    const validFile = files.find(f => f.name.endsWith('.csv') || f.name.endsWith('.xlsx') || f.name.endsWith('.xls'));
    if (validFile) { setUploadFile(validFile); setUploadError(null); }
    else setUploadError('Formato no soportado. Use .csv, .xlsx o .xls');
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
  const riskColor = riskScore >= 70 ? 'text-red-400' : riskScore >= 40 ? 'text-orange-400' : riskScore >= 15 ? 'text-amber-400' : 'text-green-400';

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
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#0b0f19] text-slate-200 gap-4">
        <div className="p-4 bg-[#111827] rounded-xl border border-[#1e293b]">
          <Loader2 className="w-10 h-10 text-blue-400 animate-spin" />
        </div>
        <p className="text-sm text-slate-400">Verificando autenticación...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#0b0f19] text-slate-200">

      {/* ── HEADER ── */}
      <header className="border-b border-[#1e293b] bg-[#0a0e17] sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center gap-3">
          <div className="p-2 bg-[#111827] rounded-lg border border-[#1e293b]">
            <Shield className="w-5 h-5 text-blue-500" />
          </div>
          <div>
            <h1 className="text-base font-semibold text-white tracking-tight">OSINT Data Scanner</h1>
            <p className="text-[10px] text-slate-500 -mt-0.5">Inteligencia de Fuentes Abiertas</p>
          </div>

          <div className="ml-auto flex items-center gap-3">
            {/* Connection status dot */}
            <div className="flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full ${testKeyStatus === 'success' ? 'bg-emerald-500' : testKeyStatus === 'error' ? 'bg-red-500' : 'bg-slate-600'}`} />
              <span className="text-[10px] text-slate-500 hidden sm:inline">
                {testKeyStatus === 'success' ? 'Conectado' : testKeyStatus === 'error' ? 'Desconectado' : 'Sin verificar'}
              </span>
            </div>

            <Badge variant="outline" className="border-[#1e293b] text-slate-400 text-xs bg-[#111827]">
              <Globe className="w-3 h-3 mr-1" />
              {selectedEngines.size}/{TOTAL_ENGINES}
            </Badge>

            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-slate-400 hover:text-white hover:bg-[#1a2235] rounded-lg"
              onClick={() => { setSettingsOpen(true); setTestKeyStatus('idle'); }}
            >
              <Settings className="w-4 h-4" />
            </Button>

            {/* User session & MFA indicator */}
            {authUser && (
              <>
                <div className="hidden sm:flex items-center gap-1.5 px-2 py-1 rounded-md bg-[#111827] border border-[#1e293b]">
                  <Mail className="w-3 h-3 text-amber-400" />
                  <span className="text-[10px] text-slate-400 font-medium">{authUser.email || authUser.username}</span>
                  <Badge className="bg-amber-900/40 text-amber-300 text-[8px] px-1 py-0 h-4">
                    {authUser.role}
                  </Badge>
                </div>
                <a href="/setup-mfa" className="h-8 w-8 flex items-center justify-center text-slate-400 hover:text-amber-400 hover:bg-[#1a2235] rounded-lg transition-colors" title="Configurar MFA">
                  <Fingerprint className="w-4 h-4" />
                </a>
              </>
            )}

            {/* Logout button */}
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-slate-400 hover:text-red-400 hover:bg-red-900/20 rounded-lg"
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
        <DialogContent className="bg-[#111827] border-[#1e293b] text-slate-200 sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2">
              <Settings className="w-5 h-5 text-blue-400" />
              Configuración
            </DialogTitle>
            <DialogDescription className="text-slate-500">
              Configura las opciones avanzadas del escáner OSINT
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* API Key Status - Server-side only, no input field */}
            <div className="p-4 rounded-lg bg-[#0b0f19] border border-[#1e293b] space-y-3">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${testKeyStatus === 'success' ? 'bg-green-900/30' : testKeyStatus === 'error' ? 'bg-red-900/30' : 'bg-slate-800/50'}`}>
                  {testKeyStatus === 'success' ? (
                    <CheckCircle2 className="w-5 h-5 text-green-400" />
                  ) : testKeyStatus === 'error' ? (
                    <XCircle className="w-5 h-5 text-red-400" />
                  ) : (
                    <WifiOff className="w-5 h-5 text-slate-500" />
                  )}
                </div>
                <div className="flex-1">
                  <p className={`text-sm font-medium ${testKeyStatus === 'success' ? 'text-green-400' : testKeyStatus === 'error' ? 'text-red-400' : 'text-slate-400'}`}>
                    IA DeepSeek
                  </p>
                  <p className="text-xs text-slate-500">
                    La clave API se configura en el servidor. No se requiere configuración manual.
                  </p>
                </div>
                <Badge className={`${testKeyStatus === 'success' ? 'bg-green-800 text-green-200' : testKeyStatus === 'error' ? 'bg-red-800 text-red-200' : 'bg-slate-700 text-slate-300'} text-[10px]`}>
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
                  className="border-[#1e293b] text-slate-300 hover:bg-[#1a2235] hover:text-white"
                >
                  {testKeyLoading ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Probando...</>
                  ) : (
                    <><Wifi className="w-4 h-4 mr-2" />Probar Conexión</>
                  )}
                </Button>
                {testKeyStatus === 'success' && (
                  <span className="text-sm text-green-400 flex items-center gap-1">
                    <CheckCircle2 className="w-4 h-4" /> Conexión exitosa
                  </span>
                )}
                {testKeyStatus === 'error' && (
                  <span className="text-sm text-red-400 flex items-center gap-1">
                    <XCircle className="w-4 h-4" /> Error de conexión
                  </span>
                )}
              </div>
            </div>

            {/* Info note */}
            <div className="p-3 rounded-lg bg-[#0b0f19] border border-[#1e293b]">
              <div className="flex items-start gap-2">
                <Info className="w-4 h-4 text-slate-500 mt-0.5 shrink-0" />
                <p className="text-xs text-slate-500 leading-relaxed">
                  El motor de IA DeepSeek se configura mediante variables de entorno en el servidor. Verifica la conexión para confirmar que el servicio está disponible.
                </p>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setSettingsOpen(false)} className="border-[#1e293b] text-slate-300">
              Cerrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── MAIN CONTENT ── */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 py-6">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="bg-[#111827] border border-[#1e293b] flex-wrap h-auto gap-1 p-1">
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
                <Card className="bg-[#111827] border-[#1e293b]">
                  <CardHeader>
                    <CardTitle className="text-white flex items-center gap-2">
                      <User className="w-5 h-5 text-blue-400" />
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
                        <Input id="fullName" placeholder="Juan Perez Garcia" value={fullName} onChange={e => setFullName(e.target.value)} className="pl-10 bg-[#0b0f19] border-[#1e293b] text-white placeholder:text-slate-600 focus:border-blue-600" />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="cedula" className="text-slate-300 text-sm">Cedula / Documento</Label>
                      <div className="relative">
                        <FileText className="absolute left-3 top-2.5 w-4 h-4 text-slate-600" />
                        <Input id="cedula" placeholder="1234567890" value={cedula} onChange={e => setCedula(e.target.value)} className="pl-10 bg-[#0b0f19] border-[#1e293b] text-white placeholder:text-slate-600 focus:border-blue-600" />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="email" className="text-slate-300 text-sm">Correo Electronico</Label>
                      <div className="relative">
                        <Mail className="absolute left-3 top-2.5 w-4 h-4 text-slate-600" />
                        <Input id="email" type="email" placeholder="correo@ejemplo.com" value={email} onChange={e => setEmail(e.target.value)} className="pl-10 bg-[#0b0f19] border-[#1e293b] text-white placeholder:text-slate-600 focus:border-blue-600" />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="phone" className="text-slate-300 text-sm">Numero de Telefono</Label>
                      <div className="relative">
                        <Phone className="absolute left-3 top-2.5 w-4 h-4 text-slate-600" />
                        <Input id="phone" placeholder="+57 300 1234567" value={phone} onChange={e => setPhone(e.target.value)} className="pl-10 bg-[#0b0f19] border-[#1e293b] text-white placeholder:text-slate-600 focus:border-blue-600" />
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
                          className={reportFormat === 'pdf' ? 'bg-blue-700 hover:bg-blue-800 text-white' : 'border-[#1e293b] text-slate-400 hover:text-white'}
                        >
                          <FileDown className="w-4 h-4 mr-1" /> PDF
                        </Button>
                        <Button
                          type="button" size="sm"
                          variant={reportFormat === 'docx' ? 'default' : 'outline'}
                          onClick={() => setReportFormat('docx')}
                          className={reportFormat === 'docx' ? 'bg-blue-700 hover:bg-blue-800 text-white' : 'border-[#1e293b] text-slate-400 hover:text-white'}
                        >
                          <FileText className="w-4 h-4 mr-1" /> DOCX
                        </Button>
                      </div>
                    </div>

                    {error && (
                      <div className="p-3 bg-red-900/20 border border-red-800/30 rounded-lg text-red-400 text-sm">
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

                    {progress > 0 && <Progress value={progress} className="h-2" />}

                    {scanData && (
                      <div className="flex gap-2">
                        <Button onClick={() => handleDownloadReport(scanData.scanId, 'pdf')} className="flex-1 bg-[#1a2235] hover:bg-[#243049] text-white border border-[#1e293b]">
                          <Download className="w-4 h-4 mr-2" />PDF
                        </Button>
                        <Button onClick={() => handleDownloadReport(scanData.scanId, 'docx')} className="flex-1 bg-[#1a2235] hover:bg-[#243049] text-white border border-[#1e293b]">
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
                <Card className="bg-[#111827] border-[#1e293b]">
                  <CardHeader>
                    <CardTitle className="text-white flex items-center gap-2 text-sm">
                      <Upload className="w-4 h-4 text-blue-400" />
                      Zona de análisis de archivos
                    </CardTitle>
                    <CardDescription className="text-slate-500 text-xs">
                      Carga archivos Excel (.xlsx / .xls) para investigación OSINT individual y cruce de vínculos
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div
                      onDrop={handleDrop}
                      onDragOver={handleDragOver}
                      onDragLeave={handleDragLeave}
                      className={`border-2 border-dashed rounded-lg p-6 text-center transition-all cursor-pointer ${
                        isDragging
                          ? 'border-blue-500 bg-blue-900/10'
                          : uploadFile
                            ? 'border-blue-700/50 bg-blue-900/5'
                            : 'border-[#1e293b] bg-[#0b0f19] hover:border-slate-600 hover:bg-[#111827]'
                      }`}
                      onClick={() => {
                        const input = document.createElement('input');
                        input.type = 'file';
                        input.accept = '.csv,.xlsx,.xls';
                        input.onchange = (e) => {
                          const file = (e.target as HTMLInputElement).files?.[0];
                          if (file) { setUploadFile(file); setUploadError(null); }
                        };
                        input.click();
                      }}
                    >
                      {uploadFile ? (
                        <div className="space-y-1">
                          <FileSpreadsheet className="w-8 h-8 mx-auto text-blue-400" />
                          <p className="text-sm font-medium text-white">{uploadFile.name}</p>
                          <p className="text-xs text-slate-500">{(uploadFile.size / 1024).toFixed(1)} KB</p>
                          <Button variant="ghost" size="sm" className="text-red-400 hover:text-red-300 h-6 text-xs" onClick={(e) => { e.stopPropagation(); setUploadFile(null); }}>
                            <XCircle className="w-3 h-3 mr-1" /> Quitar
                          </Button>
                        </div>
                      ) : (
                        <div className="space-y-1">
                          <Upload className="w-8 h-8 mx-auto text-slate-600" />
                          <p className="text-sm text-slate-400">Arrastra tu archivo aquí o haz clic</p>
                          <p className="text-[10px] text-slate-600">.xlsx / .xls (máx. 30 personas/hoja) | .csv</p>
                        </div>
                      )}
                    </div>

                    {uploadError && (
                      <div className="p-2 bg-red-900/20 border border-red-800/30 rounded-lg text-red-400 text-xs">
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

                    {uploadProgress > 0 && <Progress value={uploadProgress} className="h-1.5" />}

                    {/* Batch Results (compact inline) */}
                    {batchResults && batchResults.length > 0 && (
                      <div className="space-y-2 mt-2">
                        <Separator className="bg-[#1e293b]" />
                        <p className="text-xs font-medium text-slate-400">{batchResults.length} persona(s) procesada(s)</p>
                        <ScrollArea className="max-h-48">
                          <div className="space-y-2">
                            {batchResults.map((result, idx) => {
                              const s = result.summary || { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
                              const totalRisk = Math.min(100, s.critical * 30 + s.high * 15 + s.medium * 5 + s.low * 2);
                              const rLabel = totalRisk >= 70 ? 'CRITICO' : totalRisk >= 40 ? 'ALTO' : totalRisk >= 15 ? 'MODERADO' : 'BAJO';
                              const rColor = totalRisk >= 70 ? 'text-red-400' : totalRisk >= 40 ? 'text-orange-400' : totalRisk >= 15 ? 'text-amber-400' : 'text-green-400';

                              return (
                                <div key={idx} className="p-3 bg-[#0b0f19] rounded-lg border border-[#1e293b]">
                                  <div className="flex items-center justify-between">
                                    <div className="flex-1 min-w-0">
                                      <p className="text-xs font-medium text-white">{result.fullName || result.sheetName || `Resultado ${idx + 1}`}</p>
                                      <div className="flex items-center gap-2 mt-1">
                                        <Badge variant="outline" className="border-[#1e293b] text-slate-400 text-[10px]">{result.totalResults || result.rowCount || 0} hallazgos</Badge>
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
                                      <Button size="sm" variant="outline" className="border-[#1e293b] text-slate-400 hover:text-white h-7 text-[10px] px-2" onClick={() => handleDownloadReport(result.scanId, 'docx')}>
                                        <FileText className="w-3 h-3" />
                                      </Button>
                                      <Button size="sm" className="bg-emerald-700 hover:bg-emerald-800 text-white h-7 text-[10px] px-2" onClick={() => handleDownloadBothReports(result.scanId)}>
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
                          <div className="p-3 bg-violet-900/15 border border-violet-800/30 rounded-lg">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <GitBranch className="w-4 h-4 text-violet-400" />
                                <div>
                                  <p className="text-xs font-medium text-violet-300">Vinculos: {relationshipAnalysis.totalLinks}</p>
                                  <p className="text-[10px] text-violet-500">{relationshipAnalysis.sheet1Name} ↔ {relationshipAnalysis.sheet2Name}</p>
                                </div>
                              </div>
                              <div className="flex gap-1.5">
                                <Button size="sm" className="bg-violet-700 hover:bg-violet-800 text-white h-7 text-[10px]" onClick={() => handleDownloadJointReport(jointAnalysisId, 'pdf')}>
                                  <Download className="w-3 h-3 mr-1" />PDF
                                </Button>
                                <Button size="sm" className="bg-violet-900/40 hover:bg-violet-900/60 text-violet-300 border border-violet-800/30 h-7 text-[10px]" onClick={() => handleDownloadJointReport(jointAnalysisId, 'docx')}>
                                  <FileSpreadsheet className="w-3 h-3 mr-1" />DOCX
                                </Button>
                                <Button size="sm" className="bg-emerald-700 hover:bg-emerald-800 text-white h-7 text-[10px]" onClick={() => handleDownloadBothJointReports(jointAnalysisId)}>
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
                                        className={`p-2 rounded-md border cursor-pointer transition-colors ${config.bgColor} hover:bg-[#1a2235]`}
                                        onClick={() => setExpandedLink(isExpanded ? null : `${idx}`)}
                                      >
                                        <div className="flex items-center gap-2">
                                          <Icon className={`w-3 h-3 ${config.color} shrink-0`} />
                                          <p className="text-[10px] text-white flex-1 min-w-0 truncate">
                                            <span className="text-blue-400">{link.sheet1Person}</span>
                                            <span className="text-slate-500 mx-1">↔</span>
                                            <span className="text-violet-400">{link.sheet2Person}</span>
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
                <Card className="bg-[#111827] border-[#1e293b]">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-white flex items-center gap-2">
                        <Database className="w-5 h-5 text-blue-400" />
                        Motores de Busqueda
                      </CardTitle>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-500">{selectedEngines.size}/{TOTAL_ENGINES}</span>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={toggleAllEngines}
                          className="border-[#1e293b] text-slate-400 hover:bg-[#1a2235] text-xs h-7"
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
                              className="border-slate-600 data-[state=checked]:bg-blue-600 data-[state=checked]:border-blue-600"
                            />
                            <span className={`text-xs font-semibold group-hover:brightness-125 transition-all ${getCategoryColor(category.color)}`}>
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
                                  className={`group flex items-start gap-2 p-2.5 rounded-lg border cursor-pointer transition-all duration-200 ${
                                    isSelected
                                      ? `${getCategoryColor(category.color, 'bg')} ${getCategoryColor(category.color, 'border')}`
                                      : 'bg-[#0b0f19] border-[#1e293b] opacity-50 hover:opacity-80 hover:border-slate-600'
                                  }`}
                                  onClick={() => toggleEngine(engine.name)}
                                >
                                  <div className={`mt-0.5 shrink-0 w-7 h-7 rounded-md flex items-center justify-center transition-all ${
                                    isSelected ? 'bg-[#0b0f19]' : 'bg-slate-800/30'
                                  }`}>
                                    <EngineIcon className={`w-3.5 h-3.5 transition-all ${
                                      isSelected ? getCategoryColor(category.color) : 'text-slate-600 group-hover:text-slate-400'
                                    }`} />
                                  </div>

                                  <div className="min-w-0 flex-1">
                                    <p className={`text-xs font-semibold truncate ${isSelected ? 'text-white' : 'text-slate-500'}`}>
                                      {engine.name}
                                    </p>
                                    <p className={`text-[10px] truncate ${isSelected ? 'text-slate-300' : 'text-slate-600'}`}>{engine.desc}</p>
                                  </div>

                                  {/* Check indicator */}
                                  <div className={`mt-0.5 shrink-0 w-4 h-4 rounded border-2 flex items-center justify-center transition-all ${
                                    isSelected
                                      ? 'bg-blue-500 border-blue-500'
                                      : 'border-slate-600 bg-transparent'
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
                <Card className="bg-[#111827] border-[#1e293b]">
                  <CardContent className="p-6">
                    <div className="flex flex-col sm:flex-row items-center gap-6">
                      {/* Risk Gauge */}
                      <RiskGauge score={riskScore} label={riskLabel} color={riskColor} />

                      {/* Summary Cards */}
                      <div className="flex-1 grid grid-cols-2 sm:grid-cols-3 gap-3 w-full">
                        <div className="p-3 bg-[#0b0f19] rounded-lg border border-[#1e293b] text-center cursor-pointer hover:opacity-80 transition-opacity" onClick={() => setDetailModal({ open: true, title: 'Todos los Hallazgos', items: scanData.results.map(r => ({ title: r.title, description: r.description || r.dataFound || 'Sin descripción', source: r.source })) })}>
                          <p className="text-2xl font-bold text-white">{scanData.totalResults}</p>
                          <p className="text-xs text-slate-500">Total</p>
                        </div>
                        <div className="p-3 bg-red-900/20 rounded-lg border border-red-800/30 text-center cursor-pointer hover:opacity-80 transition-opacity" onClick={() => setDetailModal({ open: true, title: 'Hallazgos Críticos', items: scanData.results.filter(r => r.severity === 'critical').map(r => ({ title: r.title, description: r.description || r.dataFound || 'Sin descripción', source: r.source })) })}>
                          <p className="text-2xl font-bold text-red-400">{scanData.summary.critical}</p>
                          <p className="text-xs text-slate-500">Criticos</p>
                        </div>
                        <div className="p-3 bg-orange-900/20 rounded-lg border border-orange-800/30 text-center cursor-pointer hover:opacity-80 transition-opacity" onClick={() => setDetailModal({ open: true, title: 'Hallazgos Altos', items: scanData.results.filter(r => r.severity === 'high').map(r => ({ title: r.title, description: r.description || r.dataFound || 'Sin descripción', source: r.source })) })}>
                          <p className="text-2xl font-bold text-orange-400">{scanData.summary.high}</p>
                          <p className="text-xs text-slate-500">Altos</p>
                        </div>
                        <div className="p-3 bg-amber-900/20 rounded-lg border border-amber-800/30 text-center cursor-pointer hover:opacity-80 transition-opacity" onClick={() => setDetailModal({ open: true, title: 'Hallazgos Medios', items: scanData.results.filter(r => r.severity === 'medium').map(r => ({ title: r.title, description: r.description || r.dataFound || 'Sin descripción', source: r.source })) })}>
                          <p className="text-2xl font-bold text-amber-400">{scanData.summary.medium}</p>
                          <p className="text-xs text-slate-500">Medios</p>
                        </div>
                        <div className="p-3 bg-blue-900/20 rounded-lg border border-blue-800/30 text-center cursor-pointer hover:opacity-80 transition-opacity" onClick={() => setDetailModal({ open: true, title: 'Hallazgos Bajos', items: scanData.results.filter(r => r.severity === 'low').map(r => ({ title: r.title, description: r.description || r.dataFound || 'Sin descripción', source: r.source })) })}>
                          <p className="text-2xl font-bold text-blue-400">{scanData.summary.low}</p>
                          <p className="text-xs text-slate-500">Bajos</p>
                        </div>
                        <div className="p-3 bg-slate-800/30 rounded-lg border border-slate-700/30 text-center cursor-pointer hover:opacity-80 transition-opacity" onClick={() => setDetailModal({ open: true, title: 'Hallazgos Informativos', items: scanData.results.filter(r => r.severity === 'info').map(r => ({ title: r.title, description: r.description || r.dataFound || 'Sin descripción', source: r.source })) })}>
                          <p className="text-2xl font-bold text-slate-400">{scanData.summary.info}</p>
                          <p className="text-xs text-slate-500">Info</p>
                        </div>
                      </div>
                    </div>

                    {/* Download Buttons */}
                    <div className="flex items-center justify-center gap-3 mt-6 pt-4 border-t border-[#1e293b]">
                      <span className="text-sm text-slate-400">Descargar Informe:</span>
                      <Button onClick={() => handleDownloadReport(scanData.scanId, 'pdf')} className="bg-blue-700 hover:bg-blue-800 text-white">
                        <Download className="w-4 h-4 mr-2" />PDF
                      </Button>
                      <Button onClick={() => handleDownloadReport(scanData.scanId, 'docx')} className="bg-[#1a2235] hover:bg-[#243049] text-white border border-[#1e293b]">
                        <Download className="w-4 h-4 mr-2" />DOCX
                      </Button>
                      <Button onClick={() => handleDownloadBothReports(scanData.scanId)} className="bg-emerald-700 hover:bg-emerald-800 text-white">
                        <FileDown className="w-4 h-4 mr-2" />PDF + DOCX
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                {/* Severity Filter Buttons */}
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm text-slate-500">Filtrar:</span>
                  <Button size="sm" variant={filterSeverity === 'all' ? 'default' : 'outline'} onClick={() => setFilterSeverity('all')} className={filterSeverity === 'all' ? 'bg-blue-600 text-white' : 'border-[#1e293b] text-slate-400'}>
                    Todos ({scanData.totalResults})
                  </Button>
                  {Object.entries(severityBadgeConfig).map(([key, config]) => {
                    const count = scanData.summary[key as keyof ScanSummary];
                    if (count === 0) return null;
                    return (
                      <Button key={key} size="sm" variant={filterSeverity === key ? 'default' : 'outline'} onClick={() => setFilterSeverity(key)} className={filterSeverity === key ? `${config.color} border-0` : 'border-[#1e293b] text-slate-400'}>
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
                          <Card className="bg-[#111827] border-[#1e293b] overflow-hidden">
                            <CollapsibleTrigger asChild>
                              <div className="p-4 flex items-center gap-3 cursor-pointer hover:bg-[#1a2235] transition-colors">
                                <div className={`p-1.5 rounded-md ${maxConfig.color} shrink-0`}>
                                  <maxConfig.icon className="w-4 h-4" />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2">
                                    <p className="text-sm font-medium text-white truncate">{source}</p>
                                    <Badge className={`${maxConfig.color} text-xs`}>{maxConfig.label}</Badge>
                                  </div>
                                  <p className="text-xs text-slate-500">{results.length} hallazgo{results.length !== 1 ? 's' : ''}</p>
                                </div>
                                {isOpen ? <ChevronUp className="w-4 h-4 text-slate-600 shrink-0" /> : <ChevronDown className="w-4 h-4 text-slate-600 shrink-0" />}
                              </div>
                            </CollapsibleTrigger>
                            <CollapsibleContent>
                              <div className="border-t border-[#1e293b]">
                                {results.map((result, idx) => {
                                  const config = severityBadgeConfig[result.severity];
                                  const Icon = config.icon;
                                  const isExpanded = expandedResult === `${source}-${idx}`;
                                  return (
                                    <div
                                      key={idx}
                                      className="p-3 pl-6 border-b border-[#1e293b]/50 last:border-b-0 cursor-pointer hover:bg-[#1a2235]/50 transition-colors"
                                      onClick={() => setExpandedResult(isExpanded ? null : `${source}-${idx}`)}
                                    >
                                      <div className="flex items-start gap-2">
                                        <Badge className={`${config.color} text-[10px] shrink-0`}>{config.label}</Badge>
                                        <div className="flex-1 min-w-0">
                                          <p className="text-sm text-white break-words">{result.title}</p>
                                          {isExpanded && result.description && (
                                            <p className="text-sm text-slate-400 mt-1 break-words">{result.description}</p>
                                          )}
                                          {isExpanded && result.dataFound && (
                                            <p className="text-xs text-slate-500 mt-1 break-words">Datos: {result.dataFound}</p>
                                          )}
                                          <div className="flex items-center gap-2 mt-1">
                                            <Badge variant="outline" className="border-[#1e293b] text-slate-500 text-[10px]">
                                              {categoryLabels[result.category] || result.category}
                                            </Badge>
                                            {isExpanded && result.url && (
                                              <a href={result.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300" onClick={e => e.stopPropagation()}>
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
                        <ShieldCheck className="w-12 h-12 mx-auto mb-3 text-green-600" />
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
              <Card className="bg-[#111827] border-[#1e293b]">
                <CardContent className="p-6">
                  <div className="flex flex-col md:flex-row items-center gap-6">
                    <div className="flex-1 w-full">
                      <div className="flex items-center gap-3 mb-4">
                        <div className="p-2 bg-[#0b0f19] rounded-lg border border-[#1e293b]">
                          <Globe className="w-5 h-5 text-blue-400" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <h2 className="text-lg font-bold text-white">Investigación de Redes Sociales</h2>
                            {socialScanData.searchMode && (
                              <Badge className={`text-[9px] ${
                                socialScanData.searchMode === 'nickname'
                                  ? 'bg-rose-900/30 text-rose-400 border border-rose-800/30'
                                  : socialScanData.searchMode === 'email'
                                  ? 'bg-sky-900/30 text-sky-400 border border-sky-800/30'
                                  : 'bg-blue-900/30 text-blue-400 border border-blue-800/30'
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
                        <div className="p-3 bg-[#0b0f19] rounded-lg border border-[#1e293b] text-center cursor-pointer hover:opacity-80 transition-opacity" onClick={() => setDetailModal({ open: true, title: 'Perfiles Encontrados', items: socialScanData.results.filter(r => r.profileFound).map(r => ({ title: r.platform, description: r.profileFound ? `Perfil detectado${r.username ? ': @' + r.username : ''}${r.profileVerified ? ' (Verificado)' : ''}` : 'Sin perfil', platform: r.platform })) })}>
                          <p className="text-2xl font-bold text-blue-400">{socialScanData.summary.profilesFound}</p>
                          <p className="text-[10px] text-slate-500 font-medium">Perfiles Encontrados</p>
                        </div>
                        <div className="p-3 bg-[#0b0f19] rounded-lg border border-[#1e293b] text-center cursor-pointer hover:opacity-80 transition-opacity" onClick={() => setDetailModal({ open: true, title: 'Hallazgos Totales', items: socialScanData.results.flatMap(r => r.findings.map(f => ({ title: f.title, description: f.description || 'Sin descripción', platform: r.platform }))) })}>
                          <p className="text-2xl font-bold text-white">{socialScanData.summary.totalFindings}</p>
                          <p className="text-[10px] text-slate-500 font-medium">Hallazgos Totales</p>
                        </div>
                        <div className="p-3 bg-red-900/15 rounded-lg border border-red-800/30 text-center cursor-pointer hover:opacity-80 transition-opacity" onClick={() => setDetailModal({ open: true, title: 'Hallazgos Críticos y Altos', items: socialScanData.results.flatMap(r => r.findings.filter(f => f.severity === 'critical' || f.severity === 'high').map(f => ({ title: f.title, description: f.description || 'Sin descripción', platform: r.platform }))) })}>
                          <p className="text-2xl font-bold text-red-400">{socialScanData.summary.critical + socialScanData.summary.high}</p>
                          <p className="text-[10px] text-slate-500 font-medium">Críticos</p>
                        </div>
                        <div className="p-3 bg-amber-900/15 rounded-lg border border-amber-800/30 text-center cursor-pointer hover:opacity-80 transition-opacity" onClick={() => setDetailModal({ open: true, title: 'Hallazgos Medios', items: socialScanData.results.flatMap(r => r.findings.filter(f => f.severity === 'medium').map(f => ({ title: f.title, description: f.description || 'Sin descripción', platform: r.platform }))) })}>
                          <p className="text-2xl font-bold text-amber-400">{socialScanData.summary.medium}</p>
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
                          className="bg-[#1a2235] hover:bg-[#243049] text-white border border-[#1e293b] text-xs h-8"
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
                          className="bg-emerald-700 hover:bg-emerald-800 text-white text-xs h-8"
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
                        const socialRiskColor = socialRiskScore >= 70 ? 'text-red-400' : socialRiskScore >= 40 ? 'text-orange-400' : socialRiskScore >= 15 ? 'text-amber-400' : 'text-green-400';
                        return <RiskGauge score={socialRiskScore} label={`Riesgo Social: ${socialRiskLabel}`} color={socialRiskColor} />;
                      })()}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* ── Ciclo de Escaneo Automático Card ── */}
            <Card className="bg-[#111827] border-[#1e293b]">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className={`p-1.5 rounded-md ${cycleActive ? 'bg-emerald-900/30 border border-emerald-800/40' : 'bg-[#0b0f19] border border-[#1e293b]'}`}>
                      <Clock className={`w-4 h-4 ${cycleActive ? 'text-emerald-400' : 'text-slate-500'}`} />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-white leading-tight">Ciclo de Escaneo Automático</h3>
                      {cycleActive && cycleCountdown > 0 && (
                        <p className="text-[10px] text-emerald-400">
                          Próximo escaneo en {Math.floor(cycleCountdown / 60)}:{String(cycleCountdown % 60).padStart(2, '0')}
                        </p>
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={toggleCycle}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      cycleActive ? 'bg-emerald-600' : 'bg-slate-700'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        cycleActive ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>

                {/* Engine Activation Buttons */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                  {searchEngines.map(engine => {
                    const isActive = activeEngines[engine.id]?.active;
                    const countdown = activeEngines[engine.id]?.countdown || 0;
                    return (
                      <button
                        key={engine.id}
                        type="button"
                        onClick={() => isActive ? deactivateEngine(engine.id) : activateEngine(engine.id)}
                        disabled={!getSocialSearchValue() && !isActive}
                        className={`flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-md border text-[10px] font-medium transition-all ${
                          isActive
                            ? `${engine.bgColor} ${engine.borderColor} ${engine.color} ring-1 ring-current/20`
                            : 'bg-[#0b0f19] border-[#1e293b] text-slate-500 hover:border-slate-600 hover:text-slate-400 disabled:opacity-40 disabled:cursor-not-allowed'
                        }`}
                      >
                        <div className="flex items-center gap-1">
                          <ExternalLink className="w-2.5 h-2.5 shrink-0" />
                          <span>{engine.name}</span>
                          {isActive && <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />}
                        </div>
                        {isActive && countdown > 0 && (
                          <span className="text-[8px] opacity-70">
                            {Math.floor(countdown / 60)}:{String(countdown % 60).padStart(2, '0')}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>

                {cycleActive && (
                  <div className="mt-2 flex items-center gap-1.5 text-[10px] text-emerald-400/70">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    Ciclo activo · escaneo automático cada 30 min
                  </div>
                )}
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Left Column: Search Form + Platform Selector */}
              <div className="lg:col-span-5 space-y-4">
                <Card className="bg-[#111827] border-[#1e293b]">
                  <CardHeader>
                    <CardTitle className="text-white flex items-center gap-2">
                      <Globe className="w-5 h-5 text-blue-400" />
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
                          className={`flex flex-col items-center gap-1 p-2.5 rounded-lg border transition-all ${
                            socialSearchMode === 'nickname'
                              ? 'bg-rose-900/20 border-rose-800/40'
                              : 'bg-[#0b0f19] border-[#1e293b] hover:border-rose-800/30'
                          }`}
                        >
                          <AtSign className={`w-4 h-4 ${socialSearchMode === 'nickname' ? 'text-rose-400' : 'text-slate-500'}`} />
                          <span className={`text-[10px] font-bold ${socialSearchMode === 'nickname' ? 'text-rose-400' : 'text-slate-500'}`}>NickName</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => { setSocialSearchMode('email'); setSocialNickname(''); setSocialName(''); }}
                          className={`flex flex-col items-center gap-1 p-2.5 rounded-lg border transition-all ${
                            socialSearchMode === 'email'
                              ? 'bg-sky-900/20 border-sky-800/40'
                              : 'bg-[#0b0f19] border-[#1e293b] hover:border-sky-800/30'
                          }`}
                        >
                          <Mail className={`w-4 h-4 ${socialSearchMode === 'email' ? 'text-sky-400' : 'text-slate-500'}`} />
                          <span className={`text-[10px] font-bold ${socialSearchMode === 'email' ? 'text-sky-400' : 'text-slate-500'}`}>Correo</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => { setSocialSearchMode('name'); setSocialNickname(''); setSocialEmail(''); }}
                          className={`flex flex-col items-center gap-1 p-2.5 rounded-lg border transition-all ${
                            socialSearchMode === 'name'
                              ? 'bg-blue-900/20 border-blue-800/40'
                              : 'bg-[#0b0f19] border-[#1e293b] hover:border-blue-800/30'
                          }`}
                        >
                          <User className={`w-4 h-4 ${socialSearchMode === 'name' ? 'text-blue-400' : 'text-slate-500'}`} />
                          <span className={`text-[10px] font-bold ${socialSearchMode === 'name' ? 'text-blue-400' : 'text-slate-500'}`}>Nombre</span>
                        </button>
                      </div>
                    </div>

                    {/* Conditional Input based on Search Mode */}
                    {socialSearchMode === 'nickname' && (
                      <div className="space-y-1.5">
                        <Label className="text-xs text-rose-400 font-medium flex items-center gap-1.5">
                          <AtSign className="w-3.5 h-3.5" /> NickName / Usuario
                        </Label>
                        <Input
                          placeholder="ej: johndoe, @username"
                          value={socialNickname}
                          onChange={(e) => setSocialNickname(e.target.value)}
                          className="bg-[#0b0f19] border-rose-800/30 focus:border-rose-500 text-white placeholder:text-slate-600"
                        />
                      </div>
                    )}
                    {socialSearchMode === 'email' && (
                      <div className="space-y-1.5">
                        <Label className="text-xs text-sky-400 font-medium flex items-center gap-1.5">
                          <Mail className="w-3.5 h-3.5" /> Correo Electrónico
                        </Label>
                        <Input
                          type="email"
                          placeholder="ej: usuario@correo.com"
                          value={socialEmail}
                          onChange={(e) => setSocialEmail(e.target.value)}
                          className="bg-[#0b0f19] border-sky-800/30 focus:border-sky-500 text-white placeholder:text-slate-600"
                        />
                        {!socialEmail.trim() && email.trim() && (
                          <button
                            type="button"
                            onClick={() => setSocialEmail(email)}
                            className="text-[9px] text-sky-400 hover:text-sky-300 flex items-center gap-1"
                          >
                            <Sparkles className="w-2.5 h-2.5" /> Usar correo del formulario: {email}
                          </button>
                        )}
                      </div>
                    )}
                    {socialSearchMode === 'name' && (
                      <div className="space-y-1.5">
                        <Label className="text-xs text-blue-400 font-medium flex items-center gap-1.5">
                          <User className="w-3.5 h-3.5" /> Nombre Completo
                        </Label>
                        <Input
                          placeholder="ej: Juan Pérez García"
                          value={socialName}
                          onChange={(e) => setSocialName(e.target.value)}
                          className="bg-[#0b0f19] border-blue-800/30 focus:border-blue-500 text-white placeholder:text-slate-600"
                        />
                        {!socialName.trim() && fullName.trim() && (
                          <button
                            type="button"
                            onClick={() => setSocialName(fullName)}
                            className="text-[9px] text-blue-400 hover:text-blue-300 flex items-center gap-1"
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
                                className={`flex items-center gap-2 px-2.5 py-1.5 rounded-md border text-[10px] font-medium transition-all ${engine.bgColor} ${engine.borderColor} ${engine.color} hover:bg-[#1a2235]`}
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
                      <div className="p-2.5 bg-red-900/20 border border-red-800/30 rounded-lg text-red-400 text-sm flex items-start gap-2">
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
                <Card className="bg-[#111827] border-[#1e293b]">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-white flex items-center gap-2 text-sm">
                        <Database className="w-4 h-4 text-blue-400" />
                        Plataformas
                      </CardTitle>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-500">{selectedSocialPlatforms.size}/{socialPlatforms.length}</span>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={toggleAllSocialPlatforms}
                          className="border-[#1e293b] text-slate-400 hover:bg-[#1a2235] text-xs h-7"
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
                            className={`group flex items-center gap-1.5 p-2 rounded-lg border cursor-pointer transition-all min-h-[36px] ${
                              isSelected
                                ? `${platform.bgColor} ${platform.borderColor}`
                                : 'bg-[#0b0f19] border-[#1e293b] opacity-50 hover:opacity-80 hover:border-slate-600'
                            }`}
                            onClick={() => toggleSocialPlatform(platform.id)}
                          >
                            <div className={`w-5 h-5 rounded flex items-center justify-center shrink-0 ${
                              isSelected ? 'bg-[#0b0f19]' : 'bg-slate-800/30'
                            }`}>
                              <PlatformIcon className={`w-3 h-3 ${
                                isSelected ? platform.color : 'text-slate-600 group-hover:text-slate-400'
                              }`} />
                            </div>
                            <p className={`text-[10px] font-semibold truncate flex-1 min-w-0 ${
                              isSelected ? 'text-white' : 'text-slate-500'
                            }`}>
                              {platform.name}
                            </p>
                            <div className={`w-3 h-3 rounded-full border-2 flex items-center justify-center shrink-0 ${
                              isSelected
                                ? 'bg-blue-500 border-blue-500'
                                : 'border-slate-600 bg-transparent'
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
                <Card className="bg-[#111827] border-[#1e293b]">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-white flex items-center gap-2 text-sm">
                        <Network className="w-4 h-4 text-blue-400" />
                        Mapa de Huella Digital
                      </CardTitle>
                      {socialScanData && (
                        <div className="flex items-center gap-3 text-[10px]">
                          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500 inline-block" /> Perfil</span>
                          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500 inline-block" /> Menciones</span>
                          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500 inline-block" /> Sin datos</span>
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
                        let statusColor = 'bg-[#0b0f19] border-[#1e293b]';
                        let statusDot = 'bg-slate-700';
                        let statusLabel = '—';
                        let statusTextColor = 'text-slate-600';

                        if (wasScanned) {
                          if (result.profileFound) {
                            statusColor = `${platform.bgColor} border-green-800/40`;
                            statusDot = 'bg-green-500';
                            statusLabel = 'Perfil';
                            statusTextColor = 'text-green-400';
                          } else if (result.searchResultsCount > 0 || result.findings.length > 0) {
                            statusColor = `${platform.bgColor} border-amber-800/40`;
                            statusDot = 'bg-amber-500';
                            statusLabel = `${result.findings.length} men.`;
                            statusTextColor = 'text-amber-400';
                          } else {
                            statusColor = 'bg-[#0b0f19] border-red-800/30';
                            statusDot = 'bg-red-500';
                            statusLabel = 'Sin datos';
                            statusTextColor = 'text-red-400';
                          }
                        }

                        return (
                          <div
                            key={platform.id}
                            className={`relative flex flex-col items-center gap-1 p-2 rounded-lg border transition-all min-h-[68px] ${statusColor}`}
                          >
                            <div className={`absolute top-1 right-1 w-1.5 h-1.5 rounded-full ${statusDot} ${wasScanned && result?.profileFound ? 'animate-pulse' : ''}`} />
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                              wasScanned && result?.profileFound ? 'bg-[#0b0f19]' : 'bg-slate-800/30'
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
                              <div className="absolute inset-0 rounded-lg border-2 border-blue-500/20 animate-pulse" />
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
                      <BarChart3 className="w-4 h-4 text-blue-400" />
                      <h3 className="text-sm font-semibold text-white">Resultados por Plataforma</h3>
                      <Badge variant="outline" className="border-[#1e293b] text-slate-400 text-[10px]">
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
                              className={`bg-[#111827] border-[#1e293b] overflow-hidden transition-all hover:border-slate-600 ${
                                result.profileFound ? `border-l-2 border-l-green-500` : hasCriticalFindings ? 'border-l-2 border-l-orange-500' : ''
                              }`}
                            >
                              {/* Card Header - Compact */}
                              <div
                                className="px-3 py-2.5 flex items-center gap-2.5 cursor-pointer hover:bg-[#1a2235] transition-colors"
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
                                    <p className="text-xs font-semibold text-white">{result.platform}</p>
                                    {result.profileFound ? (
                                      <Badge className="bg-green-900/30 text-green-400 text-[8px] gap-0.5 border border-green-800/30 py-0">
                                        <CheckCircle2 className="w-2.5 h-2.5" /> Detectado
                                      </Badge>
                                    ) : result.findings.length > 0 ? (
                                      <Badge className="bg-amber-900/30 text-amber-400 text-[8px] gap-0.5 border border-amber-800/30 py-0">
                                        <Eye className="w-2.5 h-2.5" /> Menciones
                                      </Badge>
                                    ) : (
                                      <Badge variant="outline" className="border-[#1e293b] text-slate-500 text-[8px] py-0">
                                        Sin hallazgos
                                      </Badge>
                                    )}
                                    {result.profileVerified && (
                                      <Badge className="bg-green-900/20 text-green-300 text-[8px] gap-0.5 border border-green-800/30 py-0">
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
                                        className={`text-[8px] px-1 py-0.5 rounded border flex items-center gap-0.5 transition-all hover:bg-[#1a2235] ${engine.bgColor} ${engine.borderColor} ${engine.color}`}
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
                                <div className="border-t border-[#1e293b]">
                                  {result.profileUrl && (
                                    <div className="px-3 py-2 bg-green-900/5 flex items-center gap-2 border-b border-[#1e293b]/50">
                                      <div className="w-4 h-4 rounded-md bg-green-900/30 flex items-center justify-center shrink-0">
                                        <Link2 className="w-2.5 h-2.5 text-green-400" />
                                      </div>
                                      <div className="flex-1 min-w-0">
                                        <p className="text-[9px] text-green-400 font-medium">Perfil Encontrado</p>
                                        <a href={result.profileUrl} target="_blank" rel="noopener noreferrer" className="text-[10px] text-green-300 hover:text-green-200 truncate block" onClick={e => e.stopPropagation()}>
                                          {result.profileUrl}
                                        </a>
                                      </div>
                                      <a
                                        href={result.profileUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-[9px] px-1.5 py-0.5 rounded-md bg-green-900/20 text-green-400 hover:bg-green-900/40 transition-colors shrink-0"
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
                                      <div key={idx} className="px-3 py-2 border-b border-[#1e293b]/50 last:border-b-0 hover:bg-[#1a2235]/30 transition-colors">
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
                                            <p className="text-xs text-white break-words">{finding.title}</p>
                                            {finding.description && (
                                              <p className="text-[11px] text-slate-400 mt-0.5 break-words line-clamp-2">{finding.description}</p>
                                            )}
                                            {finding.url && (
                                              <a href={finding.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 text-[10px] text-blue-400 hover:text-blue-300 mt-1" onClick={e => e.stopPropagation()}>
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
                  <Card className="bg-[#111827] border-[#1e293b]">
                    <CardContent className="py-16 text-center">
                      <div className="w-16 h-16 rounded-full bg-[#0b0f19] flex items-center justify-center mx-auto mb-4 border border-[#1e293b]">
                        <Globe className="w-8 h-8 text-slate-600" />
                      </div>
                      <p className="text-slate-400 font-medium mb-1">Consola de Investigación Social</p>
                      <p className="text-xs text-slate-600 max-w-sm mx-auto">Selecciona las plataformas que deseas investigar y haz clic en &quot;Buscar en Redes&quot; para mapear la huella digital del objetivo.</p>
                    </CardContent>
                  </Card>
                )}

                {/* Loading state */}
                {socialScanLoading && (
                  <Card className="bg-[#111827] border-[#1e293b]">
                    <CardContent className="py-16 text-center">
                      <div className="relative w-16 h-16 mx-auto mb-4">
                        <div className="absolute inset-0 rounded-full border-2 border-slate-700" />
                        <div className="absolute inset-0 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
                        <div className="absolute inset-0 flex items-center justify-center">
                          <Globe className="w-6 h-6 text-blue-400" />
                        </div>
                      </div>
                      <p className="text-blue-300 font-semibold">Escaneando redes sociales...</p>
                      <p className="text-xs text-slate-500 mt-1">Buscando en {selectedSocialPlatforms.size} plataforma(s)</p>
                    </CardContent>
                  </Card>
                )}
              </div>
            </div>
          </TabsContent>

          {/* ────────────────────────────────────────────
              HISTORY TAB
          ──────────────────────────────────────────── */}
          <TabsContent value="history" className="space-y-4">
            {pastScans.length === 0 ? (
              <Card className="bg-[#111827] border-[#1e293b]">
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
                  <Button size="sm" variant="outline" className="border-red-900/50 text-red-400 hover:text-red-300 hover:bg-red-950/30" onClick={confirmDeleteAll}>
                    <Trash2 className="w-3.5 h-3.5 mr-1.5" />Eliminar todo
                  </Button>
                </div>
                {pastScans.map(scan => {
                  const criticals = scan.results.filter(r => r.severity === 'critical').length;
                  const isSocial = scan.scanType === 'social_media';
                  const TypeIcon = isSocial ? Users : Shield;
                  return (
                    <Card key={scan.id} className="bg-[#111827] border-[#1e293b] hover:border-slate-600 transition-colors">
                      <CardContent className="p-4 flex items-center justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <TypeIcon className={`w-4 h-4 shrink-0 ${isSocial ? 'text-violet-400' : 'text-blue-400'}`} />
                            <p className="text-sm font-medium text-white">{scan.fullName}</p>
                          </div>
                          <div className="flex items-center gap-3 mt-1 text-xs text-slate-500">
                            {scan.email && <span>{scan.email}</span>}
                            {scan.cedula && <span>CC: {scan.cedula}</span>}
                            {scan.phone && <span>Tel: {scan.phone}</span>}
                          </div>
                          <div className="flex items-center gap-2 mt-2 flex-wrap">
                            <Badge className={
                              isSocial
                                ? 'bg-violet-900/40 text-violet-400 border border-violet-800/30 text-xs'
                                : 'bg-blue-900/40 text-blue-400 border border-blue-800/30 text-xs'
                            }>
                              {isSocial ? 'Social Media' : 'Data Intelligence'}
                            </Badge>
                            <Badge variant="outline" className="border-[#1e293b] text-slate-400 text-xs">
                              {new Date(scan.createdAt).toLocaleDateString('es-CO', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                            </Badge>
                            <Badge variant="outline" className="border-[#1e293b] text-slate-400 text-xs">
                              {scan.results.length} resultados
                            </Badge>
                            {criticals > 0 && <Badge className="bg-red-900/40 text-red-400 text-xs border border-red-800/30">{criticals} criticos</Badge>}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 ml-4">
                          {!isSocial && (
                            <Button size="sm" variant="outline" className="border-[#1e293b] text-slate-400 hover:text-white hover:bg-[#1a2235]" onClick={() => handleViewPastScan(scan.id)}>
                              <Eye className="w-3.5 h-3.5 mr-1" />Ver
                            </Button>
                          )}
                          {isSocial ? (
                            <>
                              <Button size="sm" className="bg-blue-700 hover:bg-blue-800 text-white" onClick={() => handleDownloadSocialHistoryReport(scan.id, 'pdf')}>
                                <Download className="w-3.5 h-3.5 mr-1" />PDF
                              </Button>
                              <Button size="sm" variant="outline" className="border-[#1e293b] text-slate-400 hover:text-white hover:bg-[#1a2235]" onClick={() => handleDownloadSocialHistoryReport(scan.id, 'docx')}>
                                <FileSpreadsheet className="w-3.5 h-3.5 mr-1" />DOCX
                              </Button>
                              <Button size="sm" className="bg-emerald-700 hover:bg-emerald-800 text-white" onClick={async () => { await handleDownloadSocialHistoryReport(scan.id, 'pdf'); setTimeout(() => handleDownloadSocialHistoryReport(scan.id, 'docx'), 500); }}>
                                <FileDown className="w-3.5 h-3.5 mr-1" />Ambos
                              </Button>
                            </>
                          ) : (
                            <>
                              <Button size="sm" className="bg-blue-700 hover:bg-blue-800 text-white" onClick={() => handleDownloadReport(scan.id, 'pdf')}>
                                <Download className="w-3.5 h-3.5 mr-1" />PDF
                              </Button>
                              <Button size="sm" variant="outline" className="border-[#1e293b] text-slate-400 hover:text-white hover:bg-[#1a2235]" onClick={() => handleDownloadReport(scan.id, 'docx')}>
                                <Download className="w-3.5 h-3.5 mr-1" />DOCX
                              </Button>
                              <Button size="sm" className="bg-emerald-700 hover:bg-emerald-800 text-white" onClick={() => handleDownloadBothReports(scan.id)}>
                                <FileDown className="w-3.5 h-3.5 mr-1" />Ambos
                              </Button>
                            </>
                          )}
                          <Button size="sm" variant="outline" className="border-[#1e293b] text-red-400 hover:text-red-300 hover:bg-[#1a2235]" onClick={() => confirmDeleteScan(scan.id, scan.fullName)}>
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
              ALERTS TAB — Telegram Bot Alert Configuration
          ──────────────────────────────────────────── */}
          <TabsContent value="alerts" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

              {/* ── Telegram Config Status Card ── */}
              <Card className="bg-[#111827] border-[#1e293b]">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-white text-base">
                    <Send className="w-5 h-5 text-cyan-400" />
                    Configuración Telegram Bot
                  </CardTitle>
                  <CardDescription className="text-slate-400 text-xs">
                    Estado de la conexión con el bot de alertas de Telegram
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Status indicator */}
                  <div className={`flex items-center gap-3 p-3 rounded-lg border ${
                    telegramConfigured
                      ? 'bg-emerald-950/20 border-emerald-800/30'
                      : 'bg-red-950/20 border-red-800/30'
                  }`}>
                    {telegramConfigured ? (
                      <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                    ) : (
                      <XCircle className="w-5 h-5 text-red-400 shrink-0" />
                    )}
                    <div>
                      <p className={`text-sm font-medium ${telegramConfigured ? 'text-emerald-400' : 'text-red-400'}`}>
                        {telegramConfigured ? 'Telegram Bot Configurado' : 'Telegram Bot No Configurado'}
                      </p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {telegramConfigured
                          ? 'Las alertas se enviarán automáticamente cuando se detecten palabras clave'
                          : 'Configura las variables de entorno para habilitar las alertas'}
                      </p>
                    </div>
                  </div>

                  {/* Config details */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between p-2.5 rounded-lg bg-[#0b0f19] border border-[#1e293b]">
                      <div className="flex items-center gap-2">
                        {telegramHasBotToken ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                        ) : (
                          <XCircle className="w-4 h-4 text-red-400" />
                        )}
                        <span className="text-sm text-slate-300">TELEGRAM_BOT_TOKEN</span>
                      </div>
                      <span className={`text-xs ${telegramHasBotToken ? 'text-emerald-400' : 'text-red-400'}`}>
                        {telegramHasBotToken ? 'Configurado' : 'No configurado'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between p-2.5 rounded-lg bg-[#0b0f19] border border-[#1e293b]">
                      <div className="flex items-center gap-2">
                        {telegramHasChatId ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                        ) : (
                          <XCircle className="w-4 h-4 text-red-400" />
                        )}
                        <span className="text-sm text-slate-300">TELEGRAM_CHAT_ID</span>
                      </div>
                      <span className={`text-xs ${telegramHasChatId ? 'text-emerald-400' : 'text-red-400'}`}>
                        {telegramHasChatId ? 'Configurado' : 'No configurado'}
                      </span>
                    </div>
                  </div>

                  {/* Test Alert Button */}
                  <Button
                    onClick={handleTestAlert}
                    disabled={!telegramConfigured || alertLoading}
                    className="w-full bg-cyan-700 hover:bg-cyan-800 text-white disabled:opacity-50"
                  >
                    {alertLoading ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Zap className="w-4 h-4 mr-2" />
                    )}
                    Enviar Alerta de Prueba
                  </Button>

                  {/* Setup instructions */}
                  {!telegramConfigured && (
                    <div className="p-3 rounded-lg bg-[#0b0f19] border border-[#1e293b]">
                      <p className="text-xs text-slate-400 font-medium mb-2">Instrucciones de configuración:</p>
                      <ol className="text-xs text-slate-500 space-y-1 list-decimal list-inside">
                        <li>Crear un bot en Telegram vía @BotFather</li>
                        <li>Obtener el token del bot</li>
                        <li>Obtener el Chat ID (enviar /start al bot, luego consultar /getUpdates)</li>
                        <li>Configurar variables de entorno TELEGRAM_BOT_TOKEN y TELEGRAM_CHAT_ID</li>
                      </ol>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* ── Keyword Blacklist Card ── */}
              <Card className="bg-[#111827] border-[#1e293b]">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-white text-base">
                    <AlertTriangle className="w-5 h-5 text-amber-400" />
                    Lista Negra de Palabras Clave
                  </CardTitle>
                  <CardDescription className="text-slate-400 text-xs">
                    Palabras clave que activan alertas automáticas al detectarse en resultados OSINT
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Add keyword input */}
                  <div className="flex gap-2">
                    <Input
                      placeholder="Nueva palabra clave..."
                      value={newKeyword}
                      onChange={e => setNewKeyword(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') handleAddKeyword(); }}
                      className="bg-[#0b0f19] border-[#1e293b] text-white placeholder:text-slate-600 text-sm focus:border-amber-600"
                      disabled={alertLoading}
                    />
                    <Button
                      onClick={handleAddKeyword}
                      disabled={!newKeyword.trim() || alertLoading}
                      className="bg-amber-700 hover:bg-amber-800 text-white shrink-0"
                    >
                      {alertLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Agregar'}
                    </Button>
                  </div>

                  {/* Keywords list */}
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {alertKeywords.length === 0 ? (
                      <p className="text-xs text-slate-500 text-center py-4">No hay palabras clave configuradas</p>
                    ) : (
                      alertKeywords.map((keyword, idx) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between p-2.5 rounded-lg bg-[#0b0f19] border border-[#1e293b] group hover:border-amber-800/50 transition-colors"
                        >
                          <div className="flex items-center gap-2">
                            <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                            <span className="text-sm text-slate-200 font-mono">{keyword}</span>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="opacity-0 group-hover:opacity-100 transition-opacity text-red-400 hover:text-red-300 hover:bg-red-900/20 h-7 w-7 p-0"
                            onClick={() => handleRemoveKeyword(keyword)}
                            disabled={alertLoading}
                          >
                            <X className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      ))
                    )}
                  </div>

                  {/* Keyword count */}
                  <div className="flex items-center justify-between pt-2 border-t border-[#1e293b]">
                    <span className="text-xs text-slate-500">
                      {alertKeywords.length} palabra{alertKeywords.length !== 1 ? 's' : ''} clave activa{alertKeywords.length !== 1 ? 's' : ''}
                    </span>
                    <Badge variant="outline" className="text-amber-400 border-amber-800/50 text-[10px]">
                      Coincidencia sin mayúsculas/minúsculas
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* ── Alert History Card ── */}
            <Card className="bg-[#111827] border-[#1e293b]">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2 text-white text-base">
                      <Bell className="w-5 h-5 text-blue-400" />
                      Historial de Alertas
                    </CardTitle>
                    <CardDescription className="text-slate-400 text-xs">
                      Últimas alertas disparadas por el interceptor de palabras clave
                    </CardDescription>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-[#1e293b] text-slate-400 hover:text-white hover:bg-[#1a2235]"
                    onClick={() => fetchAlertConfig()}
                  >
                    <ScanLine className="w-3.5 h-3.5 mr-1.5" />
                    Actualizar
                  </Button>
                </div>
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
                    {alertHistory.map((alert, idx) => {
                      const sourceBadge = alert.sourceType === 'channel' ? 'CANAL'
                        : alert.sourceType === 'group' || alert.sourceType === 'chat' ? 'CHAT/GROUP'
                        : alert.sourceType === 'bot' ? 'BOT'
                        : alert.sourceType === 'user' ? 'USUARIO'
                        : alert.sourceType === 'web' ? 'WEB' : 'OTRO';
                      const badgeColor = alert.sourceType === 'channel' ? 'bg-cyan-900/30 text-cyan-400 border-cyan-800/30'
                        : alert.sourceType === 'group' || alert.sourceType === 'chat' ? 'bg-violet-900/30 text-violet-400 border-violet-800/30'
                        : alert.sourceType === 'web' ? 'bg-amber-900/30 text-amber-400 border-amber-800/30'
                        : 'bg-slate-800/50 text-slate-400 border-slate-700/30';
                      return (
                        <div key={idx} className="flex items-center gap-3 p-3 rounded-lg bg-[#0b0f19] border border-[#1e293b]">
                          <div className="shrink-0">
                            {alert.telegramSent ? (
                              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                            ) : (
                              <XCircle className="w-4 h-4 text-red-400" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-mono text-amber-400 font-medium">{alert.keyword}</span>
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

            {/* ── How It Works Card ── */}
            <Card className="bg-[#111827] border-[#1e293b]">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-white text-base">
                  <Info className="w-5 h-5 text-slate-400" />
                  Cómo Funciona
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="p-3 rounded-lg bg-[#0b0f19] border border-[#1e293b]">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="flex items-center justify-center w-6 h-6 rounded-full bg-amber-900/30 text-amber-400 text-xs font-bold">1</span>
                      <span className="text-sm font-medium text-slate-200">Detección</span>
                    </div>
                    <p className="text-xs text-slate-500">El interceptor analiza todos los resultados OSINT buscando coincidencias con las palabras clave configuradas</p>
                  </div>
                  <div className="p-3 rounded-lg bg-[#0b0f19] border border-[#1e293b]">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="flex items-center justify-center w-6 h-6 rounded-full bg-cyan-900/30 text-cyan-400 text-xs font-bold">2</span>
                      <span className="text-sm font-medium text-slate-200">Clasificación</span>
                    </div>
                    <p className="text-xs text-slate-500">Se extrae metadata de la fuente (canal, grupo, web) y se determina la severidad del hallazgo</p>
                  </div>
                  <div className="p-3 rounded-lg bg-[#0b0f19] border border-[#1e293b]">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="flex items-center justify-center w-6 h-6 rounded-full bg-emerald-900/30 text-emerald-400 text-xs font-bold">3</span>
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
        <DialogContent className="bg-[#111827] border-[#1e293b] text-white">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertOctagon className="w-5 h-5 text-red-400" />
              {deleteConfirm.deleteAll ? 'Eliminar todo el historial' : 'Eliminar escaneo'}
            </DialogTitle>
            <DialogDescription className="text-slate-400">
              {deleteConfirm.deleteAll
                ? `¿Estás seguro de que deseas eliminar los ${pastScans.length} escaneos del historial? Esta acción no se puede deshacer.`
                : `¿Estás seguro de que deseas eliminar el escaneo de "${deleteConfirm.scanName}"? Esta acción no se puede deshacer.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" className="border-[#1e293b] text-slate-400 hover:text-white hover:bg-[#1a2235]" onClick={() => setDeleteConfirm({ open: false, scanId: null, scanName: '', deleteAll: false })}>
              Cancelar
            </Button>
            <Button className="bg-red-700 hover:bg-red-800 text-white" onClick={executeDelete}>
              <Trash2 className="w-3.5 h-3.5 mr-1.5" />
              {deleteConfirm.deleteAll ? 'Eliminar todo' : 'Eliminar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── AI CHATBOT ── */}
      {chatOpen && (
        <div className="fixed bottom-20 right-4 sm:right-6 w-[360px] max-w-[calc(100vw-2rem)] h-[500px] bg-[#111827] border border-[#1e293b] rounded-xl z-50 flex flex-col overflow-hidden">
          {/* Chat Header */}
          <div className="flex items-center justify-between p-3 bg-[#0b0f19] border-b border-[#1e293b]">
            <div className="flex items-center gap-2">
              <div className="p-1 bg-blue-900/30 rounded-md">
                <Bot className="w-4 h-4 text-blue-400" />
              </div>
              <div>
                <p className="text-sm font-medium text-white">Asistente OSINT</p>
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
                  <div className="w-6 h-6 bg-blue-900/30 rounded-full flex items-center justify-center shrink-0 mt-1">
                    <Sparkles className="w-3 h-3 text-blue-400" />
                  </div>
                )}
                <div className={`max-w-[85%] px-3 py-2 rounded-lg text-sm leading-relaxed ${
                  msg.role === 'user'
                    ? 'bg-blue-600 text-white rounded-br-sm'
                    : 'bg-[#0b0f19] text-slate-200 rounded-bl-sm border border-[#1e293b]'
                }`}>
                  {msg.role === 'assistant' ? renderMarkdown(msg.content) : msg.content}
                </div>
              </div>
            ))}
            {chatLoading && (
              <div className="flex gap-2 justify-start">
                <div className="w-6 h-6 bg-blue-900/30 rounded-full flex items-center justify-center shrink-0 mt-1">
                  <Sparkles className="w-3 h-3 text-blue-400 animate-pulse" />
                </div>
                <div className="bg-[#0b0f19] text-slate-400 px-3 py-2 rounded-lg rounded-bl-sm border border-[#1e293b] text-sm">
                  <Loader2 className="w-4 h-4 animate-spin" />
                </div>
              </div>
            )}
          </div>

          {/* Chat Input */}
          <div className="p-3 border-t border-[#1e293b] bg-[#111827]">
            <div className="flex gap-2">
              <Input
                placeholder="Pregunta sobre OSINT, seguridad..."
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && chatInput.trim()) handleChatSend(); }}
                className="bg-[#0b0f19] border-[#1e293b] text-white placeholder:text-slate-600 text-sm focus:border-blue-600"
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
        <DialogContent className="bg-[#111827] border-[#1e293b] text-white max-w-lg max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="text-white">{detailModal.title}</DialogTitle>
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
                  <div key={i} className="p-2.5 bg-[#0b0f19] rounded-lg border border-[#1e293b]">
                    <div className="flex items-start gap-2">
                      {item.platform && <Badge className="bg-violet-900/40 text-violet-400 text-[9px] shrink-0">{item.platform}</Badge>}
                      <p className="text-sm font-medium text-white">{item.title}</p>
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
      <footer className="border-t border-[#1e293b] mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex flex-col sm:flex-row items-center justify-between gap-2">
          <p className="text-xs text-slate-600">OSINT Data Scanner — Inteligencia de Fuentes Abiertas | Informes PDF + DOCX</p>
          <div className="flex items-center gap-3">
            <Badge variant="outline" className="border-[#1e293b] text-slate-500 text-[10px]">
              <Shield className="w-3 h-3 mr-1" /> CONFIDENCIAL
            </Badge>
            <Badge variant="outline" className="border-[#1e293b] text-slate-500 text-[10px]">
              <FileDown className="w-3 h-3 mr-1" /> PDF + DOCX
            </Badge>
          </div>
        </div>
      </footer>
    </div>
  );
}
