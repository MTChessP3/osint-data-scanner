/**
 * Generador de Informes OSINT en PDF — Formato INTELIGENCIA-GRADE
 *
 * Reescritura completa: contenido analítico profundo, diseño profesional,
 * sin páginas en blanco, análisis exhaustivo por sección.
 *
 * Límites: máx 8 críticos, 8 altos, 8 medios, 4 bajos
 * Fuentes: DejaVuSans / DejaVuSans-Bold con fallback Helvetica
 *
 * REGLAS CRÍTICAS:
 *  - Cover page: set doc.y = PAGE_H - 10 after all content to prevent auto-page-break
 *  - All footer text calls use { lineBreak: false } to prevent auto page creation
 *  - Use checkPage(doc, neededHeight) instead of doc.addPage() to avoid blank pages
 *  - After drawProfessionalCover(), doc.y is set near bottom to prevent auto-page-break
 */

import PDFDocument from 'pdfkit';
import path from 'path';
import fs from 'fs';
import { OSINTResult } from './osint-scanner';
import { RelationshipAnalysisResult } from './relationship-analyzer';

// ── Font paths with fallback ──
const FONT_REGULAR_PATH = path.join(process.cwd(), 'public', 'fonts', 'DejaVuSans.ttf');
const FONT_BOLD_PATH = path.join(process.cwd(), 'public', 'fonts', 'DejaVuSans-Bold.ttf');

function areFontsAvailable(): boolean {
  try {
    return fs.existsSync(FONT_REGULAR_PATH) && fs.existsSync(FONT_BOLD_PATH);
  } catch {
    return false;
  }
}

// ── Source Anonymization ──
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

// ── Color Palette ──
const C = {
  navy: '#1a365d',
  navyDark: '#0d1b2a',
  accent: '#1b3a5c',
  teal: '#00b4d8',
  red: '#c0392b',
  redBright: '#e74c3c',
  orange: '#e67e22',
  yellow: '#f1c40f',
  green: '#27ae60',
  blue: '#2980b9',
  gray: '#7f8c8d',
  lightGray: '#bdc3c7',
  bg: '#f5f6fa',
  white: '#ffffff',
  text: '#2c3e50',
  textLight: '#636e72',
  tableBorder: '#dfe6e9',
  tableHeader: '#1a365d',
  tableStripe: '#f0f4f8',
  coverBg: '#0a0e17',
  coverAccent: '#3b82f6',
  coverSlate: '#94a3b8',
  coverLight: '#e2e8f0',
};

const SEV: Record<string, { color: string; label: string; bg: string }> = {
  critical: { color: '#ffffff', label: 'CRÍTICO', bg: '#c0392b' },
  high: { color: '#ffffff', label: 'ALTO', bg: '#e67e22' },
  medium: { color: '#000000', label: 'MEDIO', bg: '#f1c40f' },
  low: { color: '#ffffff', label: 'BAJO', bg: '#2980b9' },
  info: { color: '#ffffff', label: 'INFO', bg: '#95a5a6' },
};

const SEV_LIMITS: Record<string, number> = {
  critical: 8,
  high: 8,
  medium: 8,
  low: 4,
  info: 99,
};

const CAT_ES: Record<string, string> = {
  credential_breach: 'Filtración Credenciales',
  password_exposure: 'Exposición Contraseña',
  personal_exposure: 'Exposición Personal',
  social_media: 'Redes Sociales',
  data_broker: 'Broker de Datos',
  dark_web_mention: 'Dark Web',
  paste_site: 'Sitio de Paste',
  document_exposure: 'Documentos Expuestos',
  judicial: 'Registros Judiciales',
};

const REC_MAP: Record<string, string> = {
  credential_breach: 'Cambiar de inmediato todas las contraseñas comprometidas, habilitar autenticación multifactor (MFA) en todas las cuentas, y realizar una auditoría completa de accesos recientes a cuentas sensibles. Se recomienda también revisar si las credenciales filtradas fueron reutilizadas en otros servicios y proceder con su rotación inmediata.',
  password_exposure: 'Rotar contraseñas comprometidas de forma inmediata implementando políticas de contraseñas únicas por servicio. Habilitar MFA en todas las cuentas críticas y considerar el uso de un gestor de contraseñas para eliminar la reutilización. Monitorear activamente los registros de acceso de las cuentas afectadas.',
  personal_exposure: 'Solicitar la eliminación de datos personales ante los responsables de tratamiento conforme al derecho de Habeas Data (Ley 1581/2012). Restringir la configuración de privacidad en todas las plataformas digitales y evaluar la necesidad de solicitar la desindexación de resultados en motores de búsqueda.',
  dark_web_mention: 'Implementar monitoreo continuo de la dark web mediante servicios especializados de inteligencia de amenazas. Configurar alertas tempranas de fraude en centrales de riesgo y entidades financieras. Considerar el congelamiento preventivo del reporte de crédito para prevenir aperturas fraudulentas de cuentas.',
  paste_site: 'Cambiar de inmediato las credenciales comprometidas y auditar todos los servicios donde pudieron haber sido reutilizadas. Revisar los registros de actividad de las cuentas afectadas en busca de accesos no autorizados. Implementar alertas de seguridad en los servicios críticos.',
  data_broker: 'Ejercer el derecho de supresión de datos personales ante cada broker de datos identificado, conforme a la Ley 1581/2012 y el derecho al Habeas Data. Realizar seguimiento escrito de las solicitudes y escalar ante la Superintendencia de Industria y Comercio en caso de falta de respuesta dentro del término legal.',
  social_media: 'Revisar y restringir exhaustivamente la configuración de privacidad en todas las plataformas detectadas. Eliminar información personal innecesaria de perfiles públicos, desactivar la indexación por motores de búsqueda, y considerar la desactivación de cuentas innecesarias o inactivas.',
  document_exposure: 'Solicitar la eliminación del documento expuesto ante la entidad responsable y verificar el alcance completo de la exposición. Si se trata de documentos de identidad, considerar la solicitud de un nuevo documento y activar alertas de fraude documental ante las autoridades competentes.',
  judicial: 'Verificar manualmente los registros en las fuentes oficiales de la Rama Judicial para confirmar su exactitud y contexto. En caso de información desactualizada o errónea, solicitar la corrección conforme al procedimiento legal vigente. Evaluar el impacto reputacional con asesoría jurídica.',
};

function catES(cat: string): string {
  return CAT_ES[cat] || cat;
}
function recFor(cat: string): string {
  return REC_MAP[cat] || 'Investigar a fondo el hallazgo, tomar medidas correctivas inmediatas y establecer monitoreo continuo para prevenir futuras exposiciones.';
}

// ── Layout Constants ──
const PAGE_W = 612;
const PAGE_H = 792;
const M = { top: 50, bottom: 50, left: 50, right: 50 };
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

// ── Font helper with fallback ──
let useCustomFonts = false;

function setFont(doc: PDFDocument, bold: boolean = false): PDFDocument {
  if (useCustomFonts) {
    return doc.font(bold ? 'DejaVuBold' : 'DejaVuRegular');
  }
  return doc.font(bold ? 'Helvetica-Bold' : 'Helvetica');
}

function registerFonts(doc: PDFDocument): void {
  if (areFontsAvailable()) {
    try {
      doc.registerFont('DejaVuRegular', FONT_REGULAR_PATH);
      doc.registerFont('DejaVuBold', FONT_BOLD_PATH);
      useCustomFonts = true;
    } catch (e) {
      console.warn('Failed to register custom fonts, falling back to Helvetica:', e);
      useCustomFonts = false;
    }
  } else {
    console.warn('Custom fonts not found at', FONT_REGULAR_PATH, '- using Helvetica fallback');
    useCustomFonts = false;
  }
}

// ── Drawing helpers ──

function drawSectionHeader(doc: PDFDocument, title: string): void {
  checkPage(doc, 45);
  doc.moveDown(0.3);
  const y = doc.y;
  // Gradient-style header bar
  doc.fillColor(C.navy).rect(M.left, y, CW, 24).fill();
  // Accent left strip
  doc.fillColor(C.coverAccent).rect(M.left, y, 4, 24).fill();
  setFont(doc, true).fillColor(C.white).fontSize(11)
    .text(title, M.left + 12, y + 6, { width: CW - 20 });
  doc.y = y + 28;
  doc.moveDown(0.1);
}

function drawSubsectionHeader(doc: PDFDocument, title: string): void {
  checkPage(doc, 25);
  doc.moveDown(0.1);
  const y = doc.y;
  doc.fillColor(C.accent).rect(M.left, y, 3, 14).fill();
  setFont(doc, true).fillColor(C.navy).fontSize(9.5)
    .text(title, M.left + 8, y + 1, { width: CW - 12 });
  doc.y = y + 17;
  doc.moveDown(0.05);
}

function drawParagraph(doc: PDFDocument, text: string, opts?: { fontSize?: number; color?: string; bold?: boolean; indent?: number }): void {
  const fs = opts?.fontSize || 9;
  const color = opts?.color || C.text;
  const bold = opts?.bold || false;
  const indent = opts?.indent || 0;
  checkPage(doc, fs * 2 + 5);
  setFont(doc, bold).fillColor(color).fontSize(fs)
    .text(text, M.left + indent, doc.y, { width: CW - indent, align: 'justify', lineGap: 2 });
  doc.moveDown(0.1);
}

function truncateUrl(url: string, maxLen: number = 60): string {
  if (!url) return '';
  if (url.length <= maxLen) return url;
  return url.substring(0, maxLen - 3) + '...';
}

// ── Severity badge helper ──
function drawSeverityBadge(doc: PDFDocument, severity: string, x: number, y: number): void {
  const sev = SEV[severity] || SEV.info;
  const badgeW = 52;
  const badgeH = 12;
  doc.fillColor(sev.bg).roundedRect(x, y, badgeW, badgeH, 2).fill();
  setFont(doc, true).fillColor(sev.color).fontSize(7)
    .text(sev.label, x + 3, y + 2.5, { width: badgeW - 6, align: 'center', lineBreak: false });
}

// ════════════════════════════════════════════════════════════════
//  PROFESSIONAL COVER PAGE
// ════════════════════════════════════════════════════════════════

function drawProfessionalCover(
  doc: PDFDocument,
  opts: {
    title: string;
    subtitle?: string;
    fullName: string;
    cedula?: string;
    email?: string;
    phone?: string;
    reportId: string;
    riskScore: number;
    riskLevel: string;
    riskColor: string;
    today: string;
  }
): void {
  // Full dark navy background
  doc.rect(0, 0, PAGE_W, PAGE_H).fill(C.coverBg);

  // Top accent line with gradient effect
  doc.fillColor(C.coverAccent).rect(0, 0, PAGE_W, 5).fill();
  doc.fillColor('#1e40af').rect(0, 5, PAGE_W, 2).fill();

  // Logo area
  const logoY = 35;
  doc.fillColor('#1e293b').roundedRect(M.left, logoY, 42, 42, 4).fill();
  doc.strokeColor(C.coverAccent).lineWidth(1).roundedRect(M.left, logoY, 42, 42, 4).stroke();
  setFont(doc, true).fillColor(C.coverAccent).fontSize(20)
    .text('◆', M.left + 8, logoY + 9, { width: 26, lineBreak: false });
  setFont(doc, true).fillColor(C.coverLight).fontSize(11)
    .text('OSINT DATA SCANNER', M.left + 52, logoY + 8, { width: 200, lineBreak: false });
  setFont(doc, false).fillColor(C.coverSlate).fontSize(7)
    .text('Plataforma de Inteligencia de Fuentes Abiertas', M.left + 52, logoY + 23, { width: 200, lineBreak: false });

  // CONFIDENTIAL badge
  const confX = PAGE_W - M.right - 145;
  doc.fillColor('#7f1d1d').roundedRect(confX, logoY, 145, 26, 3).fill();
  doc.strokeColor('#991b1b').lineWidth(0.5).roundedRect(confX, logoY, 145, 26, 3).stroke();
  setFont(doc, true).fillColor('#fca5a5').fontSize(8)
    .text('CLASIFICACIÓN: CONFIDENCIAL', confX + 8, logoY + 8, { width: 130, lineBreak: false });

  // Thin separator
  doc.y = logoY + 55;
  doc.strokeColor('#1e293b').lineWidth(0.5)
    .moveTo(M.left, doc.y).lineTo(PAGE_W - M.right, doc.y).stroke();

  // Main title area
  doc.y = 130;
  setFont(doc, true).fillColor(C.coverSlate).fontSize(14)
    .text('INFORME DE', M.left, doc.y, { width: CW, align: 'center', lineBreak: false });
  doc.moveDown(0.1);
  setFont(doc, true).fillColor(C.coverAccent).fontSize(36)
    .text('INVESTIGACIÓN', M.left, doc.y, { width: CW, align: 'center', lineBreak: false });
  doc.moveDown(0.6);

  // Decorative double line
  const lineY = doc.y;
  doc.strokeColor(C.coverAccent).lineWidth(2)
    .moveTo(PAGE_W / 2 - 90, lineY).lineTo(PAGE_W / 2 + 90, lineY).stroke();
  doc.strokeColor('#1e293b').lineWidth(0.5)
    .moveTo(PAGE_W / 2 - 90, lineY + 4).lineTo(PAGE_W / 2 + 90, lineY + 4).stroke();
  doc.y = lineY + 15;

  // Subtitle
  if (opts.subtitle) {
    setFont(doc, false).fillColor(C.coverSlate).fontSize(12)
      .text(opts.subtitle, M.left, doc.y, { width: CW, align: 'center', lineBreak: false });
    doc.moveDown(0.6);
  }

  // Risk score gauge — large, centered, professional
  const gaugeW = 180;
  const gaugeX = PAGE_W / 2 - gaugeW / 2;
  const gaugeY = doc.y + 8;
  const gaugeCenterX = PAGE_W / 2;
  const gaugeCenterY = gaugeY + 38;

  // Outer ring glow
  doc.strokeColor('#1e293b').lineWidth(4)
    .circle(gaugeCenterX, gaugeCenterY, 32).stroke();
  // Inner filled circle
  doc.fillColor(opts.riskColor).circle(gaugeCenterX, gaugeCenterY, 28).fill();
  // Score text
  setFont(doc, true).fillColor(C.white).fontSize(28)
    .text(`${opts.riskScore}`, gaugeX, gaugeCenterY - 14, { width: gaugeW, align: 'center', lineBreak: false });
  // Level text
  setFont(doc, true).fillColor(C.white).fontSize(9)
    .text(`/100`, gaugeX, gaugeCenterY + 16, { width: gaugeW, align: 'center', lineBreak: false });

  // Risk level label below circle
  doc.y = gaugeCenterY + 38;
  const levelBadgeW = 100;
  const levelBadgeX = PAGE_W / 2 - levelBadgeW / 2;
  doc.fillColor(opts.riskColor).roundedRect(levelBadgeX, doc.y, levelBadgeW, 18, 3).fill();
  setFont(doc, true).fillColor(C.white).fontSize(9)
    .text(opts.riskLevel, levelBadgeX, doc.y + 4, { width: levelBadgeW, align: 'center', lineBreak: false });
  doc.y = doc.y + 28;

  // Subject info box — dark card
  doc.moveDown(0.3);
  const infoBoxY = doc.y;
  const infoBoxH = 90;
  doc.fillColor('#111827').roundedRect(M.left + 25, infoBoxY, CW - 50, infoBoxH, 6).fill();
  doc.strokeColor('#1e293b').lineWidth(0.5).roundedRect(M.left + 25, infoBoxY, CW - 50, infoBoxH, 6).stroke();

  // Accent left strip inside box
  doc.fillColor(C.coverAccent).roundedRect(M.left + 25, infoBoxY, 4, infoBoxH, 2).fill();

  const infoX = M.left + 40;
  setFont(doc, true).fillColor(C.coverAccent).fontSize(8)
    .text('SUJETO DE INVESTIGACIÓN', infoX, infoBoxY + 10, { width: CW - 80, lineBreak: false });
  setFont(doc, true).fillColor(C.coverLight).fontSize(15)
    .text(opts.fullName, infoX, infoBoxY + 24, { width: CW - 80, lineBreak: false });

  const detailLines: string[] = [];
  if (opts.cedula) detailLines.push(`CC: ${opts.cedula}`);
  if (opts.email) detailLines.push(`${opts.email}`);
  if (opts.phone) detailLines.push(`Tel: ${opts.phone}`);
  if (detailLines.length > 0) {
    setFont(doc, false).fillColor(C.coverSlate).fontSize(8)
      .text(detailLines.join('   |   '), infoX, infoBoxY + 46, { width: CW - 80, lineBreak: false });
  }

  setFont(doc, false).fillColor('#64748b').fontSize(7)
    .text(`ID: ${opts.reportId}  |  Fecha: ${opts.today}`, infoX, infoBoxY + 64, { width: CW - 80, lineBreak: false });

  // Classification level indicator
  const classY = infoBoxY + 74;
  doc.fillColor('#475569').fontSize(6)
    .text('Nivel de Clasificación: CONFIDENCIAL — Solo para uso autorizado', infoX, classY, { width: CW - 80, lineBreak: false });

  doc.y = infoBoxY + infoBoxH + 15;

  // Bottom section — Classification & Footer
  const footerY = PAGE_H - 65;

  // Bottom accent line
  doc.fillColor(C.coverAccent).rect(0, footerY - 12, PAGE_W, 2).fill();
  doc.fillColor('#1e40af').rect(0, footerY - 10, PAGE_W, 1).fill();

  // Classification marking — lineBreak: false to prevent auto-page-break
  setFont(doc, true).fillColor('#ef4444').fontSize(10)
    .text('DOCUMENTO CONFIDENCIAL — USO RESTRINGIDO', M.left, footerY, { width: CW, align: 'center', lineBreak: false });
  setFont(doc, false).fillColor('#64748b').fontSize(6.5)
    .text('La distribución, reproducción o divulgación no autorizada de este documento constituye una violación a la Ley 1581 de 2012 (Protección de Datos Personales) y la Ley 1273 de 2009 (Delitos Informáticos)', M.left, footerY + 15, { width: CW, align: 'center', lineBreak: false });
  setFont(doc, false).fillColor('#475569').fontSize(6)
    .text(`OSINT Data Scanner  |  ${opts.reportId}  |  ${opts.today}`, M.left, footerY + 29, { width: CW, align: 'center', lineBreak: false });

  // CRITICAL: Set doc.y near page bottom to prevent auto-page-break
  doc.y = PAGE_H - 10;
}

