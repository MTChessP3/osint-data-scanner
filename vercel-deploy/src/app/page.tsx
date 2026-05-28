'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Shield, Search, AlertTriangle, Eye, Globe, Database,
  ChevronDown, ChevronUp, ExternalLink, Loader2, Trash2,
  ShieldAlert, ShieldCheck, Info, User, Mail, Phone, FileText,
  ScanLine, BarChart3, Clock, Upload, Download, FileSpreadsheet,
  CheckCircle2, XCircle, FileDown, Users, AlertOctagon,
  Scale, Fingerprint, Landmark, ScanSearch
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
  reports: { id: string; fileName: string }[];
}

interface BatchResult {
  scanId: string;
  fullName: string;
  totalResults: number;
  reportGenerated: boolean;
  reportFileName: string | null;
  summary: ScanSummary;
}

interface Relationship {
  type: string;
  person1: { name: string; sheet: string; row: number };
  person2: { name: string; sheet: string; row: number };
  sharedData: string;
  confidence: string;
  details: string;
}

interface RelationshipData {
  total: number;
  summary: Record<string, number>;
  items: Relationship[];
}

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
  judicial: 'Antecedentes Judiciales',
  public_records: 'Registros Publicos',
  leak_radar: 'Radar de Filtraciones',
  leakix: 'LeakIX Breach',
  dehashed: 'Dehashed Breach',
  pipl_search: 'Busqueda Pipl',
  deepfind: 'DeepFind Analysis',
  error: 'Error',
};

