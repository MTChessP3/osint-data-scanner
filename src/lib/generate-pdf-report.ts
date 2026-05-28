/**
 * Generador de Informes OSINT en PDF — ESTRATEGIA DOCX→PDF
 *
 * Estrategia: Generar DOCX primero (formato profesional comprobado),
 * luego convertir a PDF usando LibreOffice headless.
 * Si LibreOffice no está disponible, usa pdfkit como fallback.
 *
 * Ventajas:
 *  - PDF idéntico al DOCX en formato y calidad
 *  - Mismo motor de renderizado (LibreOffice)
 *  - Sin problemas de fuentes, márgenes, saltos de página
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { OSINTResult } from './osint-scanner';
import { RelationshipAnalysisResult } from './relationship-analyzer';
import { ScanRecord } from './memory-store';
import {
  generateDocxReport,
  generateSocialDocxReport,
  generateJointDocxReport,
} from './generate-report';

const execFileAsync = promisify(execFile);

// ── Check if LibreOffice is available ──
let libreOfficeAvailable: boolean | null = null;

async function isLibreOfficeAvailable(): Promise<boolean> {
  if (libreOfficeAvailable !== null) return libreOfficeAvailable;
  try {
    await execFileAsync('which', ['libreoffice'], { timeout: 3000 });
    libreOfficeAvailable = true;
    console.log('[PDF] LibreOffice detected — using DOCX→PDF conversion');
  } catch {
    libreOfficeAvailable = false;
    console.warn('[PDF] LibreOffice NOT found — using pdfkit fallback');
  }
  return libreOfficeAvailable;
}

// ── Convert DOCX buffer to PDF using LibreOffice ──
async function convertDocxToPdf(docxBuffer: Buffer): Promise<Buffer> {
  const tmpDir = os.tmpdir();
  const uniqueId = `osint_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  const docxPath = path.join(tmpDir, `${uniqueId}.docx`);
  const pdfPath = path.join(tmpDir, `${uniqueId}.pdf`);

  try {
    // Write DOCX to temp file
    fs.writeFileSync(docxPath, docxBuffer);

    // Convert using LibreOffice headless
    const { stdout, stderr } = await execFileAsync(
      'libreoffice',
      ['--headless', '--convert-to', 'pdf', '--outdir', tmpDir, docxPath],
      { timeout: 60000 }
    );

    console.log('[PDF] LibreOffice conversion stdout:', stdout?.substring(0, 200));
    if (stderr) console.warn('[PDF] LibreOffice conversion stderr:', stderr?.substring(0, 200));

    // Check if PDF was created
    if (!fs.existsSync(pdfPath)) {
      throw new Error('LibreOffice did not produce a PDF file');
    }

    // Read the PDF
    const pdfBuffer = fs.readFileSync(pdfPath);
    console.log(`[PDF] Converted DOCX→PDF: ${docxBuffer.length} bytes → ${pdfBuffer.length} bytes`);
    return pdfBuffer;

  } finally {
    // Clean up temp files
    try { fs.unlinkSync(docxPath); } catch { /* ignore */ }
    try { fs.unlinkSync(pdfPath); } catch { /* ignore */ }
  }
}

// ══════════════════════════════════════════════════════════════════
//  FALLBACK: pdfkit-based PDF generation (when LibreOffice unavailable)
//  Simplified, clean version that mirrors DOCX structure
// ══════════════════════════════════════════════════════════════════

import PDFDocument from 'pdfkit';

// Font paths with fallback
const FONT_REGULAR_PATH = path.join(process.cwd(), 'public', 'fonts', 'DejaVuSans.ttf');
const FONT_BOLD_PATH = path.join(process.cwd(), 'public', 'fonts', 'DejaVuSans-Bold.ttf');

let useCustomFonts = false;

function registerFonts(doc: PDFDocument): void {
  try {
    if (fs.existsSync(FONT_REGULAR_PATH) && fs.existsSync(FONT_BOLD_PATH)) {
      doc.registerFont('DejaVuRegular', FONT_REGULAR_PATH);
      doc.registerFont('DejaVuBold', FONT_BOLD_PATH);
      useCustomFonts = true;
    }
  } catch {
    useCustomFonts = false;
  }
}

function setFont(doc: PDFDocument, bold: boolean = false): PDFDocument {
  if (useCustomFonts) {
    return doc.font(bold ? 'DejaVuBold' : 'DejaVuRegular');
  }
  return doc.font(bold ? 'Helvetica-Bold' : 'Helvetica');
}

const PAGE_W = 612;
const PAGE_H = 792;
const M = { top: 55, bottom: 55, left: 55, right: 55 };
const CW = PAGE_W - M.left - M.right;

function checkPage(doc: PDFDocument, need: number = 60): boolean {
  if (doc.y + need > PAGE_H - M.bottom - 10) {
    doc.addPage();
    return true;
  }
  return false;
}