// ════════════════════════════════════════════════════════════════
//  REPORTE PRINCIPAL — generatePDFReport
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
    const infoCount = realResults.filter(r => r.severity === 'info').length;
    const riskScore = data.riskScore ?? Math.min(100, crit * 30 + high * 15 + med * 5 + low * 2);
    const riskLevel = riskScore >= 70 ? 'CRÍTICO' : riskScore >= 40 ? 'ALTO' : riskScore >= 15 ? 'MODERADO' : 'BAJO';
    const riskColor = riskScore >= 70 ? C.red : riskScore >= 40 ? C.orange : riskScore >= 15 ? C.yellow : C.green;

    const anonymizedResults = realResults.map(r => ({
      ...r,
      source: anonymizeSource(r.source),
    }));

    const limitedResults: typeof anonymizedResults = [];
    const severityOrder = ['critical', 'high', 'medium', 'low', 'info'] as const;
    for (const sev of severityOrder) {
      const filtered = anonymizedResults.filter(r => r.severity === sev);
      const limit = SEV_LIMITS[sev] || 99;
      limitedResults.push(...filtered.slice(0, limit));
    }

    const uniqueSources = [...new Set(anonymizedResults.map(r => r.source))];

    // ════════════════════════════════════════
    //  PÁGINA 1: PORTADA PROFESIONAL
    // ════════════════════════════════════════
    doc.addPage();
    drawProfessionalCover(doc, {
      title: 'INFORME DE INVESTIGACIÓN',
      fullName: data.fullName,
      cedula: data.cedula,
      email: data.email,
      phone: data.phone,
      reportId,
      riskScore,
      riskLevel,
      riskColor,
      today,
    });

    // ════════════════════════════════════════
    //  PÁGINA 2: RESUMEN EJECUTIVO
    // ════════════════════════════════════════
    doc.addPage();
    drawSectionHeader(doc, 'RESUMEN EJECUTIVO');

    // Risk score box — enhanced with gradient feel
    checkPage(doc, 60);
    const boxY = doc.y;
    const boxH = 52;
    // Score box
    doc.fillColor(riskColor).roundedRect(M.left, boxY, 95, boxH, 4).fill();
    setFont(doc, true).fillColor(C.white).fontSize(28)
      .text(`${riskScore}`, M.left + 5, boxY + 3, { width: 85, align: 'center' });
    setFont(doc, true).fillColor(C.white).fontSize(10)
      .text(`/100`, M.left + 5, boxY + 32, { width: 85, align: 'center' });
    // Risk level inside score box
    setFont(doc, true).fillColor(C.white).fontSize(8)
      .text(riskLevel, M.left + 5, boxY + 43, { width: 85, align: 'center' });

    // Info area
    doc.fillColor(C.bg).roundedRect(M.left + 95, boxY, CW - 95, boxH, 4).fill();
    doc.strokeColor(C.tableBorder).lineWidth(0.3).roundedRect(M.left + 95, boxY, CW - 95, boxH, 4).stroke();
    const infoX = M.left + 105;
    setFont(doc, true).fillColor(C.navy).fontSize(11)
      .text(data.fullName, infoX, boxY + 6, { width: CW - 120 });
    setFont(doc, false).fillColor(C.textLight).fontSize(8)
      .text(`${realResults.length} hallazgos en ${uniqueSources.length} fuentes  |  Email: ${data.email || 'N/A'}  |  Tel: ${data.phone || 'N/A'}`, infoX, boxY + 22, { width: CW - 120 });

    // Severity breakdown inside the box
    const sevY = boxY + 36;
    let sevX = infoX;
    const sevItems: [string, number, string][] = [
      ['Crítico', crit, C.red],
      ['Alto', high, C.orange],
      ['Medio', med, '#b7950b'],
      ['Bajo', low, C.blue],
      ['Info', infoCount, C.gray],
    ];
    for (const [label, count, color] of sevItems) {
      if (count === 0) continue;
      // Mini badge
      doc.fillColor(color).roundedRect(sevX, sevY, 48, 12, 2).fill();
      setFont(doc, true).fillColor(C.white).fontSize(7)
        .text(`${count} ${label}`, sevX + 3, sevY + 2.5, { width: 42, align: 'center', lineBreak: false });
      sevX += 52;
    }
    doc.y = boxY + boxH + 12;

    // Detailed executive narrative — 5-6 sentences minimum
    const execNarrative = crit > 0
      ? `La investigación de Inteligencia de Fuentes Abiertas (OSINT) realizada sobre el sujeto ${data.fullName} ha identificado ${crit} hallazgo(s) con severidad CRÍTICA que representan un riesgo inmediato y directo para su seguridad digital y su integridad patrimonial. Se han detectado filtraciones de credenciales de acceso y/o exposición de datos altamente sensibles en fuentes de inteligencia consultadas, lo cual requiere acción correctiva inmediata y prioritaria. La combinación de datos personales expuestos con credenciales comprometidas crea un vector de ataque multidimensional que facilita la suplantación de identidad, el fraude financiero y el acceso no autorizado a cuentas críticas del sujeto. Con un puntaje de riesgo de ${riskScore}/100 clasificado como ${riskLevel}, se determina que la probabilidad de explotación activa de estos datos es significativamente alta, y es posible que la información ya haya sido utilizada por actores malintencionados. Se recomienda de manera urgente cambiar todas las contraseñas comprometidas, habilitar autenticación multifactor (MFA) en todos los servicios, solicitar la eliminación de datos en brokers de información conforme a la Ley 1581/2012, y establecer monitoreo continuo de la huella digital del sujeto.`
      : high > 0
      ? `La investigación OSINT ha identificado ${high} hallazgo(s) de severidad ALTA que señalan una exposición significativa de datos personales del sujeto ${data.fullName} en múltiples fuentes de riesgo. Se encontraron menciones del sujeto en repositorios de datos filtrados, brokers de información, o plataformas de riesgo que requieren atención prioritaria y medidas de protección digital inmediatas. Aunque no se detectaron hallazgos críticos de filtración de credenciales, la cantidad y naturaleza de los datos expuestos es suficiente para que actores malintencionados puedan construir un perfil detallado del sujeto y ejecutar ataques de ingeniería social dirigidos. Con un puntaje de riesgo de ${riskScore}/100 (${riskLevel}), se requiere atención prioritaria para mitigar los vectores de ataque identificados y prevenir la escalada del riesgo. Se recomienda implementar medidas de protección integral, incluyendo el endurecimiento de configuraciones de privacidad, el monitoreo proactivo de nuevas exposiciones, y el ejercicio de los derechos de Habeas Data.`
      : med > 0 || low > 0
      ? `La investigación OSINT sobre el sujeto ${data.fullName} ha identificado hallazgos de severidad media y baja que indican una exposición digital moderada pero relevante. Si bien los hallazgos no representan un riesgo inmediato de compromiso crítico, la acumulación de datos personales en fuentes públicas contribuye gradualmente a una superficie de ataque que podría ser explotada si se combina con información adicional disponible en otras fuentes. Con un puntaje de riesgo de ${riskScore}/100 (${riskLevel}), se recomienda implementar medidas de protección preventiva, incluyendo la revisión de configuraciones de privacidad, la eliminación de datos innecesarios de fuentes públicas, y el establecimiento de un régimen de monitoreo periódico. La detección temprana y la gestión proactiva de la huella digital son fundamentales para prevenir la escalada del nivel de riesgo.`
      : `La investigación OSINT sobre el sujeto ${data.fullName} no identificó hallazgos de riesgo significativo en las fuentes automatizadas consultadas. Con un puntaje de riesgo de ${riskScore}/100 (${riskLevel}), la superficie de exposición digital del sujeto parece limitada según las fuentes disponibles. Sin embargo, es importante señalar que la ausencia de hallazgos en fuentes automatizadas no garantiza la no exposición del sujeto, ya que existen fuentes cerradas, mercados privados de la dark web, y brechas de seguridad no reportadas que escapan al alcance de esta investigación. Se recomienda mantener prácticas rigurosas de higiene digital, implementar autenticación multifactor preventiva, y realizar verificaciones periódicas para detectar cambios en el nivel de exposición.`;
    drawParagraph(doc, execNarrative, { fontSize: 8.5 });

    // Metodología — 2-3 paragraphs
    doc.moveDown(0.15);
    drawSubsectionHeader(doc, 'Metodología');
    drawParagraph(doc, 'La presente investigación se realizó utilizando técnicas avanzadas de Inteligencia de Fuentes Abiertas (OSINT), empleando métodos de recolección pasiva y análisis sistemático de información públicamente accesible en internet. Se utilizaron herramientas automatizadas de recolección de datos, motores de búsqueda especializados en brechas de seguridad, APIs de inteligencia de amenazas, y técnicas de correlación de información sin interactuar directamente con los sistemas del sujeto de investigación. En ningún momento se utilizaron técnicas de acceso no autorizado, ingeniería social, o cualquier método que implique violación de sistemas o comunicaciones privadas.', { fontSize: 8.5, color: C.textLight });
    drawParagraph(doc, 'La metodología de análisis sigue un enfoque de inteligencia estructurada basada en el ciclo OSINT (Planificación, Recolección, Procesamiento, Análisis, y Difusión). Los datos recopilados fueron verificados cruzadamente entre múltiples fuentes para maximizar la confiabilidad de los hallazgos. La clasificación de severidad se realizó conforme a estándares de la industria de seguridad informática, evaluando tanto el impacto potencial como la probabilidad de explotación de cada hallazgo. Todo el proceso respeta el marco legal colombiano vigente, particularmente la Ley 1581 de 2012 sobre protección de datos personales y la Ley 1273 de 2009 sobre delitos informáticos.', { fontSize: 8.5, color: C.textLight });
    drawParagraph(doc, 'Es importante notar que los resultados de esta investigación representan una fotografía del estado de exposición digital del sujeto en el momento de la consulta. Las fuentes de datos consultadas son dinámicas y la información puede cambiar con el tiempo. Se recomienda realizar verificaciones periódicas para mantener actualizada la evaluación de riesgo del sujeto.', { fontSize: 8.5, color: C.textLight });

    // Alcance de la Investigación
    doc.moveDown(0.1);
    drawSubsectionHeader(doc, 'Alcance de la Investigación');
    drawParagraph(doc, `El alcance de esta investigación comprende la búsqueda y análisis exhaustivo de información del sujeto ${data.fullName} en fuentes de datos públicas, repositorios de credenciales filtradas (incluyendo bases de datos de brechas conocidas), brokers de datos comerciales, registros judiciales públicos, y plataformas de redes sociales. Se consultaron ${uniqueSources.length} fuente${uniqueSources.length !== 1 ? 's' : ''} de inteligencia especializada, generando ${realResults.length} resultado${realResults.length !== 1 ? 's' : ''} de investigación. La investigación se limita estrictamente a fuentes abiertas y no incluye técnicas de acceso no autorizado, interceptación de comunicaciones, ni ingeniería social. Los resultados deben ser interpretados como indicadores de exposición y no como evidencia concluyente de compromiso activo.`, { fontSize: 8.5, color: C.textLight });

    // ════════════════════════════════════════
    //  HALLAZGOS DETALLADOS
    // ════════════════════════════════════════
    checkPage(doc, 80);
    doc.moveDown(0.3);
    drawSectionHeader(doc, 'HALLAZGOS DETALLADOS');

    drawParagraph(doc, 'A continuación se presenta el detalle completo de cada hallazgo identificado durante la investigación, organizado por nivel de severidad de mayor a menor riesgo. Cada hallazgo incluye el análisis de impacto potencial y la acción recomendada específica para su mitigación.', { fontSize: 8.5 });

    if (limitedResults.filter(r => r.severity !== 'info').length === 0 && realResults.length === 0) {
      drawParagraph(doc, 'No se identificaron hallazgos en las fuentes automatizadas consultadas. Se recomienda realizar verificación manual en fuentes adicionales para obtener resultados más completos. La ausencia de resultados automáticos no garantiza la no exposición del sujeto en fuentes no consultadas, mercados cerrados de datos, o brechas de seguridad no reportadas públicamente. Se sugiere complementar esta investigación con verificaciones manuales en RUES, Rama Judicial, y listas restrictivas internacionales.');
    } else {
      const displaySeverities = ['critical', 'high', 'medium', 'low'] as const;
      let findingNum = 0;

      for (const severity of displaySeverities) {
        const filtered = limitedResults.filter(r => r.severity === severity);
        if (filtered.length === 0) continue;

        const sev = SEV[severity];
        const totalOfSev = anonymizedResults.filter(r => r.severity === severity).length;
        const showingCount = filtered.length;
        const omittedCount = totalOfSev - showingCount;

        checkPage(doc, 35);
        const sevBarY = doc.y;
        doc.fillColor(sev.bg).roundedRect(M.left, sevBarY, CW, 20, 3).fill();
        setFont(doc, true).fillColor(sev.color).fontSize(10)
          .text(`${sev.label} — ${showingCount} hallazgo${showingCount > 1 ? 's' : ''}${omittedCount > 0 ? ` (de ${totalOfSev} total, ${omittedCount} omitido${omittedCount > 1 ? 's' : ''})` : ''}`, M.left + 10, sevBarY + 5, { width: CW - 20 });
        doc.y = sevBarY + 24;

        for (const r of filtered) {
          findingNum++;
          checkPage(doc, 85);

          // Finding card with left accent strip
          const cardStartY = doc.y;
          doc.fillColor(sev.bg).rect(M.left, cardStartY, 4, 10).fill();

          // Severity badge + Title
          drawSeverityBadge(doc, severity, M.left + 10, cardStartY + 1);
          setFont(doc, true).fillColor(C.navy).fontSize(9.5)
            .text(`${findingNum}. ${r.title}`, M.left + 66, cardStartY + 1, { width: CW - 70 });
          doc.moveDown(0.15);

          // Description
          const desc = r.description || r.dataFound || 'Sin descripción disponible';
          checkPage(doc, 25);
          drawParagraph(doc, desc, { fontSize: 8, indent: 10 });

          // Source and category
          checkPage(doc, 12);
          setFont(doc, false).fillColor(C.textLight).fontSize(7)
            .text(`Fuente: ${r.source}  |  Categoría: ${catES(r.category)}`, M.left + 10, doc.y, { width: CW - 14 });
          doc.moveDown(0.1);

          // IMPACTO POTENCIAL — expanded per category
          checkPage(doc, 18);
          const impactMap: Record<string, string> = {
            credential_breach: 'Alto riesgo de suplantación de identidad y acceso no autorizado a cuentas del sujeto. Las credenciales filtradas pueden ser utilizadas para acceder a servicios financieros, plataformas de correo electrónico, y sistemas corporativos. El impacto se amplifica si el sujeto reutiliza contraseñas entre múltiples servicios, pudiendo comprometer entre 3 y 15 cuentas adicionales.',
            password_exposure: 'Riesgo significativo de acceso no autorizado a cuentas y robo de información sensible. Las contraseñas expuestas permiten ataques de credential stuffing y fuerza bruta en servicios vinculados. El compromiso de servicios conectados (SSO) puede amplificar el impacto a ecosistemas completos de aplicaciones.',
            personal_exposure: 'Los datos personales expuestos facilitan ataques de phishing dirigido (spear phishing), acoso, robo de identidad, y extorsión. La información de contacto y datos familiares pueden ser utilizados para ingeniería social avanzada contra el sujeto o sus relaciones cercanas.',
            social_media: 'La información de redes sociales permite la construcción de perfiles detallados para ataques de ingeniería social, suplantación de identidad digital, acoso cibernético, y reputational attacks. Los datos de ubicación y actividad pueden ser explotados para vigilancia física.',
            data_broker: 'La comercialización no autorizada de datos personales por brokers amplifica exponencialmente la superficie de exposición al distribuir la información a múltiples compradores. Esto facilita el perfilamiento, el marketing invasivo, y potencialmente el fraude dirigido.',
            dark_web_mention: 'La presencia de datos del sujeto en la dark web indica circulación activa en foros y mercados de actividades ilícitas. Los datos pueden ser vendidos, intercambiados, o utilizados para fraude masivo, suplantación de identidad, y operaciones de estafa financiera.',
            paste_site: 'La publicación en sitios de paste expone credenciales y datos a un acceso masivo e incontrolable. Estos sitios son monitoreados activamente por actores malintencionados que utilizan scripts automatizados para extraer y explotar la información publicada.',
            document_exposure: 'La exposición de documentos oficiales permite fraude documental, suplantación ante entidades públicas y privadas, apertura fraudulenta de cuentas bancarias, y solicitud de créditos a nombre del sujeto. El impacto puede extenderse a procesos judiciales o administrativos fraudulentos.',
            judicial: 'La disponibilidad de registros judiciales en línea puede causar perjuicio reputacional, discriminación laboral o social, y extorsión. Incluso registros desactualizados o resueltos pueden ser utilizados fuera de contexto para causar daño al sujeto.',
          };
          const impactText = impactMap[r.category] || 'Compromiso potencial de la seguridad digital y la privacidad del sujeto, con impacto variable según la naturaleza específica de los datos expuestos y los vectores de ataque disponibles.';
          setFont(doc, true).fillColor('#c0392b').fontSize(7)
            .text('IMPACTO POTENCIAL: ', M.left + 10, doc.y, { width: CW - 14, continued: true });
          setFont(doc, false).fillColor(C.textLight).fontSize(7)
            .text(impactText);

          // ACCIÓN RECOMENDADA — expanded
          checkPage(doc, 18);
          setFont(doc, true).fillColor('#27ae60').fontSize(7)
            .text('ACCIÓN RECOMENDADA: ', M.left + 10, doc.y, { width: CW - 14, continued: true });
          setFont(doc, false).fillColor(C.textLight).fontSize(7)
            .text(recFor(r.category));

          if (r.url) {
            checkPage(doc, 12);
            setFont(doc, false).fillColor(C.blue).fontSize(6.5)
              .text(truncateUrl(r.url, 80), M.left + 10, doc.y, { width: CW - 14 });
          }

          doc.moveDown(0.15);
          // Separator
          const sepY = doc.y;
          doc.strokeColor('#d0d0d0').lineWidth(0.3)
            .moveTo(M.left + 8, sepY).lineTo(PAGE_W - M.right, sepY).stroke();
          doc.y = sepY + 5;
        }
      }
    }

    // ════════════════════════════════════════
    //  ANÁLISIS DE SUPERFICIE DE EXPOSICIÓN
    // ════════════════════════════════════════
    checkPage(doc, 80);
    doc.moveDown(0.3);
    drawSectionHeader(doc, 'ANÁLISIS DE SUPERFICIE DE EXPOSICIÓN');

    drawParagraph(doc, 'El análisis de la superficie de exposición digital del sujeto constituye una evaluación fundamental para comprender la magnitud y las implicaciones de la disponibilidad de su información personal en fuentes públicas y de riesgo. A continuación se presenta un análisis profundo por cada categoría de exposición identificada, detallando no solo qué datos están expuestos sino también cómo pueden ser explotados y cuál es el alcance potencial del compromiso.', { fontSize: 8.5 });

    const categoriesPresent = [...new Set(limitedResults.filter(r => r.severity !== 'info').map(r => r.category))];
    for (const cat of categoriesPresent) {
      checkPage(doc, 35);
      const catResults = limitedResults.filter(r => r.category === cat && r.severity !== 'info');
      if (catResults.length === 0) continue;

      // Deep analysis per category — 3-4 sentences minimum
      const surfaceAnalysis: Record<string, string> = {
        credential_breach: `La detección de ${catResults.length} filtración(es) de credenciales constituye el hallazgo más crítico de esta investigación. Las credenciales comprometidas en brechas de seguridad conocidas representan un vector de ataque directo y verificable: terceros malintencionados poseen combinaciones de usuario/contraseña del sujeto que pueden ser utilizadas para acceso no autorizado inmediato. La gravedad se amplifica significativamente por la práctica generalizada de reutilizar contraseñas entre múltiples servicios, lo que significa que una sola credencial filtrada puede comprometer entre 3 y 15 cuentas adicionales. Además, las credenciales filtradas frecuentemente circulan durante meses o años en la dark web antes de aparecer en fuentes públicas, lo que implica que el compromiso puede ser anterior a la fecha de detección y que ya pudo haber sido explotado activamente.`,
        password_exposure: `Se identificaron ${catResults.length} instancia(s) de contraseñas expuestas en fuentes públicas, lo cual representa un riesgo grave de compromiso multiplataforma. La exposición de contraseñas en texto plano o con hash débil permite ataques de credential stuffing automatizados que prueban las credenciales en cientos de servicios simultáneamente. Este tipo de ataque tiene una tasa de éxito estimada del 1-3% debido a la reutilización de contraseñas, lo que en la práctica significa que cada contraseña expuesta puede comprometer entre 2 y 8 servicios adicionales. La exposición de contraseñas también puede revelar patrones de creación de contraseñas del sujeto, facilitando ataques de fuerza bruta dirigidos contra cuentas no comprometidas.`,
        personal_exposure: `La presencia de ${catResults.length} hallazgo(s) de exposición personal indica que datos sensibles del sujeto — incluyendo pero no limitado a direcciones físicas, números de teléfono, información familiar, datos biométricos, y detalles de identificación — se encuentran accesibles públicamente. Esta información constituye la base para ataques de ingeniería social avanzados, incluyendo spear phishing (phishing dirigido personalizado), vishing (phishing por teléfono), y pretexting (creación de pretextos falsos para obtener información adicional). La exposición de datos familiares también extiende el riesgo a las personas cercanas al sujeto, quienes pueden ser objetivo de ataques indirectos para llegar al sujeto principal.`,
        social_media: `Se detectaron ${catResults.length} hallazgo(s) en redes sociales que revelan información significativa del sujeto. La sobreexposición en plataformas sociales es uno de los vectores más explotados por actores malintencionados, ya que permite construir un perfil psicológico y comportamental detallado que se utiliza para personalizar ataques de ingeniería social. La información de ubicación, rutinas, relaciones interpersonales, y afiliaciones disponible en redes sociales también puede ser explotada para vigilancia física, acoso, o preparación de ataques de suplantación de identidad convincentes.`,
        data_broker: `La aparición en ${catResults.length} broker(s) de datos indica que la información del sujeto está siendo comercializada activamente sin su conocimiento ni consentimiento explícito. Los brokers de datos operan como agregadores masivos que recopilan información de múltiples fuentes — registros públicos, transacciones comerciales, actividad digital, y datos de terceros — para crear perfiles exhaustivos que son vendidos a clientes corporativos y, en algunos casos, a actores menos escrupulosos. La presencia en bases de datos de brokers amplifica exponencialmente la superficie de exposición, ya que la información se distribuye a compradores que pueden utilizarla para marketing agresivo, discriminación algorítmica, o fines más maliciosos.`,
        dark_web_mention: `La detección de ${catResults.length} mención(es) en la dark web es particularmente alarmante, ya que indica que los datos del sujeto circulan activamente en foros, mercados, y plataformas de actividades ilícitas. A diferencia de las brechas de datos públicas, la dark web opera como un ecosistema cerrado donde los datos son negociados, vendidos, y explotados por actores malintencionados sofisticados. La presencia de datos del sujeto en estos entornos sugiere que su información ha sido evaluada como valiosa para fraude, suplantación de identidad, o extorsión. Los datos en la dark web frecuentemente se venden en paquetes que combinan información de múltiples fuentes, aumentando su utilidad para ataques complejos.`,
        paste_site: `La presencia en ${catResults.length} sitio(s) de paste indica que credenciales o datos del sujeto fueron publicados en servicios de texto temporal, que funcionan como canales de distribución masiva de filtraciones de datos. Estos sitios son monitoreados constantemente por actores malintencionados que utilizan herramientas automatizadas para capturar y procesar la información antes de que sea eliminada. La publicación en sitios de paste típicamente indica una brecha de datos reciente, y los datos publicados son rápidamente integrados en bases de datos de credenciales compiladas que alimentan ataques de credential stuffing a escala industrial.`,
        document_exposure: `Se identificaron ${catResults.length} documento(s) expuesto(s) del sujeto, lo cual representa uno de los riesgos más severos de fraude documental. La exposición de documentos oficiales — como cédulas de ciudadanía, pasaportes, certificados, contratos, o estados financieros — proporciona a los delincuentes toda la información necesaria para crear documentos falsos convincentes y suplantar la identidad del sujeto ante entidades bancarias, gubernamentales, y comerciales. El fraude documental puede resultar en la apertura de cuentas financieras fraudulentas, solicitud de créditos a nombre del sujeto, y operaciones de lavado de activos que pueden implicar al sujeto en investigaciones penales.`,
        judicial: `La presencia de ${catResults.length} registro(s) judicial(es) indica información de carácter público vinculada a procesos legales del sujeto. Si bien los registros judiciales son información oficial y pública por naturaleza, su disponibilidad en línea en contextos de investigación OSINT amplía significativamente su alcance y potencial de daño. La información judicial descontextualizada puede ser utilizada para extorsión, discriminación laboral, perjuicio reputacional en redes sociales, y construcción de narrativas falsas contra el sujeto. Es fundamental verificar la exactitud y actualidad de estos registros con las fuentes oficiales.`,
      };
      const analysisText = surfaceAnalysis[cat] || `Se identificaron ${catResults.length} hallazgo(s) en la categoría ${catES(cat)} que contribuyen significativamente a la superficie de exposición digital del sujeto. La presencia de datos en esta categoría amplía los vectores de ataque disponibles para actores malintencionados y debe ser tratada con la debida seriedad.`;

      drawSubsectionHeader(doc, catES(cat));
      drawParagraph(doc, analysisText, { fontSize: 8, indent: 8 });
    }

    if (categoriesPresent.length === 0) {
      drawParagraph(doc, 'No se identificaron categorías de exposición significativas en las fuentes automatizadas consultadas. La superficie de exposición digital del sujeto parece limitada según las fuentes disponibles, aunque esto no descarta la existencia de exposición en fuentes cerradas o no monitoreadas por esta investigación. Se recomienda complementar con verificación manual en fuentes adicionales.', { fontSize: 8.5 });
    }

    // ════════════════════════════════════════
    //  EVALUACIÓN DE IMPACTO
    // ════════════════════════════════════════
    checkPage(doc, 80);
    doc.moveDown(0.3);
    drawSectionHeader(doc, 'EVALUACIÓN DE IMPACTO');

    drawParagraph(doc, 'La siguiente evaluación de impacto analiza en profundidad las consecuencias potenciales derivadas de los hallazgos identificados, evaluando cada dimensión de riesgo de forma independiente y considerando los efectos acumulativos de la exposición múltiple. Cada área de impacto incluye una valoración cualitativa basada en la evidencia recopilada y las mejores prácticas de la industria de seguridad informática.', { fontSize: 8.5 });

    // 1. Riesgo de Suplantación de Identidad — 3-4 sentences
    checkPage(doc, 45);
    drawSubsectionHeader(doc, 'Riesgo de Suplantación de Identidad');
    drawParagraph(doc, crit > 0
      ? `El nivel de riesgo de suplantación de identidad es CRÍTICO. La filtración de credenciales y datos personales detectados proporciona a actores malintencionados la combinación de información necesaria para hacerse pasar por el sujeto ante entidades financieras, plataformas digitales, y servicios gubernamentales con alta probabilidad de éxito. Con ${crit} hallazgo(s) crítico(s) que incluyen exposición de datos sensibles verificables, la probabilidad de que esta información ya haya sido utilizada con fines fraudulentos es considerablemente alta. Se recomienda solicitar de inmediato alertas de fraude en centrales de riesgo (DataCrédito, TransUnion, CIFIN), monitorear activamente cualquier actividad sospechosa en cuentas financieras, y considerar el congelamiento preventivo del reporte de crédito. La suplantación de identidad puede manifestarse meses o incluso años después de la filtración original, haciendo necesario un monitoreo sostenido en el tiempo.`
      : high > 0
      ? `El riesgo de suplantación de identidad es SIGNIFICATIVO. Los hallazgos de severidad alta indican que datos personales del sujeto están expuestos en múltiples fuentes, proporcionando suficiente información para construir un perfil de identidad convincente para suplantación. Si bien no se detectaron credenciales críticas filtradas directamente, la combinación de datos personales disponibles con técnicas de ingeniería social puede permitir a atacantes eludir mecanismos de verificación de identidad basados en conocimiento (preguntas de seguridad, verificación por SMS). Se recomienda fortalecer los mecanismos de autenticación en todas las cuentas críticas y monitorear periódicamente el reporte de crédito.`
      : `El riesgo de suplantación de identidad es MODERADO. La exposición detectada es limitada pero contribuye a un perfil digital que podría ser explotado si se combina con información adicional disponible en otras fuentes. Los datos expuestos, aunque insuficientes por sí solos para una suplantación completa, pueden servir como piezas de un rompecabezas que, combinadas con información de brechas futuras o fuentes no monitoreadas, permitan un ataque exitoso. Se recomienda mantener prácticas de seguridad proactivas y monitoreo periódico.`, { fontSize: 8, indent: 8 });

    // 2. Compromiso de Credenciales — 3-4 sentences
    checkPage(doc, 45);
    drawSubsectionHeader(doc, 'Compromiso de Credenciales');
    drawParagraph(doc, limitedResults.some(r => r.category === 'credential_breach' || r.category === 'password_exposure')
      ? `Se ha confirmado el compromiso de credenciales del sujeto mediante evidencia directa de filtración. La disponibilidad de combinaciones de usuario/contraseña en fuentes públicas representa un riesgo inmediato y verificable de acceso no autorizado a las cuentas del sujeto. Los atacantes pueden utilizar técnicas de credential stuffing para probar las credenciales comprometidas en cientos de servicios simultáneamente, aprovechando la práctica extendida de reutilizar contraseñas. Estudios de la industria indican que las credenciales filtradas dan acceso exitoso a entre 3 y 15 servicios adicionales cuando el usuario reutiliza contraseñas. Además, las credenciales comprometidas frecuentemente incluyen metadatos como direcciones IP, información del dispositivo, y fechas de acceso que pueden ser utilizados para ataques más sofisticados.`
      : `No se detectaron credenciales filtradas en las fuentes públicas consultadas. Sin embargo, esta ausencia de evidencia no constituye evidencia de ausencia: las credenciales del sujeto pueden haber sido comprometidas en brechas de seguridad no reportadas públicamente, en bases de datos privadas de la dark web, o en filtraciones que aún no han sido detectadas por los servicios de monitoreo. Se estima que el tiempo promedio entre una brecha de seguridad y su detección pública es de 287 días, durante los cuales las credenciales pueden ser explotadas activamente. Se recomienda implementar autenticación multifactor como medida de protección preventiva independientemente del resultado de esta investigación.`, { fontSize: 8, indent: 8 });

    // 3. Exposición de Datos Personales — 3-4 sentences
    checkPage(doc, 45);
    drawSubsectionHeader(doc, 'Exposición de Datos Personales');
    drawParagraph(doc, `La exposición de datos personales del sujeto ${data.fullName} en fuentes públicas y de riesgo tiene implicaciones directas y medibles en su privacidad, seguridad, y bienestar. La información expuesta — que puede incluir datos de contacto, información familiar, ubicaciones frecuentes, datos de identificación, y detalles profesionales — facilita ataques de ingeniería social altamente personalizados, phishing dirigido (spear phishing), y puede ser utilizada para extorsión, acoso, o vigilancia no deseada. La Ley 1581 de 2012 establece el derecho fundamental a la protección de datos personales en Colombia, y el sujeto tiene derecho a solicitar la eliminación de sus datos de bases de datos no autorizadas, el derecho a ser informado sobre el uso de sus datos, y el derecho a oponerse al tratamiento de los mismos. La Superintendencia de Industria y Comercio es la entidad competente para atender reclamaciones relacionadas con el tratamiento indebido de datos personales.`, { fontSize: 8, indent: 8 });

    // 4. Impacto Reputacional — 3-4 sentences
    checkPage(doc, 45);
    drawSubsectionHeader(doc, 'Impacto Reputacional y Profesional');
    drawParagraph(doc, `La presencia de información del sujeto en fuentes de riesgo, particularmente en la dark web, sitios de paste, o asociada a registros judiciales, puede tener un impacto negativo significativo en su reputación personal y profesional. Empleadores, socios comerciales, e instituciones financieras realizan frecuentemente verificaciones de antecedentes digitales como parte de sus procesos de due diligence, evaluación de riesgo crediticio, y selección de personal. La información encontrada, incluso si es incorrecta, descontextualizada, o corresponde a eventos resueltos, puede influir negativamente en decisiones de empleo, aprobación de créditos, adjudicación de contratos, o establecimiento de relaciones comerciales. En la era digital, la reputación online tiene un impacto directo en las oportunidades profesionales y personales, y la limpieza de información negativa de internet es un proceso complejo que puede tomar meses o años.`, { fontSize: 8, indent: 8 });

    // 5. Impacto Financiero — 3-4 sentences
    checkPage(doc, 45);
    drawSubsectionHeader(doc, 'Impacto Financiero Potencial');
    drawParagraph(doc, `El impacto financiero derivado de la exposición detectada puede ser sustancial y multifactorial. La suplantación de identidad puede resultar en apertura fraudulenta de cuentas bancarias, solicitudes de crédito no autorizadas, transacciones financieras ilícitas, y compras a nombre del sujeto que generan obligaciones financieras inexistentes. Adicionalmente, los costos de recuperación de identidad — incluyendo tiempo de gestión, honorarios legales, tarifas de servicios de monitoreo continuo, y posible pérdida de ingresos por tiempo dedicado a la resolución — pueden alcanzar cifras significativas según estudios de Javelin Strategy & Research. Se recomienda al sujeto congelar su reporte de crédito temporalmente ante las centrales de riesgo, monitorear activamente sus cuentas financieras con alertas de transacciones, y reportar de inmediato cualquier actividad sospechosa a las entidades financieras y a la policía cibernética de la DIJIN.`, { fontSize: 8, indent: 8 });

    // ════════════════════════════════════════
    //  CRONOLOGÍA DE EXPOSICIÓN
    // ════════════════════════════════════════
    checkPage(doc, 80);
    doc.moveDown(0.3);
    drawSectionHeader(doc, 'CRONOLOGÍA DE EXPOSICIÓN');

    drawParagraph(doc, 'La siguiente cronología estima las fechas y períodos aproximados en que las brechas y exposiciones detectadas pudieron haber ocurrido, basándose en la naturaleza de las fuentes consultadas, los patrones temporales de las brechas de seguridad conocidas, y los datos encontrados. Es importante entender que las fechas de exposición real pueden diferir significativamente de las fechas de detección pública, ya que existe una ventana temporal entre el compromiso inicial y su disponibilidad en fuentes abiertas.', { fontSize: 8.5 });

    // Timeline entries — enriched
    const timelineEntries: string[] = [];
    if (limitedResults.some(r => r.category === 'credential_breach' || r.category === 'password_exposure')) {
      timelineEntries.push('• Filtración de credenciales: Las brechas de credenciales detectadas corresponden típicamente a eventos de compromiso masivo que ocurrieron entre 1 y 5 años atrás. Los datos suelen circular inicialmente en foros cerrados de la dark web durante meses antes de aparecer en fuentes públicas. El tiempo promedio entre una brecha y su detección pública es de 287 días según el informe IBM Cost of a Data Breach 2024.');
    }
    if (limitedResults.some(r => r.category === 'data_broker')) {
      timelineEntries.push('• Registro en brokers de datos: La presencia en bases de datos de brokers indica que la información del sujeto ha sido recopilada progresivamente durante los últimos 2 a 10 años mediante múltiples fuentes de datos públicos, transaccionales, y de terceros. Los brokers actualizan sus bases de datos continuamente, por lo que la exposición es acumulativa y persistente.');
    }
    if (limitedResults.some(r => r.category === 'dark_web_mention')) {
      timelineEntries.push('• Menciones en Dark Web: Los datos detectados en la dark web generalmente aparecen semanas o meses después de la brecha original, una vez que los atacantes han procesado y validado la información. La presencia actual indica exposición activa y potencialmente en curso, ya que los datos en la dark web rara vez son eliminados y pueden ser redistribuidos indefinidamente.');
    }
    if (limitedResults.some(r => r.category === 'social_media')) {
      timelineEntries.push('• Exposición en redes sociales: La información de redes sociales se acumula de forma continua durante toda la vida activa del usuario en cada plataforma. La exposición actual refleja años de actividad digital y publicaciones que pueden contener datos personales, ubicaciones, relaciones, y patrones de comportamiento explotables.');
    }
    if (limitedResults.some(r => r.category === 'paste_site')) {
      timelineEntries.push('• Publicación en sitios de paste: Las filtraciones en sitios de paste típicamente siguen a brechas masivas recientes, con datos publicados dentro de las primeras 48-72 horas posteriores al compromiso. Los sitios de paste son utilizados como canales de distribución temporal, pero los datos son rápidamente capturados y archivados por actores malintencionados antes de su eliminación.');
    }
    if (limitedResults.some(r => r.category === 'document_exposure')) {
      timelineEntries.push('• Exposición documental: Los documentos expuestos suelen aparecer como resultado de filtraciones de bases de datos gubernamentales o empresariales, con fechas que pueden remontarse varios años. La digitalización creciente de trámites gubernamentales ha amplificado el riesgo de exposición documental en fuentes públicas.');
    }
    if (limitedResults.some(r => r.category === 'judicial')) {
      timelineEntries.push('• Registros judiciales: Los registros judiciales públicos son permanentes y reflejan procesos que pueden tener cualquier antigüedad. Su disponibilidad en línea es una consecuencia de la política de transparencia judicial y la digitalización de archivos judiciales, y permanecerán accesibles indefinidamente.');
    }
    if (timelineEntries.length === 0) {
      timelineEntries.push('• No se identificaron eventos de exposición específicos en las fuentes consultadas. La ausencia de resultados no implica ausencia de exposición previa, ya que muchas brechas de seguridad permanecen sin detectar durante años antes de ser descubiertas y reportadas públicamente.');
    }
    timelineEntries.push(`• Fecha de la investigación: ${today}. Los datos pueden haber cambiado desde su última actualización en las fuentes consultadas. Se recomienda realizar verificaciones periódicas para mantener actualizada la evaluación de riesgo.`);
    for (const entry of timelineEntries) {
      checkPage(doc, 22);
      drawParagraph(doc, entry, { fontSize: 8.5, indent: 8 });
    }

    // ════════════════════════════════════════
    //  MATRIZ DE RIESGO
    // ════════════════════════════════════════
    checkPage(doc, 140);
    doc.moveDown(0.3);
    drawSectionHeader(doc, 'MATRIZ DE RIESGO');

    drawParagraph(doc, 'La siguiente matriz visualiza la relación entre la probabilidad de explotación y el impacto potencial de los hallazgos identificados. Las celdas marcadas con ◆ indican la posición de los hallazgos del sujeto, permitiendo una evaluación visual inmediata del nivel de riesgo global:', { fontSize: 8.5 });

    doc.moveDown(0.3);
    const matrixX = M.left + 50;
    const matrixY = doc.y;
    const cellW = 140;
    const cellH = 28;

    // Y-axis label
    setFont(doc, true).fillColor(C.navy).fontSize(7)
      .text('PROBABILIDAD', M.left, matrixY + cellH * 1, { width: 50, align: 'center' });

    // Draw grid
    const likelihoodLabels = ['Alta', 'Media', 'Baja'];
    const impactLabels = ['Crítico', 'Significativo', 'Limitado'];
    const matrixColors: string[][] = [
      ['#c0392b', '#e67e22', '#f1c40f'],
      ['#e67e22', '#f1c40f', '#27ae60'],
      ['#f1c40f', '#27ae60', '#27ae60'],
    ];

    // X-axis labels
    for (let j = 0; j < 3; j++) {
      const cx = matrixX + j * cellW;
      doc.fillColor(C.tableHeader).rect(cx, matrixY, cellW, 14).fill();
      setFont(doc, true).fillColor(C.white).fontSize(7)
        .text(impactLabels[j], cx + 2, matrixY + 3, { width: cellW - 4, align: 'center' });
    }
    setFont(doc, true).fillColor(C.navy).fontSize(7)
      .text('IMPACTO →', matrixX, matrixY - 12, { width: cellW * 3, align: 'center' });

    const matrixDataY = matrixY + 14;
    for (let i = 0; i < 3; i++) {
      const ry = matrixDataY + i * cellH;
      doc.fillColor(C.tableHeader).rect(matrixX - 50, ry, 50, cellH).fill();
      setFont(doc, true).fillColor(C.white).fontSize(7)
        .text(likelihoodLabels[i], matrixX - 48, ry + 10, { width: 46, align: 'center' });

      for (let j = 0; j < 3; j++) {
        const cx = matrixX + j * cellW;
        doc.fillColor(matrixColors[i][j]).rect(cx, ry, cellW, cellH).fill();
        doc.strokeColor('#ffffff').lineWidth(0.5).rect(cx, ry, cellW, cellH).stroke();

        let markerText = '';
        if (i === 0 && j === 0 && crit > 0) markerText = `◆ ${crit} Crítico(s)`;
        else if (i === 0 && j === 1 && high > 0) markerText = `◆ ${high} Alto(s)`;
        else if (i === 1 && j === 1 && med > 0) markerText = `◆ ${med} Medio(s)`;
        else if (i === 1 && j === 2 && low > 0) markerText = `◆ ${low} Bajo(s)`;
        else if (i === 2 && j === 2 && infoCount > 0) markerText = `◆ ${infoCount} Info`;

        const textColor = (i === 0 && j === 0) || (i === 0 && j === 1) || (i === 1 && j === 0) ? C.white : '#2c3e50';
        setFont(doc, markerText ? true : false).fillColor(markerText ? textColor : (textColor + '40')).fontSize(7)
          .text(markerText || '—', cx + 2, ry + 10, { width: cellW - 4, align: 'center' });
      }
    }
    doc.y = matrixDataY + 3 * cellH + 15;

    // ════════════════════════════════════════
    //  RECOMENDACIONES
    // ════════════════════════════════════════
    checkPage(doc, 80);
    doc.moveDown(0.3);
    drawSectionHeader(doc, 'RECOMENDACIONES');

    const recCategories = new Map<string, { cat: string; count: number; rec: string }>();
    for (const r of limitedResults) {
      if (r.severity === 'info') continue;
      const cat = r.category;
      if (!recCategories.has(cat)) {
        recCategories.set(cat, { cat, count: 0, rec: recFor(cat) });
      }
      recCategories.get(cat)!.count++;
    }

    // General recommendations — enriched
    drawSubsectionHeader(doc, 'Recomendaciones Generales');
    const generalRecs: string[] = [];
    if (crit > 0) {
      generalRecs.push('• Cambiar de inmediato TODAS las contraseñas asociadas a las cuentas comprometidas, utilizando contraseñas únicas y complejas de al menos 16 caracteres generadas por un gestor de contraseñas.');
      generalRecs.push('• Habilitar autenticación de dos factores (2FA/MFA) en todas las cuentas críticas, preferiblemente utilizando llaves de seguridad hardware (FIDO2) o aplicaciones autenticadoras antes que SMS.');
      generalRecs.push('• Solicitar la eliminación de datos personales en todos los brokers de información identificados, ejerciendo el derecho de Habeas Data conforme a la Ley 1581/2012.');
      generalRecs.push('• Implementar monitoreo continuo de exposiciones futuras mediante servicios de inteligencia de amenazas y alertas automatizadas de filtración de credenciales.');
      generalRecs.push('• Congelar el reporte de crédito temporalmente ante las centrales de riesgo (DataCrédito, TransUnion, CIFIN) para prevenir apertura fraudulenta de cuentas.');
    } else if (high > 0) {
      generalRecs.push('• Revisar y actualizar contraseñas en todas las plataformas afectadas, implementando políticas de contraseñas únicas por servicio.');
      generalRecs.push('• Habilitar autenticación de dos factores (2FA/MFA) en todas las cuentas sensibles, priorizando servicios financieros y de comunicación.');
      generalRecs.push('• Ejercer derecho de Habeas Data conforme a la Ley 1581/2012, solicitando la eliminación de datos personales expuestos en fuentes no autorizadas.');
      generalRecs.push('• Establecer un régimen de monitoreo periódico de la huella digital para detectar nuevas exposiciones de forma temprana.');
    } else {
      generalRecs.push('• Mantener prácticas rigurosas de higiene digital: contraseñas únicas, MFA habilitado, y revisión periódica de configuraciones de privacidad.');
      generalRecs.push('• Verificar la exposición digital periódicamente mediante herramientas automatizadas y verificaciones manuales.');
      generalRecs.push('• Considerar la implementación de servicios de monitoreo proactivo de la huella digital y alertas de filtración de credenciales.');
      generalRecs.push('• Revisar y limitar la información personal compartida en redes sociales y servicios digitales.');
    }
    for (const rec of generalRecs) {
      checkPage(doc, 16);
      drawParagraph(doc, rec, { fontSize: 8.5, indent: 8 });
    }

    // Category-specific recommendations
    if (recCategories.size > 0) {
      doc.moveDown(0.15);
      drawSubsectionHeader(doc, 'Recomendaciones por Categoría');
      for (const [, item] of recCategories) {
        checkPage(doc, 25);
        setFont(doc, true).fillColor(C.accent).fontSize(8.5)
          .text(`${catES(item.cat)} (${item.count} hallazgo${item.count > 1 ? 's' : ''})`, M.left, doc.y, { width: CW });
        doc.moveDown(0.05);
        drawParagraph(doc, `• ${item.rec}`, { fontSize: 8.5, indent: 8 });
      }
    }

    // Manual verification
    doc.moveDown(0.15);
    checkPage(doc, 35);
    drawSubsectionHeader(doc, 'Verificación Manual Recomendada');
    const manualRecs = [
      '• Verificar registros en RUES (Registro Único Empresarial y Social) para detectar constitución fraudulenta de sociedades a nombre del sujeto.',
      '• Consultar la Rama Judicial para antecedentes penales, procesos activos, y medidas cautelares que puedan afectar al sujeto.',
      '• Revisar listas restrictivas: OFAC (Office of Foreign Assets Control), ONU, Lista Clinton, Procuraduría General, Contraloría General.',
      '• Validar información en Superintendencia de Sociedades y Superintendencia Financiera para detectar procesos concursales o reportes negativos.',
      '• Consultar el REGISTRADURÍA para verificar la vigencia y estado del documento de identidad del sujeto.',
    ];
    for (const rec of manualRecs) {
      checkPage(doc, 16);
      drawParagraph(doc, rec, { fontSize: 8.5, indent: 8 });
    }

    // ════════════════════════════════════════
    //  INDICADORES DE RIESGO
    // ════════════════════════════════════════
    checkPage(doc, 80);
    doc.moveDown(0.3);
    drawSectionHeader(doc, 'INDICADORES DE RIESGO');

    // Risk score display
    checkPage(doc, 40);
    const riskBoxY = doc.y;
    doc.fillColor(riskColor).roundedRect(M.left, riskBoxY, CW, 30, 4).fill();
    setFont(doc, true).fillColor(C.white).fontSize(14)
      .text(`Nivel de Riesgo: ${riskLevel}  —  Puntaje: ${riskScore}/100`, M.left + 10, riskBoxY + 8, { width: CW - 20, align: 'center' });
    doc.y = riskBoxY + 38;

    // Indicators table
    doc.moveDown(0.2);
    drawSubsectionHeader(doc, 'Desglose por Categoría de Riesgo');
    checkPage(doc, 25);
    let y = doc.y;
    const colW = [CW * 0.45, CW * 0.20, CW * 0.35];
    doc.fillColor(C.tableHeader).rect(M.left, y, CW, 14).fill();
    let hx = M.left;
    const headers = ['Indicador', 'Valor', 'Estado'];
    for (let i = 0; i < headers.length; i++) {
      setFont(doc, true).fillColor(C.white).fontSize(7.5)
        .text(headers[i], hx + 4, y + 3, { width: colW[i] - 8 });
      hx += colW[i];
    }
    doc.y = y + 15;

    const indicators: [string, string, string][] = [
      ['Puntaje de Riesgo Global', `${riskScore}/100`, riskLevel],
      ['Hallazgos Críticos', String(crit), crit > 0 ? 'REQUIERE ACCIÓN INMEDIATA' : 'SIN ALERTA'],
      ['Hallazgos de Severidad Alta', String(high), high > 0 ? 'ATENCIÓN PRIORITARIA' : 'SIN ALERTA'],
      ['Hallazgos de Severidad Media', String(med), med > 0 ? 'SEGUIMIENTO REQUERIDO' : 'SIN ALERTA'],
      ['Hallazgos de Severidad Baja', String(low), low > 0 ? 'MONITOREO PERIÓDICO' : 'SIN ALERTA'],
      ['Fuentes Consultadas', String(uniqueSources.length), `${realResults.length} resultados totales`],
      ['Nivel de Certeza', crit > 0 ? 'ALTO' : high > 0 ? 'MEDIO-ALTO' : 'MEDIO', crit > 0 ? 'EVIDENCIA DIRECTA' : 'REQUIERE VERIFICACIÓN'],
    ];

    for (let i = 0; i < indicators.length; i++) {
      checkPage(doc, 14);
      y = doc.y;
      if (i % 2 === 0) doc.fillColor(C.tableStripe).rect(M.left, y, CW, 13).fill();
      let cx = M.left;
      for (let j = 0; j < indicators[i].length; j++) {
        const val = indicators[i][j];
        const isState = j === 2;
        const stateColor = isState && val.includes('REQUIERE') ? C.red
          : isState && val.includes('ATENCIÓN') ? C.orange
          : C.text;
        setFont(doc, isState).fillColor(stateColor).fontSize(7)
          .text(val, cx + 4, y + 3, { width: colW[j] - 8 });
        cx += colW[j];
      }
      doc.y = y + 13;
    }
    doc.moveDown(0.5);

    // Risk factors narrative
    drawSubsectionHeader(doc, 'Factores de Riesgo Identificados');
    const riskFactors: string[] = [];
    if (crit > 0) riskFactors.push(`• Exposición crítica: Se detectaron ${crit} hallazgo(s) con severidad crítica que indican filtración de credenciales o datos sensibles con riesgo inmediato de explotación activa. La intervención debe ser inmediata e integral.`);
    if (high > 0) riskFactors.push(`• Exposición significativa: ${high} hallazgo(s) de severidad alta indican presencia del sujeto en fuentes de riesgo que requieren atención prioritaria y medidas correctivas aceleradas.`);
    if (med > 0) riskFactors.push(`• Exposición moderada: ${med} hallazgo(s) de severidad media sugieren presencia digital observable que, si bien no es crítica, contribuye a la superficie de ataque y debe ser gestionada proactivamente.`);
    if (low > 0) riskFactors.push(`• Exposición baja: ${low} hallazgo(s) de severidad baja con impacto limitado pero que deben ser monitoreados para prevenir escalada.`);
    if (riskFactors.length === 0) riskFactors.push('• No se identificaron factores de riesgo significativos en las fuentes consultadas. Se recomienda mantener vigilancia periódica.');
    riskFactors.push(`• Superficie de exposición: ${uniqueSources.length} fuente${uniqueSources.length !== 1 ? 's' : ''} consultada${uniqueSources.length !== 1 ? 's' : ''} con ${realResults.length} resultado${realResults.length !== 1 ? 's' : ''}. La diversidad de fuentes con hallazgos positivos aumenta la confiabilidad de la evaluación.`);

    for (const factor of riskFactors) {
      checkPage(doc, 18);
      drawParagraph(doc, factor, { fontSize: 8.5 });
    }

    // ════════════════════════════════════════
    //  FUENTES Y ANEXOS
    // ════════════════════════════════════════
    checkPage(doc, 80);
    doc.moveDown(0.3);
    drawSectionHeader(doc, 'FUENTES Y ANEXOS');

    drawSubsectionHeader(doc, 'Fuentes Consultadas');
    drawParagraph(doc, 'Se consultaron múltiples fuentes de inteligencia de fuentes abiertas (OSINT) durante esta investigación. Los resultados fueron obtenidos a través de sistemas automatizados de recolección y análisis de datos públicos. Las fuentes han sido anonimizadas para proteger la metodología de investigación, asignando identificadores numéricos secuenciales a cada fuente de datos.', { fontSize: 8.5 });

    if (uniqueSources.length > 0) {
      doc.moveDown(0.1);
      checkPage(doc, 25);
      let y = doc.y;
      doc.fillColor(C.tableHeader).rect(M.left, y, CW, 14).fill();
      setFont(doc, true).fillColor(C.white).fontSize(7.5)
        .text('Fuente', M.left + 4, y + 3, { width: CW * 0.75 })
        .text('Hallazgos', M.left + CW * 0.75 + 4, y + 3, { width: CW * 0.25 - 8 });
      doc.y = y + 15;

      for (let i = 0; i < uniqueSources.length; i++) {
        checkPage(doc, 12);
        const sy = doc.y;
        if (i % 2 === 0) doc.fillColor(C.tableStripe).rect(M.left, sy, CW, 11).fill();
        const count = anonymizedResults.filter(r => r.source === uniqueSources[i]).length;
        setFont(doc, false).fillColor(C.text).fontSize(7.5)
          .text(uniqueSources[i], M.left + 4, sy + 2, { width: CW * 0.75 });
        setFont(doc, true).fillColor(C.navy).fontSize(7.5)
          .text(`${count} hallazgo(s)`, M.left + CW * 0.75 + 4, sy + 2, { width: CW * 0.25 - 8 });
        doc.y = sy + 11;
      }
    }

    // Legal framework section
    doc.moveDown(0.2);
    checkPage(doc, 60);
    drawSubsectionHeader(doc, 'Marco Legal');
    drawParagraph(doc, 'Este informe ha sido generado mediante técnicas OSINT (Open Source Intelligence) conforme al marco legal colombiano vigente. La información proviene exclusivamente de fuentes públicas accesibles y no constituye investigación oficial ni prueba judicial sin validación por las autoridades competentes. A continuación se detallan las normas aplicables:', { fontSize: 8.5 });
    drawParagraph(doc, '• Ley 1581 de 2012 (Ley de Protección de Datos Personales): Establece el derecho fundamental al Habeas Data y regula el tratamiento de datos personales. El sujeto tiene derecho a conocer, actualizar, rectificar, y solicitar la eliminación de sus datos personales en bases de datos no autorizadas. La Superintendencia de Industria y Comercio es la entidad competente para atender reclamaciones.', { fontSize: 8, indent: 8, color: C.textLight });
    drawParagraph(doc, '• Ley 1273 de 2009 (Delitos Informáticos): Tipifica como delito la obtención, uso, y divulgación no autorizada de información contenida en bases de datos, sistemas de información, o redes de comunicación. Las penas pueden alcanzar hasta 8 años de prisión para los responsables de accesos no autorizados o interceptación de datos.', { fontSize: 8, indent: 8, color: C.textLight });
    drawParagraph(doc, '• Constitución Política de Colombia, Artículo 15: Consagra el derecho a la intimidad personal y familiar, y establece que la correspondencia y demás formas de comunicación privada son inviolables. Solo pueden ser interceptadas o registradas mediante orden judicial.', { fontSize: 8, indent: 8, color: C.textLight });

    // Chain of custody / evidence integrity
    checkPage(doc, 40);
    drawSubsectionHeader(doc, 'Cadena de Custodia e Integridad de Evidencia');
    drawParagraph(doc, 'Los datos recopilados durante esta investigación fueron obtenidos mediante métodos pasivos de recolección OSINT, sin alteración de las fuentes originales. Los resultados incluyen referencias a las fuentes consultadas para permitir la verificación independiente de los hallazgos. La integridad de la evidencia digital se mantiene mediante el registro de timestamps, identificadores únicos de fuente, y la preservación de la cadena de custodia documental. Este informe constituye un documento técnico de inteligencia y no reemplaza la validación forense digital requerida en procesos judiciales.', { fontSize: 8, color: C.textLight });

    // Signature section
    checkPage(doc, 65);
    doc.moveDown(0.2);
    doc.strokeColor(C.tableBorder).lineWidth(0.5)
      .moveTo(M.left, doc.y).lineTo(PAGE_W - M.right, doc.y).stroke();
    doc.moveDown(0.15);

    setFont(doc, false).fillColor(C.textLight).fontSize(7.5)
      .text('Elaborado por:', M.left, doc.y, { width: CW * 0.5, continued: false });
    setFont(doc, true).fillColor(C.text).fontSize(8)
      .text('OSINT Data Scanner', M.left, doc.y, { width: CW * 0.5 });
    doc.moveDown(0.1);

    setFont(doc, false).fillColor(C.textLight).fontSize(7.5)
      .text('Código del informe:', M.left, doc.y, { width: CW * 0.5, continued: false });
    setFont(doc, true).fillColor(C.text).fontSize(8)
      .text(reportId, M.left, doc.y, { width: CW * 0.5 });
    doc.moveDown(0.4);

    const sigY = doc.y;
    const sigW = (CW - 40) / 2;
    doc.strokeColor(C.lightGray).lineWidth(0.5)
      .moveTo(M.left, sigY + 25).lineTo(M.left + sigW, sigY + 25).stroke()
      .moveTo(M.left + sigW + 40, sigY + 25).lineTo(PAGE_W - M.right, sigY + 25).stroke();
    setFont(doc, false).fillColor(C.textLight).fontSize(7)
      .text('Revisado por', M.left, sigY + 28, { width: sigW, align: 'center' })
      .text('Aprobado por', M.left + sigW + 40, sigY + 28, { width: sigW, align: 'center' });

    // ════════════════════════════════════════
    //  FOOTERS (all non-cover pages) — FIXED: lineBreak: false
    // ════════════════════════════════════════
    const pages = doc.bufferedPageRange().count;
    for (let i = 0; i < pages; i++) {
      doc.switchToPage(i);
      if (i === 0) continue;
      doc.strokeColor(C.lightGray).lineWidth(0.3)
        .moveTo(M.left, PAGE_H - 30).lineTo(PAGE_W - M.right, PAGE_H - 30).stroke();
      setFont(doc, false).fillColor(C.gray).fontSize(6)
        .text(`CONFIDENCIAL  |  ${reportId}  |  Página ${i} de ${pages - 1}`, M.left, PAGE_H - 24, { width: CW, align: 'center', lineBreak: false });
    }

    doc.end();
  });
}

