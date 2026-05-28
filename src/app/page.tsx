'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Shield, Search, AlertTriangle, Eye, Globe, Database,
  ChevronDown, ChevronUp, ExternalLink, Loader2, Trash2,
  ShieldAlert, ShieldCheck, Info, User, Mail, Phone, FileText,
  ScanLine, BarChart3, Clock, Upload, Download, FileSpreadsheet,
  CheckCircle2, XCircle, FileDown, Users, AlertOctagon, Link2,
  Building2, Heart, Briefcase, MapPin, Network, FileDigit, GitBranch,
  MessageCircle, Send, Bot, X, Sparkles, Settings, Check, Wifi, WifiOff,
  Music2, Camera, Play, AtSign, Pin
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
  createdAt: string;
  results: { id: string; severity: string }[];
  reports: { id: string; fileName: string; format?: string }[];
}

interface BatchResult {
  scanId: string;
  fullName: string;
  totalResults: number;
  reportGenerated: boolean;
  reportFileName: string | null;
  summary: ScanSummary;
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
  critical: { color: 'bg-red-600 text-white', icon: ShieldAlert, label: 'Critico', barColor: 'bg-red-600' },
  high: { color: 'bg-orange-500 text-white', icon: AlertTriangle, label: 'Alto', barColor: 'bg-orange-500' },
  medium: { color: 'bg-yellow-500 text-black', icon: Eye, label: 'Medio', barColor: 'bg-yellow-500' },
  low: { color: 'bg-blue-500 text-white', icon: Info, label: 'Bajo', barColor: 'bg-blue-500' },
  info: { color: 'bg-gray-500 text-white', icon: Info, label: 'Info', barColor: 'bg-gray-500' },
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
  empresarial: { icon: Building2, label: 'Empresarial', color: 'text-blue-400', bgColor: 'bg-blue-900/30 border-blue-800' },
  personal: { icon: User, label: 'Personal', color: 'text-cyan-400', bgColor: 'bg-cyan-900/30 border-cyan-800' },
  familiar: { icon: Heart, label: 'Familiar', color: 'text-purple-400', bgColor: 'bg-purple-900/30 border-purple-800' },
  laboral: { icon: Briefcase, label: 'Laboral', color: 'text-green-400', bgColor: 'bg-green-900/30 border-green-800' },
  contacto: { icon: Phone, label: 'Contacto', color: 'text-yellow-400', bgColor: 'bg-yellow-900/30 border-yellow-800' },
  ubicacion: { icon: MapPin, label: 'Ubicacion', color: 'text-orange-400', bgColor: 'bg-orange-900/30 border-orange-800' },
  dato_compartido: { icon: Database, label: 'Dato Compartido', color: 'text-gray-400', bgColor: 'bg-gray-900/30 border-gray-800' },
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
    ],
  },
  {
    id: 'search',
    label: 'Búsqueda Avanzada',
    color: 'emerald',
    engines: [
      { name: 'Google Dorking', desc: 'Búsqueda avanzada con operadores', icon: Search },
      { name: 'Document Exposure', desc: 'Documentos PDF/DOC expuestos', icon: FileText },
    ],
  },
  {
    id: 'identity',
    label: 'Identidad y Datos',
    color: 'purple',
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
];

// ── Helper: get all engine names ──
const allEngineNames: string[] = engineCategories.flatMap(c => c.engines.map(e => e.name));
const TOTAL_ENGINES = allEngineNames.length;

// ── Social Media Platforms Config ──
const socialPlatforms = [
  { id: 'tiktok', name: 'TikTok', domain: 'tiktok.com', color: 'text-pink-400', bgColor: 'bg-pink-900/20', borderColor: 'border-pink-800/50', icon: Music2, desc: 'Perfiles y contenido viral', glowColor: 'shadow-pink-500/40', accentHex: '#ec4899', verifyUrl: 'https://www.tiktok.com/search?q=', searchUrl: 'https://www.tiktok.com/search?q=' },
  { id: 'instagram', name: 'Instagram', domain: 'instagram.com', color: 'text-purple-400', bgColor: 'bg-purple-900/20', borderColor: 'border-purple-800/50', icon: Camera, desc: 'Perfiles, fotos y stories', glowColor: 'shadow-purple-500/40', accentHex: '#a855f7', verifyUrl: 'https://www.instagram.com/', searchUrl: 'https://www.instagram.com/' },
  { id: 'youtube', name: 'YouTube', domain: 'youtube.com', color: 'text-red-400', bgColor: 'bg-red-900/20', borderColor: 'border-red-800/50', icon: Play, desc: 'Canales y videos', glowColor: 'shadow-red-500/40', accentHex: '#ef4444', verifyUrl: 'https://www.youtube.com/results?search_query=', searchUrl: 'https://www.youtube.com/results?search_query=' },
  { id: 'whatsapp', name: 'WhatsApp', domain: 'whatsapp.com', color: 'text-green-400', bgColor: 'bg-green-900/20', borderColor: 'border-green-800/50', icon: MessageCircle, desc: 'Numeros y grupos publicos', glowColor: 'shadow-green-500/40', accentHex: '#22c55e', verifyUrl: 'https://wa.me/', searchUrl: 'https://web.whatsapp.com/' },
  { id: 'facebook', name: 'Facebook', domain: 'facebook.com', color: 'text-blue-400', bgColor: 'bg-blue-900/20', borderColor: 'border-blue-800/50', icon: Users, desc: 'Perfiles, paginas y grupos', glowColor: 'shadow-blue-500/40', accentHex: '#3b82f6', verifyUrl: 'https://www.facebook.com/search/top?q=', searchUrl: 'https://www.facebook.com/search/top?q=' },
  { id: 'twitter', name: 'X (Twitter)', domain: 'x.com', color: 'text-gray-300', bgColor: 'bg-gray-800/20', borderColor: 'border-gray-700/50', icon: AtSign, desc: 'Perfiles y tweets', glowColor: 'shadow-gray-400/40', accentHex: '#9ca3af', verifyUrl: 'https://twitter.com/search?q=', searchUrl: 'https://twitter.com/search?q=' },
  { id: 'linkedin', name: 'LinkedIn', domain: 'linkedin.com', color: 'text-sky-400', bgColor: 'bg-sky-900/20', borderColor: 'border-sky-800/50', icon: Briefcase, desc: 'Perfiles profesionales', glowColor: 'shadow-sky-500/40', accentHex: '#0ea5e9', verifyUrl: 'https://www.linkedin.com/search/results/people/?keywords=', searchUrl: 'https://www.linkedin.com/search/results/people/?keywords=' },
  { id: 'telegram', name: 'Telegram', domain: 't.me', color: 'text-sky-300', bgColor: 'bg-sky-900/20', borderColor: 'border-sky-800/50', icon: Send, desc: 'Canales y grupos', glowColor: 'shadow-sky-400/40', accentHex: '#38bdf8', verifyUrl: 'https://t.me/', searchUrl: 'https://t.me/' },
  { id: 'snapchat', name: 'Snapchat', domain: 'snapchat.com', color: 'text-yellow-400', bgColor: 'bg-yellow-900/20', borderColor: 'border-yellow-800/50', icon: Camera, desc: 'Perfiles y snaps', glowColor: 'shadow-yellow-500/40', accentHex: '#eab308', verifyUrl: 'https://story.snapchat.com/s/', searchUrl: 'https://www.snapchat.com/add/' },
  { id: 'pinterest', name: 'Pinterest', domain: 'pinterest.com', color: 'text-red-300', bgColor: 'bg-red-900/20', borderColor: 'border-red-800/50', icon: Pin, desc: 'Tableros y pines', glowColor: 'shadow-red-400/40', accentHex: '#f87171', verifyUrl: 'https://www.pinterest.com/search/pins/?q=', searchUrl: 'https://www.pinterest.com/search/pins/?q=' },
];

// ── Helper: category color classes ──
function getCategoryColor(color: string, type: 'text' | 'bg' | 'border' | 'hoverBg' = 'text') {
  const map: Record<string, Record<string, string>> = {
    red: { text: 'text-red-400', bg: 'bg-red-900/15', border: 'border-red-800/40', hoverBg: 'hover:bg-red-900/25' },
    orange: { text: 'text-orange-400', bg: 'bg-orange-900/15', border: 'border-orange-800/40', hoverBg: 'hover:bg-orange-900/25' },
    blue: { text: 'text-blue-400', bg: 'bg-blue-900/15', border: 'border-blue-800/40', hoverBg: 'hover:bg-blue-900/25' },
    emerald: { text: 'text-emerald-400', bg: 'bg-emerald-900/15', border: 'border-emerald-800/40', hoverBg: 'hover:bg-emerald-900/25' },
    purple: { text: 'text-purple-400', bg: 'bg-purple-900/15', border: 'border-purple-800/40', hoverBg: 'hover:bg-purple-900/25' },
    teal: { text: 'text-teal-400', bg: 'bg-teal-900/15', border: 'border-teal-800/40', hoverBg: 'hover:bg-teal-900/25' },
  };
  return map[color]?.[type] || '';
}

