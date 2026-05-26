'use client';

import { useState, useEffect } from 'react';
import {
  Shield, Search, AlertTriangle, Eye, Globe, Database,
  ChevronDown, ChevronUp, ExternalLink, Loader2, Trash2,
  ShieldAlert, ShieldCheck, Info, User, Mail, Phone, FileText,
  ScanLine, BarChart3, Clock
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

    // Simulate progress
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
        setScanData({ scanId: scan.id, totalResults: results.length, results, summary });
        setActiveTab('results');
      }
    } catch { /* ignore */ }
  }

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
              7 Motores de Busqueda
            </Badge>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 py-6">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="bg-gray-900 border border-gray-800">
            <TabsTrigger value="scan" className="data-[state=active]:bg-emerald-600 data-[state=active]:text-white">
              <ScanLine className="w-4 h-4 mr-2" />
              Nuevo Escaneo
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
                      Ingresa los datos que deseas verificar en la red
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
                          Escaneando la red...
                        </>
                      ) : (
                        <>
                          <Search className="w-4 h-4 mr-2" />
                          Iniciar Escaneo OSINT
                        </>
                      )}
                    </Button>

                    {progress > 0 && (
                      <Progress value={progress} className="h-2" />
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
                        { name: 'Google Dorking', desc: 'Busqueda avanzada con operadores', icon: Search },
                        { name: 'Pwned Passwords', desc: 'Contrasenas comprometidas', icon: AlertTriangle },
                        { name: 'Social Media Scan', desc: 'Perfiles en redes sociales', icon: Globe },
                        { name: 'Data Broker Scan', desc: 'Directorios y brokers de datos', icon: Database },
                        { name: 'Dark Web / Leak Scan', desc: 'Menciones en filtraciones', icon: Eye },
                        { name: 'Document Exposure', desc: 'Documentos PDF/DOC expuestos', icon: FileText },
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
                    <CardTitle className="text-white text-sm">Como Funciona</CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm text-gray-400 space-y-2">
                    <p>1. Ingresa tus datos personales en el formulario (nombre es obligatorio).</p>
                    <p>2. El sistema ejecuta busquedas simultaneas en 7 motores OSINT.</p>
                    <p>3. Los resultados se clasifican por severidad y categoria.</p>
                    <p>4. Recibes un reporte detallado con enlaces y recomendaciones.</p>
                    <Separator className="my-3 bg-gray-800" />
                    <p className="text-xs text-gray-600">Solo se buscan datos publicamente accesibles. No se accede a sistemas privados ni se realizan ataques.</p>
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>

          {/* ── RESULTS TAB ── */}
          <TabsContent value="results" className="space-y-6">
            {scanData && (
              <>
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
                {pastScans.map(scan => (
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
                          {scan.results.filter(r => r.severity === 'critical').length > 0 && (
                            <Badge className="bg-red-600 text-white text-xs">
                              {scan.results.filter(r => r.severity === 'critical').length} criticos
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
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-800 mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <p className="text-xs text-gray-600">OSINT Data Scanner — Solo busca datos publicamente accesibles</p>
          <p className="text-xs text-gray-700">Desplegable en Railway.app</p>
        </div>
      </footer>
    </div>
  );
}
