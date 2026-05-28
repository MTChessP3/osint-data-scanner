/**
 * Generador de Informes OSINT en PDF — Formato PROFESIONAL 8 Páginas
 *
 * Estructura:
 *  Pág 1: Portada
 *  Pág 2: Resumen Ejecutivo
 *  Pág 3-5: Hallazgos Detallados (agrupados por severidad)
 *  Pág 6: Recomendaciones
 *  Pág 7: Indicadores de Riesgo
 *  Pág 8: Fuentes y Anexos
 *
 * Límites: máx 4 críticos, 4 altos, 4 medios, 2 bajos
 * Fuentes: DejaVuSans / DejaVuSans-Bold
 */

import PDFDocument from 'pdfkit';
import { OSINTResult } from './osint-scanner';
import { RelationshipAnalysisResult } from './relationship-analyzer';

// ── Font paths ──
const FONT_REGULAR = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf';
const FONT_BOLD = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf';

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
};

const SEV: Record<string, { color: string; label: string; bg: string }> = {
  critical: { color: '#ffffff', label: 'CRÍTICO', bg: '#c0392b' },
  high: { color: '#ffffff', label: 'ALTO', bg: '#e67e22' },
  medium: { color: '#000000', label: 'MEDIO', bg: '#f1c40f' },
  low: { color: '#ffffff', label: 'BAJO', bg: '#2980b9' },
  info: { color: '#ffffff', label: 'INFO', bg: '#95a5a6' },
};