export default function Home() {
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

  // File upload states
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadLoading, setUploadLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [batchResults, setBatchResults] = useState<BatchResult[] | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Drag & drop states
  const [isDragging, setIsDragging] = useState(false);

  // Relationship analysis states
  const [relationships, setRelationships] = useState<RelationshipData | null>(null);
  const [jointReportId, setJointReportId] = useState<string | null>(null);

  useEffect(() => {
    fetchPastScans();
  }, []);

  async function fetchPastScans() {
    try {
      const res = await fetch('/api/scan');
      if (res.ok) {
        const data = await res.json();
        setPastScans(data);
      }
    } catch { /* ignore */ }
  }

  async function handleScan() {
    if (!fullName.trim()) {
      setError('El nombre completo es obligatorio');
      return;
    }
    if (!email.trim() && !phone.trim() && !cedula.trim()) {
      setError('Proporciona al menos un dato adicional (correo, telefono o cedula)');
      return;
    }

    setLoading(true);
    setError(null);
    setScanData(null);
    setProgress(0);

    const progressInterval = setInterval(() => {
      setProgress(prev => {
        if (prev >= 90) { clearInterval(progressInterval); return 90; }
        return prev + Math.random() * 8;
      });
    }, 500);

    try {
      const res = await fetch('/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fullName, cedula, email, phone }),
      });

      clearInterval(progressInterval);
      setProgress(100);

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Error en el escaneo');
      }

      const data: ScanResponse = await res.json();
      setScanData(data);
      fetchPastScans();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setLoading(false);
      setTimeout(() => setProgress(0), 1000);
    }
  }

  async function handleDeleteScan(scanId: string) {
    try {
      await fetch(`/api/scan?scanId=${scanId}`, { method: 'DELETE' });
      fetchPastScans();
      if (scanData?.scanId === scanId) setScanData(null);
    } catch { /* ignore */ }
  }

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

  async function handleDownloadReport(scanId: string) {
    try {
      const res = await fetch(`/api/report?scanId=${scanId}&download=true`);
      if (!res.ok) throw new Error('Error al descargar informe');
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = res.headers.get('Content-Disposition')?.split('filename=')[1]?.replace(/"/g, '') || 'Informe_OSINT.docx';
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      console.error('Download error:', err);
    }
  }

  // ── File Upload Handler ──
  const handleFileUpload = useCallback(async () => {
    if (!uploadFile) return;

    setUploadLoading(true);
    setUploadError(null);
    setBatchResults(null);
    setRelationships(null);
    setJointReportId(null);
    setUploadProgress(0);

    const progressInterval = setInterval(() => {
      setUploadProgress(prev => {
        if (prev >= 85) { clearInterval(progressInterval); return 85; }
        return prev + Math.random() * 3;
      });
    }, 800);

    try {
      const formData = new FormData();
      formData.append('file', uploadFile);

      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      clearInterval(progressInterval);
      setUploadProgress(100);

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Error al procesar archivo');
      }

      const data = await res.json();
      setBatchResults(data.results);
      if (data.relationships) setRelationships(data.relationships);
      if (data.jointReportId) setJointReportId(data.jointReportId);
      fetchPastScans();
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setUploadLoading(false);
      setTimeout(() => setUploadProgress(0), 1000);
    }
  }, [uploadFile]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files);
    const validFile = files.find(f =>
      f.name.endsWith('.csv') || f.name.endsWith('.xlsx') || f.name.endsWith('.xls')
    );
    if (validFile) {
      setUploadFile(validFile);
      setUploadError(null);
    } else {
      setUploadError('Formato no soportado. Use .csv, .xlsx o .xls');
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const filteredResults = scanData?.results.filter(
    r => filterSeverity === 'all' || r.severity === filterSeverity
  ) || [];

  const riskScore = scanData
    ? Math.min(100, scanData.summary.critical * 30 + scanData.summary.high * 15 + scanData.summary.medium * 5 + scanData.summary.low * 2)
    : 0;

  const riskLabel = riskScore >= 70 ? 'CRITICO' : riskScore >= 40 ? 'ALTO' : riskScore >= 15 ? 'MODERADO' : 'BAJO';
  const riskColor = riskScore >= 70 ? 'text-red-600' : riskScore >= 40 ? 'text-orange-500' : riskScore >= 15 ? 'text-yellow-600' : 'text-green-600';

  return (
    <div className="min-h-screen flex flex-col bg-gray-950 text-gray-100">
      {/* Header */}
      <header className="border-b border-gray-800 bg-gray-950/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex items-center gap-3">
          <div className="p-2 bg-emerald-600/20 rounded-lg">
            <Shield className="w-6 h-6 text-emerald-400" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-white tracking-tight">OSINT Data Scanner</h1>
            <p className="text-xs text-gray-500">Descubre donde esta expuesta tu informacion personal</p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Badge variant="outline" className="border-gray-700 text-gray-400 text-xs">
              <Globe className="w-3 h-3 mr-1" />
              16 Motores
            </Badge>
            <Badge variant="outline" className="border-emerald-800 text-emerald-400 text-xs">
              <FileDown className="w-3 h-3 mr-1" />
              Informes DOCX
            </Badge>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 py-6">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="bg-gray-900 border border-gray-800 flex-wrap h-auto gap-1 p-1">
            <TabsTrigger value="scan" className="data-[state=active]:bg-emerald-600 data-[state=active]:text-white">
              <ScanLine className="w-4 h-4 mr-2" />
              Escaneo
            </TabsTrigger>
            <TabsTrigger value="batch" className="data-[state=active]:bg-emerald-600 data-[state=active]:text-white">
              <Upload className="w-4 h-4 mr-2" />
              Carga por Lotes
            </TabsTrigger>
            <TabsTrigger value="results" className="data-[state=active]:bg-emerald-600 data-[state=active]:text-white" disabled={!scanData}>
              <BarChart3 className="w-4 h-4 mr-2" />
              Resultados
            </TabsTrigger>
            <TabsTrigger value="history" className="data-[state=active]:bg-emerald-600 data-[state=active]:text-white">
              <Clock className="w-4 h-4 mr-2" />
              Historial ({pastScans.length})
            </TabsTrigger>
          </TabsList>

          {/* ── SCAN TAB ── */}
          <TabsContent value="scan" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Input Form */}
              <div className="lg:col-span-1 space-y-4">
                <Card className="bg-gray-900 border-gray-800">
                  <CardHeader>
                    <CardTitle className="text-white flex items-center gap-2">
                      <User className="w-5 h-5 text-emerald-400" />
                      Datos a Escanear
                    </CardTitle>
                    <CardDescription className="text-gray-500">
                      Ingresa los datos que deseas verificar
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="fullName" className="text-gray-300 text-sm">Nombre Completo *</Label>
                      <div className="relative">
                        <User className="absolute left-3 top-2.5 w-4 h-4 text-gray-600" />
                        <Input
                          id="fullName"
                          placeholder="Juan Perez Garcia"
                          value={fullName}
                          onChange={e => setFullName(e.target.value)}
                          className="pl-10 bg-gray-800 border-gray-700 text-white placeholder:text-gray-600"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="cedula" className="text-gray-300 text-sm">Cedula / Documento</Label>
                      <div className="relative">
                        <FileText className="absolute left-3 top-2.5 w-4 h-4 text-gray-600" />
                        <Input
                          id="cedula"
                          placeholder="1234567890"
                          value={cedula}
                          onChange={e => setCedula(e.target.value)}
                          className="pl-10 bg-gray-800 border-gray-700 text-white placeholder:text-gray-600"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="email" className="text-gray-300 text-sm">Correo Electronico</Label>
                      <div className="relative">
                        <Mail className="absolute left-3 top-2.5 w-4 h-4 text-gray-600" />
                        <Input
                          id="email"
                          type="email"
                          placeholder="correo@ejemplo.com"
                          value={email}
                          onChange={e => setEmail(e.target.value)}
                          className="pl-10 bg-gray-800 border-gray-700 text-white placeholder:text-gray-600"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="phone" className="text-gray-300 text-sm">Numero de Telefono</Label>
                      <div className="relative">
                        <Phone className="absolute left-3 top-2.5 w-4 h-4 text-gray-600" />
                        <Input
                          id="phone"
                          placeholder="+57 300 1234567"
                          value={phone}
                          onChange={e => setPhone(e.target.value)}
                          className="pl-10 bg-gray-800 border-gray-700 text-white placeholder:text-gray-600"
                        />
                      </div>
                    </div>

                    {error && (
                      <div className="p-3 bg-red-900/30 border border-red-800 rounded-lg text-red-300 text-sm">
                        {error}
                      </div>
                    )}

                    <Button
                      onClick={handleScan}
                      disabled={loading}
                      className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
                      size="lg"
                    >
                      {loading ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Escaneando + Generando Informe...
                        </>
                      ) : (
                        <>
                          <Search className="w-4 h-4 mr-2" />
                          Escanear y Generar Informe
                        </>
                      )}
                    </Button>

                    {progress > 0 && (
                      <Progress value={progress} className="h-2" />
                    )}

                    {scanData && scanData.reportFileName && (
                      <Button
                        onClick={() => handleDownloadReport(scanData.scanId)}
                        className="w-full bg-emerald-700 hover:bg-emerald-800 text-white"
                        size="lg"
                      >
                        <Download className="w-4 h-4 mr-2" />
                        Descargar Informe DOCX
                      </Button>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Info Panel */}
              <div className="lg:col-span-2 space-y-4">
                <Card className="bg-gray-900 border-gray-800">
                  <CardHeader>
                    <CardTitle className="text-white flex items-center gap-2">
                      <Database className="w-5 h-5 text-emerald-400" />
                      Motores de Busqueda Integrados
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {[
                        { name: 'Have I Been Pwned', desc: 'Verifica filtraciones de credenciales', icon: ShieldAlert },
                        { name: 'HIBP Enhanced', desc: 'Verificación directa con enlace HIBP', icon: ShieldCheck },
                        { name: 'Google Dorking', desc: 'Busqueda avanzada con operadores', icon: Search },
                        { name: 'Pwned Passwords', desc: 'Contrasenas comprometidas', icon: AlertTriangle },
                        { name: 'Social Media Scan', desc: 'Perfiles en redes sociales', icon: Globe },
                        { name: 'DeepFind Social Media', desc: 'Analisis de perfiles sociales', icon: ScanSearch },
                        { name: 'Data Broker Scan', desc: 'Directorios y brokers de datos', icon: Database },
                        { name: 'Pipl', desc: 'Motor de búsqueda de personas', icon: Users },
                        { name: 'Dark Web / Leak Scan', desc: 'Menciones en filtraciones', icon: Eye },
                        { name: 'Document Exposure', desc: 'Documentos PDF/DOC expuestos', icon: FileText },
                        { name: 'LeakRadar', desc: 'Base de datos de filtraciones', icon: ScanLine },
                        { name: 'Policia Nacional Colombia', desc: 'Antecedentes judiciales Colombia', icon: Scale },
                        { name: 'LeakIX', desc: 'Brechas y vulnerabilidades', icon: AlertOctagon },
                        { name: 'Aleph / OCCRP', desc: 'Registros públicos y filtraciones', icon: Landmark },
                        { name: 'DeepFind People Finder', desc: 'Búsqueda profunda de personas', icon: Fingerprint },
                        { name: 'Dehashed', desc: 'Búsqueda en bases de datos de brechas', icon: Database },
                      ].map(engine => (
                        <div key={engine.name} className="flex items-start gap-3 p-3 bg-gray-800/50 rounded-lg border border-gray-800">
                          <engine.icon className="w-5 h-5 text-emerald-400 mt-0.5 shrink-0" />
                          <div>
                            <p className="text-sm font-medium text-white">{engine.name}</p>
                            <p className="text-xs text-gray-500">{engine.desc}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                <Card className="bg-gray-900 border-gray-800">
                  <CardHeader>
                    <CardTitle className="text-white flex items-center gap-2 text-sm">
                      <FileDown className="w-4 h-4 text-emerald-400" />
                      Informe Automatizado
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm text-gray-400 space-y-2">
                    <p>Cada escaneo genera automaticamente un <strong className="text-white">Informe de Inteligencia Digital</strong> en formato DOCX basado en la plantilla profesional OSINT.</p>
                    <p>El informe incluye: resumen ejecutivo, identidad del sujeto, huella digital, red de relaciones, fuentes abiertas, indicadores de riesgo, conclusiones y cadena de evidencia.</p>
                    <Separator className="my-3 bg-gray-800" />
                    <p className="text-xs text-gray-600">Tambien puedes cargar lotes de datos via .xlsx o .csv para procesar multiples personas.</p>
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>

          {/* ── BATCH UPLOAD TAB ── */}
          <TabsContent value="batch" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Upload Area */}
              <div className="space-y-4">
                <Card className="bg-gray-900 border-gray-800">
                  <CardHeader>
                    <CardTitle className="text-white flex items-center gap-2">
                      <FileSpreadsheet className="w-5 h-5 text-emerald-400" />
                      Carga por Lotes
                    </CardTitle>
                    <CardDescription className="text-gray-500">
                      Sube un archivo .xlsx o .csv con los datos de multiples personas
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {/* Drag & Drop Zone */}
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
                          if (file) {
                            setUploadFile(file);
                            setUploadError(null);
                          }
                        };
                        input.click();
                      }}
                    >
                      {uploadFile ? (
                        <div className="space-y-2">
                          <FileSpreadsheet className="w-10 h-10 mx-auto text-emerald-400" />
                          <p className="text-sm font-medium text-white">{uploadFile.name}</p>
                          <p className="text-xs text-gray-500">{(uploadFile.size / 1024).toFixed(1)} KB</p>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-red-400 hover:text-red-300"
                            onClick={(e) => { e.stopPropagation(); setUploadFile(null); }}
                          >
                            <XCircle className="w-4 h-4 mr-1" /> Quitar archivo
                          </Button>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <Upload className="w-10 h-10 mx-auto text-gray-600" />
                          <p className="text-sm text-gray-400">Arrastra tu archivo aqui o haz clic para seleccionar</p>
                          <p className="text-xs text-gray-600">.csv, .xlsx, .xls — Maximo 50 personas por lote</p>
                        </div>
                      )}
                    </div>

                    {/* Required columns info */}
                    <div className="p-3 bg-gray-800/50 rounded-lg border border-gray-800">
                      <p className="text-xs font-medium text-gray-300 mb-2">Columnas requeridas en el archivo:</p>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="flex items-center gap-1.5">
                          <Badge className="bg-emerald-700 text-white text-[10px] px-1.5">Requerido</Badge>
                          <span className="text-gray-400">nombre / name</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Badge variant="outline" className="border-gray-600 text-gray-400 text-[10px] px-1.5">Opcional</Badge>
                          <span className="text-gray-400">cedula / documento</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Badge variant="outline" className="border-gray-600 text-gray-400 text-[10px] px-1.5">Opcional</Badge>
                          <span className="text-gray-400">correo / email</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Badge variant="outline" className="border-gray-600 text-gray-400 text-[10px] px-1.5">Opcional</Badge>
                          <span className="text-gray-400">telefono / phone</span>
                        </div>
                      </div>
                    </div>

                    {uploadError && (
                      <div className="p-3 bg-red-900/30 border border-red-800 rounded-lg text-red-300 text-sm">
                        {uploadError}
                      </div>
                    )}

                    <Button
                      onClick={handleFileUpload}
                      disabled={!uploadFile || uploadLoading}
                      className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
                      size="lg"
                    >
                      {uploadLoading ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Procesando lote...
                        </>
                      ) : (
                        <>
                          <Users className="w-4 h-4 mr-2" />
                          Procesar Lote y Generar Informes
                        </>
                      )}
                    </Button>

                    {uploadProgress > 0 && (
                      <Progress value={uploadProgress} className="h-2" />
                    )}
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
                        Resultados del Lote
                      </CardTitle>
                      <CardDescription className="text-gray-500">
                        {batchResults.length} persona(s) procesada(s)
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <ScrollArea className="max-h-[500px]">
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
                                      <Badge variant="outline" className="border-gray-700 text-gray-400 text-xs">
                                        {result.totalResults} hallazgos
                                      </Badge>
                                      <span className={`text-xs font-bold ${rColor}`}>{rLabel}</span>
                                      {result.reportGenerated ? (
                                        <Badge className="bg-emerald-700 text-white text-xs">
                                          <CheckCircle2 className="w-3 h-3 mr-1" /> Informe generado
                                        </Badge>
                                      ) : (
                                        <Badge variant="outline" className="border-red-700 text-red-400 text-xs">
                                          <XCircle className="w-3 h-3 mr-1" /> Sin informe
                                        </Badge>
                                      )}
                                    </div>
                                    {result.summary.critical > 0 && (
                                      <div className="flex items-center gap-1 mt-2">
                                        <AlertOctagon className="w-3.5 h-3.5 text-red-500" />
                                        <span className="text-xs text-red-400">{result.summary.critical} criticos, {result.summary.high} altos, {result.summary.medium} medios</span>
                                      </div>
                                    )}
                                  </div>
                                  <div className="flex gap-2 ml-3">
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="border-gray-700 text-gray-400 hover:text-white"
                                      onClick={() => handleViewPastScan(result.scanId)}
                                    >
                                      Ver
                                    </Button>
                                    {result.reportGenerated && (
                                      <Button
                                        size="sm"
                                        className="bg-emerald-700 hover:bg-emerald-800 text-white"
                                        onClick={() => handleDownloadReport(result.scanId)}
                                      >
                                        <Download className="w-3.5 h-3.5 mr-1" /> DOCX
                                      </Button>
                                    )}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </ScrollArea>
                    </CardContent>
                  </Card>
                ) : (
                  <Card className="bg-gray-900 border-gray-800">
                    <CardContent className="py-16 text-center">
                      <FileSpreadsheet className="w-16 h-16 mx-auto mb-4 text-gray-700" />
                      <p className="text-gray-500 mb-2">Carga un archivo para procesar multiples personas</p>
                      <p className="text-xs text-gray-600">Se generara un informe DOCX individual por cada persona analizada</p>
                      <p className="text-xs text-emerald-600 mt-2">Si el archivo .xlsx tiene 2 hojas, se analizara las relaciones entre ellas</p>
                    </CardContent>
                  </Card>
                )}
              </div>
            </div>

            {/* ── RELATIONSHIP ANALYSIS SECTION ── */}
            {relationships && relationships.total > 0 && (
              <Card className="bg-gray-900 border-purple-900/50">
                <CardHeader>
                  <CardTitle className="text-white flex items-center gap-2">
                    <Users className="w-5 h-5 text-purple-400" />
                    Analisis de Relaciones entre Hojas
                  </CardTitle>
                  <CardDescription className="text-gray-500">
                    {relationships.total} relacion(es) detectada(s) entre los datos de ambas hojas
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Summary badges */}
                  <div className="flex flex-wrap gap-2">
                    {relationships.summary.empresariales > 0 && (
                      <Badge className="bg-purple-700 text-white">Empresariales: {relationships.summary.empresariales}</Badge>
                    )}
                    {relationships.summary.laborales > 0 && (
                      <Badge className="bg-blue-700 text-white">Laborales: {relationships.summary.laborales}</Badge>
                    )}
                    {relationships.summary.personales > 0 && (
                      <Badge className="bg-emerald-700 text-white">Personales: {relationships.summary.personales}</Badge>
                    )}
                    {relationships.summary.familiares > 0 && (
                      <Badge className="bg-amber-700 text-white">Familiares: {relationships.summary.familiares}</Badge>
                    )}
                    {relationships.summary.porDocumento > 0 && (
                      <Badge className="bg-red-700 text-white">Por Documento: {relationships.summary.porDocumento}</Badge>
                    )}
                    {relationships.summary.porContacto > 0 && (
                      <Badge className="bg-cyan-700 text-white">Por Contacto: {relationships.summary.porContacto}</Badge>
                    )}
                    {relationships.summary.porUbicacion > 0 && (
                      <Badge className="bg-orange-700 text-white">Por Ubicacion: {relationships.summary.porUbicacion}</Badge>
                    )}
                  </div>

                  {/* Joint Report Download */}
                  {jointReportId && (
                    <Button
                      onClick={async () => {
                        try {
                          const res = await fetch(`/api/joint-report?reportId=${jointReportId}`);
                          if (!res.ok) throw new Error('Error al descargar');
                          const blob = await res.blob();
                          const url = window.URL.createObjectURL(blob);
                          const a = document.createElement('a');
                          a.href = url;
                          a.download = 'Informe_Conjunto_Relaciones.docx';
                          document.body.appendChild(a);
                          a.click();
                          window.URL.revokeObjectURL(url);
                          document.body.removeChild(a);
                        } catch (err) { console.error(err); }
                      }}
                      className="w-full bg-purple-700 hover:bg-purple-800 text-white font-semibold"
                      size="lg"
                    >
                      <Download className="w-4 h-4 mr-2" />
                      Descargar Informe Conjunto de Relaciones (DOCX)
                    </Button>
                  )}

                  {/* Relationships list */}
                  <ScrollArea className="max-h-[400px]">
                    <div className="space-y-2">
                      {relationships.items.map((rel, idx) => {
                        const typeLabels: Record<string, { label: string; color: string }> = {
                          empresarial: { label: 'Empresarial', color: 'bg-purple-600' },
                          laboral: { label: 'Laboral', color: 'bg-blue-600' },
                          personal: { label: 'Personal', color: 'bg-emerald-600' },
                          familiar: { label: 'Familiar', color: 'bg-amber-600' },
                          coincidencia_documento: { label: 'Por Documento', color: 'bg-red-600' },
                          coincidencia_contacto: { label: 'Por Contacto', color: 'bg-cyan-600' },
                          coincidencia_ubicacion: { label: 'Por Ubicacion', color: 'bg-orange-600' },
                        };
                        const confLabels: Record<string, { label: string; color: string }> = {
                          alta: { label: 'Alta', color: 'text-red-400' },
                          media: { label: 'Media', color: 'text-yellow-400' },
                          baja: { label: 'Baja', color: 'text-gray-400' },
                        };
                        const typeInfo = typeLabels[rel.type] || { label: rel.type, color: 'bg-gray-600' };
                        const confInfo = confLabels[rel.confidence] || { label: rel.confidence, color: 'text-gray-400' };

                        return (
                          <div key={idx} className="p-3 bg-gray-800/50 rounded-lg border border-gray-800">
                            <div className="flex items-center gap-2 mb-1">
                              <Badge className={`${typeInfo.color} text-white text-xs`}>{typeInfo.label}</Badge>
                              <span className={`text-xs font-medium ${confInfo.color}`}>Confianza: {confInfo.label}</span>
                            </div>
                            <p className="text-sm text-white">
                              <strong>{rel.person1.name}</strong> <span className="text-gray-500">({rel.person1.sheet})</span>
                              {' ↔ '}
                              <strong>{rel.person2.name}</strong> <span className="text-gray-500">({rel.person2.sheet})</span>
                            </p>
                            <p className="text-xs text-emerald-400 mt-1">Dato compartido: {rel.sharedData}</p>
                            {rel.details && <p className="text-xs text-gray-500 mt-0.5">{rel.details}</p>}
                          </div>
                        );
                      })}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* ── RESULTS TAB ── */}
          <TabsContent value="results" className="space-y-6">
            {scanData && (
              <>
                {/* Report Download Banner */}
                {scanData.reportFileName && (
                  <Card className="bg-emerald-900/20 border-emerald-800">
                    <CardContent className="p-4 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-emerald-800/50 rounded-lg">
                          <FileDown className="w-5 h-5 text-emerald-400" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-emerald-300">Informe de Inteligencia Digital Generado</p>
                          <p className="text-xs text-emerald-500">{scanData.reportFileName}</p>
                        </div>
                      </div>
                      <Button
                        onClick={() => handleDownloadReport(scanData.scanId)}
                        className="bg-emerald-700 hover:bg-emerald-800 text-white"
                      >
                        <Download className="w-4 h-4 mr-2" />
                        Descargar Informe
                      </Button>
                    </CardContent>
                  </Card>
                )}

                {/* Summary Cards */}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                  <Card className="bg-gray-900 border-gray-800">
                    <CardContent className="p-4 text-center">
                      <p className="text-3xl font-bold text-white">{scanData.totalResults}</p>
                      <p className="text-xs text-gray-500">Total Hallazgos</p>
                    </CardContent>
                  </Card>
                  <Card className="bg-gray-900 border-red-900/50">
                    <CardContent className="p-4 text-center">
                      <p className="text-3xl font-bold text-red-500">{scanData.summary.critical}</p>
                      <p className="text-xs text-gray-500">Criticos</p>
                    </CardContent>
                  </Card>
                  <Card className="bg-gray-900 border-orange-900/50">
                    <CardContent className="p-4 text-center">
                      <p className="text-3xl font-bold text-orange-500">{scanData.summary.high}</p>
                      <p className="text-xs text-gray-500">Altos</p>
                    </CardContent>
                  </Card>
                  <Card className="bg-gray-900 border-yellow-900/50">
                    <CardContent className="p-4 text-center">
                      <p className="text-3xl font-bold text-yellow-500">{scanData.summary.medium}</p>
                      <p className="text-xs text-gray-500">Medios</p>
                    </CardContent>
                  </Card>
                  <Card className="bg-gray-900 border-blue-900/50">
                    <CardContent className="p-4 text-center">
                      <p className="text-3xl font-bold text-blue-400">{scanData.summary.low}</p>
                      <p className="text-xs text-gray-500">Bajos</p>
                    </CardContent>
                  </Card>
                  <Card className="bg-gray-900 border-gray-800">
                    <CardContent className="p-4 text-center">
                      <p className={`text-3xl font-bold ${riskColor}`}>{riskScore}</p>
                      <p className="text-xs text-gray-500">Riesgo: {riskLabel}</p>
                    </CardContent>
                  </Card>
                </div>

                {/* Risk Score Bar */}
                <Card className="bg-gray-900 border-gray-800">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm text-gray-400">Nivel de Riesgo de Exposicion</span>
                      <span className={`text-sm font-bold ${riskColor}`}>{riskLabel} ({riskScore}/100)</span>
                    </div>
                    <div className="w-full bg-gray-800 rounded-full h-3 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-1000 ${
                          riskScore >= 70 ? 'bg-red-600' : riskScore >= 40 ? 'bg-orange-500' : riskScore >= 15 ? 'bg-yellow-500' : 'bg-green-600'
                        }`}
                        style={{ width: `${riskScore}%` }}
                      />
                    </div>
                  </CardContent>
                </Card>

                {/* Severity Filter */}
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm text-gray-500">Filtrar:</span>
                  <Button
                    size="sm"
                    variant={filterSeverity === 'all' ? 'default' : 'outline'}
                    onClick={() => setFilterSeverity('all')}
                    className={filterSeverity === 'all' ? 'bg-emerald-600' : 'border-gray-700 text-gray-400'}
                  >
                    Todos ({scanData.totalResults})
                  </Button>
                  {Object.entries(severityConfig).map(([key, config]) => {
                    const count = scanData.summary[key as keyof ScanSummary];
                    if (count === 0) return null;
                    return (
                      <Button
                        key={key}
                        size="sm"
                        variant={filterSeverity === key ? 'default' : 'outline'}
                        onClick={() => setFilterSeverity(key)}
                        className={filterSeverity === key ? config.color : 'border-gray-700 text-gray-400'}
                      >
                        {config.label} ({count})
                      </Button>
                    );
                  })}
                </div>

                {/* Results List */}
                <ScrollArea className="max-h-[600px]">
                  <div className="space-y-3">
                    {filteredResults.map((result, idx) => {
                      const config = severityConfig[result.severity];
                      const Icon = config.icon;
                      const isExpanded = expandedResult === `${idx}`;
                      return (
                        <Card
                          key={idx}
                          className="bg-gray-900 border-gray-800 hover:border-gray-700 transition-colors cursor-pointer"
                          onClick={() => setExpandedResult(isExpanded ? null : `${idx}`)}
                        >
                          <CardContent className="p-4">
                            <div className="flex items-start gap-3">
                              <div className={`p-1.5 rounded-md ${config.color} shrink-0`}>
                                <Icon className="w-4 h-4" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                  <Badge variant="outline" className="border-gray-700 text-gray-400 text-xs">
                                    {result.source}
                                  </Badge>
                                  <Badge variant="outline" className="border-gray-700 text-gray-400 text-xs">
                                    {categoryLabels[result.category] || result.category}
                                  </Badge>
                                  <Badge className={`${config.color} text-xs`}>
                                    {config.label}
                                  </Badge>
                                </div>
                                <p className="text-sm font-medium text-white break-words">{result.title}</p>
                                {isExpanded && result.description && (
                                  <p className="text-sm text-gray-400 mt-2 break-words">{result.description}</p>
                                )}
                                {isExpanded && result.url && (
                                  <a
                                    href={result.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 text-xs text-emerald-400 hover:text-emerald-300 mt-2"
                                    onClick={e => e.stopPropagation()}
                                  >
                                    <ExternalLink className="w-3 h-3" />
                                    Ver fuente
                                  </a>
                                )}
                              </div>
                              {isExpanded ? (
                                <ChevronUp className="w-4 h-4 text-gray-600 shrink-0" />
                              ) : (
                                <ChevronDown className="w-4 h-4 text-gray-600 shrink-0" />
                              )}
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                    {filteredResults.length === 0 && (
                      <div className="text-center py-12 text-gray-600">
                        <ShieldCheck className="w-12 h-12 mx-auto mb-3 text-green-600" />
                        <p className="text-lg font-medium">No se encontraron hallazgos</p>
                        <p className="text-sm">Los datos buscados no aparecen expuestos en las fuentes consultadas.</p>
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </>
            )}
          </TabsContent>

          {/* ── HISTORY TAB ── */}
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
                            {criticals > 0 && (
                              <Badge className="bg-red-600 text-white text-xs">
                                {criticals} criticos
                              </Badge>
                            )}
                            {hasReport && (
                              <Badge className="bg-emerald-700 text-white text-xs">
                                <FileDown className="w-3 h-3 mr-1" /> Informe
                              </Badge>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 ml-4">
                          <Button
                            size="sm"
                            variant="outline"
                            className="border-gray-700 text-gray-400 hover:text-white"
                            onClick={() => handleViewPastScan(scan.id)}
                          >
                            Ver
                          </Button>
                          {hasReport && (
                            <Button
                              size="sm"
                              className="bg-emerald-700 hover:bg-emerald-800 text-white"
                              onClick={() => handleDownloadReport(scan.id)}
                            >
                              <Download className="w-3.5 h-3.5" />
                            </Button>
                          )}
                          {!hasReport && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="border-emerald-700 text-emerald-400 hover:text-emerald-300"
                              onClick={async () => {
                                try {
                                  await fetch(`/api/report?scanId=${scan.id}`);
                                  fetchPastScans();
                                } catch { /* ignore */ }
                              }}
                            >
                              <FileDown className="w-3.5 h-3.5" />
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            className="border-gray-700 text-red-400 hover:text-red-300 hover:border-red-800"
                            onClick={() => handleDeleteScan(scan.id)}
                          >
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

      {/* Footer */}
      <footer className="border-t border-gray-800 mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <p className="text-xs text-gray-600">OSINT Data Scanner — Solo busca datos publicamente accesibles</p>
          <div className="flex items-center gap-3">
            <Badge variant="outline" className="border-gray-800 text-gray-600 text-[10px]">
              <FileDown className="w-3 h-3 mr-1" /> Informes basados en plantilla profesional
            </Badge>
          </div>
        </div>
      </footer>
    </div>
  );
}