function formatDate(): string {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

// Source anonymization
const SOURCE_MAP = new Map<string, number>();
let sourceCounter = 0;

function anonymizeSource(source: string): string {
  if (!source) return 'Fuente de Inteligencia #0';
  if (!SOURCE_MAP.has(source)) {
    sourceCounter++;
    SOURCE_MAP.set(source, sourceCounter);
  }
  return `Fuente de Inteligencia #${SOURCE_MAP.get(source)}`;
}

function resetSourceMap(): void {
  SOURCE_MAP.clear();
  sourceCounter = 0;
}

const SEV_COLORS: Record<string, string> = {
  critical: '#c0392b',
  high: '#e67e22',
  medium: '#d69e2e',
  low: '#2980b9',
  info: '#7f8c8d',
};

const SEV_LABELS: Record<string, string> = {
  critical: 'CRITICO',
  high: 'ALTO',
  medium: 'MEDIO',
  low: 'BAJO',
  info: 'INFO',
};

const CAT_ES: Record<string, string> = {
  credential_breach: 'Filtracion Credenciales',
  password_exposure: 'Exposicion Contrasena',
  personal_exposure: 'Exposicion Personal',
  social_media: 'Redes Sociales',
  data_broker: 'Broker de Datos',
  dark_web_mention: 'Dark Web',
  paste_site: 'Sitio de Paste',
  document_exposure: 'Documentos Expuestos',
  judicial: 'Registros Judiciales',
};

const REC_MAP: Record<string, string> = {
  credential_breach: 'Cambiar todas las contrasenas comprometidas y habilitar MFA de inmediato.',
  password_exposure: 'Rotar contrasenas comprometidas e implementar MFA en cuentas criticas.',
  personal_exposure: 'Solicitar eliminacion de datos personales. Restringir configuracion de privacidad.',
  dark_web_mention: 'Implementar monitoreo continuo en dark web. Configurar alertas de fraude.',
  paste_site: 'Cambiar credenciales comprometidas. Revisar accesos no autorizados.',
  data_broker: 'Ejercer derecho de supresion conforme Ley 1581/2012. Contactar cada broker.',
  social_media: 'Revisar y ajustar configuracion de privacidad en todas las plataformas.',
  document_exposure: 'Solicitar eliminacion del documento. Verificar alcance de filtracion.',
  judicial: 'Verificar registros en fuentes oficiales. Consultar con asesoria legal.',
};

function catES(cat: string): string { return CAT_ES[cat] || cat; }
function recFor(cat: string): string { return REC_MAP[cat] || 'Investigar el hallazgo y tomar medidas correctivas.'; }

// ── Fallback PDF generation using pdfkit ──
async function generatePDFWithPdfkit(data: {
  results: OSINTResult[];
  fullName: string;
  cedula?: string;
  email?: string;
  phone?: string;
  riskScore?: number;
  scanId?: string;
}): Promise<Buffer> {
  resetSourceMap();

  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const doc = new PDFDocument({
      size: 'LETTER',
      margins: M,
      bufferPages: true,
      autoFirstPage: false,
    });

    registerFonts(doc);
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const today = formatDate();
    const reportId = data.scanId
      ? `OSINT-${data.scanId.substring(0, 8).toUpperCase()}`
      : `OSINT-${Date.now().toString(36).toUpperCase()}`;

    const realResults = data.results.filter(r => r.category !== 'error');
    const crit = realResults.filter(r => r.severity === 'critical').length;
    const high = realResults.filter(r => r.severity === 'high').length;
    const med = realResults.filter(r => r.severity === 'medium').length;
    const low = realResults.filter(r => r.severity === 'low').length;
    const riskScore = data.riskScore ?? Math.min(100, crit * 30 + high * 15 + med * 5 + low * 2);
    const riskLevel = riskScore >= 70 ? 'CRITICO' : riskScore >= 40 ? 'ALTO' : riskScore >= 15 ? 'MODERADO' : 'BAJO';
    const riskColor = riskScore >= 70 ? '#c0392b' : riskScore >= 40 ? '#e67e22' : riskScore >= 15 ? '#d69e2e' : '#27ae60';

    const anonymizedResults = realResults.map(r => ({ ...r, source: anonymizeSource(r.source) }));
    const uniqueSources = [...new Set(anonymizedResults.map(r => r.source))];

    // ── COVER PAGE ──
    doc.addPage();
    doc.rect(0, 0, PAGE_W, PAGE_H).fill('#0a0e17');
    doc.fillColor('#3b82f6').rect(0, 0, PAGE_W, 4).fill();

    setFont(doc, true).fillColor('#94a3b8').fontSize(14)
      .text('INFORME DE', M.left, 160, { width: CW, align: 'center' });
    setFont(doc, true).fillColor('#3b82f6').fontSize(36)
      .text('INVESTIGACION OSINT', M.left, doc.y + 5, { width: CW, align: 'center' });
    doc.moveDown(1);

    // Risk score
    setFont(doc, true).fillColor('#e2e8f0').fontSize(12)
      .text('PUNTAJE DE RIESGO', M.left, doc.y + 15, { width: CW, align: 'center' });
    setFont(doc, true).fillColor(riskColor).fontSize(60)
      .text(`${riskScore}`, M.left, doc.y + 5, { width: CW, align: 'center' });
    setFont(doc, true).fillColor(riskColor).fontSize(20)
      .text(`/100  —  ${riskLevel}`, M.left, doc.y, { width: CW, align: 'center' });
    doc.moveDown(1.5);

    // Subject info
    doc.fillColor('#111827').roundedRect(M.left + 30, doc.y, CW - 60, 80, 4).fill();
    const infoX = M.left + 45;
    setFont(doc, true).fillColor('#3b82f6').fontSize(8)
      .text('SUJETO DE INVESTIGACION', infoX, doc.y + 10, { width: CW - 80 });
    setFont(doc, true).fillColor('#e2e8f0').fontSize(14)
      .text(data.fullName, infoX, doc.y + 3, { width: CW - 80 });
    const details: string[] = [];
    if (data.cedula) details.push(`CC: ${data.cedula}`);
    if (data.email) details.push(data.email);
    if (data.phone) details.push(`Tel: ${data.phone}`);
    if (details.length > 0) {
      setFont(doc, false).fillColor('#94a3b8').fontSize(9)
        .text(details.join('   |   '), infoX, doc.y + 3, { width: CW - 80 });
    }
    setFont(doc, false).fillColor('#64748b').fontSize(7)
      .text(`ID: ${reportId}  |  Fecha: ${today}`, infoX, doc.y + 5, { width: CW - 80 });

    // Footer
    const footerY = PAGE_H - 50;
    setFont(doc, true).fillColor('#ef4444').fontSize(9)
      .text('DOCUMENTO CONFIDENCIAL — USO RESTRINGIDO', M.left, footerY, { width: CW, align: 'center', lineBreak: false });
    setFont(doc, false).fillColor('#475569').fontSize(7)
      .text(`OSINT Data Scanner  |  ${reportId}  |  ${today}`, M.left, footerY + 14, { width: CW, align: 'center', lineBreak: false });

    doc.y = PAGE_H - 10;

    // ── RESUMEN EJECUTIVO ──
    doc.addPage();
    setFont(doc, true).fillColor('#1a365d').fontSize(14)
      .text('RESUMEN EJECUTIVO', M.left, doc.y);
    doc.moveDown(0.5);

    const execNarrative = crit > 0
      ? `La investigacion OSINT sobre ${data.fullName} identifico ${crit} hallazgo(s) CRITICO(S) que representan riesgo inmediato. Se detectaron filtraciones de credenciales y/o exposicion de datos sensibles. Puntaje de riesgo: ${riskScore}/100 (${riskLevel}). Se recomienda con urgencia cambiar contrasenas, habilitar MFA, y solicitar eliminacion de datos en brokers conforme Ley 1581/2012.`
      : high > 0
      ? `La investigacion OSINT identifico ${high} hallazgo(s) de severidad ALTA que senalan exposicion significativa de datos de ${data.fullName}. Puntaje: ${riskScore}/100 (${riskLevel}). Se requiere atencion prioritaria para mitigar vectores de ataque.`
      : med > 0 || low > 0
      ? `La investigacion OSINT sobre ${data.fullName} identifico hallazgos de severidad media/baja. Puntaje: ${riskScore}/100 (${riskLevel}). Se recomienda monitoreo periodico y medidas preventivas.`
      : `La investigacion OSINT sobre ${data.fullName} no identifico hallazgos significativos. Puntaje: ${riskScore}/100 (${riskLevel}). Se recomienda mantener practicas de higiene digital.`;

    setFont(doc, false).fillColor('#2c3e50').fontSize(10)
      .text(execNarrative, M.left, doc.y, { width: CW, align: 'justify', lineGap: 3 });
    doc.moveDown(0.5);

    // Severity summary
    const sevItems: [string, number, string][] = [
      ['Critico', crit, '#c0392b'], ['Alto', high, '#e67e22'],
      ['Medio', med, '#d69e2e'], ['Bajo', low, '#2980b9'],
    ];
    for (const [label, count, color] of sevItems) {
      if (count === 0) continue;
      setFont(doc, true).fillColor(color).fontSize(10)
        .text(`${count} ${label}(s)`, M.left + 15, doc.y, { width: CW - 20 });
    }
    doc.moveDown(0.3);
    setFont(doc, false).fillColor('#636e72').fontSize(9)
      .text(`Fuentes consultadas: ${uniqueSources.length} | Total hallazgos: ${realResults.length}`, M.left, doc.y, { width: CW });

    // ── HALLAZGOS DETALLADOS ──
    doc.moveDown(0.8);
    setFont(doc, true).fillColor('#1a365d').fontSize(14)
      .text('HALLAZGOS DETALLADOS', M.left, doc.y);
    doc.moveDown(0.5);

    const displaySeverities = ['critical', 'high', 'medium', 'low'] as const;
    const limits: Record<string, number> = { critical: 8, high: 8, medium: 8, low: 4, info: 99 };
    let findingNum = 0;

    for (const severity of displaySeverities) {
      const filtered = anonymizedResults.filter(r => r.severity === severity);
      if (filtered.length === 0) continue;
      const toShow = filtered.slice(0, limits[severity] || 99);

      checkPage(doc, 30);
      setFont(doc, true).fillColor(SEV_COLORS[severity]).fontSize(11)
        .text(`${SEV_LABELS[severity]} — ${filtered.length} hallazgo(s)`, M.left, doc.y);
      doc.moveDown(0.3);

      for (const r of toShow) {
        findingNum++;
        checkPage(doc, 60);

        // Title
        setFont(doc, true).fillColor('#1a365d').fontSize(10)
          .text(`${findingNum}. ${r.title}`, M.left + 10, doc.y, { width: CW - 15 });
        doc.moveDown(0.1);

        // Description
        const desc = r.description || r.dataFound || 'Sin descripcion';
        setFont(doc, false).fillColor('#2c3e50').fontSize(9)
          .text(desc.substring(0, 300), M.left + 10, doc.y, { width: CW - 15, align: 'justify' });
        doc.moveDown(0.1);

        // Source + Category
        setFont(doc, false).fillColor('#636e72').fontSize(8)
          .text(`Fuente: ${r.source}  |  Categoria: ${catES(r.category)}`, M.left + 10, doc.y, { width: CW - 15 });

        // Impact + Action
        checkPage(doc, 20);
        setFont(doc, true).fillColor('#c0392b').fontSize(8)
          .text('IMPACTO: ', M.left + 10, doc.y, { width: CW - 15, continued: true });
        setFont(doc, false).fillColor('#636e72').fontSize(8)
          .text(recFor(r.category));

        if (r.url) {
          setFont(doc, false).fillColor('#2980b9').fontSize(7)
            .text(r.url.substring(0, 100), M.left + 10, doc.y, { width: CW - 15 });
        }

        doc.moveDown(0.3);
        // Separator
        doc.strokeColor('#d0d0d0').lineWidth(0.3)
          .moveTo(M.left + 10, doc.y).lineTo(PAGE_W - M.right, doc.y).stroke();
        doc.y += 5;
      }
    }

    if (findingNum === 0) {
      setFont(doc, false).fillColor('#2c3e50').fontSize(10)
        .text('No se identificaron hallazgos significativos en las fuentes automatizadas.', M.left, doc.y, { width: CW });
    }

    // ── RECOMENDACIONES ──
    checkPage(doc, 60);
    doc.moveDown(0.5);
    setFont(doc, true).fillColor('#1a365d').fontSize(14)
      .text('RECOMENDACIONES', M.left, doc.y);
    doc.moveDown(0.4);

    const categoriesPresent = [...new Set(anonymizedResults.filter(r => r.severity !== 'info').map(r => r.category))];
    for (const cat of categoriesPresent) {
      checkPage(doc, 20);
      setFont(doc, true).fillColor('#1a365d').fontSize(9)
        .text(`${catES(cat)}:`, M.left + 10, doc.y, { width: CW - 15 });
      setFont(doc, false).fillColor('#2c3e50').fontSize(8)
        .text(recFor(cat), M.left + 20, doc.y, { width: CW - 25, align: 'justify' });
      doc.moveDown(0.2);
    }

    // ── METODOLOGIA ──
    checkPage(doc, 60);
    doc.moveDown(0.5);
    setFont(doc, true).fillColor('#1a365d').fontSize(14)
      .text('METODOLOGIA', M.left, doc.y);
    doc.moveDown(0.4);
    setFont(doc, false).fillColor('#636e72').fontSize(8)
      .text('La presente investigacion se realizo utilizando tecnicas de Inteligencia de Fuentes Abiertas (OSINT), aplicando metodologias estandarizadas de recoleccion pasiva. Se consultaron repositorios publicos, bases de datos de brokers, motores de busqueda especializados, y fuentes de la dark web. Toda la informacion fue obtenida sin interaccion directa con los sistemas del sujeto, respetando Ley 1581/2012 y Ley 1273/2009.', M.left, doc.y, { width: CW, align: 'justify', lineGap: 2 });
    doc.moveDown(0.3);
    setFont(doc, false).fillColor('#636e72').fontSize(7)
      .text(`Informe generado automaticamente por OSINT Data Scanner  |  ${reportId}  |  ${today}`, M.left, doc.y, { width: CW, align: 'center' });

    doc.end();
  });
}