const SEV_LIMITS: Record<string, number> = {
  critical: 4,
  high: 4,
  medium: 4,
  low: 2,
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

// ── Font helper ──
function setFont(doc: PDFDocument, bold: boolean = false): PDFDocument {
  return doc.font(bold ? 'DejaVuBold' : 'DejaVuRegular');
}

// ── Drawing helpers ──

function drawSectionHeader(doc: PDFDocument, title: string): void {
  checkPage(doc, 40);
  doc.moveDown(0.4);
  const y = doc.y;
  // Navy background bar
  doc.fillColor(C.navy).rect(M.left, y, CW, 22).fill();
  setFont(doc, true).fillColor(C.white).fontSize(11)
    .text(title, M.left + 8, y + 5, { width: CW - 16 });
  doc.y = y + 26;
  doc.moveDown(0.3);
}

function drawParagraph(doc: PDFDocument, text: string, opts?: { fontSize?: number; color?: string; bold?: boolean; indent?: number }): void {
  const fs = opts?.fontSize || 9;
  const color = opts?.color || C.text;
  const bold = opts?.bold || false;
  const indent = opts?.indent || 0;
  setFont(doc, bold).fillColor(color).fontSize(fs)
    .text(text, M.left + indent, doc.y, { width: CW - indent, align: 'justify', lineGap: 2 });
  doc.moveDown(0.2);
}

function truncateUrl(url: string, maxLen: number = 60): string {
  if (!url) return '';
  if (url.length <= maxLen) return url;
  return url.substring(0, maxLen - 3) + '...';
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
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const doc = new PDFDocument({
      size: 'LETTER',
      margins: M,
      bufferPages: true,
      autoFirstPage: false,
    });

    // Register fonts
    doc.registerFont('DejaVuRegular', FONT_REGULAR);
    doc.registerFont('DejaVuBold', FONT_BOLD);

    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const today = formatDate();
    const reportId = data.scanId
      ? `OSINT-${data.scanId.substring(0, 8).toUpperCase()}`
      : `OSINT-${Date.now().toString(36).toUpperCase()}`;

    // Filter and categorize results
    const realResults = data.results.filter(r => r.category !== 'error');
    const crit = realResults.filter(r => r.severity === 'critical').length;
    const high = realResults.filter(r => r.severity === 'high').length;
    const med = realResults.filter(r => r.severity === 'medium').length;
    const low = realResults.filter(r => r.severity === 'low').length;
    const infoCount = realResults.filter(r => r.severity === 'info').length;
    const riskScore = data.riskScore ?? Math.min(100, crit * 30 + high * 15 + med * 5 + low * 2);
    const riskLevel = riskScore >= 70 ? 'CRÍTICO' : riskScore >= 40 ? 'ALTO' : riskScore >= 15 ? 'MODERADO' : 'BAJO';
    const riskColor = riskScore >= 70 ? C.red : riskScore >= 40 ? C.orange : riskScore >= 15 ? C.yellow : C.green;
    const uniqueSources = [...new Set(realResults.map(r => r.source))];

    // Apply finding limits
    const limitedResults: OSINTResult[] = [];
    const severityOrder = ['critical', 'high', 'medium', 'low', 'info'] as const;
    for (const sev of severityOrder) {
      const filtered = realResults.filter(r => r.severity === sev);
      const limit = SEV_LIMITS[sev] || 99;
      limitedResults.push(...filtered.slice(0, limit));
    }

    // ════════════════════════════════════════
    //  PÁGINA 1: PORTADA
    // ════════════════════════════════════════
    doc.addPage();
    // Full navy background
    doc.rect(0, 0, PAGE_W, PAGE_H).fill(C.navy);

    // Title
    doc.y = 150;
    setFont(doc, true).fillColor(C.white).fontSize(26)
      .text('INFORME DE INVESTIGACIÓN OSINT', M.left, doc.y, { width: CW, align: 'center' });
    doc.moveDown(1.5);

    // Decorative line
    const lineY = doc.y;
    doc.strokeColor(C.teal).lineWidth(2)
      .moveTo(PAGE_W / 2 - 100, lineY).lineTo(PAGE_W / 2 + 100, lineY).stroke();
    doc.y = lineY + 30;

    // Risk score box
    const gaugeW = 140;
    const gaugeX = PAGE_W / 2 - gaugeW / 2;
    const gaugeY = doc.y;
    doc.fillColor(riskColor).rect(gaugeX, gaugeY, gaugeW, 55).fill();
    setFont(doc, true).fillColor(C.white).fontSize(28)
      .text(`${riskScore}`, gaugeX, gaugeY + 6, { width: gaugeW, align: 'center' });
    setFont(doc, true).fillColor(C.white).fontSize(10)
      .text(`/100  ${riskLevel}`, gaugeX, gaugeY + 36, { width: gaugeW, align: 'center' });
    doc.y = gaugeY + 70;

    // Subject data
    doc.moveDown(0.5);
    setFont(doc, true).fillColor(C.white).fontSize(12)
      .text(`${data.fullName}`, M.left, doc.y, { width: CW, align: 'center' });
    doc.moveDown(0.4);

    const subjectLines: string[] = [];
    if (data.cedula) subjectLines.push(`Cédula: ${data.cedula}`);
    if (data.email) subjectLines.push(`Email: ${data.email}`);
    if (data.phone) subjectLines.push(`Teléfono: ${data.phone}`);
    if (subjectLines.length > 0) {
      setFont(doc, false).fillColor('#90caf9').fontSize(9)
        .text(subjectLines.join('  |  '), M.left, doc.y, { width: CW, align: 'center' });
      doc.moveDown(0.3);
    }

    doc.moveDown(0.5);
    setFont(doc, false).fillColor('#90caf9').fontSize(9)
      .text(`ID Informe: ${reportId}`, M.left, doc.y, { width: CW, align: 'center' });
    doc.moveDown(0.2);
    setFont(doc, false).fillColor('#90caf9').fontSize(9)
      .text(`Fecha: ${today}`, M.left, doc.y, { width: CW, align: 'center' });

    // Classification label
    setFont(doc, true).fillColor(C.redBright).fontSize(10)
      .text('CLASIFICACIÓN: CONFIDENCIAL', M.left, PAGE_H - 90, { width: CW, align: 'center' });
    setFont(doc, false).fillColor(C.gray).fontSize(7)
      .text('OSINT Data Scanner', M.left, PAGE_H - 70, { width: CW, align: 'center' });

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

    // Info next to score
    doc.fillColor(C.bg).rect(M.left + 90, boxY, CW - 90, boxH).fill();
    const infoX = M.left + 100;
    setFont(doc, true).fillColor(C.navy).fontSize(10)
      .text(data.fullName, infoX, boxY + 6, { width: CW - 110 });
    setFont(doc, false).fillColor(C.textLight).fontSize(8)
      .text(`${realResults.length} hallazgos en ${uniqueSources.length} fuentes  |  Email: ${data.email || 'N/A'}  |  Tel: ${data.phone || 'N/A'}`, infoX, boxY + 20, { width: CW - 110 });

    // Severity counts inline
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
      ? `La investigación OSINT identificó ${crit} hallazgo(s) crítico(s) que representan un riesgo inmediato para la seguridad digital del sujeto. Se detectaron filtraciones de credenciales y/o exposición de datos sensibles que requieren acción correctiva inmediata. Se recomienda cambiar contraseñas comprometidas, habilitar autenticación multifactor y solicitar eliminación de datos en brokers de información. El nivel de riesgo calculado es ${riskLevel} con un puntaje de ${riskScore}/100.`
      : high > 0
      ? `La investigación identificó ${high} hallazgo(s) de severidad alta que indican exposición significativa de datos personales del sujeto. Se encontraron menciones en fuentes de riesgo que requieren atención prioritaria y medidas de protección digital. El nivel de riesgo calculado es ${riskLevel} con un puntaje de ${riskScore}/100.`
      : med > 0 || low > 0
      ? `La investigación identificó hallazgos de severidad media/baja que indican cierta exposición digital del sujeto. Se recomienda implementar medidas de protección preventiva y monitoreo periódico. El nivel de riesgo calculado es ${riskLevel} con un puntaje de ${riskScore}/100.`
      : `No se identificaron hallazgos de riesgo significativo en las fuentes consultadas. Se recomienda mantener prácticas de higiene digital y monitoreo periódico. El nivel de riesgo calculado es ${riskLevel} con un puntaje de ${riskScore}/100.`;
    drawParagraph(doc, execNarrative);

    // Risk assessment text
    doc.moveDown(0.3);
    setFont(doc, true).fillColor(C.navy).fontSize(9)
      .text('Evaluación de Riesgo:', M.left, doc.y, { width: CW });
    doc.moveDown(0.15);
    drawParagraph(doc, `Nivel de riesgo: ${riskLevel} (${riskScore}/100). ${crit > 0 ? 'Se requiere intervención inmediata.' : high > 0 ? 'Se requiere atención prioritaria.' : 'Se recomienda seguimiento.'}`, { fontSize: 8.5, color: C.textLight });

    // Key findings counts
    doc.moveDown(0.3);
    setFont(doc, true).fillColor(C.navy).fontSize(9)
      .text('Hallazgos por Severidad:', M.left, doc.y, { width: CW });
    doc.moveDown(0.15);
    const countLines: string[] = [];
    if (crit > 0) countLines.push(`• Críticos: ${crit}`);
    if (high > 0) countLines.push(`• Altos: ${high}`);
    if (med > 0) countLines.push(`• Medios: ${med}`);
    if (low > 0) countLines.push(`• Bajos: ${low}`);
    if (infoCount > 0) countLines.push(`• Informativos: ${infoCount}`);
    if (countLines.length === 0) countLines.push('• Sin hallazgos significativos');
    drawParagraph(doc, countLines.join('    '), { fontSize: 9 });

    // ════════════════════════════════════════
    //  PÁGINAS 3-5: HALLAZGOS DETALLADOS
    // ════════════════════════════════════════
    doc.addPage();
    drawSectionHeader(doc, 'HALLAZGOS DETALLADOS');

    if (limitedResults.filter(r => r.severity !== 'info').length === 0 && realResults.length === 0) {
      drawParagraph(doc, 'No se identificaron hallazgos en las fuentes automatizadas consultadas. Se recomienda realizar verificación manual en cada motor de búsqueda para obtener resultados completos. La ausencia de resultados automáticos no garantiza la no exposición del sujeto.');
    } else {
      const displaySeverities = ['critical', 'high', 'medium', 'low'] as const;
      let findingNum = 0;

      for (const severity of displaySeverities) {
        const filtered = limitedResults.filter(r => r.severity === severity);
        if (filtered.length === 0) continue;

        const sev = SEV[severity];
        const totalOfSev = realResults.filter(r => r.severity === severity).length;
        const showingCount = filtered.length;
        const omittedCount = totalOfSev - showingCount;

        // Severity section header
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

          // Color-coded severity square
          doc.fillColor(sev.bg).rect(M.left, cardY, 4, 8).fill();

          // Title in bold
          setFont(doc, true).fillColor(C.navy).fontSize(9)
            .text(`${findingNum}. ${r.title}`, M.left + 10, cardY, { width: CW - 14 });
          doc.moveDown(0.1);

          // Description as paragraph
          const desc = r.description || r.dataFound || 'Sin descripción disponible';
          checkPage(doc, 30);
          setFont(doc, false).fillColor(C.text).fontSize(8)
            .text(desc, M.left + 10, doc.y, { width: CW - 14, lineGap: 1.5 });
          doc.moveDown(0.1);

          // Source and category in gray
          checkPage(doc, 14);
          setFont(doc, false).fillColor(C.textLight).fontSize(7)
            .text(`Fuente: ${r.source}  |  Categoría: ${catES(r.category)}`, M.left + 10, doc.y, { width: CW - 14 });

          // URL if available (truncated)
          if (r.url) {
            checkPage(doc, 12);
            setFont(doc, false).fillColor(C.blue).fontSize(6.5)
              .text(truncateUrl(r.url, 80), M.left + 10, doc.y, { width: CW - 14 });
          }

          doc.moveDown(0.3);

          // Thin separator
          const sepY = doc.y;
          doc.strokeColor('#e0e0e0').lineWidth(0.3)
            .moveTo(M.left + 8, sepY).lineTo(PAGE_W - M.right, sepY).stroke();
          doc.y = sepY + 4;
        }
      }
    }

    // ════════════════════════════════════════
    //  PÁGINA 6: RECOMENDACIONES
    // ════════════════════════════════════════
    doc.addPage();
    drawSectionHeader(doc, 'RECOMENDACIONES');

    // Group recommendations by category
    const recCategories = new Map<string, { cat: string; count: number; rec: string }>();
    for (const r of limitedResults) {
      if (r.severity === 'info') continue;
      const cat = r.category;
      if (!recCategories.has(cat)) {
        recCategories.set(cat, { cat, count: 0, rec: recFor(cat) });
      }
      recCategories.get(cat)!.count++;
    }

    // Add general recommendations
    if (recCategories.size === 0) {
      drawParagraph(doc, 'No se requieren acciones correctivas específicas basadas en los hallazgos del informe.', { fontSize: 9 });
    }

    // General first
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

    // Category-specific recommendations
    if (recCategories.size > 0) {
      doc.moveDown(0.3);
      setFont(doc, true).fillColor(C.navy).fontSize(9)
        .text('Recomendaciones por Categoría', M.left, doc.y, { width: CW });
      doc.moveDown(0.15);

      for (const [, item] of recCategories) {
        checkPage(doc, 20);
        setFont(doc, true).fillColor(C.accent).fontSize(8.5)
          .text(`${catES(item.cat)} (${item.count} hallazgo${item.count > 1 ? 's' : ''})`, M.left, doc.y, { width: CW });
        doc.moveDown(0.1);
        drawParagraph(doc, `• ${item.rec}`, { fontSize: 8.5, indent: 8 });
      }
    }

    // Additional recommendations
    doc.moveDown(0.3);
    checkPage(doc, 30);
    setFont(doc, true).fillColor(C.navy).fontSize(9)
      .text('Verificación Manual Recomendada', M.left, doc.y, { width: CW });
    doc.moveDown(0.15);
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
    //  PÁGINA 7: INDICADORES DE RIESGO
    // ════════════════════════════════════════
    doc.addPage();
    drawSectionHeader(doc, 'INDICADORES DE RIESGO');

    // Overall risk assessment
    setFont(doc, true).fillColor(C.navy).fontSize(9)
      .text('Evaluación General de Riesgo', M.left, doc.y, { width: CW });
    doc.moveDown(0.15);

    // Risk score visual box
    checkPage(doc, 40);
    const riskBoxY = doc.y;
    doc.fillColor(riskColor).rect(M.left, riskBoxY, CW, 30).fill();
    setFont(doc, true).fillColor(C.white).fontSize(14)
      .text(`Nivel de Riesgo: ${riskLevel}  —  Puntaje: ${riskScore}/100`, M.left + 10, riskBoxY + 8, { width: CW - 20, align: 'center' });
    doc.y = riskBoxY + 38;

    // Category breakdown
    doc.moveDown(0.2);
    setFont(doc, true).fillColor(C.navy).fontSize(9)
      .text('Desglose por Categoría de Riesgo', M.left, doc.y, { width: CW });
    doc.moveDown(0.15);

    // Table header
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

    // Risk factors as text
    setFont(doc, true).fillColor(C.navy).fontSize(9)
      .text('Factores de Riesgo Identificados', M.left, doc.y, { width: CW });
    doc.moveDown(0.15);

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
    //  PÁGINA 8: FUENTES Y ANEXOS
    // ════════════════════════════════════════
    doc.addPage();
    drawSectionHeader(doc, 'FUENTES Y ANEXOS');

    // Sources consulted
    setFont(doc, true).fillColor(C.navy).fontSize(9)
      .text('Fuentes Consultadas', M.left, doc.y, { width: CW });
    doc.moveDown(0.15);

    const sourceMap = new Map<string, number>();
    for (const r of realResults) sourceMap.set(r.source, (sourceMap.get(r.source) || 0) + 1);
    const sourceEntries = Array.from(sourceMap.entries());

    if (sourceEntries.length > 0) {
      for (let i = 0; i < sourceEntries.length; i++) {
        checkPage(doc, 12);
        const sy = doc.y;
        if (i % 2 === 0) doc.fillColor(C.tableStripe).rect(M.left, sy, CW, 11).fill();
        setFont(doc, false).fillColor(C.text).fontSize(7.5)
          .text(sourceEntries[i][0], M.left + 4, sy + 2, { width: CW * 0.75 });
        setFont(doc, false).fillColor(C.textLight).fontSize(7.5)
          .text(`${sourceEntries[i][1]} hallazgo(s)`, M.left + CW * 0.75, sy + 2, { width: CW * 0.25 - 4 });
        doc.y = sy + 11;
      }
    } else {
      drawParagraph(doc, 'No se consultaron fuentes adicionales.', { fontSize: 8 });
    }

    // Also list standard OSINT sources
    doc.moveDown(0.3);
    checkPage(doc, 30);
    setFont(doc, true).fillColor(C.navy).fontSize(9)
      .text('Fuentes Estándar OSINT', M.left, doc.y, { width: CW });
    doc.moveDown(0.1);

    const standardSources: string[] = [
      'Have I Been Pwned', 'Pwned Passwords', 'Google Dorking',
      'Social Media Scan', 'Data Broker Scan', 'Dark Web / Leak Scan',
      'Document Exposure', 'LeakRadar', 'Policía Nacional',
      'HIBP Deep Check', 'DeepFind Profile', 'Pipl',
      'LeakIX', 'Aleph / OCCRP', 'Dehashed',
    ];
    // Two-column layout
    const srcColW = (CW - 10) / 2;
    const halfLen = Math.ceil(standardSources.length / 2);
    for (let i = 0; i < halfLen; i++) {
      checkPage(doc, 10);
      const sY = doc.y;
      setFont(doc, false).fillColor(C.text).fontSize(7)
        .text(`${i + 1}. ${standardSources[i]}`, M.left, sY, { width: srcColW });
      const rIdx = i + halfLen;
      if (rIdx < standardSources.length) {
        setFont(doc, false).fillColor(C.text).fontSize(7)
          .text(`${rIdx + 1}. ${standardSources[rIdx]}`, M.left + srcColW + 10, sY, { width: srcColW });
      }
      doc.y = sY + 9;
    }

    // Legal disclaimer
    doc.moveDown(0.3);
    checkPage(doc, 50);
    setFont(doc, true).fillColor(C.navy).fontSize(9)
      .text('Aviso Legal', M.left, doc.y, { width: CW });
    doc.moveDown(0.1);
    drawParagraph(doc, 'Este informe ha sido generado mediante técnicas OSINT (Open Source Intelligence). La información proviene de fuentes públicas accesibles y no constituye investigación oficial ni prueba judicial sin validación por las autoridades competentes. El uso de este informe debe cumplir con la Ley 1581 de 2012 (Protección de Datos Personales), la Ley 1273 de 2009 (Delitos Informáticos), y la Constitución Política de Colombia. El responsable del tratamiento de datos es quien solicita el informe.', { fontSize: 7.5, color: C.textLight });

    // Signature block
    checkPage(doc, 65);
    doc.moveDown(0.4);
    doc.strokeColor(C.tableBorder).lineWidth(0.5)
      .moveTo(M.left, doc.y).lineTo(PAGE_W - M.right, doc.y).stroke();
    doc.moveDown(0.3);

    setFont(doc, false).fillColor(C.textLight).fontSize(7.5)
      .text('Elaborado por:', M.left, doc.y, { width: CW * 0.5, continued: false });
    setFont(doc, true).fillColor(C.text).fontSize(8)
      .text('OSINT Data Scanner', M.left, doc.y, { width: CW * 0.5 });
    doc.moveDown(0.2);

    setFont(doc, false).fillColor(C.textLight).fontSize(7.5)
      .text('Código del informe:', M.left, doc.y, { width: CW * 0.5, continued: false });
    setFont(doc, true).fillColor(C.text).fontSize(8)
      .text(reportId, M.left, doc.y, { width: CW * 0.5 });
    doc.moveDown(0.4);

    // Signature lines
    const sigY = doc.y;
    const sigW = (CW - 40) / 2;
    doc.strokeColor(C.lightGray).lineWidth(0.5)
      .moveTo(M.left, sigY + 25).lineTo(M.left + sigW, sigY + 25).stroke()
      .moveTo(M.left + sigW + 40, sigY + 25).lineTo(PAGE_W - M.right, sigY + 25).stroke();
    setFont(doc, false).fillColor(C.textLight).fontSize(7)
      .text('Revisado por', M.left, sigY + 28, { width: sigW, align: 'center' })
      .text('Aprobado por', M.left + sigW + 40, sigY + 28, { width: sigW, align: 'center' });

    // ════════════════════════════════════════
    //  FOOTERS (all non-cover pages)
    // ════════════════════════════════════════
    const pages = doc.bufferedPageRange().count;
    for (let i = 0; i < pages; i++) {
      doc.switchToPage(i);
      if (i === 0) continue; // skip cover page
      doc.strokeColor(C.lightGray).lineWidth(0.3)
        .moveTo(M.left, PAGE_H - 30).lineTo(PAGE_W - M.right, PAGE_H - 30).stroke();
      setFont(doc, false).fillColor(C.gray).fontSize(6)
        .text(`CONFIDENCIAL  |  ${reportId}  |  Página ${i} de ${pages - 1}`, M.left, PAGE_H - 24, { width: CW, align: 'center' });
    }

    doc.end();
  });
}