// ════════════════════════════════════════════════════════════════
//  COMPATIBILITY: generateIndividualPDF
// ════════════════════════════════════════════════════════════════

interface ScanData {
  id: string;
  fullName: string;
  cedula?: string | null;
  email?: string | null;
  phone?: string | null;
  createdAt: string;
}

export async function generateIndividualPDF(
  scan: ScanData,
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

// ════════════════════════════════════════════════════════════════
//  FILE NAME HELPERS
// ════════════════════════════════════════════════════════════════

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
//  SOCIAL MEDIA PDF REPORT — ENHANCED with methodology, risk profile, activity indicators
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

    const { summary, results: scanResults } = data;
    const crit = summary.critical;
    const high = summary.high;
    const med = summary.medium;
    const low = summary.low;
    const infoCount = summary.info;
    const riskScore = Math.min(100, summary.profilesFound * 12 + crit * 25 + high * 12 + med * 5 + low * 2);
    const riskLevel = riskScore >= 70 ? 'CRÍTICO' : riskScore >= 40 ? 'ALTO' : riskScore >= 15 ? 'MODERADO' : 'BAJO';
    const riskColor = riskScore >= 70 ? C.red : riskScore >= 40 ? C.orange : riskScore >= 15 ? C.yellow : C.green;

    // ── COVER PAGE ──
    doc.addPage();
    drawProfessionalCover(doc, {
      title: 'INFORME DE INVESTIGACIÓN',
      subtitle: 'Análisis de Redes Sociales',
      fullName: data.searchQuery,
      reportId,
      riskScore,
      riskLevel,
      riskColor,
      today,
    });

    // ── PAGE 2: RESUMEN EJECUTIVO ──
    doc.addPage();
    drawSectionHeader(doc, 'RESUMEN EJECUTIVO — REDES SOCIALES');

    checkPage(doc, 60);
    const boxY = doc.y;
    const boxH = 52;
    doc.fillColor(riskColor).roundedRect(M.left, boxY, 95, boxH, 4).fill();
    setFont(doc, true).fillColor(C.white).fontSize(28)
      .text(`${riskScore}`, M.left + 5, boxY + 3, { width: 85, align: 'center' });
    setFont(doc, true).fillColor(C.white).fontSize(10)
      .text(`/100`, M.left + 5, boxY + 32, { width: 85, align: 'center' });

    doc.fillColor(C.bg).roundedRect(M.left + 95, boxY, CW - 95, boxH, 4).fill();
    const infoX = M.left + 105;
    const modeLabel = data.searchMode === 'nickname' ? 'NickName' : data.searchMode === 'email' ? 'Correo' : 'Nombre';
    setFont(doc, true).fillColor(C.navy).fontSize(11)
      .text(`Consulta: ${data.searchQuery}`, infoX, boxY + 6, { width: CW - 120 });
    setFont(doc, false).fillColor(C.textLight).fontSize(8)
      .text(`Modo: ${modeLabel}  |  ${summary.profilesFound} perfiles  |  ${summary.totalFindings} hallazgos  |  ${scanResults.length} plataformas`, infoX, boxY + 22, { width: CW - 120 });

    const sevY = boxY + 36;
    let sevX = infoX;
    const sevItems: [string, number, string][] = [
      ['Crítico', crit, C.red],
      ['Alto', high, C.orange],
      ['Medio', med, '#b7950b'],
      ['Bajo', low, C.blue],
      ['Info', infoCount, C.gray],
    ];
    for (const [label, count, color] of sevItems) {
      if (count === 0) continue;
      doc.fillColor(color).roundedRect(sevX, sevY, 48, 12, 2).fill();
      setFont(doc, true).fillColor(C.white).fontSize(7)
        .text(`${count} ${label}`, sevX + 3, sevY + 2.5, { width: 42, align: 'center', lineBreak: false });
      sevX += 52;
    }
    doc.y = boxY + boxH + 12;

    // Executive narrative — enriched
    const execNarrative = crit > 0
      ? `La investigación en redes sociales identificó ${crit} hallazgo(s) crítico(s) y ${summary.profilesFound} perfil(es) asociados al sujeto de investigación. La exposición en plataformas sociales representa un riesgo significativo para la seguridad digital del sujeto, ya que la información disponible públicamente puede ser utilizada para ataques de ingeniería social, suplantación de identidad, y vigilancia no autorizada. Se recomienda revisar y restringir inmediatamente la configuración de privacidad en todas las cuentas detectadas. El nivel de riesgo calculado es ${riskLevel} con un puntaje de ${riskScore}/100.`
      : high > 0
      ? `La investigación identificó ${high} hallazgo(s) de severidad alta en redes sociales. Se detectaron ${summary.profilesFound} perfil(es) que requieren atención prioritaria y medidas de protección digital inmediatas. La combinación de datos personales disponibles en redes sociales con información de otras fuentes amplifica significativamente la superficie de ataque del sujeto. El nivel de riesgo calculado es ${riskLevel} con un puntaje de ${riskScore}/100.`
      : summary.profilesFound > 0
      ? `La investigación detectó ${summary.profilesFound} perfil(es) en redes sociales. Los hallazgos indican cierta exposición digital que requiere medidas preventivas y monitoreo periódico. La presencia en múltiples plataformas facilita la correlación de datos y la construcción de perfiles detallados del sujeto. El nivel de riesgo calculado es ${riskLevel} con un puntaje de ${riskScore}/100.`
      : `No se identificaron perfiles o hallazgos significativos en las plataformas consultadas. El nivel de riesgo calculado es ${riskLevel} con un puntaje de ${riskScore}/100. Sin embargo, la ausencia de resultados no descarta la existencia de perfiles con configuraciones de privacidad restrictivas o bajo identificadores no consultados.`;
    drawParagraph(doc, execNarrative, { fontSize: 8.5 });

    // ── METODOLOGÍA ──
    checkPage(doc, 60);
    doc.moveDown(0.15);
    drawSectionHeader(doc, 'METODOLOGÍA');

    drawParagraph(doc, 'La presente investigación fue realizada aplicando las siguientes técnicas y procedimientos de inteligencia de fuentes abiertas (OSINT), sin revelar herramientas o métodos específicos que puedan comprometer futuras investigaciones:', { fontSize: 8.5 });

    const methodology = [
      '• Verificación directa de perfiles mediante consulta de plataformas públicas de redes sociales utilizando identificadores proporcionados por el solicitante.',
      '• Análisis de huella digital en redes sociales mediante correlación de identificadores (nombre, nickname, correo electrónico) a través de múltiples plataformas.',
      '• Correlación de datos entre plataformas para determinar consistencia de identidad digital y evaluar la posibilidad de suplantación o confusión de identidad.',
      '• Evaluación de exposición de información personal disponible públicamente en perfiles detectados, incluyendo datos de contacto, ubicación, relaciones, y actividad.',
      '• Clasificación de severidad basada en el tipo de dato expuesto, su accesibilidad pública, y el impacto potencial de su explotación por actores malintencionados.',
    ];
    for (const item of methodology) {
      checkPage(doc, 14);
      drawParagraph(doc, item, { fontSize: 8.5, indent: 8 });
    }

    // ── PERFIL DE RIESGO DIGITAL ──
    checkPage(doc, 80);
    doc.moveDown(0.15);
    drawSectionHeader(doc, 'PERFIL DE RIESGO DIGITAL');

    const verifiedCount = scanResults.filter(r => r.profileVerified).length;
    const foundCount = scanResults.filter(r => r.profileFound).length;
    const sameUsername = data.searchMode === 'nickname'
      ? scanResults.filter(r => r.profileFound && r.username).length
      : 0;

    checkPage(doc, 25);
    let tY = doc.y;
    doc.fillColor(C.tableHeader).rect(M.left, tY, CW, 14).fill();
    setFont(doc, true).fillColor(C.white).fontSize(7.5)
      .text('Indicador', M.left + 4, tY + 3, { width: CW * 0.45 })
      .text('Valor', M.left + CW * 0.45 + 4, tY + 3, { width: CW * 0.25 })
      .text('Evaluación', M.left + CW * 0.7 + 4, tY + 3, { width: CW * 0.3 - 8 });
    tY += 15;

    const nivelExposicion = riskScore >= 70 ? 'Alto' : riskScore >= 40 ? 'Medio' : 'Bajo';
    const superficieAtaque = String(foundCount);
    const correlacionPlataformas = sameUsername >= 3 ? 'Alta' : sameUsername >= 1 ? 'Media' : 'Baja';

    const riskProfileRows: [string, string, string][] = [
      ['Nivel de Exposición', nivelExposicion, riskScore >= 70 ? 'RIESGO ELEVADO' : riskScore >= 40 ? 'PRECAUCIÓN' : 'ACEPTABLE'],
      ['Superficie de Ataque', `${superficieAtaque} plataforma${foundCount !== 1 ? 's' : ''} con perfil`, foundCount >= 5 ? 'AMPLIA' : foundCount >= 2 ? 'MODERADA' : 'LIMITADA'],
      ['Verificabilidad', `${verifiedCount} perfil${verifiedCount !== 1 ? 'es' : ''} verificado${verifiedCount !== 1 ? 's' : ''}`, verifiedCount >= 3 ? 'ALTA VULNERABILIDAD' : 'VERIFICADO'],
      ['Correlación entre Plataformas', correlacionPlataformas, sameUsername >= 3 ? 'IDENTIDAD COMPARTIDA' : 'SIN CORRELACIÓN SIGNIFICATIVA'],
      ['Puntaje de Riesgo Global', `${riskScore}/100`, riskLevel],
    ];

    for (let i = 0; i < riskProfileRows.length; i++) {
      checkPage(doc, 14);
      const rY = doc.y;
      if (i % 2 === 0) doc.fillColor(C.tableStripe).rect(M.left, rY, CW, 13).fill();
      const row = riskProfileRows[i];
      const evalColor = row[2].includes('RIESGO') || row[2].includes('VULNERabilidad') || row[2].includes('COMPARTIDA') ? C.red
        : row[2].includes('PRECAUCIÓN') || row[2].includes('MODERADA') || row[2].includes('AMPLIA') ? C.orange
        : C.text;
      setFont(doc, false).fillColor(C.text).fontSize(7)
        .text(row[0], M.left + 4, rY + 3, { width: CW * 0.45 - 8 });
      setFont(doc, true).fillColor(C.navy).fontSize(7)
        .text(row[1], M.left + CW * 0.45 + 4, rY + 3, { width: CW * 0.25 - 8 });
      setFont(doc, true).fillColor(evalColor).fontSize(7)
        .text(row[2], M.left + CW * 0.7 + 4, rY + 3, { width: CW * 0.3 - 8 });
      doc.y = rY + 13;
    }
    doc.moveDown(0.15);

    // ── INDICADORES DE ACTIVIDAD ──
    checkPage(doc, 60);
    doc.moveDown(0.15);
    drawSectionHeader(doc, 'INDICADORES DE ACTIVIDAD');

    const verifiedPlatforms = scanResults.filter(r => r.profileFound && r.profileVerified);
    const foundPlatforms = scanResults.filter(r => r.profileFound && !r.profileVerified);
    const mentionPlatforms = scanResults.filter(r => !r.profileFound && r.findings.length > 0);
    const noResultPlatforms = scanResults.filter(r => !r.profileFound && r.findings.length === 0);

    checkPage(doc, 14);
    setFont(doc, true).fillColor(C.green).fontSize(8)
      .text(`Perfiles Verificados: ${verifiedPlatforms.length}`, M.left, doc.y, { width: CW });
    doc.moveDown(0.05);
    if (verifiedPlatforms.length > 0) {
      setFont(doc, false).fillColor(C.text).fontSize(7.5)
        .text(verifiedPlatforms.map(r => r.platform).join(', '), M.left + 12, doc.y, { width: CW - 12 });
      doc.moveDown(0.1);
    }

    checkPage(doc, 14);
    setFont(doc, true).fillColor(C.navy).fontSize(8)
      .text(`Perfiles Encontrados (sin verificar): ${foundPlatforms.length}`, M.left, doc.y, { width: CW });
    doc.moveDown(0.05);
    if (foundPlatforms.length > 0) {
      setFont(doc, false).fillColor(C.text).fontSize(7.5)
        .text(foundPlatforms.map(r => r.platform).join(', '), M.left + 12, doc.y, { width: CW - 12 });
      doc.moveDown(0.1);
    }

    checkPage(doc, 14);
    setFont(doc, true).fillColor(C.orange).fontSize(8)
      .text(`Menciones sin Perfil: ${mentionPlatforms.length}`, M.left, doc.y, { width: CW });
    doc.moveDown(0.05);
    if (mentionPlatforms.length > 0) {
      setFont(doc, false).fillColor(C.text).fontSize(7.5)
        .text(mentionPlatforms.map(r => r.platform).join(', '), M.left + 12, doc.y, { width: CW - 12 });
      doc.moveDown(0.1);
    }

    checkPage(doc, 14);
    setFont(doc, true).fillColor(C.gray).fontSize(8)
      .text(`Sin Resultados: ${noResultPlatforms.length}`, M.left, doc.y, { width: CW });
    doc.moveDown(0.05);
    if (noResultPlatforms.length > 0) {
      setFont(doc, false).fillColor(C.textLight).fontSize(7.5)
        .text(noResultPlatforms.map(r => r.platform).join(', '), M.left + 12, doc.y, { width: CW - 12 });
      doc.moveDown(0.1);
    }

    // ── RESULTADOS POR PLATAFORMA ──
    checkPage(doc, 50);
    doc.moveDown(0.15);
    drawSectionHeader(doc, 'RESULTADOS POR PLATAFORMA');

    let platformNum = 0;
    for (const result of scanResults) {
      platformNum++;
      checkPage(doc, 55);

      const cardY = doc.y;
      const headerColor = result.profileFound ? '#1b4332' : result.findings.length > 0 ? '#7c4a03' : C.accent;
      doc.fillColor(headerColor).roundedRect(M.left, cardY, CW, 20, 3).fill();
      setFont(doc, true).fillColor(C.white).fontSize(9)
        .text(`${platformNum}. ${result.platform}${result.profileFound ? '  — Perfil Detectado' : result.findings.length > 0 ? '  — Menciones' : '  — Sin resultados'}`, M.left + 10, cardY + 5, { width: CW - 20 });
      doc.y = cardY + 24;

      if (result.profileFound) {
        checkPage(doc, 16);
        setFont(doc, true).fillColor(C.green).fontSize(8)
          .text(`Perfil encontrado${result.username ? `: @${result.username}` : ''}${result.profileVerified ? ' (Verificado)' : ''}`, M.left + 10, doc.y, { width: CW - 14 });
        doc.moveDown(0.1);
        if (result.profileUrl) {
          checkPage(doc, 12);
          setFont(doc, false).fillColor(C.blue).fontSize(7)
            .text(truncateUrl(result.profileUrl, 90), M.left + 10, doc.y, { width: CW - 14 });
          doc.moveDown(0.1);
        }
      }

      for (const finding of result.findings) {
        checkPage(doc, 28);
        const sev = SEV[finding.severity] || SEV.info;
        const fY = doc.y;

        doc.fillColor(sev.bg).rect(M.left + 10, fY, 3, 7).fill();
        setFont(doc, true).fillColor(C.navy).fontSize(8)
          .text(`[${sev.label}] ${finding.title}`, M.left + 18, fY, { width: CW - 24 });
        doc.moveDown(0.1);

        if (finding.description) {
          checkPage(doc, 14);
          setFont(doc, false).fillColor(C.text).fontSize(7)
            .text(finding.description.substring(0, 200), M.left + 18, doc.y, { width: CW - 24 });
          doc.moveDown(0.05);
        }

        checkPage(doc, 10);
        setFont(doc, false).fillColor(C.textLight).fontSize(6.5)
          .text(`Fuente: ${anonymizeSource(finding.source)}  |  ${catES(finding.category)}`, M.left + 18, doc.y, { width: CW - 24 });
        doc.moveDown(0.15);
      }

      if (result.findings.length === 0 && !result.profileFound) {
        setFont(doc, false).fillColor(C.textLight).fontSize(7)
          .text('Sin hallazgos para esta plataforma.', M.left + 10, doc.y, { width: CW - 14 });
        doc.moveDown(0.15);
      }

      const sepY = doc.y;
      doc.strokeColor('#e0e0e0').lineWidth(0.3)
        .moveTo(M.left + 8, sepY).lineTo(PAGE_W - M.right, sepY).stroke();
      doc.y = sepY + 6;
    }

    // ── MAPA DE HUELLA DIGITAL ──
    checkPage(doc, 100);
    doc.moveDown(0.2);
    drawSectionHeader(doc, 'MAPA DE HUELLA DIGITAL');

    drawParagraph(doc, 'El siguiente mapa representa visualmente la presencia digital del sujeto en las plataformas investigadas. Los estados indican: Perfil (perfil confirmado), Mención (datos encontrados sin perfil), Sin datos (sin resultados):', { fontSize: 8.5 });

    const footprintPlatforms = scanResults.map(r => ({
      name: r.platform,
      status: r.profileFound ? 'perfil' as const : r.findings.length > 0 ? 'mencion' as const : 'sin_datos' as const,
    }));

    doc.moveDown(0.2);
    const fpCellW = 85;
    const fpCellH = 32;
    const fpCols = Math.min(5, Math.floor(CW / fpCellW));

    for (let i = 0; i < footprintPlatforms.length; i++) {
      if (i % fpCols === 0 && i > 0) {
        // advance Y after each row
      }
      const col = i % fpCols;
      if (col === 0) {
        checkPage(doc, fpCellH + 10);
      }
      const fpX = M.left + col * fpCellW;
      const fpY = doc.y;

      const statusColors: Record<string, string> = {
        perfil: '#1b4332',
        mencion: '#7c4a03',
        sin_datos: '#6b2126',
      };
      const statusLabels: Record<string, string> = {
        perfil: '● Perfil',
        mencion: '◐ Mención',
        sin_datos: '○ Sin datos',
      };

      const p = footprintPlatforms[i];
      doc.fillColor(statusColors[p.status]).roundedRect(fpX, fpY, fpCellW - 3, fpCellH - 2, 3).fill();
      setFont(doc, true).fillColor(C.white).fontSize(7)
        .text(p.name, fpX + 3, fpY + 4, { width: fpCellW - 10 });
      setFont(doc, false).fillColor('#e2e8f0').fontSize(6)
        .text(statusLabels[p.status], fpX + 3, fpY + 16, { width: fpCellW - 10 });

      if (col === fpCols - 1 || i === footprintPlatforms.length - 1) {
        doc.y = fpY + fpCellH;
      }
    }
    doc.moveDown(0.3);

    // ── ANÁLISIS DE CORRELACIÓN ──
    checkPage(doc, 80);
    doc.moveDown(0.2);
    drawSectionHeader(doc, 'ANÁLISIS DE CORRELACIÓN');

    drawParagraph(doc, 'El análisis de correlación evalúa si el mismo identificador (nombre de usuario, correo electrónico, o nombre) aparece en múltiples plataformas, lo que permite construir un perfil de identidad cruzada del sujeto. La correlación de identidad es un factor crítico en la evaluación del riesgo digital, ya que la consistencia de identificadores entre plataformas facilita tanto la investigación legítima como los ataques de ingeniería social:', { fontSize: 8.5 });

    const usernamesFound = scanResults.filter(r => r.username).map(r => r.username!);
    const uniqueUsernames = [...new Set(usernamesFound)];
    const platformsWithProfiles = scanResults.filter(r => r.profileFound);

    checkPage(doc, 30);
    drawSubsectionHeader(doc, 'Correlación de Identidad');

    if (uniqueUsernames.length > 1) {
      drawParagraph(doc, `Se detectaron ${uniqueUsernames.length} identificadores distintos en las plataformas investigadas: ${uniqueUsernames.map(u => `@${u}`).join(', ')}. La presencia de múltiples identificadores sugiere que el sujeto utiliza diferentes alias en distintas plataformas, lo que puede dificultar la correlación de identidad pero también indica una estrategia activa de gestión de identidad digital. Es importante evaluar si esta diversidad de alias responde a una práctica de seguridad consciente o a la necesidad de mantener identidades separadas por otros motivos.`, { fontSize: 8, indent: 8 });
    } else if (uniqueUsernames.length === 1) {
      drawParagraph(doc, `Se detectó un único identificador @${uniqueUsernames[0]} en las plataformas investigadas. El uso del mismo nombre de usuario en múltiples plataformas facilita la correlación de identidad y aumenta la superficie de exposición digital, ya que cualquier persona puede rastrear la actividad del sujeto a través de múltiples servicios. Esta consistencia de identidad, aunque conveniente, representa un riesgo significativo que debe ser gestionado mediante configuraciones de privacidad restrictivas.`, { fontSize: 8, indent: 8 });
    } else {
      drawParagraph(doc, 'No se detectaron nombres de usuario consistentes entre las plataformas investigadas. Esto puede indicar que el sujeto utiliza identificadores diferentes en cada servicio, o que no se encontraron perfiles suficientes para realizar una correlación significativa de identidad.', { fontSize: 8, indent: 8 });
    }

    checkPage(doc, 30);
    drawSubsectionHeader(doc, 'Presencia Multiplataforma');

    if (platformsWithProfiles.length >= 3) {
      drawParagraph(doc, `El sujeto tiene presencia confirmada en ${platformsWithProfiles.length} plataformas: ${platformsWithProfiles.map(r => r.platform).join(', ')}. Esta presencia multiplataforma amplia indica un alto nivel de actividad digital y una superficie de exposición significativa. Cada plataforma adicional aumenta el riesgo de correlación de datos y facilita la construcción de un perfil completo del sujeto por parte de actores malintencionados, incluyendo información sobre hábitos, relaciones, ubicaciones, y preferencias.`, { fontSize: 8, indent: 8 });
    } else if (platformsWithProfiles.length > 0) {
      drawParagraph(doc, `El sujeto tiene presencia confirmada en ${platformsWithProfiles.length} plataforma(s): ${platformsWithProfiles.map(r => r.platform).join(', ')}. La presencia limitada reduce la superficie de exposición pero no elimina el riesgo de correlación si los datos disponibles son consistentes entre plataformas. Se recomienda evaluar la información visible en cada perfil y restringir lo que sea posible.`, { fontSize: 8, indent: 8 });
    } else {
      drawParagraph(doc, 'No se confirmó la presencia del sujeto en ninguna de las plataformas investigadas. Esto puede indicar que el sujeto mantiene un perfil digital bajo o que utiliza identificadores diferentes a los consultados. La ausencia de perfiles detectables puede ser tanto un indicador de buena higiene digital como de uso de identidades alternativas.', { fontSize: 8, indent: 8 });
    }

    // Per-platform privacy analysis
    checkPage(doc, 80);
    doc.moveDown(0.2);
    drawSubsectionHeader(doc, 'Análisis de Privacidad por Plataforma');

    const platformPrivacyMap: Record<string, { activity: string; privacyRisk: string; recSettings: string; footprintScore: number }> = {
      'Facebook': { activity: 'Plataforma de alta actividad social', privacyRisk: 'Alto — Perfil público por defecto, datos personales extensos', recSettings: 'Restringir perfil a privado, limitar búsquedas externas, desactivar etiquetado', footprintScore: 85 },
      'Instagram': { activity: 'Plataforma visual de alta frecuencia', privacyRisk: 'Medio-Alto — Imágenes con metadatos, stories visibles', recSettings: 'Cuenta privada, desactivar actividad visible, limitar seguidores', footprintScore: 75 },
      'Twitter/X': { activity: 'Plataforma de comunicación pública', privacyRisk: 'Alto — Contenido público por defecto, geolocalización', recSettings: 'Proteger tuits, desactivar ubicación, limitar información del perfil', footprintScore: 90 },
      'LinkedIn': { activity: 'Red profesional activa', privacyRisk: 'Medio — Información profesional detallada, conexiones visibles', recSettings: 'Restringir perfil a conexiones, ocultar actividad, limitar datos de contacto', footprintScore: 70 },
      'TikTok': { activity: 'Plataforma de contenido viral', privacyRisk: 'Medio-Alto — Contenido público, datos de uso extensivos', recSettings: 'Cuenta privada, desactivar descargas, limitar duets', footprintScore: 80 },
      'GitHub': { activity: 'Plataforma de desarrollo técnico', privacyRisk: 'Medio — Repositorios públicos, contribuciones visibles, emails', recSettings: 'Ocultar email, repositorios privados, limitar actividad visible', footprintScore: 65 },
      'Reddit': { activity: 'Foro de discusión anónima', privacyRisk: 'Medio — Historial de publicaciones, intereses revelados', recSettings: 'Usar username genérico, borrar historial periódicamente', footprintScore: 55 },
      'Pinterest': { activity: 'Plataforma de contenido visual', privacyRisk: 'Bajo-Medio — Intereses visibles, tableros públicos', recSettings: 'Tableros privados, limitar perfil público', footprintScore: 45 },
      'YouTube': { activity: 'Plataforma de video', privacyRisk: 'Medio — Canal público, listas de reproducción', recSettings: 'Canal privado, ocultar suscripciones, desactivar historial', footprintScore: 60 },
      'Snapchat': { activity: 'Mensajería efímera', privacyRisk: 'Medio — Contactos visibles, ubicación', recSettings: 'Modo Ghost, contactos solo amigos, desactivar mapa', footprintScore: 50 },
    };

    for (const result of scanResults.filter(r => r.profileFound || r.findings.length > 0)) {
      checkPage(doc, 35);
      const privacy = platformPrivacyMap[result.platform];
      const footprintScore = privacy?.footprintScore || (result.profileFound ? 60 : 30);

      setFont(doc, true).fillColor(C.accent).fontSize(8)
        .text(result.platform, M.left, doc.y, { width: CW });
      doc.moveDown(0.05);

      setFont(doc, true).fillColor(C.textLight).fontSize(7)
        .text('Actividad: ', M.left + 8, doc.y, { width: CW - 16, continued: true });
      setFont(doc, false).fillColor(C.text).fontSize(7)
        .text(privacy?.activity || (result.profileFound ? 'Perfil activo detectado' : 'Actividad limitada o desconocida'));

      checkPage(doc, 10);
      setFont(doc, true).fillColor(C.textLight).fontSize(7)
        .text('Riesgo de Privacidad: ', M.left + 8, doc.y, { width: CW - 16, continued: true });
      setFont(doc, false).fillColor(privacy?.privacyRisk.startsWith('Alto') ? C.red : privacy?.privacyRisk.startsWith('Medio') ? C.orange : C.text).fontSize(7)
        .text(privacy?.privacyRisk || (result.profileFound ? 'Medio — Perfil detectado con información visible' : 'Bajo — Sin perfil confirmado'));

      checkPage(doc, 10);
      setFont(doc, true).fillColor(C.textLight).fontSize(7)
        .text('Configuración Recomendada: ', M.left + 8, doc.y, { width: CW - 16, continued: true });
      setFont(doc, false).fillColor(C.text).fontSize(7)
        .text(privacy?.recSettings || 'Revisar configuración de privacidad y limitar información pública');

      checkPage(doc, 14);
      const scoreBarW = 80;
      const scoreBarH = 6;
      const scoreBarX = M.left + 8;
      const scoreBarY = doc.y + 2;
      doc.fillColor('#e0e0e0').rect(scoreBarX, scoreBarY, scoreBarW, scoreBarH).fill();
      const scoreFillW = (footprintScore / 100) * scoreBarW;
      const scoreColor = footprintScore >= 70 ? C.red : footprintScore >= 50 ? C.orange : C.green;
      doc.fillColor(scoreColor).rect(scoreBarX, scoreBarY, scoreFillW, scoreBarH).fill();
      setFont(doc, true).fillColor(C.navy).fontSize(7)
        .text(`Huella Digital: ${footprintScore}/100`, scoreBarX + scoreBarW + 5, scoreBarY - 1, { width: 100 });
      doc.y = scoreBarY + scoreBarH + 6;
    }

    // ── RECOMMENDATIONS ──
    checkPage(doc, 80);
    doc.moveDown(0.15);
    drawSectionHeader(doc, 'RECOMENDACIONES');

    drawSubsectionHeader(doc, 'Recomendaciones Generales');
    const socialRecs = [
      '• Revisar y restringir la configuración de privacidad en todas las plataformas detectadas, estableciendo perfiles como privados donde sea posible.',
      '• Eliminar información personal innecesaria de perfiles públicos (teléfono, dirección, fecha de nacimiento, lugar de trabajo).',
      '• Habilitar autenticación de dos factores (2FA) en todas las cuentas detectadas, preferiblemente con aplicación autenticadora.',
      '• Monitorear periódicamente la huella digital en redes sociales para detectar nuevas exposiciones o suplantaciones.',
      '• Considerar la desactivación de perfiles no utilizados o inactivos que puedan contener información personal.',
      '• Utilizar seudónimos o nombres alternativos en nuevas cuentas para dificultar la correlación de identidad entre plataformas.',
    ];
    for (const rec of socialRecs) {
      checkPage(doc, 14);
      drawParagraph(doc, rec, { fontSize: 8.5, indent: 8 });
    }

    if (foundCount > 0) {
      doc.moveDown(0.15);
      checkPage(doc, 30);
      drawSubsectionHeader(doc, 'Recomendaciones por Plataforma');
      for (const result of scanResults.filter(r => r.profileFound || r.findings.length > 0)) {
        checkPage(doc, 18);
        setFont(doc, true).fillColor(C.accent).fontSize(8.5)
          .text(`${result.platform}${result.profileVerified ? ' (Verificado)' : ''}`, M.left, doc.y, { width: CW });
        doc.moveDown(0.1);

        const platformRec = result.profileVerified
          ? '• Perfil verificado detectado. Se recomienda revisar la información visible públicamente y limitar la exposición de datos personales. Considerar desvincular cuentas de terceros y revisar permisos de aplicaciones conectadas.'
          : result.profileFound
          ? '• Perfil encontrado. Restringir la visibilidad del perfil a privado, revisar configuración de privacidad, y evaluar si la cuenta es necesaria. Eliminar información sensible del perfil y desactivar la indexación por motores de búsqueda.'
          : '• Se detectaron menciones sin perfil confirmado. Monitorear futuras apariciones y evaluar si es necesario crear alertas automatizadas. La mención de datos del sujeto en plataformas sin perfil puede indicar exposición derivada de otros usuarios o fuentes.';
        drawParagraph(doc, platformRec, { fontSize: 8.5, indent: 8 });
      }
    }

    // Legal disclaimer
    doc.moveDown(0.15);
    checkPage(doc, 40);
    drawSubsectionHeader(doc, 'Aviso Legal');
    drawParagraph(doc, 'Este informe ha sido generado mediante técnicas OSINT. La información proviene de fuentes públicas. No constituye investigación oficial ni prueba judicial sin validación por las autoridades competentes. Uso sujeto a Ley 1581/2012 (Protección de Datos Personales), Ley 1273/2009 (Delitos Informáticos), y la Constitución Política de Colombia. El responsable del tratamiento de datos es quien solicita el informe.', { fontSize: 7.5, color: C.textLight });

    // ── FOOTERS — FIXED: lineBreak: false ──
    const pages = doc.bufferedPageRange().count;
    for (let i = 0; i < pages; i++) {
      doc.switchToPage(i);
      if (i === 0) continue;
      doc.strokeColor(C.lightGray).lineWidth(0.3)
        .moveTo(M.left, PAGE_H - 30).lineTo(PAGE_W - M.right, PAGE_H - 30).stroke();
      setFont(doc, false).fillColor(C.gray).fontSize(6)
        .text(`CONFIDENCIAL  |  ${reportId}  |  Página ${i} de ${pages - 1}`, M.left, PAGE_H - 24, { width: CW, align: 'center', lineBreak: false });
    }

    doc.end();
  });
}