// ════════════════════════════════════════════════════════════════
//  MAIN PDF GENERATION FUNCTIONS
//  Strategy: DOCX first → LibreOffice conversion → pdfkit fallback
// ════════════════════════════════════════════════════════════════

export async function generatePDFReport(data: {
  results: OSINTResult[];
  fullName: string;
  cedula?: string;
  email?: string;
  phone?: string;
  riskScore?: number;
  scanId?: string;
}): Promise<Buffer> {
  resetSourceMap();

  // Strategy 1: Generate DOCX, then convert to PDF via LibreOffice
  if (await isLibreOfficeAvailable()) {
    try {
      console.log('[PDF] Generating DOCX first, then converting to PDF...');
      const docxBuffer = await generateDocxReport(data);
      const pdfBuffer = await convertDocxToPdf(docxBuffer);
      return pdfBuffer;
    } catch (error) {
      console.warn('[PDF] DOCX→PDF conversion failed, falling back to pdfkit:', error instanceof Error ? error.message : 'unknown');
      // Fall through to pdfkit fallback
    }
  }

  // Strategy 2: pdfkit fallback
  console.log('[PDF] Using pdfkit fallback for generatePDFReport');
  return generatePDFWithPdfkit(data);
}

export async function generateIndividualPDF(
  scan: ScanRecord,
  results: OSINTResult[]
): Promise<Buffer> {
  return generatePDFReport({
    results,
    fullName: scan.fullName,
    cedula: scan.cedula || undefined,
    email: scan.email || undefined,
    phone: scan.phone || undefined,
    scanId: scan.id,
  });
}