// ── Simple Markdown renderer for chat messages ──
function renderMarkdown(text: string) {
  const lines = text.split('\n');
  return lines.map((line, i) => {
    let processed = line
      .replace(/\*\*(.+?)\*\*/g, '<strong class="text-emerald-300">$1</strong>')
      .replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '<em>$1</em>')
      .replace(/`(.+?)`/g, '<code class="bg-gray-700 px-1 rounded text-xs text-emerald-400">$1</code>')
      .replace(/^[-•]\s+(.*)/, '<span class="flex gap-1"><span class="text-emerald-400 shrink-0">•</span><span>$1</span></span>')
      .replace(/^(\d+)\.\s+(.*)/, '<span class="flex gap-1"><span class="text-emerald-400 shrink-0 font-mono text-xs">$1.</span><span>$2</span></span>');

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
          <circle cx="60" cy="60" r={radius} fill="none" stroke="#1f2937" strokeWidth="8" />
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
          <span className="text-[10px] text-gray-500 font-medium">/100</span>
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

  // ── Chat states ──
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<{ role: 'user' | 'assistant'; content: string }[]>([
    { role: 'assistant', content: '¡Hola! 👋 Soy **SOFIA**, tu asistente OSINT. Puedo ayudarte a entender los resultados de escaneo, recomendar acciones de seguridad, orientarte sobre legislación colombiana y explicarte cómo usar el portal. ¿En qué te puedo ayudar?' }
  ]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);

  useEffect(() => {
    fetchPastScans();
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

  // ── Delete scan ──
  async function handleDeleteScan(scanId: string) {
    try {
      await fetch(`/api/scan?scanId=${scanId}`, { method: 'DELETE' });
      fetchPastScans();
      if (scanData?.scanId === scanId) setScanData(null);
    } catch { /* ignore */ }
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

  // ── Download report ──
  async function handleDownloadReport(scanId: string, format?: 'docx' | 'pdf') {
    try {
      const fmt = format || 'pdf';
      const res = await fetch(`/api/report?scanId=${scanId}&download=true&format=${fmt}`);
      if (!res.ok) throw new Error('Error al descargar informe');
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const disposition = res.headers.get('Content-Disposition');
      a.download = disposition?.split('filename=')[1]?.replace(/"/g, '') || `Informe_OSINT.${fmt}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      console.error('Download error:', err);
    }
  }

  // ── Download joint report ──
  async function handleDownloadJointReport(analysisId: string) {
    try {
      const res = await fetch(`/api/joint-analysis?analysisId=${analysisId}&download=true`);
      if (!res.ok) throw new Error('Error al descargar informe conjunto');
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = jointReportFileName || 'Informe_Conjunto.pdf';
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      console.error('Download error:', err);
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
    { id: 'google', name: 'Google', color: 'text-blue-400', bgColor: 'bg-blue-900/20', borderColor: 'border-blue-800/40', buildUrl: (q: string) => `https://www.google.com/search?q=${encodeURIComponent(q)}` },
    { id: 'bing', name: 'Bing', color: 'text-cyan-400', bgColor: 'bg-cyan-900/20', borderColor: 'border-cyan-800/40', buildUrl: (q: string) => `https://www.bing.com/search?q=${encodeURIComponent(q)}` },
    { id: 'yandex', name: 'Yandex', color: 'text-red-400', bgColor: 'bg-red-900/20', borderColor: 'border-red-800/40', buildUrl: (q: string) => `https://yandex.com/search/?text=${encodeURIComponent(q)}` },
    { id: 'duckduckgo', name: 'DuckDuckGo', color: 'text-orange-400', bgColor: 'bg-orange-900/20', borderColor: 'border-orange-800/40', buildUrl: (q: string) => `https://duckduckgo.com/?q=${encodeURIComponent(q)}` },
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
    // Search mode validation using dedicated social inputs first, then fall back to main form
    const effectiveNickname = socialNickname.trim();
    const effectiveEmail = socialEmail.trim() || email.trim();
    const effectiveName = socialName.trim() || fullName.trim();

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
      const res = await fetch('/api/social-scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName: effectiveName.trim(),
          email: effectiveEmail.trim() || undefined,
          phone: phone.trim() || undefined,
          cedula: cedula.trim() || undefined,
          nickname: effectiveNickname.trim() || undefined,
          searchMode: socialSearchMode,
          selectedPlatforms: Array.from(selectedSocialPlatforms),
        }),
      });

      clearInterval(progressInterval);
      setSocialScanProgress(100);

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Error en el escaneo de redes sociales');
      }

      const data: SocialScanResponse = await res.json();
      setSocialScanData(data);
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
        let processed = false;
        let lastError: string = '';

        // ATTEMPT 1: Client-side parsing
        try {
          const XLSX = await import('xlsx');
          const arrayBuffer = await uploadFile.arrayBuffer();
          const workbook = XLSX.read(new Uint8Array(arrayBuffer), { type: 'array' });

          const sheets = workbook.SheetNames.map(name => {
            const ws = workbook.Sheets[name];
            let data: Record<string, string>[] = [];

            try {
              const aoaData: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', blankrows: false });
              if (aoaData.length >= 2) {
                const headers = aoaData[0].map((h: unknown) => h != null ? String(h).trim() : '');
                for (let i = 1; i < aoaData.length; i++) {
                  const row: Record<string, string> = {};
                  let hasData = false;
                  headers.forEach((header, idx) => {
                    const val = aoaData[i]?.[idx];
                    const strVal = val != null ? String(val).trim() : '';
                    row[header] = strVal;
                    if (strVal) hasData = true;
                  });
                  if (hasData) data.push(row);
                }
              }
            } catch { /* try next */ }

            if (data.length === 0) {
              try {
                const rawData = XLSX.utils.sheet_to_json(ws, { defval: '', blankrows: false });
                for (const row of rawData) {
                  const strRow: Record<string, string> = {};
                  for (const [key, val] of Object.entries(row as Record<string, unknown>)) {
                    strRow[key] = val != null ? String(val) : '';
                  }
                  if (Object.values(strRow).some(v => v.trim())) data.push(strRow);
                }
              } catch { /* try next */ }
            }

            if (data.length === 0 && ws['!ref']) {
              try {
                const range = XLSX.utils.decode_range(ws['!ref']);
                const headers: string[] = [];
                for (let c = range.s.c; c <= range.e.c; c++) {
                  const addr = XLSX.utils.encode_cell({ r: range.s.r, c });
                  const cell = ws[addr];
                  headers.push(cell ? String(cell.v).trim() : `Col_${c + 1}`);
                }
                for (let r = range.s.r + 1; r <= range.e.r; r++) {
                  const row: Record<string, string> = {};
                  let hasData = false;
                  for (let c = range.s.c; c <= range.e.c; c++) {
                    const addr = XLSX.utils.encode_cell({ r, c });
                    const cell = ws[addr];
                    const val = cell ? String(cell.v).trim() : '';
                    row[headers[c - range.s.c]] = val;
                    if (val) hasData = true;
                  }
                  if (hasData) data.push(row);
                }
              } catch { /* give up */ }
            }

            return { name, data };
          });

          const totalRows = sheets.reduce((sum, s) => sum + s.data.length, 0);
          if (totalRows === 0) {
            throw new Error('El archivo parece estar vacío o no se pudieron leer los datos');
          }

          const res = await fetch('/api/upload', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: 'xlsx', sheets, sheetNames: workbook.SheetNames }),
          });

          clearInterval(progressInterval);
          setUploadProgress(100);

          if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            throw new Error(errData.error || 'Error al procesar archivo Excel en el servidor');
          }

          const data = await res.json();
          processed = true;

          if (data.type === 'xlsx_multi_sheet') {
            setSheetNames(data.sheetNames || []);
            setBatchResults(data.results);
            setRelationshipAnalysis(data.relationshipAnalysis || null);
            setJointAnalysisId(data.jointAnalysisId || null);
            setJointReportFileName(data.jointReportFileName || null);
          } else {
            setBatchResults(data.results);
          }
        } catch (clientError) {
          lastError = clientError instanceof Error ? clientError.message : 'Error de parsing';
          console.warn('Client-side XLSX parsing failed:', lastError);
        }

        // ATTEMPT 2: Server-side fallback via FormData
        if (!processed) {
          try {
            const formData = new FormData();
            formData.append('file', uploadFile);
            const res = await fetch('/api/upload', { method: 'POST', body: formData });
            clearInterval(progressInterval);
            setUploadProgress(100);
            if (!res.ok) {
              const errData = await res.json().catch(() => ({}));
              throw new Error(errData.error || 'Error al procesar archivo Excel en el servidor');
            }
            const data = await res.json();
            processed = true;
            if (data.type === 'xlsx_multi_sheet') {
              setSheetNames(data.sheetNames || []);
              setBatchResults(data.results);
              setRelationshipAnalysis(data.relationshipAnalysis || null);
              setJointAnalysisId(data.jointAnalysisId || null);
              setJointReportFileName(data.jointReportFileName || null);
            } else {
              setBatchResults(data.results);
            }
          } catch (serverError) {
            const serverMsg = serverError instanceof Error ? serverError.message : 'Error del servidor';
            // ATTEMPT 3: Read as base64
            try {
              const arrayBuffer = await uploadFile.arrayBuffer();
              const base64 = btoa(new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), ''));
              const res = await fetch('/api/upload', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type: 'xlsx', fileName: uploadFile.name, fileBase64: base64 }),
              });
              clearInterval(progressInterval);
              setUploadProgress(100);
              if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                throw new Error(errData.error || 'Error al procesar archivo');
              }
              const data = await res.json();
              processed = true;
              if (data.type === 'xlsx_multi_sheet') {
                setSheetNames(data.sheetNames || []);
                setBatchResults(data.results);
                setRelationshipAnalysis(data.relationshipAnalysis || null);
                setJointAnalysisId(data.jointAnalysisId || null);
                setJointReportFileName(data.jointReportFileName || null);
              } else {
                setBatchResults(data.results);
              }
            } catch (base64Error) {
              throw new Error(
                `No se pudo leer el archivo Excel. Intentos fallidos:\n` +
                `1. Lectura en navegador: ${lastError}\n` +
                `2. Carga al servidor: ${serverMsg}\n` +
                `3. Codificación base64: ${base64Error instanceof Error ? base64Error.message : 'falló'}\n\n` +
                `Sugerencia: Abre el archivo en Excel y guárdalo como .xlsx (formato libro de Excel). Los archivos .xls antiguos no son compatibles.`
              );
            }
          }
        }
      } else {
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
      }

      fetchPastScans();
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
  const riskColor = riskScore >= 70 ? 'text-red-600' : riskScore >= 40 ? 'text-orange-500' : riskScore >= 15 ? 'text-yellow-600' : 'text-green-600';

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

  return (
    <div className="min-h-screen flex flex-col bg-gray-950 text-gray-100">

      {/* ── HEADER ── */}
      <header className="border-b border-gray-800 bg-gradient-to-r from-gray-950 via-gray-950 to-gray-900 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center gap-3">
          <div className="p-2.5 bg-emerald-600/20 rounded-xl border border-emerald-700/30 shadow-lg shadow-emerald-900/20">
            <Shield className="w-6 h-6 text-emerald-400" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-white tracking-tight">OSINT Data Scanner</h1>
            <p className="text-[11px] text-gray-500">Plataforma de Inteligencia de Fuentes Abiertas</p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Badge variant="outline" className="border-emerald-800/60 text-emerald-400 text-xs bg-emerald-900/20">
              <Globe className="w-3 h-3 mr-1" />
              {selectedEngines.size}/{TOTAL_ENGINES} Motores
            </Badge>
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 text-gray-400 hover:text-white hover:bg-gray-800 relative rounded-lg transition-all duration-200"
              onClick={() => { setSettingsOpen(true); setTestKeyStatus('idle'); }}
            >
              <Settings className="w-4 h-4" />
              {testKeyStatus === 'success' && (
                <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
              )}
            </Button>
          </div>
        </div>
      </header>

      {/* ── SETTINGS DIALOG ── */}
      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="bg-gray-900 border-gray-700 text-white sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2">
              <Settings className="w-5 h-5 text-emerald-400" />
              Configuración
            </DialogTitle>
            <DialogDescription className="text-gray-500">
              Configura las opciones avanzadas del escáner OSINT
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* API Key Status - Server-side only */}
            <div className="p-4 rounded-xl bg-gray-800/50 border border-gray-700/50 space-y-3">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${testKeyStatus === 'success' ? 'bg-emerald-900/40' : testKeyStatus === 'error' ? 'bg-red-900/40' : 'bg-gray-700/50'}`}>
                  {testKeyStatus === 'success' ? (
                    <Wifi className="w-5 h-5 text-emerald-400" />
                  ) : testKeyStatus === 'error' ? (
                    <WifiOff className="w-5 h-5 text-red-400" />
                  ) : (
                    <WifiOff className="w-5 h-5 text-gray-500" />
                  )}
                </div>
                <div className="flex-1">
                  <p className={`text-sm font-medium ${testKeyStatus === 'success' ? 'text-emerald-400' : testKeyStatus === 'error' ? 'text-red-400' : 'text-gray-400'}`}>
                    IA DeepSeek
                  </p>
                  <p className="text-xs text-gray-500">
                    La clave API se configura en el servidor. No se requiere configuración manual.
                  </p>
                </div>
                <Badge className={`${testKeyStatus === 'success' ? 'bg-emerald-700' : testKeyStatus === 'error' ? 'bg-red-700' : 'bg-gray-700'} text-white text-[10px]`}>
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
                  className="border-gray-600 text-gray-300 hover:bg-gray-700 hover:text-white"
                >
                  {testKeyLoading ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Probando...</>
                  ) : (
                    <><Sparkles className="w-4 h-4 mr-2" />Probar Conexión</>
                  )}
                </Button>
                {testKeyStatus === 'success' && (
                  <span className="text-sm text-emerald-400 flex items-center gap-1">
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
            <div className="p-3 rounded-lg bg-gray-800/30 border border-gray-800">
              <div className="flex items-start gap-2">
                <Info className="w-4 h-4 text-gray-500 mt-0.5 shrink-0" />
                <p className="text-xs text-gray-500 leading-relaxed">
                  El motor de IA DeepSeek se configura mediante variables de entorno en el servidor. Verifica la conexión para confirmar que el servicio está disponible.
                </p>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setSettingsOpen(false)} className="border-gray-700 text-gray-300">
              Cerrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── MAIN CONTENT ── */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 py-6">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="bg-gray-900 border border-gray-800 flex-wrap h-auto gap-1 p-1">
            <TabsTrigger value="scan" className="data-[state=active]:bg-emerald-600 data-[state=active]:text-white">
              <ScanLine className="w-4 h-4 mr-2" />
              Escaneo
            </TabsTrigger>
            <TabsTrigger value="batch" className="data-[state=active]:bg-emerald-600 data-[state=active]:text-white">
              <Upload className="w-4 h-4 mr-2" />
              Carga / Vinculos
            </TabsTrigger>
            <TabsTrigger value="results" className="data-[state=active]:bg-emerald-600 data-[state=active]:text-white" disabled={!scanData}>
              <BarChart3 className="w-4 h-4 mr-2" />
              Resultados
            </TabsTrigger>
            <TabsTrigger value="relationships" className="data-[state=active]:bg-emerald-600 data-[state=active]:text-white" disabled={!relationshipAnalysis}>
              <GitBranch className="w-4 h-4 mr-2" />
              Vinculos
            </TabsTrigger>
            <TabsTrigger value="social" className="data-[state=active]:bg-pink-600 data-[state=active]:text-white">
              <Globe className="w-4 h-4 mr-2" />
              Redes Sociales
            </TabsTrigger>
            <TabsTrigger value="history" className="data-[state=active]:bg-emerald-600 data-[state=active]:text-white">
              <Clock className="w-4 h-4 mr-2" />
              Historial ({pastScans.length})
            </TabsTrigger>
          </TabsList>

          {/* ────────────────────────────────────────────
              SCAN TAB
          ──────────────────────────────────────────── */}
          <TabsContent value="scan" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

              {/* ── Input Form ── */}
              <div className="lg:col-span-1 space-y-4">
                <Card className="bg-gray-900 border-gray-800">
                  <CardHeader>
                    <CardTitle className="text-white flex items-center gap-2">
                      <User className="w-5 h-5 text-emerald-400" />
                      Datos a Escanear
                    </CardTitle>
                    <CardDescription className="text-gray-500">
                      Ingresa los datos que deseas verificar con {selectedEngines.size} motores
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="fullName" className="text-gray-300 text-sm">Nombre Completo *</Label>
                      <div className="relative">
                        <User className="absolute left-3 top-2.5 w-4 h-4 text-gray-600" />
                        <Input id="fullName" placeholder="Juan Perez Garcia" value={fullName} onChange={e => setFullName(e.target.value)} className="pl-10 bg-gray-800 border-gray-700 text-white placeholder:text-gray-600" />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="cedula" className="text-gray-300 text-sm">Cedula / Documento</Label>
                      <div className="relative">
                        <FileText className="absolute left-3 top-2.5 w-4 h-4 text-gray-600" />
                        <Input id="cedula" placeholder="1234567890" value={cedula} onChange={e => setCedula(e.target.value)} className="pl-10 bg-gray-800 border-gray-700 text-white placeholder:text-gray-600" />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="email" className="text-gray-300 text-sm">Correo Electronico</Label>
                      <div className="relative">
                        <Mail className="absolute left-3 top-2.5 w-4 h-4 text-gray-600" />
                        <Input id="email" type="email" placeholder="correo@ejemplo.com" value={email} onChange={e => setEmail(e.target.value)} className="pl-10 bg-gray-800 border-gray-700 text-white placeholder:text-gray-600" />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="phone" className="text-gray-300 text-sm">Numero de Telefono</Label>
                      <div className="relative">
                        <Phone className="absolute left-3 top-2.5 w-4 h-4 text-gray-600" />
                        <Input id="phone" placeholder="+57 300 1234567" value={phone} onChange={e => setPhone(e.target.value)} className="pl-10 bg-gray-800 border-gray-700 text-white placeholder:text-gray-600" />
                      </div>
                    </div>

                    {/* Report Format */}
                    <div className="space-y-2">
                      <Label className="text-gray-300 text-sm">Formato del Informe</Label>
                      <div className="flex gap-2">
                        <Button
                          type="button" size="sm"
                          variant={reportFormat === 'pdf' ? 'default' : 'outline'}
                          onClick={() => setReportFormat('pdf')}
                          className={reportFormat === 'pdf' ? 'bg-emerald-600 text-white' : 'border-gray-700 text-gray-400'}
                        >
                          <FileDown className="w-4 h-4 mr-1" /> PDF
                        </Button>
                        <Button
                          type="button" size="sm"
                          variant={reportFormat === 'docx' ? 'default' : 'outline'}
                          onClick={() => setReportFormat('docx')}
                          className={reportFormat === 'docx' ? 'bg-blue-600 text-white' : 'border-gray-700 text-gray-400'}
                        >
                          <FileText className="w-4 h-4 mr-1" /> DOCX
                        </Button>
                      </div>
                    </div>

                    {error && (
                      <div className="p-3 bg-red-900/30 border border-red-800 rounded-lg text-red-300 text-sm">
                        {error}
                      </div>
                    )}

                    <Button onClick={handleScan} disabled={loading} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold" size="lg">
                      {loading ? (
                        <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Escaneando {selectedEngines.size} motores...</>
                      ) : (
                        <><Search className="w-4 h-4 mr-2" />Escanear y Generar {reportFormat.toUpperCase()}</>
                      )}
                    </Button>

                    {progress > 0 && <Progress value={progress} className="h-2" />}

                    {scanData && (
                      <div className="flex gap-2">
                        <Button onClick={() => handleDownloadReport(scanData.scanId, 'pdf')} className="flex-1 bg-emerald-700 hover:bg-emerald-800 text-white">
                          <Download className="w-4 h-4 mr-2" />PDF
                        </Button>
                        <Button onClick={() => handleDownloadReport(scanData.scanId, 'docx')} className="flex-1 bg-blue-700 hover:bg-blue-800 text-white">
                          <Download className="w-4 h-4 mr-2" />DOCX
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* ── Interactive Engines Panel ── */}
              <div className="lg:col-span-2 space-y-4">
                <Card className="bg-gray-900 border-gray-800">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-white flex items-center gap-2">
                        <Database className="w-5 h-5 text-emerald-400" />
                        Motores de Busqueda
                      </CardTitle>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-500">{selectedEngines.size}/{TOTAL_ENGINES} motores seleccionados</span>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={toggleAllEngines}
                          className="border-gray-700 text-gray-300 hover:bg-gray-800 text-xs h-7"
                        >
                          {selectedEngines.size === TOTAL_ENGINES ? 'Deseleccionar Todos' : 'Seleccionar Todos'}
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {/* Categorized Engines with Selection */}
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
                              className="border-gray-600 data-[state=checked]:bg-emerald-600 data-[state=checked]:border-emerald-600"
                            />
                            <span className={`text-xs font-semibold group-hover:brightness-125 transition-all ${getCategoryColor(category.color)}`}>
                              {category.label.toUpperCase()} ({category.engines.length})
                            </span>
                          </div>

                          {/* Engine Cards — Interactive with animations */}
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {category.engines.map(engine => {
                              const isSelected = selectedEngines.has(engine.name);
                              const EngineIcon = engine.icon;
                              const borderColorMap: Record<string,string> = {
                                red: '#f87171', orange: '#fb923c', blue: '#60a5fa',
                                emerald: '#34d399', purple: '#c084fc', teal: '#2dd4bf',
                              };
                              const accentColor = borderColorMap[category.color] || '#34d399';

                              return (
                                <div
                                  key={engine.name}
                                  className={`group relative flex items-start gap-2.5 p-3 rounded-xl border cursor-pointer transition-all duration-200 ${
                                    isSelected
                                      ? `${getCategoryColor(category.color, 'bg')} ${getCategoryColor(category.color, 'border')} shadow-md hover:shadow-lg hover:scale-[1.02]`
                                      : 'bg-gray-800/20 border-gray-800/40 opacity-60 hover:opacity-80 hover:border-gray-700 hover:bg-gray-800/40'
                                  }`}
                                  onClick={() => toggleEngine(engine.name)}
                                  style={isSelected ? {
                                    borderLeftWidth: '3px',
                                    borderLeftColor: accentColor,
                                    boxShadow: `0 2px 12px -2px ${accentColor}25`,
                                  } : {}}
                                >
                                  {/* Icon with animated glow */}
                                  <div className={`mt-0.5 shrink-0 w-8 h-8 rounded-lg flex items-center justify-center transition-all duration-200 ${
                                    isSelected
                                      ? 'bg-gray-800/60 shadow-inner'
                                      : 'bg-gray-800/30'
                                  }`}>
                                    <EngineIcon className={`w-4 h-4 transition-all duration-200 ${
                                      isSelected ? getCategoryColor(category.color) : 'text-gray-600 group-hover:text-gray-400'
                                    }`} style={isSelected ? { filter: `drop-shadow(0 0 4px ${accentColor})` } : {}} />
                                  </div>

                                  <div className="min-w-0 flex-1">
                                    <p className={`text-xs font-semibold truncate transition-colors duration-200 ${isSelected ? 'text-white' : 'text-gray-500'}`}>
                                      {engine.name}
                                    </p>
                                    <p className={`text-[10px] truncate transition-colors duration-200 ${isSelected ? 'text-gray-300' : 'text-gray-600'}`}>{engine.desc}</p>
                                  </div>

                                  {/* Animated check indicator */}
                                  <div className={`mt-0.5 shrink-0 w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all duration-300 ${
                                    isSelected
                                      ? 'bg-emerald-500 border-emerald-500 scale-110'
                                      : 'border-gray-600 bg-transparent scale-100 group-hover:border-gray-500'
                                  }`}>
                                    {isSelected && <Check className="w-3 h-3 text-white" />}
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

                {/* Link Analysis Info Card */}
                <Card className="bg-gray-900 border-gray-800">
                  <CardHeader>
                    <CardTitle className="text-white flex items-center gap-2 text-sm">
                      <GitBranch className="w-4 h-4 text-purple-400" />
                      Analisis de Vinculos (Nuevo)
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm text-gray-400 space-y-2">
                    <p>Sube un archivo <strong className="text-white">.xlsx con 2 hojas</strong> y el sistema analizara automaticamente los vinculos entre ellas:</p>
                    <div className="grid grid-cols-2 gap-2 mt-2">
                      <div className="flex items-center gap-2 text-xs">
                        <Building2 className="w-3.5 h-3.5 text-blue-400" />
                        <span>Vinculos empresariales</span>
                      </div>
                      <div className="flex items-center gap-2 text-xs">
                        <User className="w-3.5 h-3.5 text-cyan-400" />
                        <span>Vinculos personales</span>
                      </div>
                      <div className="flex items-center gap-2 text-xs">
                        <Heart className="w-3.5 h-3.5 text-purple-400" />
                        <span>Conexiones familiares</span>
                      </div>
                      <div className="flex items-center gap-2 text-xs">
                        <Briefcase className="w-3.5 h-3.5 text-green-400" />
                        <span>Conexiones laborales</span>
                      </div>
                    </div>
                    <Separator className="my-3 bg-gray-800" />
                    <p className="text-xs text-gray-600">Se genera un <strong className="text-purple-400">Informe Conjunto en PDF</strong> con el analisis de vinculos y los hallazgos individuales.</p>
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>

          {/* ────────────────────────────────────────────
              BATCH UPLOAD TAB
          ──────────────────────────────────────────── */}
          <TabsContent value="batch" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Upload Area */}
              <div className="space-y-4">
                <Card className="bg-gray-900 border-gray-800">
                  <CardHeader>
                    <CardTitle className="text-white flex items-center gap-2">
                      <FileSpreadsheet className="w-5 h-5 text-emerald-400" />
                      Carga de Archivo
                    </CardTitle>
                    <CardDescription className="text-gray-500">
                      Sube un .xlsx con 2 hojas para analisis de vinculos, o .csv para lote
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div
                      onDrop={handleDrop}
                      onDragOver={handleDragOver}
                      onDragLeave={handleDragLeave}
                      className={`border-2 border-dashed rounded-xl p-8 text-center transition-all cursor-pointer ${
                        isDragging
                          ? 'border-emerald-500 bg-emerald-900/20'
                          : uploadFile
                            ? 'border-emerald-700 bg-emerald-900/10'
                            : 'border-gray-700 bg-gray-800/30 hover:border-gray-600 hover:bg-gray-800/50'
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
                        <div className="space-y-2">
                          <FileSpreadsheet className="w-10 h-10 mx-auto text-emerald-400" />
                          <p className="text-sm font-medium text-white">{uploadFile.name}</p>
                          <p className="text-xs text-gray-500">{(uploadFile.size / 1024).toFixed(1)} KB</p>
                          <Button variant="ghost" size="sm" className="text-red-400 hover:text-red-300" onClick={(e) => { e.stopPropagation(); setUploadFile(null); }}>
                            <XCircle className="w-4 h-4 mr-1" /> Quitar archivo
                          </Button>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <Upload className="w-10 h-10 mx-auto text-gray-600" />
                          <p className="text-sm text-gray-400">Arrastra tu archivo aqui o haz clic para seleccionar</p>
                          <p className="text-xs text-gray-600">.xlsx (2 hojas = analisis de vinculos) | .csv (lote)</p>
                        </div>
                      )}
                    </div>

                    <div className="p-3 bg-purple-900/20 rounded-lg border border-purple-800/50">
                      <p className="text-xs font-medium text-purple-300 mb-1">Analisis de Vinculos (xlsx con 2 hojas)</p>
                      <p className="text-[10px] text-gray-500">Si subes un .xlsx con 2 o mas hojas, se ejecutara automaticamente el analisis de vinculos empresariales, personales, familiares y laborales entre los datos de ambas hojas. Se genera un Informe Conjunto en PDF.</p>
                    </div>

                    {uploadError && (
                      <div className="p-3 bg-red-900/30 border border-red-800 rounded-lg text-red-300 text-sm">
                        {uploadError}
                      </div>
                    )}

                    <Button onClick={handleFileUpload} disabled={!uploadFile || uploadLoading} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold" size="lg">
                      {uploadLoading ? (
                        <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Procesando...</>
                      ) : (
                        <><Users className="w-4 h-4 mr-2" />Procesar y Analizar</>
                      )}
                    </Button>

                    {uploadProgress > 0 && <Progress value={uploadProgress} className="h-2" />}
                  </CardContent>
                </Card>
              </div>

              {/* Batch Results */}
              <div className="space-y-4">
                {batchResults ? (
                  <Card className="bg-gray-900 border-gray-800">
                    <CardHeader>
                      <CardTitle className="text-white flex items-center gap-2">
                        <BarChart3 className="w-5 h-5 text-emerald-400" />
                        Resultados del Procesamiento
                      </CardTitle>
                      <CardDescription className="text-gray-500">
                        {batchResults.length} persona(s) procesada(s)
                        {sheetNames.length > 0 && ` | Hojas: ${sheetNames.join(', ')}`}
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <ScrollArea className="max-h-[400px]">
                        <div className="space-y-3">
                          {batchResults.map((result, idx) => {
                            const totalRisk = Math.min(100, result.summary.critical * 30 + result.summary.high * 15 + result.summary.medium * 5 + result.summary.low * 2);
                            const rLabel = totalRisk >= 70 ? 'CRITICO' : totalRisk >= 40 ? 'ALTO' : totalRisk >= 15 ? 'MODERADO' : 'BAJO';
                            const rColor = totalRisk >= 70 ? 'text-red-500' : totalRisk >= 40 ? 'text-orange-500' : totalRisk >= 15 ? 'text-yellow-500' : 'text-green-500';

                            return (
                              <div key={idx} className="p-4 bg-gray-800/50 rounded-lg border border-gray-800">
                                <div className="flex items-start justify-between">
                                  <div className="flex-1">
                                    <p className="text-sm font-medium text-white">{result.fullName}</p>
                                    <div className="flex items-center gap-2 mt-1">
                                      <Badge variant="outline" className="border-gray-700 text-gray-400 text-xs">{result.totalResults} hallazgos</Badge>
                                      <span className={`text-xs font-bold ${rColor}`}>{rLabel}</span>
                                      {result.reportGenerated && <Badge className="bg-emerald-700 text-white text-xs"><CheckCircle2 className="w-3 h-3 mr-1" />PDF</Badge>}
                                    </div>
                                    {result.summary.critical > 0 && (
                                      <div className="flex items-center gap-1 mt-2">
                                        <AlertOctagon className="w-3.5 h-3.5 text-red-500" />
                                        <span className="text-xs text-red-400">{result.summary.critical} criticos</span>
                                      </div>
                                    )}
                                  </div>
                                  <div className="flex gap-2 ml-3">
                                    <Button size="sm" variant="outline" className="border-gray-700 text-gray-400 hover:text-white" onClick={() => handleViewPastScan(result.scanId)}>Ver</Button>
                                    {result.reportGenerated && (
                                      <Button size="sm" className="bg-emerald-700 hover:bg-emerald-800 text-white" onClick={() => handleDownloadReport(result.scanId)}>
                                        <Download className="w-3.5 h-3.5 mr-1" />PDF
                                      </Button>
                                    )}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </ScrollArea>

                      {/* Joint Analysis Banner */}
                      {relationshipAnalysis && jointAnalysisId && (
                        <div className="mt-4 p-4 bg-purple-900/20 border border-purple-800/50 rounded-lg">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <div className="p-2 bg-purple-800/50 rounded-lg">
                                <GitBranch className="w-5 h-5 text-purple-400" />
                              </div>
                              <div>
                                <p className="text-sm font-medium text-purple-300">Analisis de Vinculos Completo</p>
                                <p className="text-xs text-purple-500">{relationshipAnalysis.totalLinks} vinculos encontrados entre {relationshipAnalysis.sheet1Name} y {relationshipAnalysis.sheet2Name}</p>
                              </div>
                            </div>
                            <Button className="bg-purple-700 hover:bg-purple-800 text-white" onClick={() => { setActiveTab('relationships'); }}>
                              Ver Vinculos
                            </Button>
                          </div>
                          <div className="flex gap-2 mt-3">
                            <Button size="sm" className="bg-purple-600 hover:bg-purple-700 text-white" onClick={() => handleDownloadJointReport(jointAnalysisId)}>
                              <Download className="w-3.5 h-3.5 mr-1" />Informe Conjunto PDF
                            </Button>
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ) : (
                  <Card className="bg-gray-900 border-gray-800">
                    <CardContent className="py-16 text-center">
                      <FileSpreadsheet className="w-16 h-16 mx-auto mb-4 text-gray-700" />
                      <p className="text-gray-500 mb-2">Carga un archivo para procesar</p>
                      <p className="text-xs text-gray-600">.xlsx con 2 hojas = Analisis de vinculos + Informe Conjunto PDF</p>
                      <p className="text-xs text-gray-600">.csv = Lote individual con informes PDF</p>
                    </CardContent>
                  </Card>
                )}
              </div>
            </div>
          </TabsContent>

          {/* ────────────────────────────────────────────
              RESULTS TAB (IMPROVED)
          ──────────────────────────────────────────── */}
          <TabsContent value="results" className="space-y-6">
            {scanData && (
              <>
                {/* Report download banner */}
                {scanData && (
                  <Card className="bg-emerald-900/20 border-emerald-800">
                    <CardContent className="p-4 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-emerald-800/50 rounded-lg">
                          <FileDown className="w-5 h-5 text-emerald-400" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-emerald-300">Informe Generado</p>
                          <p className="text-xs text-emerald-500">{scanData.reportFileName}</p>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button onClick={() => handleDownloadReport(scanData.scanId, 'pdf')} className="bg-emerald-700 hover:bg-emerald-800 text-white">
                          <Download className="w-4 h-4 mr-2" />PDF
                        </Button>
                        <Button onClick={() => handleDownloadReport(scanData.scanId, 'docx')} className="bg-blue-700 hover:bg-blue-800 text-white">
                          <Download className="w-4 h-4 mr-2" />DOCX
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Risk Score & Summary */}
                <Card className="bg-gray-900 border-gray-800">
                  <CardContent className="p-6">
                    <div className="flex flex-col sm:flex-row items-center gap-6">
                      {/* Risk Gauge */}
                      <RiskGauge score={riskScore} label={riskLabel} color={riskColor} />

                      {/* Summary Cards */}
                      <div className="flex-1 grid grid-cols-2 sm:grid-cols-3 gap-3 w-full">
                        <div className="p-3 bg-gray-800/50 rounded-lg border border-gray-800 text-center">
                          <p className="text-2xl font-bold text-white">{scanData.totalResults}</p>
                          <p className="text-xs text-gray-500">Total</p>
                        </div>
                        <div className="p-3 bg-red-900/20 rounded-lg border border-red-900/50 text-center">
                          <p className="text-2xl font-bold text-red-500">{scanData.summary.critical}</p>
                          <p className="text-xs text-gray-500">Criticos</p>
                        </div>
                        <div className="p-3 bg-orange-900/20 rounded-lg border border-orange-900/50 text-center">
                          <p className="text-2xl font-bold text-orange-500">{scanData.summary.high}</p>
                          <p className="text-xs text-gray-500">Altos</p>
                        </div>
                        <div className="p-3 bg-yellow-900/20 rounded-lg border border-yellow-900/50 text-center">
                          <p className="text-2xl font-bold text-yellow-500">{scanData.summary.medium}</p>
                          <p className="text-xs text-gray-500">Medios</p>
                        </div>
                        <div className="p-3 bg-blue-900/20 rounded-lg border border-blue-900/50 text-center">
                          <p className="text-2xl font-bold text-blue-400">{scanData.summary.low}</p>
                          <p className="text-xs text-gray-500">Bajos</p>
                        </div>
                        <div className="p-3 bg-gray-800/50 rounded-lg border border-gray-800 text-center">
                          <p className="text-2xl font-bold text-gray-400">{scanData.summary.info}</p>
                          <p className="text-xs text-gray-500">Info</p>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Severity Filter Buttons */}
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm text-gray-500">Filtrar:</span>
                  <Button size="sm" variant={filterSeverity === 'all' ? 'default' : 'outline'} onClick={() => setFilterSeverity('all')} className={filterSeverity === 'all' ? 'bg-emerald-600' : 'border-gray-700 text-gray-400'}>
                    Todos ({scanData.totalResults})
                  </Button>
                  {Object.entries(severityConfig).map(([key, config]) => {
                    const count = scanData.summary[key as keyof ScanSummary];
                    if (count === 0) return null;
                    return (
                      <Button key={key} size="sm" variant={filterSeverity === key ? 'default' : 'outline'} onClick={() => setFilterSeverity(key)} className={filterSeverity === key ? config.color : 'border-gray-700 text-gray-400'}>
                        {config.label} ({count})
                      </Button>
                    );
                  })}
                </div>

                {/* Results grouped by source in collapsible sections */}
                <ScrollArea className="max-h-[600px]">
                  <div className="space-y-2">
                    {Object.entries(groupedResults).map(([source, results]) => {
                      const isOpen = expandedGroups.has(source);
                      const maxSeverity = results.reduce((max, r) => {
                        const order = ['critical', 'high', 'medium', 'low', 'info'];
                        return order.indexOf(r.severity) < order.indexOf(max) ? r.severity : max;
                      }, 'info' as ScanResult['severity']);
                      const maxConfig = severityConfig[maxSeverity];

                      return (
                        <Collapsible key={source} open={isOpen} onOpenChange={() => toggleGroup(source)}>
                          <Card className="bg-gray-900 border-gray-800 overflow-hidden">
                            <CollapsibleTrigger asChild>
                              <div className="p-4 flex items-center gap-3 cursor-pointer hover:bg-gray-800/30 transition-colors">
                                <div className={`p-1.5 rounded-md ${maxConfig.color} shrink-0`}>
                                  <maxConfig.icon className="w-4 h-4" />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2">
                                    <p className="text-sm font-medium text-white truncate">{source}</p>
                                    <Badge className={`${maxConfig.color} text-xs`}>{maxConfig.label}</Badge>
                                  </div>
                                  <p className="text-xs text-gray-500">{results.length} hallazgo{results.length !== 1 ? 's' : ''}</p>
                                </div>
                                {isOpen ? <ChevronUp className="w-4 h-4 text-gray-600 shrink-0" /> : <ChevronDown className="w-4 h-4 text-gray-600 shrink-0" />}
                              </div>
                            </CollapsibleTrigger>
                            <CollapsibleContent>
                              <div className="border-t border-gray-800">
                                {results.map((result, idx) => {
                                  const config = severityConfig[result.severity];
                                  const Icon = config.icon;
                                  const isExpanded = expandedResult === `${source}-${idx}`;
                                  return (
                                    <div
                                      key={idx}
                                      className="p-3 pl-6 border-b border-gray-800/50 last:border-b-0 cursor-pointer hover:bg-gray-800/20 transition-colors"
                                      onClick={() => setExpandedResult(isExpanded ? null : `${source}-${idx}`)}
                                    >
                                      <div className="flex items-start gap-2">
                                        <Badge className={`${config.color} text-[10px] shrink-0`}>{config.label}</Badge>
                                        <div className="flex-1 min-w-0">
                                          <p className="text-sm text-white break-words">{result.title}</p>
                                          {isExpanded && result.description && (
                                            <p className="text-sm text-gray-400 mt-1 break-words">{result.description}</p>
                                          )}
                                          {isExpanded && result.dataFound && (
                                            <p className="text-xs text-gray-500 mt-1 break-words">Datos: {result.dataFound}</p>
                                          )}
                                          <div className="flex items-center gap-2 mt-1">
                                            <Badge variant="outline" className="border-gray-700 text-gray-500 text-[10px]">
                                              {categoryLabels[result.category] || result.category}
                                            </Badge>
                                            {isExpanded && result.url && (
                                              <a href={result.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-emerald-400 hover:text-emerald-300" onClick={e => e.stopPropagation()}>
                                                <ExternalLink className="w-3 h-3" />Ver fuente
                                              </a>
                                            )}
                                          </div>
                                        </div>
                                        {isExpanded ? <ChevronUp className="w-3 h-3 text-gray-600 shrink-0 mt-1" /> : <ChevronDown className="w-3 h-3 text-gray-600 shrink-0 mt-1" />}
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
                      <div className="text-center py-12 text-gray-600">
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
              RELATIONSHIPS TAB
          ──────────────────────────────────────────── */}
          <TabsContent value="relationships" className="space-y-6">
            {relationshipAnalysis && (
              <>
                {/* Summary Banner */}
                <Card className="bg-purple-900/20 border-purple-800">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-purple-800/50 rounded-lg">
                          <GitBranch className="w-5 h-5 text-purple-400" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-purple-300">Analisis de Vinculos</p>
                          <p className="text-xs text-purple-500">{relationshipAnalysis.sheet1Name} ({relationshipAnalysis.sheet1RowCount} registros) ↔ {relationshipAnalysis.sheet2Name} ({relationshipAnalysis.sheet2RowCount} registros)</p>
                        </div>
                      </div>
                      {jointAnalysisId && (
                        <Button className="bg-purple-700 hover:bg-purple-800 text-white" onClick={() => handleDownloadJointReport(jointAnalysisId)}>
                          <Download className="w-4 h-4 mr-2" />Informe Conjunto PDF
                        </Button>
                      )}
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
                      {Object.entries(relationshipAnalysis.summary).map(([type, count]) => {
                        const config = linkTypeConfig[type];
                        if (!config || count === 0) return null;
                        const Icon = config.icon;
                        return (
                          <div key={type} className={`p-2 rounded-lg border text-center cursor-pointer ${linkFilter === type ? config.bgColor : 'bg-gray-800/50 border-gray-800'}`} onClick={() => setLinkFilter(linkFilter === type ? 'all' : type)}>
                            <Icon className={`w-4 h-4 mx-auto mb-1 ${config.color}`} />
                            <p className="text-lg font-bold text-white">{count}</p>
                            <p className="text-[10px] text-gray-500">{config.label}</p>
                          </div>
                        );
                      })}
                      <div className={`p-2 rounded-lg border text-center cursor-pointer ${linkFilter === 'all' ? 'bg-gray-700 border-gray-600' : 'bg-gray-800/50 border-gray-800'}`} onClick={() => setLinkFilter('all')}>
                        <Network className="w-4 h-4 mx-auto mb-1 text-gray-400" />
                        <p className="text-lg font-bold text-white">{relationshipAnalysis.totalLinks}</p>
                        <p className="text-[10px] text-gray-500">Todos</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Network Map */}
                {relationshipAnalysis.networkMap.length > 0 && (
                  <Card className="bg-gray-900 border-gray-800">
                    <CardHeader>
                      <CardTitle className="text-white flex items-center gap-2 text-sm">
                        <Network className="w-4 h-4 text-purple-400" />
                        Mapa de Red - Personas con Mas Conexiones
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="flex flex-wrap gap-2">
                        {relationshipAnalysis.networkMap.slice(0, 15).map((node, idx) => (
                          <div key={idx} className="flex items-center gap-2 px-3 py-1.5 bg-gray-800/50 rounded-full border border-gray-800">
                            <span className="text-xs font-medium text-white">{node.person}</span>
                            <Badge className="bg-purple-700 text-white text-[10px] px-1.5">{node.connections}</Badge>
                            <div className="flex gap-1">
                              {node.types.map(t => {
                                const tc = linkTypeConfig[t];
                                if (!tc) return null;
                                const TIcon = tc.icon;
                                return <TIcon key={t} className={`w-3 h-3 ${tc.color}`} />;
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Link Filter */}
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm text-gray-500">Filtrar vinculos:</span>
                  <Button size="sm" variant={linkFilter === 'all' ? 'default' : 'outline'} onClick={() => setLinkFilter('all')} className={linkFilter === 'all' ? 'bg-purple-600' : 'border-gray-700 text-gray-400'}>
                    Todos ({relationshipAnalysis.totalLinks})
                  </Button>
                  {Object.entries(linkTypeConfig).map(([type, config]) => {
                    const count = relationshipAnalysis.summary[type as keyof typeof relationshipAnalysis.summary];
                    if (count === 0) return null;
                    const Icon = config.icon;
                    return (
                      <Button key={type} size="sm" variant={linkFilter === type ? 'default' : 'outline'} onClick={() => setLinkFilter(type)} className={linkFilter === type ? `bg-purple-600 text-white` : 'border-gray-700 text-gray-400'}>
                        <Icon className="w-3.5 h-3.5 mr-1" />{config.label} ({count})
                      </Button>
                    );
                  })}
                </div>

                {/* Links List */}
                <ScrollArea className="max-h-[600px]">
                  <div className="space-y-3">
                    {filteredLinks.map((link, idx) => {
                      const config = linkTypeConfig[link.type] || linkTypeConfig.dato_compartido;
                      const Icon = config.icon;
                      const isExpanded = expandedLink === `${idx}`;
                      const confColor = link.confidence === 'alta' ? 'text-green-400' : link.confidence === 'media' ? 'text-yellow-400' : 'text-red-400';

                      return (
                        <Card key={idx} className={`bg-gray-900 border-gray-800 hover:border-gray-700 transition-colors cursor-pointer ${config.bgColor}`} onClick={() => setExpandedLink(isExpanded ? null : `${idx}`)}>
                          <CardContent className="p-4">
                            <div className="flex items-start gap-3">
                              <div className={`p-1.5 rounded-md shrink-0`} style={{ backgroundColor: config.color.replace('text-', '').replace('-400', '-900/30') }}>
                                <Icon className={`w-4 h-4 ${config.color}`} />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                  <Badge className={`${config.color.replace('text-', 'bg-').replace('-400', '-700')} text-white text-xs`}>
                                    {config.label}
                                  </Badge>
                                  <span className={`text-xs font-bold ${confColor}`}>
                                    Confianza: {link.confidence.toUpperCase()}
                                  </span>
                                </div>
                                <p className="text-sm font-medium text-white">
                                  <span className="text-emerald-400">{link.sheet1Person}</span>
                                  <span className="text-gray-500 mx-2">↔</span>
                                  <span className="text-purple-400">{link.sheet2Person}</span>
                                </p>
                                <p className="text-xs text-gray-500 mt-1">
                                  Campo: {link.matchedField} | Valor: &quot;{link.matchedValue}&quot;
                                </p>
                                {isExpanded && (
                                  <p className="text-sm text-gray-400 mt-2">{link.description}</p>
                                )}
                              </div>
                              {isExpanded ? <ChevronUp className="w-4 h-4 text-gray-600 shrink-0" /> : <ChevronDown className="w-4 h-4 text-gray-600 shrink-0" />}
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                    {filteredLinks.length === 0 && (
                      <div className="text-center py-12 text-gray-600">
                        <Link2 className="w-12 h-12 mx-auto mb-3 text-gray-700" />
                        <p className="text-lg font-medium">No se encontraron vinculos de este tipo</p>
                        <p className="text-sm">Intenta con otro filtro o verifica los datos del archivo.</p>
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
            {/* ── Summary Header (shows when scan is done) ── */}
            {socialScanData && (
              <Card className="bg-gradient-to-r from-gray-900 via-gray-900 to-pink-950/20 border-pink-800/40 overflow-hidden">
                <CardContent className="p-6">
                  <div className="flex flex-col md:flex-row items-center gap-6">
                    {/* Left: Summary Stats */}
                    <div className="flex-1 w-full">
                      <div className="flex items-center gap-3 mb-4">
                        <div className="p-2.5 bg-pink-800/30 rounded-xl border border-pink-700/30">
                          <Globe className="w-6 h-6 text-pink-400" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <h2 className="text-lg font-bold text-white">Investigación de Redes Sociales</h2>
                            {socialScanData.searchMode && (
                              <Badge className={`text-[9px] gap-1 ${
                                socialScanData.searchMode === 'nickname'
                                  ? 'bg-pink-600/30 text-pink-300 border border-pink-500/30'
                                  : socialScanData.searchMode === 'email'
                                  ? 'bg-sky-600/30 text-sky-300 border border-sky-500/30'
                                  : 'bg-emerald-600/30 text-emerald-300 border border-emerald-500/30'
                              }`}>
                                {socialScanData.searchMode === 'nickname' && <AtSign className="w-3 h-3" />}
                                {socialScanData.searchMode === 'email' && <Mail className="w-3 h-3" />}
                                {socialScanData.searchMode === 'name' && <User className="w-3 h-3" />}
                                Búsqueda por {socialScanData.searchMode === 'nickname' ? 'NickName' : socialScanData.searchMode === 'email' ? 'Correo' : 'Nombre'}
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-gray-400">
                            {socialScanData.platformsScanned.length} plataformas escaneadas
                            {socialScanData.searchQuery && <span className="text-gray-500"> · Consulta: <span className="text-gray-300">{socialScanData.searchQuery}</span></span>}
                          </p>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <div className="p-3 bg-pink-900/20 rounded-xl border border-pink-800/30 text-center">
                          <p className="text-2xl font-bold text-pink-300">{socialScanData.summary.profilesFound}</p>
                          <p className="text-[10px] text-gray-500 font-medium">Perfiles Encontrados</p>
                        </div>
                        <div className="p-3 bg-gray-800/40 rounded-xl border border-gray-700/30 text-center">
                          <p className="text-2xl font-bold text-white">{socialScanData.summary.totalFindings}</p>
                          <p className="text-[10px] text-gray-500 font-medium">Hallazgos Totales</p>
                        </div>
                        <div className="p-3 bg-red-900/15 rounded-xl border border-red-800/30 text-center">
                          <p className="text-2xl font-bold text-red-400">{socialScanData.summary.critical + socialScanData.summary.high}</p>
                          <p className="text-[10px] text-gray-500 font-medium">Hallazgos Críticos</p>
                        </div>
                        <div className="p-3 bg-orange-900/15 rounded-xl border border-orange-800/30 text-center">
                          <p className="text-2xl font-bold text-orange-400">{socialScanData.summary.medium}</p>
                          <p className="text-[10px] text-gray-500 font-medium">Hallazgos Medios</p>
                        </div>
                      </div>
                    </div>

                    {/* Right: Social Risk Gauge */}
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
                        const socialRiskColor = socialRiskScore >= 70 ? 'text-red-500' : socialRiskScore >= 40 ? 'text-orange-500' : socialRiskScore >= 15 ? 'text-yellow-500' : 'text-emerald-500';
                        return <RiskGauge score={socialRiskScore} label={`Riesgo Social: ${socialRiskLabel}`} color={socialRiskColor} />;
                      })()}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Social Scan Input - Left Column */}
              <div className="lg:col-span-1 space-y-4">
                <Card className="bg-gray-900 border-gray-800">
                  <CardHeader>
                    <CardTitle className="text-white flex items-center gap-2">
                      <Globe className="w-5 h-5 text-pink-400" />
                      Búsqueda en Redes Sociales
                    </CardTitle>
                    <CardDescription className="text-gray-500">
                      Escanea la presencia digital en {selectedSocialPlatforms.size || 0} plataformas
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {/* Search Mode Selector */}
                    <div className="space-y-2">
                      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Modo de Búsqueda</p>
                      <div className="grid grid-cols-3 gap-2">
                        <button
                          type="button"
                          onClick={() => setSocialSearchMode('nickname')}
                          className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 transition-all duration-200 ${
                            socialSearchMode === 'nickname'
                              ? 'bg-pink-900/30 border-pink-500 shadow-lg shadow-pink-900/20'
                              : 'bg-gray-800/30 border-gray-700/40 hover:border-pink-800/50 hover:bg-pink-900/10'
                          }`}
                        >
                          <AtSign className={`w-5 h-5 ${socialSearchMode === 'nickname' ? 'text-pink-400' : 'text-gray-500'}`} />
                          <span className={`text-[10px] font-bold ${socialSearchMode === 'nickname' ? 'text-pink-300' : 'text-gray-500'}`}>NickName</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setSocialSearchMode('email')}
                          className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 transition-all duration-200 ${
                            socialSearchMode === 'email'
                              ? 'bg-sky-900/30 border-sky-500 shadow-lg shadow-sky-900/20'
                              : 'bg-gray-800/30 border-gray-700/40 hover:border-sky-800/50 hover:bg-sky-900/10'
                          }`}
                        >
                          <Mail className={`w-5 h-5 ${socialSearchMode === 'email' ? 'text-sky-400' : 'text-gray-500'}`} />
                          <span className={`text-[10px] font-bold ${socialSearchMode === 'email' ? 'text-sky-300' : 'text-gray-500'}`}>Correo</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setSocialSearchMode('name')}
                          className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 transition-all duration-200 ${
                            socialSearchMode === 'name'
                              ? 'bg-emerald-900/30 border-emerald-500 shadow-lg shadow-emerald-900/20'
                              : 'bg-gray-800/30 border-gray-700/40 hover:border-emerald-800/50 hover:bg-emerald-900/10'
                          }`}
                        >
                          <User className={`w-5 h-5 ${socialSearchMode === 'name' ? 'text-emerald-400' : 'text-gray-500'}`} />
                          <span className={`text-[10px] font-bold ${socialSearchMode === 'name' ? 'text-emerald-300' : 'text-gray-500'}`}>Nombre</span>
                        </button>
                      </div>
                    </div>

                    {/* Conditional Input based on Search Mode - ALL EDITABLE */}
                    {socialSearchMode === 'nickname' && (
                      <div className="space-y-1.5">
                        <Label className="text-xs text-pink-300 font-medium flex items-center gap-1.5">
                          <AtSign className="w-3.5 h-3.5" /> NickName / Usuario
                        </Label>
                        <Input
                          placeholder="ej: johndoe, @username"
                          value={socialNickname}
                          onChange={(e) => setSocialNickname(e.target.value)}
                          className="bg-gray-800/50 border-pink-800/30 focus:border-pink-500 text-white placeholder:text-gray-600"
                        />
                        <p className="text-[9px] text-gray-500">Busca perfiles por nombre de usuario en redes sociales</p>
                      </div>
                    )}
                    {socialSearchMode === 'email' && (
                      <div className="space-y-1.5">
                        <Label className="text-xs text-sky-300 font-medium flex items-center gap-1.5">
                          <Mail className="w-3.5 h-3.5" /> Correo Electrónico
                        </Label>
                        <Input
                          type="email"
                          placeholder="ej: usuario@correo.com"
                          value={socialEmail}
                          onChange={(e) => setSocialEmail(e.target.value)}
                          className="bg-gray-800/50 border-sky-800/30 focus:border-sky-500 text-white placeholder:text-gray-600"
                        />
                        {!socialEmail.trim() && email.trim() && (
                          <button
                            type="button"
                            onClick={() => setSocialEmail(email)}
                            className="text-[9px] text-sky-400 hover:text-sky-300 flex items-center gap-1 transition-colors"
                          >
                            <Sparkles className="w-2.5 h-2.5" /> Usar correo del formulario principal: {email}
                          </button>
                        )}
                        <p className="text-[9px] text-gray-500">Busca cuentas asociadas al correo electrónico</p>
                      </div>
                    )}
                    {socialSearchMode === 'name' && (
                      <div className="space-y-1.5">
                        <Label className="text-xs text-emerald-300 font-medium flex items-center gap-1.5">
                          <User className="w-3.5 h-3.5" /> Nombre Completo
                        </Label>
                        <Input
                          placeholder="ej: Juan Pérez García"
                          value={socialName}
                          onChange={(e) => setSocialName(e.target.value)}
                          className="bg-gray-800/50 border-emerald-800/30 focus:border-emerald-500 text-white placeholder:text-gray-600"
                        />
                        {!socialName.trim() && fullName.trim() && (
                          <button
                            type="button"
                            onClick={() => setSocialName(fullName)}
                            className="text-[9px] text-emerald-400 hover:text-emerald-300 flex items-center gap-1 transition-colors"
                          >
                            <Sparkles className="w-2.5 h-2.5" /> Usar nombre del formulario principal: {fullName}
                          </button>
                        )}
                        <p className="text-[9px] text-gray-500">Busca perfiles por nombre de persona</p>
                      </div>
                    )}

                    {/* ── Search Engine Quick Links ── */}
                    {getSocialSearchValue() && (
                      <div className="space-y-2">
                        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                          <Globe className="w-3 h-3" /> Buscar en Motores de Búsqueda
                        </p>
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
                                className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-[10px] font-medium transition-all duration-200 hover:scale-[1.02] ${engine.bgColor} ${engine.borderColor} ${engine.color} hover:shadow-lg`}
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

                    {/* Contexto de Búsqueda */}
                    <div className="p-3 bg-gray-800/40 rounded-xl border border-gray-700/30">
                      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Contexto de Búsqueda</p>
                      <div className="space-y-1.5">
                        {socialSearchMode === 'nickname' && socialNickname.trim() && (
                          <div className="flex items-center gap-2">
                            <AtSign className="w-3.5 h-3.5 text-pink-400 shrink-0" />
                            <p className="text-xs text-white font-medium truncate">{socialNickname}</p>
                            <Badge className="bg-pink-600/30 text-pink-300 text-[8px] border-0 ml-auto">NickName</Badge>
                          </div>
                        )}
                        {socialSearchMode === 'email' && (socialEmail.trim() || email.trim()) && (
                          <div className="flex items-center gap-2">
                            <Mail className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                            <p className="text-[10px] text-gray-300 truncate">{socialEmail.trim() || email}</p>
                            <Badge className="bg-sky-600/30 text-sky-300 text-[8px] border-0 ml-auto">Correo</Badge>
                          </div>
                        )}
                        {socialSearchMode === 'name' && (socialName.trim() || fullName.trim()) && (
                          <div className="flex items-center gap-2">
                            <User className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                            <p className="text-xs text-white font-medium truncate">{socialName.trim() || fullName}</p>
                            <Badge className="bg-emerald-600/30 text-emerald-300 text-[8px] border-0 ml-auto">Nombre</Badge>
                          </div>
                        )}
                        {(socialEmail.trim() || email.trim()) && socialSearchMode !== 'email' && (
                          <div className="flex items-center gap-2">
                            <Mail className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                            <p className="text-[10px] text-gray-400 truncate">{socialEmail.trim() || email}</p>
                          </div>
                        )}
                        {phone.trim() && (
                          <div className="flex items-center gap-2">
                            <Phone className="w-3.5 h-3.5 text-green-400 shrink-0" />
                            <p className="text-[10px] text-gray-400 truncate">{phone}</p>
                          </div>
                        )}
                        {cedula.trim() && (
                          <div className="flex items-center gap-2">
                            <FileText className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                            <p className="text-[10px] text-gray-400 truncate">{cedula}</p>
                          </div>
                        )}
                        {!getSocialSearchValue() && !phone.trim() && !cedula.trim() && (
                          <p className="text-[10px] text-gray-600 italic">No hay datos de búsqueda ingresados</p>
                        )}
                      </div>
                    </div>

                    {socialScanError && (
                      <div className="p-3 bg-red-900/30 border border-red-800 rounded-lg text-red-300 text-sm flex items-start gap-2">
                        <AlertOctagon className="w-4 h-4 shrink-0 mt-0.5" />
                        {socialScanError}
                      </div>
                    )}

                    <Button
                      onClick={handleSocialScan}
                      disabled={socialScanLoading || selectedSocialPlatforms.size === 0 || !getSocialSearchValue()}
                      className="w-full bg-pink-600 hover:bg-pink-700 text-white font-semibold shadow-lg shadow-pink-900/30"
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
                        <p className="text-[10px] text-gray-500 text-center">Analizando plataformas...</p>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Platform Selector Card - compact in left column */}
                <Card className="bg-gray-900 border-gray-800">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-white flex items-center gap-2 text-sm">
                        <Database className="w-4 h-4 text-pink-400" />
                        Plataformas
                      </CardTitle>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-500">{selectedSocialPlatforms.size}/{socialPlatforms.length}</span>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={toggleAllSocialPlatforms}
                          className="border-gray-700 text-gray-300 hover:bg-gray-800 text-xs h-7"
                        >
                          {selectedSocialPlatforms.size === socialPlatforms.length ? 'Ninguna' : 'Todas'}
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 gap-2">
                      {socialPlatforms.map(platform => {
                        const isSelected = selectedSocialPlatforms.has(platform.id);
                        const PlatformIcon = platform.icon;
                        return (
                          <div
                            key={platform.id}
                            className={`group relative flex items-center gap-2.5 p-2.5 rounded-xl border cursor-pointer transition-all duration-300 ${
                              isSelected
                                ? `${platform.bgColor} ${platform.borderColor} shadow-lg ${platform.glowColor} hover:scale-[1.02]`
                                : 'bg-gray-800/20 border-gray-800/40 opacity-50 hover:opacity-80 hover:border-gray-700'
                            }`}
                            onClick={() => toggleSocialPlatform(platform.id)}
                          >
                            {/* Icon with glow */}
                            <div className={`w-9 h-9 rounded-lg flex items-center justify-center transition-all duration-300 ${
                              isSelected ? 'bg-gray-800/60 shadow-inner' : 'bg-gray-800/30'
                            }`}>
                              <PlatformIcon className={`w-4.5 h-4.5 transition-all duration-300 ${
                                isSelected ? platform.color : 'text-gray-600 group-hover:text-gray-400'
                              }`} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className={`text-[11px] font-semibold truncate transition-colors duration-300 ${
                                isSelected ? 'text-white' : 'text-gray-500'
                              }`}>
                                {platform.name}
                              </p>
                              <p className={`text-[8px] truncate transition-colors duration-300 ${
                                isSelected ? 'text-gray-400' : 'text-gray-600'
                              }`}>
                                {platform.desc}
                              </p>
                            </div>
                            {/* Check indicator */}
                            <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center transition-all duration-300 shrink-0 ${
                              isSelected
                                ? 'bg-pink-500 border-pink-500 scale-110'
                                : 'border-gray-600 bg-transparent scale-100'
                            }`}>
                              {isSelected && <Check className="w-2.5 h-2.5 text-white" />}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Right Column: Digital Footprint Map + Results */}
              <div className="lg:col-span-2 space-y-4">

                {/* ── Digital Footprint Map ── */}
                <Card className="bg-gray-900 border-gray-800">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-white flex items-center gap-2 text-sm">
                        <Network className="w-4 h-4 text-pink-400" />
                        Mapa de Huella Digital
                      </CardTitle>
                      {socialScanData && (
                        <div className="flex items-center gap-3 text-[10px]">
                          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" /> Perfil</span>
                          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block" /> Menciones</span>
                          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block" /> Sin datos</span>
                          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-gray-700 inline-block" /> No escaneado</span>
                        </div>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-5 gap-3">
                      {socialPlatforms.map(platform => {
                        const PlatformIcon = platform.icon;
                        const result = socialScanData?.results.find(r => r.platformId === platform.id);
                        const wasScanned = !!result;
                        let statusColor = 'bg-gray-800/30 border-gray-700/30';
                        let statusDot = 'bg-gray-700';
                        let statusLabel = 'No escaneado';
                        let statusTextColor = 'text-gray-600';

                        if (wasScanned) {
                          if (result.profileFound) {
                            statusColor = `${platform.bgColor} border-emerald-600/40`;
                            statusDot = 'bg-emerald-500';
                            statusLabel = 'Perfil encontrado';
                            statusTextColor = 'text-emerald-400';
                          } else if (result.searchResultsCount > 0 || result.findings.length > 0) {
                            statusColor = `${platform.bgColor} border-amber-600/40`;
                            statusDot = 'bg-amber-500';
                            statusLabel = `${result.findings.length} mención(es)`;
                            statusTextColor = 'text-amber-400';
                          } else {
                            statusColor = 'bg-gray-800/20 border-red-800/30';
                            statusDot = 'bg-red-500';
                            statusLabel = 'Sin resultados';
                            statusTextColor = 'text-red-400';
                          }
                        }

                        return (
                          <div
                            key={platform.id}
                            className={`relative flex flex-col items-center gap-2 p-3 rounded-xl border transition-all duration-500 ${statusColor} ${
                              wasScanned && result.profileFound ? `shadow-lg ${platform.glowColor}` : ''
                            }`}
                          >
                            {/* Status dot */}
                            <div className={`absolute top-2 right-2 w-2 h-2 rounded-full ${statusDot} ${wasScanned && result?.profileFound ? 'animate-pulse' : ''}`} />

                            {/* Icon */}
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center transition-all duration-300 ${
                              wasScanned && result?.profileFound ? 'bg-gray-800/60 shadow-inner' : 'bg-gray-800/30'
                            }`}>
                              <PlatformIcon className={`w-5 h-5 ${
                                wasScanned && result?.profileFound ? platform.color : wasScanned ? 'text-gray-400' : 'text-gray-700'
                              }`} />
                            </div>

                            {/* Platform name */}
                            <p className={`text-[10px] font-semibold text-center truncate w-full ${
                              wasScanned ? 'text-gray-300' : 'text-gray-600'
                            }`}>
                              {platform.name}
                            </p>

                            {/* Status label */}
                            <p className={`text-[8px] text-center font-medium ${statusTextColor}`}>
                              {statusLabel}
                            </p>

                            {/* Username badge if found */}
                            {wasScanned && result?.username && (
                              <Badge variant="outline" className="border-gray-600 text-gray-300 text-[7px] px-1 py-0 max-w-full truncate">
                                @{result.username}
                              </Badge>
                            )}

                            {/* Quick verify link */}
                            {wasScanned && (
                              <a
                                href={`${platform.searchUrl}${encodeURIComponent(getSocialSearchValue() || fullName)}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[8px] text-pink-400 hover:text-pink-300 flex items-center gap-0.5 mt-0.5 transition-colors"
                                onClick={e => e.stopPropagation()}
                              >
                                <ExternalLink className="w-2.5 h-2.5" /> Verificar
                              </a>
                            )}

                            {/* Search engine mini-buttons */}
                            {getSocialSearchValue() && (
                              <div className="flex gap-0.5 mt-1">
                                {searchEngines.slice(0, 4).map(engine => {
                                  const q = buildPlatformSearchQuery(platform, engine);
                                  const url = engine.buildUrl(q || getSocialSearchValue());
                                  return (
                                    <a
                                      key={engine.id}
                                      href={url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className={`text-[6px] px-1 py-0.5 rounded border ${engine.bgColor} ${engine.borderColor} ${engine.color} hover:opacity-80 transition-opacity`}
                                      onClick={e => e.stopPropagation()}
                                      title={`Buscar en ${engine.name}`}
                                    >
                                      {engine.name.substring(0, 2).toUpperCase()}
                                    </a>
                                  );
                                })}
                              </div>
                            )}

                            {/* Scanning animation */}
                            {socialScanLoading && selectedSocialPlatforms.has(platform.id) && !wasScanned && (
                              <div className="absolute inset-0 rounded-xl border-2 border-pink-500/30 animate-pulse" />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>

                {/* ── Per-Platform Detail Cards ── */}
                {socialScanData && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <BarChart3 className="w-4 h-4 text-pink-400" />
                      <h3 className="text-sm font-semibold text-white">Resultados por Plataforma</h3>
                      <Badge variant="outline" className="border-gray-700 text-gray-400 text-[10px]">
                        {socialScanData.results.length} plataformas
                      </Badge>
                    </div>

                    <ScrollArea className="max-h-[600px]">
                      <div className="space-y-3 pr-1">
                        {socialScanData.results.map(result => {
                          const platformConfig = socialPlatforms.find(p => p.id === result.platformId);
                          const isExpanded = expandedSocialPlatform === result.platformId;
                          const PlatformIcon = platformConfig?.icon || Globe;
                          const hasCriticalFindings = result.findings.some(f => f.severity === 'critical' || f.severity === 'high');

                          return (
                            <Card
                              key={result.platformId}
                              className={`bg-gray-900 border-gray-800 overflow-hidden transition-all duration-300 hover:border-gray-700 ${
                                result.profileFound ? `border-l-2 border-l-emerald-500` : hasCriticalFindings ? 'border-l-2 border-l-orange-500' : ''
                              }`}
                            >
                              {/* Card Header */}
                              <div
                                className="p-4 flex items-center gap-3 cursor-pointer hover:bg-gray-800/20 transition-colors"
                                onClick={() => setExpandedSocialPlatform(isExpanded ? null : result.platformId)}
                              >
                                {/* Platform icon with colored background */}
                                <div
                                  className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 transition-all duration-300"
                                  style={{ backgroundColor: `${platformConfig?.accentHex}15`, border: `1px solid ${platformConfig?.accentHex}30` }}
                                >
                                  <PlatformIcon className="w-5 h-5" style={{ color: platformConfig?.accentHex }} />
                                </div>

                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <p className="text-sm font-semibold text-white">{result.platform}</p>

                                    {/* Profile detection badge */}
                                    {result.profileFound ? (
                                      <Badge className="bg-emerald-600/80 text-white text-[9px] gap-1 shadow-sm shadow-emerald-900/50">
                                        <CheckCircle2 className="w-3 h-3" /> Perfil Detectado
                                      </Badge>
                                    ) : result.findings.length > 0 ? (
                                      <Badge className="bg-amber-600/80 text-white text-[9px] gap-1">
                                        <Eye className="w-3 h-3" /> Menciones
                                      </Badge>
                                    ) : (
                                      <Badge variant="outline" className="border-gray-700 text-gray-500 text-[9px]">
                                        Sin hallazgos
                                      </Badge>
                                    )}

                                    {/* Verified badge */}
                                    {result.profileVerified && (
                                      <Badge className="bg-emerald-500/20 text-emerald-300 text-[9px] gap-1 border border-emerald-500/30">
                                        <ShieldCheck className="w-3 h-3" /> Verificado
                                      </Badge>
                                    )}

                                    {/* Username */}
                                    {result.username && (
                                      <Badge
                                        variant="outline"
                                        className="text-[9px] px-1.5"
                                        style={{ borderColor: `${platformConfig?.accentHex}50`, color: platformConfig?.accentHex }}
                                      >
                                        @{result.username}
                                      </Badge>
                                    )}
                                  </div>
                                  <p className="text-xs text-gray-500 mt-0.5">
                                    {result.findings.length} hallazgo{result.findings.length !== 1 ? 's' : ''} · {result.searchResultsCount} resultado{result.searchResultsCount !== 1 ? 's' : ''} web
                                  </p>
                                </div>

                                {/* Search Engine buttons per platform */}
                                <div className="flex items-center gap-1">
                                  {searchEngines.map(engine => {
                                    const q = platformConfig ? buildPlatformSearchQuery(platformConfig, engine) : getSocialSearchValue();
                                    const url = engine.buildUrl(q || getSocialSearchValue());
                                    return (
                                      <a
                                        key={engine.id}
                                        href={url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className={`text-[9px] px-1.5 py-1 rounded-md border flex items-center gap-0.5 transition-all duration-200 hover:scale-105 ${engine.bgColor} ${engine.borderColor} ${engine.color}`}
                                        onClick={e => e.stopPropagation()}
                                        title={`Buscar en ${engine.name}`}
                                      >
                                        <ExternalLink className="w-2.5 h-2.5" />
                                        {engine.name.substring(0, 3)}
                                      </a>
                                    );
                                  })}
                                </div>

                                {isExpanded ? <ChevronUp className="w-4 h-4 text-gray-600 shrink-0 ml-1" /> : <ChevronDown className="w-4 h-4 text-gray-600 shrink-0 ml-1" />}
                              </div>

                              {/* Expanded Content */}
                              {isExpanded && (
                                <div className="border-t border-gray-800">
                                  {/* Profile URL section */}
                                  {result.profileUrl && (
                                    <div className="px-4 py-2.5 bg-emerald-900/10 flex items-center gap-2 border-b border-gray-800/50">
                                      <div className="w-6 h-6 rounded-md bg-emerald-800/30 flex items-center justify-center shrink-0">
                                        <Link2 className="w-3.5 h-3.5 text-emerald-400" />
                                      </div>
                                      <div className="flex-1 min-w-0">
                                        <p className="text-[10px] text-emerald-400 font-medium">Perfil Encontrado</p>
                                        <a href={result.profileUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-emerald-300 hover:text-emerald-200 truncate block" onClick={e => e.stopPropagation()}>
                                          {result.profileUrl}
                                        </a>
                                      </div>
                                      <a
                                        href={result.profileUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-[10px] px-2 py-1 rounded-md bg-emerald-800/20 text-emerald-400 hover:bg-emerald-800/40 transition-colors shrink-0"
                                        onClick={e => e.stopPropagation()}
                                      >
                                        Abrir <ExternalLink className="w-3 h-3 inline ml-0.5" />
                                      </a>
                                    </div>
                                  )}

                                  {/* Findings with severity indicators */}
                                  {result.findings.map((finding, idx) => {
                                    const config = severityConfig[finding.severity];
                                    const Icon = config.icon;
                                    return (
                                      <div key={idx} className="px-4 py-3 border-b border-gray-800/50 last:border-b-0 hover:bg-gray-800/10 transition-colors">
                                        <div className="flex items-start gap-2.5">
                                          <div className={`w-6 h-6 rounded-md flex items-center justify-center shrink-0 mt-0.5 ${config.color}`}>
                                            <Icon className="w-3.5 h-3.5" />
                                          </div>
                                          <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 mb-0.5">
                                              <Badge className={`${config.color} text-[9px] shrink-0`}>{config.label}</Badge>
                                              {finding.category && (
                                                <span className="text-[9px] text-gray-600 uppercase tracking-wider">{categoryLabels[finding.category] || finding.category}</span>
                                              )}
                                            </div>
                                            <p className="text-sm text-white break-words">{finding.title}</p>
                                            {finding.description && (
                                              <p className="text-sm text-gray-400 mt-1 break-words">{finding.description}</p>
                                            )}
                                            {finding.url && (
                                              <a href={finding.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-emerald-400 hover:text-emerald-300 mt-1.5" onClick={e => e.stopPropagation()}>
                                                <ExternalLink className="w-3 h-3" />Ver fuente
                                              </a>
                                            )}
                                          </div>
                                        </div>
                                      </div>
                                    );
                                  })}
                                  {result.findings.length === 0 && (
                                    <div className="px-4 py-8 text-center">
                                      <div className="w-12 h-12 rounded-full bg-gray-800/50 flex items-center justify-center mx-auto mb-2">
                                        <ShieldCheck className="w-6 h-6 text-gray-600" />
                                      </div>
                                      <p className="text-sm text-gray-500">Sin hallazgos para esta plataforma</p>
                                      <p className="text-[10px] text-gray-600 mt-1">No se detectaron exposiciones ni menciones relevantes</p>
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

                {/* Empty state when no scan yet */}
                {!socialScanData && !socialScanLoading && (
                  <Card className="bg-gray-900 border-gray-800">
                    <CardContent className="py-16 text-center">
                      <div className="w-20 h-20 rounded-full bg-pink-900/15 flex items-center justify-center mx-auto mb-4 border border-pink-800/20">
                        <Globe className="w-10 h-10 text-pink-600/50" />
                      </div>
                      <p className="text-gray-400 font-medium mb-1">Consola de Investigación Social</p>
                      <p className="text-xs text-gray-600 max-w-sm mx-auto">Selecciona las plataformas que deseas investigar y haz clic en &quot;Buscar en Redes&quot; para mapear la huella digital del objetivo.</p>
                    </CardContent>
                  </Card>
                )}

                {/* Loading state */}
                {socialScanLoading && (
                  <Card className="bg-gray-900 border-gray-800">
                    <CardContent className="py-16 text-center">
                      <div className="relative w-20 h-20 mx-auto mb-4">
                        <div className="absolute inset-0 rounded-full border-2 border-pink-800/30" />
                        <div className="absolute inset-0 rounded-full border-2 border-pink-500 border-t-transparent animate-spin" />
                        <div className="absolute inset-0 flex items-center justify-center">
                          <Globe className="w-8 h-8 text-pink-400" />
                        </div>
                      </div>
                      <p className="text-pink-300 font-semibold">Escaneando redes sociales...</p>
                      <p className="text-xs text-gray-500 mt-1">Buscando en {selectedSocialPlatforms.size} plataforma(s). Esto puede tomar unos minutos.</p>
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
              <Card className="bg-gray-900 border-gray-800">
                <CardContent className="py-12 text-center">
                  <Clock className="w-12 h-12 mx-auto mb-3 text-gray-700" />
                  <p className="text-gray-500">No hay escaneos previos</p>
                  <p className="text-sm text-gray-600">Realiza tu primer escaneo para ver el historial aqui.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {pastScans.map(scan => {
                  const hasReport = scan.reports && scan.reports.length > 0;
                  const criticals = scan.results.filter(r => r.severity === 'critical').length;
                  return (
                    <Card key={scan.id} className="bg-gray-900 border-gray-800">
                      <CardContent className="p-4 flex items-center justify-between">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-white">{scan.fullName}</p>
                          <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                            {scan.email && <span>{scan.email}</span>}
                            {scan.cedula && <span>CC: {scan.cedula}</span>}
                            {scan.phone && <span>Tel: {scan.phone}</span>}
                          </div>
                          <div className="flex items-center gap-2 mt-2">
                            <Badge variant="outline" className="border-gray-700 text-gray-400 text-xs">
                              {new Date(scan.createdAt).toLocaleDateString('es-CO', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                            </Badge>
                            <Badge variant="outline" className="border-gray-700 text-gray-400 text-xs">
                              {scan.results.length} resultados
                            </Badge>
                            {criticals > 0 && <Badge className="bg-red-600 text-white text-xs">{criticals} criticos</Badge>}
                            {hasReport && <Badge className="bg-emerald-700 text-white text-xs"><FileDown className="w-3 h-3 mr-1" />Informe</Badge>}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 ml-4">
                          <Button size="sm" variant="outline" className="border-gray-700 text-gray-400 hover:text-white" onClick={() => handleViewPastScan(scan.id)}>Ver</Button>
                          <>
                            <Button size="sm" className="bg-emerald-700 hover:bg-emerald-800 text-white" onClick={() => handleDownloadReport(scan.id, 'pdf')}>
                              <FileDown className="w-3.5 h-3.5" />
                            </Button>
                            <Button size="sm" variant="outline" className="border-blue-700 text-blue-400 hover:text-blue-300" onClick={() => handleDownloadReport(scan.id, 'docx')}>
                              <FileText className="w-3.5 h-3.5" />
                            </Button>
                          </>
                          <Button size="sm" variant="outline" className="border-gray-700 text-red-400 hover:text-red-300 hover:border-red-800" onClick={() => handleDeleteScan(scan.id)}>
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
        </Tabs>
      </main>

      {/* ── AI CHATBOT ── */}
      {chatOpen && (
        <div className="fixed bottom-20 right-4 sm:right-6 w-[360px] max-w-[calc(100vw-2rem)] h-[500px] bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl z-50 flex flex-col overflow-hidden">
          {/* Chat Header */}
          <div className="flex items-center justify-between p-3 bg-gradient-to-r from-emerald-900 to-purple-900 border-b border-gray-700">
            <div className="flex items-center gap-2">
              <div className="p-1 bg-white/10 rounded-lg">
                <Bot className="w-4 h-4 text-emerald-400" />
              </div>
              <div>
                <p className="text-sm font-medium text-white">Asistente OSINT</p>
                <p className="text-[10px] text-emerald-300">IA especializada en ciberseguridad</p>
              </div>
            </div>
            <Button variant="ghost" size="sm" className="text-gray-400 hover:text-white h-7 w-7 p-0" onClick={() => setChatOpen(false)}>
              <X className="w-4 h-4" />
            </Button>
          </div>

          {/* Chat Messages */}
          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {chatMessages.map((msg, idx) => (
              <div key={idx} className={`flex gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                {msg.role === 'assistant' && (
                  <div className="w-6 h-6 bg-emerald-800/50 rounded-full flex items-center justify-center shrink-0 mt-1">
                    <Sparkles className="w-3 h-3 text-emerald-400" />
                  </div>
                )}
                <div className={`max-w-[85%] px-3 py-2 rounded-xl text-sm leading-relaxed ${
                  msg.role === 'user'
                    ? 'bg-emerald-700 text-white rounded-br-sm'
                    : 'bg-gray-800 text-gray-200 rounded-bl-sm border border-gray-700'
                }`}>
                  {msg.role === 'assistant' ? renderMarkdown(msg.content) : msg.content}
                </div>
              </div>
            ))}
            {chatLoading && (
              <div className="flex gap-2 justify-start">
                <div className="w-6 h-6 bg-emerald-800/50 rounded-full flex items-center justify-center shrink-0 mt-1">
                  <Sparkles className="w-3 h-3 text-emerald-400 animate-pulse" />
                </div>
                <div className="bg-gray-800 text-gray-400 px-3 py-2 rounded-xl rounded-bl-sm border border-gray-700 text-sm">
                  <Loader2 className="w-4 h-4 animate-spin" />
                </div>
              </div>
            )}
          </div>

          {/* Chat Input */}
          <div className="p-3 border-t border-gray-700 bg-gray-900">
            <div className="flex gap-2">
              <Input
                placeholder="Pregunta sobre OSINT, seguridad..."
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && chatInput.trim()) handleChatSend(); }}
                className="bg-gray-800 border-gray-700 text-white placeholder:text-gray-600 text-sm"
                disabled={chatLoading}
              />
              <Button
                onClick={handleChatSend}
                disabled={!chatInput.trim() || chatLoading}
                className="bg-emerald-600 hover:bg-emerald-700 text-white shrink-0"
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
        className={`fixed bottom-4 right-4 sm:right-6 z-50 rounded-full w-14 h-14 shadow-lg transition-all ${
          chatOpen ? 'bg-gray-700 hover:bg-gray-600' : 'bg-emerald-600 hover:bg-emerald-700'
        }`}
      >
        {chatOpen ? <X className="w-6 h-6" /> : <MessageCircle className="w-6 h-6" />}
      </Button>

      {/* ── FOOTER ── */}
      <footer className="border-t border-gray-800 mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <p className="text-xs text-gray-600">OSINT Data Scanner v2.0 — {selectedEngines.size} motores | Redes Sociales | Analisis de vinculos | Informes PDF + DOCX</p>
          <div className="flex items-center gap-3">
            <Badge variant="outline" className="border-pink-800 text-pink-400 text-[10px]">
              <Globe className="w-3 h-3 mr-1" /> 10 Redes Sociales
            </Badge>
            <Badge variant="outline" className="border-purple-800 text-purple-400 text-[10px]">
              <GitBranch className="w-3 h-3 mr-1" /> Analisis de Vinculos
            </Badge>
            <Badge variant="outline" className="border-emerald-800 text-emerald-400 text-[10px]">
              <FileDown className="w-3 h-3 mr-1" /> PDF + DOCX
            </Badge>
          </div>
        </div>
      </footer>
    </div>
  );
}