// ════════════════════════════════════════════════════════════════
//  REPORTE CONJUNTO EN PDF (Análisis de Vínculos)
// ════════════════════════════════════════════════════════════════

export async function generateJointPDF(
  analysis: RelationshipAnalysisResult,
  individualScans: { name: string; results: OSINTResult[] }[]
): Promise<Buffer> {
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
    const reportId = `OSINT-JOINT-${Date.now().toString(36).toUpperCase()}`;

    const totalLinks = analysis.totalLinks || 0;
    const jointRiskScore = Math.min(100, totalLinks * 8);
    const jointRiskLevel = totalLinks >= 10 ? 'CRÍTICO' : totalLinks >= 5 ? 'ALTO' : totalLinks >= 2 ? 'MODERADO' : 'BAJO';
    const jointRiskColor = totalLinks >= 10 ? C.red : totalLinks >= 5 ? C.orange : totalLinks >= 2 ? C.yellow : C.green;

    // ── Cover ──
    doc.addPage();
    drawProfessionalCover(doc, {
      title: 'INFORME DE INVESTIGACIÓN',
      subtitle: 'Análisis de Vínculos',
      fullName: `${analysis.sheet1Name} ↔ ${analysis.sheet2Name}`,
      reportId,
      riskScore: jointRiskScore,
      riskLevel: jointRiskLevel,
      riskColor: jointRiskColor,
      today,
    });

    // ── Resumen del Análisis ──
    doc.addPage();
    drawSectionHeader(doc, 'RESUMEN DEL ANÁLISIS DE VÍNCULOS');

    drawParagraph(doc, `El presente informe de análisis de vínculos evalúa las relaciones e interconexiones identificadas entre los sujetos contenidos en las dos hojas de datos analizadas: "${analysis.sheet1Name}" (${analysis.sheet1RowCount} registros) y "${analysis.sheet2Name}" (${analysis.sheet2RowCount} registros). Se identificaron ${totalLinks} vínculos entre los registros de ambas hojas, los cuales representan conexiones significativas que requieren análisis detallado. El nivel de riesgo derivado de las conexiones identificadas es ${jointRiskLevel} con un puntaje de ${jointRiskScore}/100.`, { fontSize: 8.5 });

    // Summary breakdown
    const summaryItemsRaw: [string, number][] = [
      ['Empresariales', Number(analysis.summary.empresariales) || 0],
      ['Personales', Number(analysis.summary.personales) || 0],
      ['Familiares', Number(analysis.summary.familiares) || 0],
      ['Laborales', Number(analysis.summary.laborales) || 0],
      ['Contacto', Number(analysis.summary.contacto) || 0],
      ['Ubicación', Number(analysis.summary.ubicacion) || 0],
      ['Datos compartidos', Number(analysis.summary.dato_compartido) || 0],
    ];
    const summaryItems = summaryItemsRaw.filter(([, count]) => count > 0);

    if (summaryItems.length > 0) {
      doc.moveDown(0.15);
      drawSubsectionHeader(doc, 'Clasificación de Vínculos');
      for (const [type, count] of summaryItems) {
        checkPage(doc, 16);
        const sy = doc.y;
        doc.fillColor(C.accent).rect(M.left, sy, 4, 14).fill();
        setFont(doc, true).fillColor(C.navy).fontSize(9)
          .text(`${count}`, M.left + 10, sy + 2, { width: 25 });
        setFont(doc, false).fillColor(C.text).fontSize(9)
          .text(type, M.left + 35, sy + 2, { width: 200 });
        doc.y = sy + 16;
      }
    }

    // Methodology
    doc.moveDown(0.15);
    checkPage(doc, 50);
    drawSubsectionHeader(doc, 'Metodología de Análisis de Vínculos');
    drawParagraph(doc, 'El análisis de vínculos se realizó mediante la comparación sistemática de los datos contenidos en ambas hojas de información, identificando coincidencias en campos como nombres, números de identificación, direcciones, números de teléfono, correos electrónicos, y otros datos de contacto. Los vínculos fueron clasificados según su naturaleza (empresarial, personal, familiar, laboral, de contacto, de ubicación, o datos compartidos) para facilitar la evaluación del tipo de relación entre los sujetos vinculados. La metodología sigue estándares de análisis de inteligencia financiera y prevención de lavado de activos.', { fontSize: 8.5, color: C.textLight });

    // ── Detail table ──
    checkPage(doc, 60);
    doc.moveDown(0.2);
    drawSectionHeader(doc, 'DETALLE DE VÍNCULOS');

    if (analysis.links.length > 0) {
      checkPage(doc, 20);
      let y = doc.y;
      doc.fillColor(C.tableHeader).rect(M.left, y, CW, 14).fill();
      setFont(doc, true).fillColor(C.white).fontSize(6.5)
        .text('#', M.left + 3, y + 4, { width: 20 })
        .text('Tipo', M.left + 25, y + 4, { width: 70 })
        .text('Personas', M.left + 97, y + 4, { width: 150 })
        .text('Campo', M.left + 250, y + 4, { width: 80 })
        .text('Valor', M.left + 332, y + 4, { width: CW - 335 });
      doc.y = y + 15;

      for (let i = 0; i < Math.min(analysis.links.length, 30); i++) {
        checkPage(doc, 14);
        const l = analysis.links[i];
        y = doc.y;
        if (i % 2 === 0) doc.fillColor(C.tableStripe).rect(M.left, y, CW, 13).fill();
        setFont(doc, false).fillColor(C.text).fontSize(6)
          .text(String(i + 1), M.left + 3, y + 3, { width: 20 })
          .text(l.type, M.left + 25, y + 3, { width: 70 })
          .text(`${l.sheet1Person} ↔ ${l.sheet2Person}`, M.left + 97, y + 3, { width: 150, ellipsis: true })
          .text(l.matchedField, M.left + 250, y + 3, { width: 80 })
          .text(l.matchedValue.substring(0, 30), M.left + 332, y + 3, { width: CW - 335, ellipsis: true });
        doc.y = y + 13;
      }

      if (analysis.links.length > 30) {
        doc.moveDown(0.1);
        drawParagraph(doc, `Se muestran los primeros 30 vínculos de un total de ${analysis.links.length} identificados. El detalle completo está disponible en los datos fuente del análisis.`, { fontSize: 8, color: C.textLight });
      }
    } else {
      drawParagraph(doc, 'No se identificaron vínculos entre los registros de las dos hojas de datos analizadas. La ausencia de conexiones no descarta la existencia de relaciones indirectas o a través de intermediarios no incluidos en los datos analizados.', { fontSize: 8.5 });
    }

    // ── Risk Assessment ──
    checkPage(doc, 60);
    doc.moveDown(0.2);
    drawSectionHeader(doc, 'EVALUACIÓN DE RIESGO DE VÍNCULOS');

    drawParagraph(doc, `El nivel de riesgo derivado de los vínculos identificados es ${jointRiskLevel} (${jointRiskScore}/100). ${totalLinks >= 10 ? 'La cantidad significativa de vínculos entre los registros de ambas hojas indica una red de relaciones extensa que puede representar riesgos de concentración, conflicto de interés, o exposición a riesgos compartidos. Se recomienda un análisis detallado de la naturaleza de cada vínculo para determinar las acciones de mitigación apropiadas.' : totalLinks >= 5 ? 'La cantidad moderada de vínculos indica relaciones significativas entre los sujetos de ambas hojas que deben ser evaluadas en el contexto del negocio o la investigación. Se recomienda profundizar en la naturaleza de las relaciones identificadas.' : totalLinks >= 2 ? 'Se identificaron algunos vínculos entre los registros de ambas hojas. Las relaciones encontradas deben ser evaluadas en contexto para determinar su relevancia y nivel de riesgo.' : 'Los pocos o ningún vínculo identificado sugiere que los sujetos de ambas hojas tienen relaciones limitadas. Se recomienda complementar con análisis de vínculos indirectos o de segundo grado.'}`, { fontSize: 8.5 });

    // ── Legal ──
    checkPage(doc, 50);
    drawSectionHeader(doc, 'AVISO LEGAL');
    drawParagraph(doc, 'Este informe ha sido generado mediante técnicas OSINT. La información proviene de fuentes públicas. No constituye investigación oficial ni prueba judicial sin validación por las autoridades competentes. Uso sujeto a Ley 1581/2012 (Protección de Datos Personales), Ley 1273/2009 (Delitos Informáticos), y la Constitución Política de Colombia. El responsable del tratamiento de datos es quien solicita el informe. Los vínculos identificados representan coincidencias de datos y no implican necesariamente relaciones personales, comerciales, o de otro tipo sin verificación adicional.', { fontSize: 7.5, color: C.textLight });

    // ── Footers — FIXED: lineBreak: false ──
    const pages = doc.bufferedPageRange().count;
    for (let i = 0; i < pages; i++) {
      doc.switchToPage(i);
      if (i === 0) continue;
      doc.strokeColor(C.lightGray).lineWidth(0.3)
        .moveTo(M.left, PAGE_H - 30).lineTo(PAGE_W - M.right, PAGE_H - 30).stroke();
      setFont(doc, false).fillColor(C.gray).fontSize(6)
        .text(`CONFIDENCIAL  |  ${reportId}  |  Página ${i} de ${pages - 1}`, M.left, PAGE_H - 24, { width: CW, align: 'center', lineBreak: false });
    }

    doc.end();
  });
}
