/**
 * Generador de Informes OSINT en PDF — Formato PROFESIONAL
 *
 * Límites: máx 4 críticos, 4 altos, 4 medios, 2 bajos
 * Fuentes: DejaVuSans / DejaVuSans-Bold con fallback Helvetica
 *
 * FIXES:
 *  - Cover page: set doc.y = PAGE_H - 10 after all content to prevent auto-page-break
 *  - All footer text calls use { lineBreak: false } to prevent auto page creation
 *  - After drawProfessionalCover(), reset doc.y before next addPage()
 *  - Social report: added Metodología, Perfil de Riesgo Digital, Indicadores de Actividad sections
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
  credential_breach: 'Cambiar contraseñas y habilitar 2FA inmediatamente.',
  password_exposure: 'Rotar contraseñas comprometidas. Implementar MFA.',
  personal_exposure: 'Solicitar eliminación de datos. Restringir privacidad.',
  dark_web_mention: 'Monitoreo continuo. Alertas de fraude.',
  paste_site: 'Cambiar credenciales comprometidas. Revisar accesos.',
  data_broker: 'Ejercer derecho de supresión (Ley 1581/2012).',
  social_media: 'Revisar configuración de privacidad en todas las plataformas.',
  document_exposure: 'Solicitar eliminación del documento. Verificar alcance.',
  judicial: 'Verificar registros manualmente en fuentes oficiales.',
};

function catES(cat: string): string {
  return CAT_ES[cat] || cat;
}
function recFor(cat: string): string {
  return REC_MAP[cat] || 'Investigar y tomar medidas correctivas.';
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
  checkPage(doc, 40);
  doc.moveDown(0.2);
  const y = doc.y;
  doc.fillColor(C.navy).rect(M.left, y, CW, 22).fill();
  setFont(doc, true).fillColor(C.white).fontSize(11)
    .text(title, M.left + 8, y + 5, { width: CW - 16 });
  doc.y = y + 26;
  doc.moveDown(0.15);
}

function drawParagraph(doc: PDFDocument, text: string, opts?: { fontSize?: number; color?: string; bold?: boolean; indent?: number }): void {
  const fs = opts?.fontSize || 9;
  const color = opts?.color || C.text;
  const bold = opts?.bold || false;
  const indent = opts?.indent || 0;
  setFont(doc, bold).fillColor(color).fontSize(fs)
    .text(text, M.left + indent, doc.y, { width: CW - indent, align: 'justify', lineGap: 2 });
  doc.moveDown(0.1);
}

function truncateUrl(url: string, maxLen: number = 60): string {
  if (!url) return '';
  if (url.length <= maxLen) return url;
  return url.substring(0, maxLen - 3) + '...';
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

  // Top accent line
  doc.fillColor(C.coverAccent).rect(0, 0, PAGE_W, 4).fill();

  // Logo area placeholder (subtle)
  const logoY = 40;
  doc.fillColor('#1e293b').rect(M.left, logoY, 40, 40).fill();
  setFont(doc, true).fillColor(C.coverAccent).fontSize(18)
    .text('◆', M.left + 9, logoY + 8, { width: 22, lineBreak: false });
  setFont(doc, true).fillColor(C.coverLight).fontSize(10)
    .text('OSINT DATA SCANNER', M.left + 50, logoY + 12, { width: 200, lineBreak: false });

  // CONFIDENTIAL badge
  const confX = PAGE_W - M.right - 130;
  doc.fillColor('#7f1d1d').rect(confX, logoY, 130, 24).fill();
  setFont(doc, true).fillColor('#fca5a5').fontSize(8)
    .text('CLASIFICACIÓN: CONFIDENCIAL', confX + 6, logoY + 7, { width: 118, lineBreak: false });

  // Main title area
  doc.y = 160;
  setFont(doc, true).fillColor(C.coverLight).fontSize(28)
    .text('INFORME DE', M.left, doc.y, { width: CW, align: 'center', lineBreak: false });
  doc.moveDown(0.2);
  setFont(doc, true).fillColor(C.coverAccent).fontSize(32)
    .text('INVESTIGACIÓN', M.left, doc.y, { width: CW, align: 'center', lineBreak: false });
  doc.moveDown(1);

  // Decorative line
  const lineY = doc.y;
  doc.strokeColor(C.coverAccent).lineWidth(1.5)
    .moveTo(PAGE_W / 2 - 80, lineY).lineTo(PAGE_W / 2 + 80, lineY).stroke();
  doc.y = lineY + 15;

  // Subtitle
  if (opts.subtitle) {
    setFont(doc, false).fillColor(C.coverSlate).fontSize(12)
      .text(opts.subtitle, M.left, doc.y, { width: CW, align: 'center', lineBreak: false });
    doc.moveDown(0.8);
  }

  // Risk score gauge (centered, professional)
  const gaugeW = 160;
  const gaugeX = PAGE_W / 2 - gaugeW / 2;
  const gaugeY = doc.y + 5;

  // Outer ring
  doc.strokeColor('#1e293b').lineWidth(3)
    .circle(PAGE_W / 2, gaugeY + 30, 28).stroke();
  doc.strokeColor(opts.riskColor).lineWidth(3);
  doc.save();
  doc.fillColor(opts.riskColor).circle(PAGE_W / 2, gaugeY + 30, 24).fill();
  doc.restore();

  setFont(doc, true).fillColor(C.white).fontSize(22)
    .text(`${opts.riskScore}`, gaugeX, gaugeY + 17, { width: gaugeW, align: 'center', lineBreak: false });
  setFont(doc, true).fillColor(C.white).fontSize(8)
    .text(`/100  ${opts.riskLevel}`, gaugeX, gaugeY + 40, { width: gaugeW, align: 'center', lineBreak: false });

  doc.y = gaugeY + 65;

  // Subject info box
  doc.moveDown(0.5);
  const infoBoxY = doc.y;
  doc.fillColor('#111827').roundedRect(M.left + 40, infoBoxY, CW - 80, 80, 4).fill();
  doc.strokeColor('#1e293b').lineWidth(0.5).roundedRect(M.left + 40, infoBoxY, CW - 80, 80, 4).stroke();

  const infoX = M.left + 55;
  setFont(doc, true).fillColor(C.coverAccent).fontSize(9)
    .text('SUJETO DE INVESTIGACIÓN', infoX, infoBoxY + 8, { width: CW - 110, lineBreak: false });
  setFont(doc, true).fillColor(C.coverLight).fontSize(13)
    .text(opts.fullName, infoX, infoBoxY + 22, { width: CW - 110, lineBreak: false });

  const detailLines: string[] = [];
  if (opts.cedula) detailLines.push(`CC: ${opts.cedula}`);
  if (opts.email) detailLines.push(`${opts.email}`);
  if (opts.phone) detailLines.push(`Tel: ${opts.phone}`);
  if (detailLines.length > 0) {
    setFont(doc, false).fillColor(C.coverSlate).fontSize(8)
      .text(detailLines.join('   |   '), infoX, infoBoxY + 42, { width: CW - 110, lineBreak: false });
  }

  setFont(doc, false).fillColor(C.coverSlate).fontSize(7)
    .text(`ID: ${opts.reportId}  |  Fecha: ${opts.today}`, infoX, infoBoxY + 60, { width: CW - 110, lineBreak: false });

  doc.y = infoBoxY + 95;

  // Bottom section - Classification & Footer
  const footerY = PAGE_H - 60;

  // Bottom accent line
  doc.fillColor(C.coverAccent).rect(0, footerY - 10, PAGE_W, 2).fill();

  // Classification marking — use lineBreak: false to prevent auto-page-break
  setFont(doc, true).fillColor('#ef4444').fontSize(9)
    .text('DOCUMENTO CONFIDENCIAL — USO RESTRINGIDO', M.left, footerY, { width: CW, align: 'center', lineBreak: false });
  setFont(doc, false).fillColor('#64748b').fontSize(6)
    .text('La distribución no autorizada de este documento viola la Ley 1581 de 2012 y la Ley 1273 de 2009', M.left, footerY + 14, { width: CW, align: 'center', lineBreak: false });
  setFont(doc, false).fillColor('#475569').fontSize(6)
    .text(`OSINT Data Scanner  |  ${opts.reportId}  |  ${opts.today}`, M.left, footerY + 26, { width: CW, align: 'center', lineBreak: false });

  // CRITICAL FIX: Set doc.y to near page bottom but within bounds to prevent auto-page-break
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

    // Risk score box
    checkPage(doc, 55);
    const boxY = doc.y;
    const boxH = 48;
    doc.fillColor(riskColor).rect(M.left, boxY, 90, boxH).fill();
    setFont(doc, true).fillColor(C.white).fontSize(24)
      .text(`${riskScore}`, M.left + 5, boxY + 4, { width: 80, align: 'center' });
    setFont(doc, true).fillColor(C.white).fontSize(9)
      .text(`/100 ${riskLevel}`, M.left + 5, boxY + 30, { width: 80, align: 'center' });

    doc.fillColor(C.bg).rect(M.left + 90, boxY, CW - 90, boxH).fill();
    const infoX = M.left + 100;
    setFont(doc, true).fillColor(C.navy).fontSize(10)
      .text(data.fullName, infoX, boxY + 6, { width: CW - 110 });
    setFont(doc, false).fillColor(C.textLight).fontSize(8)
      .text(`${realResults.length} hallazgos en ${uniqueSources.length} fuentes  |  Email: ${data.email || 'N/A'}  |  Tel: ${data.phone || 'N/A'}`, infoX, boxY + 20, { width: CW - 110 });

    const sevY = boxY + 34;
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
      setFont(doc, true).fillColor(color).fontSize(8)
        .text(`${count} ${label}`, sevX, sevY, { width: 60 });
      sevX += 55;
    }
    doc.y = boxY + boxH + 10;

    const execNarrative = crit > 0
      ? `La investigación OSINT identificó ${crit} hallazgo(s) crítico(s) que representan un riesgo inmediato para la seguridad digital del sujeto. Se detectaron filtraciones de credenciales y/o exposición de datos sensibles que requieren acción correctiva inmediata. Se recomienda cambiar contraseñas comprometidas, habilitar autenticación multifactor y solicitar eliminación de datos en brokers de información. El nivel de riesgo calculado es ${riskLevel} con un puntaje de ${riskScore}/100.`
      : high > 0
      ? `La investigación identificó ${high} hallazgo(s) de severidad alta que indican exposición significativa de datos personales del sujeto. Se encontraron menciones en fuentes de riesgo que requieren atención prioritaria y medidas de protección digital. El nivel de riesgo calculado es ${riskLevel} con un puntaje de ${riskScore}/100.`
      : med > 0 || low > 0
      ? `La investigación identificó hallazgos de severidad media/baja que indican cierta exposición digital del sujeto. Se recomienda implementar medidas de protección preventiva y monitoreo periódico. El nivel de riesgo calculado es ${riskLevel} con un puntaje de ${riskScore}/100.`
      : `No se identificaron hallazgos de riesgo significativo en las fuentes consultadas. Se recomienda mantener prácticas de higiene digital y monitoreo periódico. El nivel de riesgo calculado es ${riskLevel} con un puntaje de ${riskScore}/100.`;
    drawParagraph(doc, execNarrative);

    doc.moveDown(0.15);
    setFont(doc, true).fillColor(C.navy).fontSize(9)
      .text('Evaluación de Riesgo:', M.left, doc.y, { width: CW });
    doc.moveDown(0.1);
    drawParagraph(doc, `Nivel de riesgo: ${riskLevel} (${riskScore}/100). ${crit > 0 ? 'Se requiere intervención inmediata.' : high > 0 ? 'Se requiere atención prioritaria.' : 'Se recomienda seguimiento.'}`, { fontSize: 8.5, color: C.textLight });

    doc.moveDown(0.15);
    setFont(doc, true).fillColor(C.navy).fontSize(9)
      .text('Hallazgos por Severidad:', M.left, doc.y, { width: CW });
    doc.moveDown(0.1);
    const countLines: string[] = [];
    if (crit > 0) countLines.push(`• Críticos: ${crit}`);
    if (high > 0) countLines.push(`• Altos: ${high}`);
    if (med > 0) countLines.push(`• Medios: ${med}`);
    if (low > 0) countLines.push(`• Bajos: ${low}`);
    if (infoCount > 0) countLines.push(`• Informativos: ${infoCount}`);
    if (countLines.length === 0) countLines.push('• Sin hallazgos significativos');
    drawParagraph(doc, countLines.join('    '), { fontSize: 9 });

    // ════════════════════════════════════════
    //  HALLAZGOS DETALLADOS
    // ════════════════════════════════════════
    checkPage(doc, 80);
    doc.moveDown(0.5);
    drawSectionHeader(doc, 'HALLAZGOS DETALLADOS');

    if (limitedResults.filter(r => r.severity !== 'info').length === 0 && realResults.length === 0) {
      drawParagraph(doc, 'No se identificaron hallazgos en las fuentes automatizadas consultadas. Se recomienda realizar verificación manual para obtener resultados completos. La ausencia de resultados automáticos no garantiza la no exposición del sujeto.');
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

        checkPage(doc, 30);
        const sevY = doc.y;
        doc.fillColor(sev.bg).rect(M.left, sevY, CW, 16).fill();
        setFont(doc, true).fillColor(sev.color).fontSize(9)
          .text(`${sev.label} — ${showingCount} hallazgo${showingCount > 1 ? 's' : ''}${omittedCount > 0 ? ` (de ${totalOfSev} total, ${omittedCount} omitido${omittedCount > 1 ? 's' : ''})` : ''}`, M.left + 8, sevY + 3, { width: CW - 16 });
        doc.y = sevY + 20;

        for (const r of filtered) {
          findingNum++;
          checkPage(doc, 65);

          const cardY = doc.y;
          doc.fillColor(sev.bg).rect(M.left, cardY, 4, 8).fill();

          setFont(doc, true).fillColor(C.navy).fontSize(9)
            .text(`${findingNum}. ${r.title}`, M.left + 10, cardY, { width: CW - 14 });
          doc.moveDown(0.1);

          const desc = r.description || r.dataFound || 'Sin descripción disponible';
          checkPage(doc, 30);
          setFont(doc, false).fillColor(C.text).fontSize(8)
            .text(desc, M.left + 10, doc.y, { width: CW - 14, lineGap: 1.5 });
          doc.moveDown(0.1);

          checkPage(doc, 14);
          setFont(doc, false).fillColor(C.textLight).fontSize(7)
            .text(`Fuente: ${r.source}  |  Categoría: ${catES(r.category)}`, M.left + 10, doc.y, { width: CW - 14 });

          if (r.url) {
            checkPage(doc, 12);
            setFont(doc, false).fillColor(C.blue).fontSize(6.5)
              .text(truncateUrl(r.url, 80), M.left + 10, doc.y, { width: CW - 14 });
          }

          doc.moveDown(0.15);
          const sepY = doc.y;
          doc.strokeColor('#e0e0e0').lineWidth(0.3)
            .moveTo(M.left + 8, sepY).lineTo(PAGE_W - M.right, sepY).stroke();
          doc.y = sepY + 4;
        }
      }
    }

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

    if (recCategories.size === 0) {
      drawParagraph(doc, 'No se requieren acciones correctivas específicas basadas en los hallazgos del informe.', { fontSize: 9 });
    }

    checkPage(doc, 20);
    setFont(doc, true).fillColor(C.navy).fontSize(9)
      .text('Recomendaciones Generales', M.left, doc.y, { width: CW });
    doc.moveDown(0.15);
    const generalRecs: string[] = [];
    if (crit > 0) {
      generalRecs.push('• Cambiar de inmediato todas las contraseñas asociadas a las cuentas comprometidas.');
      generalRecs.push('• Habilitar autenticación de dos factores (2FA/MFA) en todas las cuentas.');
      generalRecs.push('• Solicitar eliminación de datos personales en brokers de información.');
      generalRecs.push('• Implementar monitoreo continuo de exposiciones futuras.');
    } else if (high > 0) {
      generalRecs.push('• Revisar y actualizar contraseñas en las plataformas afectadas.');
      generalRecs.push('• Habilitar autenticación de dos factores (2FA/MFA) en cuentas sensibles.');
      generalRecs.push('• Ejercer derecho de Habeas Data conforme a la Ley 1581/2012.');
    } else {
      generalRecs.push('• Mantener prácticas de higiene digital.');
      generalRecs.push('• Verificar exposición periódicamente.');
      generalRecs.push('• Considerar alertas de monitoreo proactivo.');
    }
    for (const rec of generalRecs) {
      checkPage(doc, 14);
      drawParagraph(doc, rec, { fontSize: 8.5, indent: 8 });
    }

    if (recCategories.size > 0) {
      doc.moveDown(0.15);
      setFont(doc, true).fillColor(C.navy).fontSize(9)
        .text('Recomendaciones por Categoría', M.left, doc.y, { width: CW });
      doc.moveDown(0.1);

      for (const [, item] of recCategories) {
        checkPage(doc, 20);
        setFont(doc, true).fillColor(C.accent).fontSize(8.5)
          .text(`${catES(item.cat)} (${item.count} hallazgo${item.count > 1 ? 's' : ''})`, M.left, doc.y, { width: CW });
        doc.moveDown(0.1);
        drawParagraph(doc, `• ${item.rec}`, { fontSize: 8.5, indent: 8 });
      }
    }

    doc.moveDown(0.15);
    checkPage(doc, 30);
    setFont(doc, true).fillColor(C.navy).fontSize(9)
      .text('Verificación Manual Recomendada', M.left, doc.y, { width: CW });
    doc.moveDown(0.1);
    const manualRecs = [
      '• Verificar registros en RUES (Registro Único Empresarial y Social).',
      '• Consultar Rama Judicial para antecedentes penales y procesos activos.',
      '• Revisar listas restrictivas: OFAC, ONU, Procuraduría, Contraloría.',
      '• Validar información en Superintendencia de Sociedades.',
    ];
    for (const rec of manualRecs) {
      checkPage(doc, 14);
      drawParagraph(doc, rec, { fontSize: 8.5, indent: 8 });
    }

    // ════════════════════════════════════════
    //  INDICADORES DE RIESGO
    // ════════════════════════════════════════
    checkPage(doc, 80);
    doc.moveDown(0.3);
    drawSectionHeader(doc, 'INDICADORES DE RIESGO');

    setFont(doc, true).fillColor(C.navy).fontSize(9)
      .text('Evaluación General de Riesgo', M.left, doc.y, { width: CW });
    doc.moveDown(0.15);

    checkPage(doc, 40);
    const riskBoxY = doc.y;
    doc.fillColor(riskColor).rect(M.left, riskBoxY, CW, 30).fill();
    setFont(doc, true).fillColor(C.white).fontSize(14)
      .text(`Nivel de Riesgo: ${riskLevel}  —  Puntaje: ${riskScore}/100`, M.left + 10, riskBoxY + 8, { width: CW - 20, align: 'center' });
    doc.y = riskBoxY + 38;

    doc.moveDown(0.2);
    setFont(doc, true).fillColor(C.navy).fontSize(9)
      .text('Desglose por Categoría de Riesgo', M.left, doc.y, { width: CW });
    doc.moveDown(0.1);

    checkPage(doc, 20);
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
      ['Hallazgos Críticos', String(crit), crit > 0 ? 'REQUIERE ACCIÓN' : 'SIN ALERTA'],
      ['Hallazgos de Severidad Alta', String(high), high > 0 ? 'ATENCIÓN PRIORITARIA' : 'SIN ALERTA'],
      ['Hallazgos de Severidad Media', String(med), med > 0 ? 'SEGUIMIENTO' : 'SIN ALERTA'],
      ['Hallazgos de Severidad Baja', String(low), low > 0 ? 'MONITOREO' : 'SIN ALERTA'],
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

    setFont(doc, true).fillColor(C.navy).fontSize(9)
      .text('Factores de Riesgo Identificados', M.left, doc.y, { width: CW });
    doc.moveDown(0.1);

    const riskFactors: string[] = [];
    if (crit > 0) riskFactors.push(`• Exposición crítica: Se detectaron ${crit} hallazgo(s) con severidad crítica que indican filtración de credenciales o datos sensibles.`);
    if (high > 0) riskFactors.push(`• Exposición significativa: ${high} hallazgo(s) de severidad alta indican presencia en fuentes de riesgo.`);
    if (med > 0) riskFactors.push(`• Exposición moderada: ${med} hallazgo(s) de severidad media sugieren cierta presencia digital observable.`);
    if (low > 0) riskFactors.push(`• Exposición baja: ${low} hallazgo(s) de severidad baja con impacto limitado.`);
    if (riskFactors.length === 0) riskFactors.push('• No se identificaron factores de riesgo significativos en las fuentes consultadas.');
    riskFactors.push(`• Superficie de exposición: ${uniqueSources.length} fuente${uniqueSources.length !== 1 ? 's' : ''} consultada${uniqueSources.length !== 1 ? 's' : ''} con ${realResults.length} resultado${realResults.length !== 1 ? 's' : ''}.`);

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

    setFont(doc, true).fillColor(C.navy).fontSize(9)
      .text('Fuentes Consultadas', M.left, doc.y, { width: CW });
    doc.moveDown(0.15);
    drawParagraph(doc, 'Se consultaron múltiples fuentes de inteligencia de fuentes abiertas (OSINT) durante esta investigación. Los resultados fueron obtenidos a través de sistemas automatizados de recolección y análisis de datos públicos.', { fontSize: 8.5 });

    if (uniqueSources.length > 0) {
      doc.moveDown(0.2);
      setFont(doc, true).fillColor(C.navy).fontSize(9)
        .text('Resumen de Fuentes', M.left, doc.y, { width: CW });
      doc.moveDown(0.1);

      for (let i = 0; i < uniqueSources.length; i++) {
        checkPage(doc, 12);
        const sy = doc.y;
        if (i % 2 === 0) doc.fillColor(C.tableStripe).rect(M.left, sy, CW, 11).fill();
        const count = anonymizedResults.filter(r => r.source === uniqueSources[i]).length;
        setFont(doc, false).fillColor(C.text).fontSize(7.5)
          .text(uniqueSources[i], M.left + 4, sy + 2, { width: CW * 0.75 });
        setFont(doc, false).fillColor(C.textLight).fontSize(7.5)
          .text(`${count} hallazgo(s)`, M.left + CW * 0.75, sy + 2, { width: CW * 0.25 - 4 });
        doc.y = sy + 11;
      }
    }

    doc.moveDown(0.15);
    checkPage(doc, 50);
    setFont(doc, true).fillColor(C.navy).fontSize(9)
      .text('Aviso Legal', M.left, doc.y, { width: CW });
    doc.moveDown(0.05);
    drawParagraph(doc, 'Este informe ha sido generado mediante técnicas OSINT (Open Source Intelligence). La información proviene de fuentes públicas accesibles y no constituye investigación oficial ni prueba judicial sin validación por las autoridades competentes. El uso de este informe debe cumplir con la Ley 1581 de 2012 (Protección de Datos Personales), la Ley 1273 de 2009 (Delitos Informáticos), y la Constitución Política de Colombia. El responsable del tratamiento de datos es quien solicita el informe.', { fontSize: 7.5, color: C.textLight });

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

    checkPage(doc, 55);
    const boxY = doc.y;
    const boxH = 48;
    doc.fillColor(riskColor).rect(M.left, boxY, 90, boxH).fill();
    setFont(doc, true).fillColor(C.white).fontSize(24)
      .text(`${riskScore}`, M.left + 5, boxY + 4, { width: 80, align: 'center' });
    setFont(doc, true).fillColor(C.white).fontSize(9)
      .text(`/100 ${riskLevel}`, M.left + 5, boxY + 30, { width: 80, align: 'center' });

    doc.fillColor(C.bg).rect(M.left + 90, boxY, CW - 90, boxH).fill();
    const infoX = M.left + 100;
    const modeLabel = data.searchMode === 'nickname' ? 'NickName' : data.searchMode === 'email' ? 'Correo' : 'Nombre';
    setFont(doc, true).fillColor(C.navy).fontSize(10)
      .text(`Consulta: ${data.searchQuery}`, infoX, boxY + 6, { width: CW - 110 });
    setFont(doc, false).fillColor(C.textLight).fontSize(8)
      .text(`Modo: ${modeLabel}  |  ${summary.profilesFound} perfiles  |  ${summary.totalFindings} hallazgos  |  ${scanResults.length} plataformas`, infoX, boxY + 20, { width: CW - 110 });

    const sevY = boxY + 34;
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
      setFont(doc, true).fillColor(color).fontSize(8)
        .text(`${count} ${label}`, sevX, sevY, { width: 60 });
      sevX += 55;
    }
    doc.y = boxY + boxH + 10;

    // Executive narrative
    const execNarrative = crit > 0
      ? `La investigación en redes sociales identificó ${crit} hallazgo(s) crítico(s) y ${summary.profilesFound} perfil(es) asociados al sujeto de investigación. La exposición en plataformas sociales representa un riesgo significativo para la seguridad digital. Se recomienda revisar y restringir la configuración de privacidad en todas las cuentas detectadas. El nivel de riesgo calculado es ${riskLevel} con un puntaje de ${riskScore}/100.`
      : high > 0
      ? `La investigación identificó ${high} hallazgo(s) de severidad alta en redes sociales. Se detectaron ${summary.profilesFound} perfil(es) que requieren atención. El nivel de riesgo calculado es ${riskLevel} con un puntaje de ${riskScore}/100.`
      : summary.profilesFound > 0
      ? `La investigación detectó ${summary.profilesFound} perfil(es) en redes sociales. Los hallazgos indican cierta exposición digital que requiere medidas preventivas. El nivel de riesgo calculado es ${riskLevel} con un puntaje de ${riskScore}/100.`
      : `No se identificaron perfiles o hallazgos significativos en las plataformas consultadas. El nivel de riesgo calculado es ${riskLevel} con un puntaje de ${riskScore}/100.`;
    drawParagraph(doc, execNarrative);

    // ── METODOLOGÍA ──
    checkPage(doc, 60);
    doc.moveDown(0.15);
    drawSectionHeader(doc, 'METODOLOGÍA');

    drawParagraph(doc, 'La presente investigación fue realizada aplicando las siguientes técnicas y procedimientos de inteligencia de fuentes abiertas (OSINT), sin revelar herramientas o métodos específicos:', { fontSize: 8.5 });

    const methodology = [
      '• Verificación directa de perfiles mediante consulta de plataformas públicas de redes sociales.',
      '• Análisis de huella digital en redes sociales mediante correlación de identificadores.',
      '• Correlación de datos entre plataformas para determinar consistencia de identidad digital.',
      '• Evaluación de exposición de información personal disponible públicamente en perfiles detectados.',
      '• Clasificación de severidad basada en el tipo de dato expuesto y su accesibilidad pública.',
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

    // Risk profile table
    checkPage(doc, 20);
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

    // Summary by platform status
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
      checkPage(doc, 50);

      const cardY = doc.y;
      const headerColor = result.profileFound ? '#1b4332' : result.findings.length > 0 ? '#7c4a03' : C.accent;
      doc.fillColor(headerColor).rect(M.left, cardY, CW, 18).fill();
      setFont(doc, true).fillColor(C.white).fontSize(9)
        .text(`${platformNum}. ${result.platform}${result.profileFound ? '  — Perfil Detectado' : result.findings.length > 0 ? '  — Menciones' : '  — Sin resultados'}`, M.left + 8, cardY + 4, { width: CW - 16 });
      doc.y = cardY + 22;

      if (result.profileFound) {
        checkPage(doc, 14);
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
        checkPage(doc, 25);
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

    // ── RECOMMENDATIONS (enhanced with per-platform) ──
    checkPage(doc, 80);
    doc.moveDown(0.15);
    drawSectionHeader(doc, 'RECOMENDACIONES');

    // General recommendations
    setFont(doc, true).fillColor(C.navy).fontSize(9)
      .text('Recomendaciones Generales', M.left, doc.y, { width: CW });
    doc.moveDown(0.15);

    const socialRecs = [
      '• Revisar y restringir la configuración de privacidad en todas las plataformas detectadas.',
      '• Eliminar información personal innecesaria de perfiles públicos (teléfono, dirección, fecha de nacimiento).',
      '• Habilitar autenticación de dos factores (2FA) en todas las cuentas detectadas.',
      '• Monitorear periódicamente la huella digital en redes sociales.',
      '• Considerar la desactivación de perfiles no utilizados.',
      '• Utilizar seudónimos o nombres alternativos en nuevas cuentas para dificultar la correlación.',
    ];
    for (const rec of socialRecs) {
      checkPage(doc, 14);
      drawParagraph(doc, rec, { fontSize: 8.5, indent: 8 });
    }

    // Per-platform recommendations
    if (foundCount > 0) {
      doc.moveDown(0.15);
      checkPage(doc, 30);
      setFont(doc, true).fillColor(C.navy).fontSize(9)
        .text('Recomendaciones por Plataforma', M.left, doc.y, { width: CW });
      doc.moveDown(0.1);

      for (const result of scanResults.filter(r => r.profileFound || r.findings.length > 0)) {
        checkPage(doc, 18);
        setFont(doc, true).fillColor(C.accent).fontSize(8.5)
          .text(`${result.platform}${result.profileVerified ? ' (Verificado)' : ''}`, M.left, doc.y, { width: CW });
        doc.moveDown(0.1);

        const platformRec = result.profileVerified
          ? '• Perfil verificado detectado. Se recomienda revisar la información visible públicamente y limitar la exposición de datos personales.'
          : result.profileFound
          ? '• Perfil encontrado. Restringir la visibilidad del perfil, revisar configuración de privacidad y evaluar si la cuenta es necesaria.'
          : '• Se detectaron menciones sin perfil confirmado. Monitorear futuras apariciones y evaluar si es necesario crear alertas.';
        drawParagraph(doc, platformRec, { fontSize: 8.5, indent: 8 });
      }
    }

    // Legal disclaimer
    doc.moveDown(0.15);
    checkPage(doc, 40);
    setFont(doc, true).fillColor(C.navy).fontSize(9)
      .text('Aviso Legal', M.left, doc.y, { width: CW });
    doc.moveDown(0.1);
    drawParagraph(doc, 'Este informe ha sido generado mediante técnicas OSINT. La información proviene de fuentes públicas. No constituye investigación oficial ni prueba judicial sin validación. Uso sujeto a Ley 1581/2012 y Ley 1273/2009.', { fontSize: 7.5, color: C.textLight });

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

    // ── Cover ──
    doc.addPage();
    drawProfessionalCover(doc, {
      title: 'INFORME DE INVESTIGACIÓN',
      subtitle: 'Análisis de Vínculos',
      fullName: `${analysis.sheet1Name} ↔ ${analysis.sheet2Name}`,
      reportId,
      riskScore: Math.min(100, analysis.totalLinks * 8),
      riskLevel: analysis.totalLinks >= 10 ? 'CRÍTICO' : analysis.totalLinks >= 5 ? 'ALTO' : analysis.totalLinks >= 2 ? 'MODERADO' : 'BAJO',
      riskColor: analysis.totalLinks >= 10 ? C.red : analysis.totalLinks >= 5 ? C.orange : analysis.totalLinks >= 2 ? C.yellow : C.green,
      today,
    });

    // ── Analysis content ──
    doc.addPage();
    drawSectionHeader(doc, 'RESUMEN DEL ANÁLISIS DE VÍNCULOS');
    drawParagraph(doc, `Análisis de vínculos entre "${analysis.sheet1Name}" (${analysis.sheet1RowCount} registros) y "${analysis.sheet2Name}" (${analysis.sheet2RowCount} registros). Se identificaron ${analysis.totalLinks} vínculos.`);

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
      for (const [type, count] of summaryItems) {
        checkPage(doc, 14);
        const sy = doc.y;
        doc.fillColor(C.accent).rect(M.left, sy, 3, 12).fill();
        setFont(doc, true).fillColor(C.text).fontSize(8)
          .text(`${count}`, M.left + 8, sy + 2, { width: 20 });
        setFont(doc, false).fillColor(C.text).fontSize(8)
          .text(type, M.left + 30, sy + 2, { width: 200 });
        doc.y = sy + 14;
      }
    }

    drawSectionHeader(doc, 'DETALLE DE VÍNCULOS');
    if (analysis.links.length > 0) {
      checkPage(doc, 15);
      let y = doc.y;
      doc.fillColor(C.tableHeader).rect(M.left, y, CW, 13).fill();
      setFont(doc, true).fillColor(C.white).fontSize(6.5)
        .text('#', M.left + 3, y + 3, { width: 20 })
        .text('Tipo', M.left + 25, y + 3, { width: 70 })
        .text('Personas', M.left + 97, y + 3, { width: 150 })
        .text('Campo', M.left + 250, y + 3, { width: 80 })
        .text('Valor', M.left + 332, y + 3, { width: CW - 335 });
      doc.y = y + 14;

      for (let i = 0; i < Math.min(analysis.links.length, 30); i++) {
        checkPage(doc, 13);
        const l = analysis.links[i];
        y = doc.y;
        if (i % 2 === 0) doc.fillColor(C.tableStripe).rect(M.left, y, CW, 12).fill();
        setFont(doc, false).fillColor(C.text).fontSize(6)
          .text(String(i + 1), M.left + 3, y + 3, { width: 20 })
          .text(l.type, M.left + 25, y + 3, { width: 70 })
          .text(`${l.sheet1Person} ↔ ${l.sheet2Person}`, M.left + 97, y + 3, { width: 150, ellipsis: true })
          .text(l.matchedField, M.left + 250, y + 3, { width: 80 })
          .text(l.matchedValue.substring(0, 30), M.left + 332, y + 3, { width: CW - 335, ellipsis: true });
        doc.y = y + 12;
      }
    }

    checkPage(doc, 40);
    drawSectionHeader(doc, 'AVISO LEGAL');
    drawParagraph(doc, 'Este informe ha sido generado mediante técnicas OSINT. La información proviene de fuentes públicas. No constituye investigación oficial ni prueba judicial sin validación. Uso sujeto a Ley 1581/2012 y Ley 1273/2009.', { fontSize: 7.5 });

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