// ════════════════════════════════════════════════════════════════
//  COMPATIBILITY: generateIndividualPDF
//  Wraps generatePDFReport with the older signature used by API routes
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
//  REPORTE CONJUNTO EN PDF (Análisis de Vínculos)
// ════════════════════════════════════════════════════════════════

export async function generateJointPDF(
  analysis: RelationshipAnalysisResult,
  individualScans: { name: string; results: OSINTResult[] }[]
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const doc = new PDFDocument({
      size: 'LETTER',
      margins: M,
      bufferPages: true,
      autoFirstPage: false,
    });

    // Register fonts
    doc.registerFont('DejaVuRegular', FONT_REGULAR);
    doc.registerFont('DejaVuBold', FONT_BOLD);

    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const today = formatDate();
    const reportId = `OSINT-JOINT-${Date.now().toString(36).toUpperCase()}`;

    // ── Cover ──
    doc.addPage();
    doc.rect(0, 0, PAGE_W, PAGE_H).fill(C.navy);
    doc.y = 180;
    setFont(doc, true).fillColor(C.white).fontSize(24)
      .text('INFORME DE INVESTIGACIÓN OSINT', M.left, doc.y, { width: CW, align: 'center' });
    doc.moveDown(0.3);
    setFont(doc, true).fillColor(C.teal).fontSize(14)
      .text('Análisis de Vínculos', M.left, doc.y, { width: CW, align: 'center' });
    doc.moveDown(1);

    // Decorative line
    const lineY = doc.y;
    doc.strokeColor(C.teal).lineWidth(2)
      .moveTo(PAGE_W / 2 - 80, lineY).lineTo(PAGE_W / 2 + 80, lineY).stroke();
    doc.y = lineY + 25;

    setFont(doc, true).fillColor(C.white).fontSize(11)
      .text(`${analysis.sheet1Name} ↔ ${analysis.sheet2Name}`, M.left, doc.y, { width: CW, align: 'center' });
    doc.moveDown(0.5);
    setFont(doc, false).fillColor('#90caf9').fontSize(9)
      .text(`${analysis.totalLinks} vínculos identificados  |  ${today}`, M.left, doc.y, { width: CW, align: 'center' });
    doc.moveDown(0.3);
    setFont(doc, false).fillColor('#90caf9').fontSize(9)
      .text(`ID Informe: ${reportId}`, M.left, doc.y, { width: CW, align: 'center' });

    setFont(doc, true).fillColor(C.redBright).fontSize(10)
      .text('CLASIFICACIÓN: CONFIDENCIAL', M.left, PAGE_H - 90, { width: CW, align: 'center' });

    // ── Analysis content ──
    doc.addPage();
    drawSectionHeader(doc, 'RESUMEN DEL ANÁLISIS DE VÍNCULOS');
    drawParagraph(doc, `Análisis de vínculos entre "${analysis.sheet1Name}" (${analysis.sheet1RowCount} registros) y "${analysis.sheet2Name}" (${analysis.sheet2RowCount} registros). Se identificaron ${analysis.totalLinks} vínculos.`);

    // Summary by type
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

    // Links detail
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

    // Legal
    checkPage(doc, 40);
    drawSectionHeader(doc, 'AVISO LEGAL');
    drawParagraph(doc, 'Este informe ha sido generado mediante técnicas OSINT. La información proviene de fuentes públicas. No constituye investigación oficial ni prueba judicial sin validación. Uso sujeto a Ley 1581/2012 y Ley 1273/2009.', { fontSize: 7.5 });

    // ── Footers ──
    const pages = doc.bufferedPageRange().count;
    for (let i = 0; i < pages; i++) {
      doc.switchToPage(i);
      if (i === 0) continue;
      doc.strokeColor(C.lightGray).lineWidth(0.3)
        .moveTo(M.left, PAGE_H - 30).lineTo(PAGE_W - M.right, PAGE_H - 30).stroke();
      setFont(doc, false).fillColor(C.gray).fontSize(6)
        .text(`CONFIDENCIAL  |  ${reportId}  |  Página ${i} de ${pages - 1}`, M.left, PAGE_H - 24, { width: CW, align: 'center' });
    }

    doc.end();
  });
}