// ── File name helpers ──

export function generatePDFFileName(fullName: string): string {
  const clean = fullName.replace(/[^a-zA-Z0-9áéíóúÁÉÍÓÚñÑ ]/g, '').replace(/\s+/g, '_');
  const date = new Date().toISOString().replace(/[-:T]/g, '').substring(0, 14);
  return `Informe_OSINT_${clean}_${date}.pdf`;
}

export function generateJointPDFFileName(fullName: string): string {
  const clean = fullName.replace(/[^a-zA-Z0-9áéíóúÁÉÍÓÚñÑ ]/g, '').replace(/\s+/g, '_');
  const date = new Date().toISOString().replace(/[-:T]/g, '').substring(0, 14);
  return `Informe_Conjunto_${clean}_${date}.pdf`;
}

// ════════════════════════════════════════════════════════════════
//  SOCIAL MEDIA PDF REPORT
// ════════════════════════════════════════════════════════════════

interface SocialScanResultItem {
  platform: string;
  platformId: string;
  profileFound: boolean;
  profileUrl?: string;
  username?: string;
  profileVerified?: boolean;
  profileStatusCode?: number;
  findings: Array<{
    source: string;
    category: string;
    severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
    title: string;
    description?: string;
    url?: string;
    dataFound?: string;
  }>;
  searchResultsCount: number;
}

interface SocialSummary {
  profilesFound: number;
  totalFindings: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
  info: number;
}

export async function generateSocialPDFReport(data: {
  searchMode: string;
  searchQuery: string;
  results: SocialScanResultItem[];
  summary: SocialSummary;
  scanId?: string;
}): Promise<Buffer> {
  resetSourceMap();

  // Strategy 1: DOCX → PDF via LibreOffice
  if (await isLibreOfficeAvailable()) {
    try {
      console.log('[PDF] Generating Social DOCX, then converting to PDF...');
      const docxBuffer = await generateSocialDocxReport(data);
      const pdfBuffer = await convertDocxToPdf(docxBuffer);
      return pdfBuffer;
    } catch (error) {
      console.warn('[PDF] Social DOCX→PDF conversion failed, falling back to pdfkit:', error instanceof Error ? error.message : 'unknown');
    }
  }

  // Strategy 2: pdfkit fallback for social report
  console.log('[PDF] Using pdfkit fallback for generateSocialPDFReport');
  return generateSocialPDFWithPdfkit(data);
}

async function generateSocialPDFWithPdfkit(data: {
  searchMode: string;
  searchQuery: string;
  results: SocialScanResultItem[];
  summary: SocialSummary;
  scanId?: string;
}): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const doc = new PDFDocument({
      size: 'LETTER',
      margins: M,
      bufferPages: true,
      autoFirstPage: false,
    });

    registerFonts(doc);
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const today = formatDate();
    const reportId = data.scanId
      ? `SOCIAL-${data.scanId.substring(0, 8).toUpperCase()}`
      : `SOCIAL-${Date.now().toString(36).toUpperCase()}`;

    const { summary } = data;
    const riskScore = Math.min(100, summary.profilesFound * 12 + summary.critical * 25 + summary.high * 12 + summary.medium * 5 + summary.low * 2);
    const riskLevel = riskScore >= 70 ? 'CRITICO' : riskScore >= 40 ? 'ALTO' : riskScore >= 15 ? 'MODERADO' : 'BAJO';
    const riskColor = riskScore >= 70 ? '#c0392b' : riskScore >= 40 ? '#e67e22' : riskScore >= 15 ? '#d69e2e' : '#27ae60';

    // ── COVER ──
    doc.addPage();
    doc.rect(0, 0, PAGE_W, PAGE_H).fill('#0a0e17');
    doc.fillColor('#3b82f6').rect(0, 0, PAGE_W, 4).fill();

    setFont(doc, true).fillColor('#94a3b8').fontSize(14)
      .text('INFORME DE', M.left, 160, { width: CW, align: 'center' });
    setFont(doc, true).fillColor('#3b82f6').fontSize(36)
      .text('INVESTIGACION SOCIAL', M.left, doc.y + 5, { width: CW, align: 'center' });
    doc.moveDown(1);

    setFont(doc, true).fillColor('#e2e8f0').fontSize(12)
      .text('PUNTAJE DE RIESGO', M.left, doc.y + 15, { width: CW, align: 'center' });
    setFont(doc, true).fillColor(riskColor).fontSize(60)
      .text(`${riskScore}`, M.left, doc.y + 5, { width: CW, align: 'center' });
    setFont(doc, true).fillColor(riskColor).fontSize(20)
      .text(`/100  —  ${riskLevel}`, M.left, doc.y, { width: CW, align: 'center' });
    doc.moveDown(1.5);

    const modeLabel = data.searchMode === 'nickname' ? 'NickName' : data.searchMode === 'email' ? 'Correo' : 'Nombre';
    doc.fillColor('#111827').roundedRect(M.left + 30, doc.y, CW - 60, 60, 4).fill();
    const infoX = M.left + 45;
    setFont(doc, true).fillColor('#3b82f6').fontSize(8)
      .text('SUJETO DE INVESTIGACION', infoX, doc.y + 10, { width: CW - 80 });
    setFont(doc, true).fillColor('#e2e8f0').fontSize(14)
      .text(data.searchQuery, infoX, doc.y + 3, { width: CW - 80 });
    setFont(doc, false).fillColor('#94a3b8').fontSize(8)
      .text(`Modo: ${modeLabel}  |  ${summary.profilesFound} perfiles  |  ${summary.totalFindings} hallazgos  |  ID: ${reportId}`, infoX, doc.y + 3, { width: CW - 80 });

    // Footer
    const footerY = PAGE_H - 50;
    setFont(doc, true).fillColor('#ef4444').fontSize(9)
      .text('DOCUMENTO CONFIDENCIAL', M.left, footerY, { width: CW, align: 'center', lineBreak: false });
    setFont(doc, false).fillColor('#475569').fontSize(7)
      .text(`OSINT Data Scanner  |  ${reportId}  |  ${today}`, M.left, footerY + 14, { width: CW, align: 'center', lineBreak: false });
    doc.y = PAGE_H - 10;

    // ── RESUMEN EJECUTIVO ──
    doc.addPage();
    setFont(doc, true).fillColor('#1a365d').fontSize(14)
      .text('RESUMEN EJECUTIVO — REDES SOCIALES', M.left, doc.y);
    doc.moveDown(0.5);

    const execText = summary.critical > 0
      ? `La investigacion en redes sociales identifico ${summary.critical} hallazgo(s) critico(s) y ${summary.profilesFound} perfil(es) asociados al sujeto. La exposicion representa riesgo significativo para ingenieria social y suplantacion. Nivel de riesgo: ${riskLevel} (${riskScore}/100).`
      : summary.high > 0
      ? `Se identificaron ${summary.high} hallazgo(s) de severidad alta en redes sociales. ${summary.profilesFound} perfil(es) detectados. Nivel de riesgo: ${riskLevel} (${riskScore}/100).`
      : `Se detectaron ${summary.profilesFound} perfil(es) en redes sociales. Nivel de riesgo: ${riskLevel} (${riskScore}/100). Se recomienda revision de privacidad.`;

    setFont(doc, false).fillColor('#2c3e50').fontSize(10)
      .text(execText, M.left, doc.y, { width: CW, align: 'justify', lineGap: 3 });
    doc.moveDown(0.5);

    // Severity breakdown
    const sevItems: [string, number, string][] = [
      ['Critico', summary.critical, '#c0392b'], ['Alto', summary.high, '#e67e22'],
      ['Medio', summary.medium, '#d69e2e'], ['Bajo', summary.low, '#2980b9'],
    ];
    for (const [label, count, color] of sevItems) {
      if (count === 0) continue;
      setFont(doc, true).fillColor(color).fontSize(10)
        .text(`${count} ${label}(s)`, M.left + 15, doc.y, { width: CW - 20 });
    }
    doc.moveDown(0.3);

    // ── RESULTADOS POR PLATAFORMA ──
    doc.moveDown(0.5);
    setFont(doc, true).fillColor('#1a365d').fontSize(14)
      .text('RESULTADOS POR PLATAFORMA', M.left, doc.y);
    doc.moveDown(0.4);

    for (const result of data.results) {
      checkPage(doc, 50);
      const statusIcon = result.profileFound ? 'ENCONTRADO' : 'NO ENCONTRADO';
      const statusColor = result.profileFound ? '#27ae60' : '#7f8c8d';

      setFont(doc, true).fillColor('#1a365d').fontSize(10)
        .text(`${result.platform}`, M.left + 10, doc.y, { width: CW - 15, continued: true });
      setFont(doc, true).fillColor(statusColor).fontSize(9)
        .text(`  [${statusIcon}]`);

      if (result.username) {
        setFont(doc, false).fillColor('#636e72').fontSize(8)
          .text(`Usuario: ${result.username}`, M.left + 20, doc.y, { width: CW - 25 });
      }
      if (result.profileUrl) {
        setFont(doc, false).fillColor('#2980b9').fontSize(7)
          .text(result.profileUrl.substring(0, 100), M.left + 20, doc.y, { width: CW - 25 });
      }

      // Findings for this platform
      for (const f of result.findings.slice(0, 3)) {
        checkPage(doc, 20);
        setFont(doc, true).fillColor(SEV_COLORS[f.severity] || '#7f8c8d').fontSize(8)
          .text(`[${SEV_LABELS[f.severity] || 'INFO'}]`, M.left + 25, doc.y, { continued: true });
        setFont(doc, false).fillColor('#2c3e50').fontSize(8)
          .text(` ${f.title}`);
        if (f.description) {
          setFont(doc, false).fillColor('#636e72').fontSize(7)
            .text(f.description.substring(0, 200), M.left + 30, doc.y, { width: CW - 35 });
        }
      }
      doc.moveDown(0.3);
    }

    // ── METODOLOGIA ──
    checkPage(doc, 60);
    doc.moveDown(0.5);
    setFont(doc, true).fillColor('#1a365d').fontSize(14)
      .text('METODOLOGIA', M.left, doc.y);
    doc.moveDown(0.4);
    setFont(doc, false).fillColor('#636e72').fontSize(8)
      .text('La investigacion fue realizada aplicando tecnicas de Inteligencia de Fuentes Abiertas (OSINT) enfocadas en redes sociales. Se verificaron perfiles mediante consulta publica de plataformas, analisis de huella digital, y correlacion de identificadores. Se respeto el marco legal vigente (Ley 1581/2012 y Ley 1273/2009).', M.left, doc.y, { width: CW, align: 'justify', lineGap: 2 });
    doc.moveDown(0.3);
    setFont(doc, false).fillColor('#636e72').fontSize(7)
      .text(`Informe generado automaticamente por OSINT Data Scanner  |  ${reportId}  |  ${today}`, M.left, doc.y, { width: CW, align: 'center' });

    doc.end();
  });
}

// ════════════════════════════════════════════════════════════════
//  JOINT PDF REPORT (for batch/Excel cross-reference analysis)
// ════════════════════════════════════════════════════════════════

export async function generateJointPDF(
  analysis: RelationshipAnalysisResult,
  osintResults?: Array<{ name: string; results: OSINTResult[] }>
): Promise<Buffer> {
  resetSourceMap();

  // Strategy 1: DOCX → PDF via LibreOffice
  if (await isLibreOfficeAvailable()) {
    try {
      console.log('[PDF] Generating Joint DOCX, then converting to PDF...');
      const docxBuffer = await generateJointDocxReport(analysis, osintResults || []);
      const pdfBuffer = await convertDocxToPdf(docxBuffer);
      return pdfBuffer;
    } catch (error) {
      console.warn('[PDF] Joint DOCX→PDF conversion failed, falling back to pdfkit:', error instanceof Error ? error.message : 'unknown');
    }
  }

  // Strategy 2: pdfkit fallback for joint report
  console.log('[PDF] Using pdfkit fallback for generateJointPDF');
  return generateJointPDFWithPdfkit(analysis, osintResults);
}

async function generateJointPDFWithPdfkit(
  analysis: RelationshipAnalysisResult,
  osintResults?: Array<{ name: string; results: OSINTResult[] }>
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const doc = new PDFDocument({
      size: 'LETTER',
      margins: M,
      bufferPages: true,
      autoFirstPage: false,
    });

    registerFonts(doc);
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const today = formatDate();
    const reportId = `JOINT-${Date.now().toString(36).toUpperCase()}`;
    const totalLinks = analysis.totalLinks;

    // Risk score based on links
    const riskScore = Math.min(100, totalLinks * 8 + (analysis.summary.empresariales * 15) + (analysis.summary.contacto * 10) + (analysis.summary.familiares * 5));
    const riskLevel = riskScore >= 70 ? 'CRITICO' : riskScore >= 40 ? 'ALTO' : riskScore >= 15 ? 'MODERADO' : 'BAJO';
    const riskColor = riskScore >= 70 ? '#c0392b' : riskScore >= 40 ? '#e67e22' : riskScore >= 15 ? '#d69e2e' : '#27ae60';

    // ── COVER ──
    doc.addPage();
    doc.rect(0, 0, PAGE_W, PAGE_H).fill('#0a0e17');
    doc.fillColor('#3b82f6').rect(0, 0, PAGE_W, 4).fill();

    setFont(doc, true).fillColor('#94a3b8').fontSize(14)
      .text('INFORME DE', M.left, 150, { width: CW, align: 'center' });
    setFont(doc, true).fillColor('#3b82f6').fontSize(36)
      .text('VINCULOS Y CRUCE', M.left, doc.y + 5, { width: CW, align: 'center' });
    setFont(doc, true).fillColor('#94a3b8').fontSize(12)
      .text('Analisis de Relaciones OSINT', M.left, doc.y + 10, { width: CW, align: 'center' });
    doc.moveDown(1.5);

    // Risk score
    setFont(doc, true).fillColor('#e2e8f0').fontSize(12)
      .text('PUNTAJE DE RIESGO', M.left, doc.y + 10, { width: CW, align: 'center' });
    setFont(doc, true).fillColor(riskColor).fontSize(60)
      .text(`${riskScore}`, M.left, doc.y + 5, { width: CW, align: 'center' });
    setFont(doc, true).fillColor(riskColor).fontSize(20)
      .text(`/100  —  ${riskLevel}`, M.left, doc.y, { width: CW, align: 'center' });
    doc.moveDown(1.5);

    // Sheets info
    doc.fillColor('#111827').roundedRect(M.left + 30, doc.y, CW - 60, 70, 4).fill();
    const infoX = M.left + 45;
    setFont(doc, true).fillColor('#3b82f6').fontSize(8)
      .text('ANALISIS CRUZADO', infoX, doc.y + 10, { width: CW - 80 });
    setFont(doc, true).fillColor('#e2e8f0').fontSize(12)
      .text(`${analysis.sheet1Name} vs ${analysis.sheet2Name}`, infoX, doc.y + 3, { width: CW - 80 });
    setFont(doc, false).fillColor('#94a3b8').fontSize(8)
      .text(`Total vinculos: ${totalLinks} | Hoja 1: ${analysis.sheet1RowCount} registros | Hoja 2: ${analysis.sheet2RowCount} registros`, infoX, doc.y + 3, { width: CW - 80 });

    // Footer
    const footerY = PAGE_H - 50;
    setFont(doc, true).fillColor('#ef4444').fontSize(9)
      .text('DOCUMENTO CONFIDENCIAL', M.left, footerY, { width: CW, align: 'center', lineBreak: false });
    doc.y = PAGE_H - 10;

    // ── RESUMEN DE VINCULOS ──
    doc.addPage();
    setFont(doc, true).fillColor('#1a365d').fontSize(14)
      .text('RESUMEN DE VINCULOS', M.left, doc.y);
    doc.moveDown(0.5);

    const summaryItems: [string, number, string][] = [
      ['Empresariales', analysis.summary.empresariales, '#1a365d'],
      ['Personales', analysis.summary.personales, '#c0392b'],
      ['Familiares', analysis.summary.familiares, '#e67e22'],
      ['Laborales', analysis.summary.laborales, '#2980b9'],
      ['Contacto', analysis.summary.contacto, '#27ae60'],
      ['Ubicacion', analysis.summary.ubicacion, '#d69e2e'],
      ['Dato Compartido', analysis.summary.dato_compartido, '#7f8c8d'],
    ];

    for (const [label, count, color] of summaryItems) {
      if (count === 0) continue;
      setFont(doc, true).fillColor(color).fontSize(10)
        .text(`${count} ${label}`, M.left + 15, doc.y, { width: CW - 20 });
    }
    doc.moveDown(0.5);

    // ── DETALLE DE VINCULOS ──
    setFont(doc, true).fillColor('#1a365d').fontSize(14)
      .text('DETALLE DE VINCULOS', M.left, doc.y);
    doc.moveDown(0.4);

    const linkTypeLabels: Record<string, string> = {
      empresarial: 'Empresarial',
      personal: 'Personal',
      familiar: 'Familiar',
      laboral: 'Laboral',
      contacto: 'Contacto',
      ubicacion: 'Ubicacion',
      dato_compartido: 'Dato Compartido',
    };

    for (const link of analysis.links.slice(0, 50)) {
      checkPage(doc, 50);

      const typeColor = SEV_COLORS[link.type === 'empresarial' ? 'high' : link.type === 'personal' ? 'critical' : link.type === 'familiar' ? 'medium' : 'low'] || '#7f8c8d';

      setFont(doc, true).fillColor(typeColor).fontSize(9)
        .text(`[${linkTypeLabels[link.type] || link.type}]`, M.left + 5, doc.y, { continued: true });
      setFont(doc, true).fillColor('#1a365d').fontSize(9)
        .text(` ${link.sheet1Person} ↔ ${link.sheet2Person}`);

      setFont(doc, false).fillColor('#2c3e50').fontSize(8)
        .text(link.description.substring(0, 250), M.left + 15, doc.y, { width: CW - 20, align: 'justify' });

      setFont(doc, false).fillColor('#636e72').fontSize(7)
        .text(`Campo: ${link.matchedField} | Valor: ${link.matchedValue} | Confianza: ${link.confidence}`, M.left + 15, doc.y, { width: CW - 20 });

      doc.moveDown(0.2);
      doc.strokeColor('#d0d0d0').lineWidth(0.3)
        .moveTo(M.left + 5, doc.y).lineTo(PAGE_W - M.right, doc.y).stroke();
      doc.y += 4;
    }

    // ── MAPA DE RED ──
    if (analysis.networkMap && analysis.networkMap.length > 0) {
      checkPage(doc, 60);
      doc.moveDown(0.5);
      setFont(doc, true).fillColor('#1a365d').fontSize(14)
        .text('MAPA DE RED', M.left, doc.y);
      doc.moveDown(0.4);

      for (const node of analysis.networkMap.slice(0, 20)) {
        checkPage(doc, 15);
        setFont(doc, true).fillColor('#1a365d').fontSize(9)
          .text(`${node.person}`, M.left + 10, doc.y, { continued: true });
        setFont(doc, false).fillColor('#636e72').fontSize(8)
          .text(` — ${node.connections} conexiones | Tipos: ${node.types.join(', ')}`);
      }
    }

    // ── METODOLOGIA ──
    checkPage(doc, 60);
    doc.moveDown(0.5);
    setFont(doc, true).fillColor('#1a365d').fontSize(14)
      .text('METODOLOGIA', M.left, doc.y);
    doc.moveDown(0.4);
    setFont(doc, false).fillColor('#636e72').fontSize(8)
      .text('Este informe de vinculos fue generado mediante investigacion OSINT individual de cada persona, seguida de un analisis cruzado de los hallazgos. Se compararon identificadores directos (cedula, correo, telefono, direccion) y entidades extraidas de los resultados OSINT (empresas, dominios, direcciones, telefonos). La metodologia respeta la Ley 1581/2012 y Ley 1273/2009.', M.left, doc.y, { width: CW, align: 'justify', lineGap: 2 });
    doc.moveDown(0.3);
    setFont(doc, false).fillColor('#636e72').fontSize(7)
      .text(`Informe generado automaticamente por OSINT Data Scanner  |  ${reportId}  |  ${today}`, M.left, doc.y, { width: CW, align: 'center' });

    doc.end();
  });
}
