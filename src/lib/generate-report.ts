/**
 * Generador de Informes OSINT en DOCX — Formato PROFESIONAL
 * SIN TABLAS. Solo parrafos, encabezados, listas con viñetas y texto formateado.
 * Maximo 8 paginas. Formato legible y presentable.
 *
 * Estructura (8 paginas):
 *  Pag 1: Portada
 *  Pag 2: Resumen Ejecutivo
 *  Pag 3-5: Hallazgos Detallados
 *  Pag 6: Recomendaciones
 *  Pag 7: Indicadores de Riesgo
 *  Pag 8: Fuentes y Anexos
 */

import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  BorderStyle,
  ShadingType,
  PageBreak,
} from 'docx';
import { OSINTResult } from './osint-scanner';

// ── Source Anonymization ──
const DOCX_SOURCE_MAP = new Map<string, number>();
let docxSourceCounter = 0;

function anonymizeSource(source: string): string {
  if (!source) return 'Fuente de Inteligencia #0';
  if (!DOCX_SOURCE_MAP.has(source)) {
    docxSourceCounter++;
    DOCX_SOURCE_MAP.set(source, docxSourceCounter);
  }
  return `Fuente de Inteligencia #${DOCX_SOURCE_MAP.get(source)}`;
}

function resetDocxSourceMap(): void {
  DOCX_SOURCE_MAP.clear();
  docxSourceCounter = 0;
}

// ── Color Palette ──
const C = {
  navy: '1a365d',
  navyDark: '0d1b2a',
  teal: '00b4d8',
  red: 'c53030',
  redBright: 'e74c3c',
  orange: 'dd6b20',
  yellow: 'd69e2e',
  blue: '3182ce',
  green: '27ae60',
  gray: '7f8c8d',
  lightGray: 'bdc3c7',
  text: '2c3e50',
  textLight: '636e72',
  white: 'FFFFFF',
};

const SEV: Record<string, { color: string; label: string; bg: string }> = {
  critical: { color: C.red, label: 'CRITICO', bg: C.red },
  high: { color: C.orange, label: 'ALTO', bg: C.orange },
  medium: { color: C.yellow, label: 'MEDIO', bg: C.yellow },
  low: { color: C.blue, label: 'BAJO', bg: C.blue },
  info: { color: C.gray, label: 'INFO', bg: C.gray },
};

const CAT_ES: Record<string, string> = {
  credential_breach: 'Filtracion de Credenciales',
  password_exposure: 'Exposicion de Contrasena',
  personal_exposure: 'Exposicion Personal',
  social_media: 'Redes Sociales',
  data_broker: 'Broker de Datos',
  dark_web_mention: 'Dark Web',
  paste_site: 'Sitio de Paste',
  document_exposure: 'Documentos Expuestos',
  judicial: 'Registros Judiciales',
};

const REC_MAP: Record<string, string> = {
  credential_breach: 'Cambiar todas las contrasenas afectadas y habilitar autenticacion en dos pasos (2FA) de inmediato.',
  password_exposure: 'Rotar las contrasenas comprometidas inmediatamente. Implementar MFA en todas las cuentas criticas.',
  personal_exposure: 'Solicitar la eliminacion de datos personales en los sitios correspondientes. Restringir la configuracion de privacidad.',
  dark_web_mention: 'Implementar monitoreo continuo en la dark web. Configurar alertas de fraude y suplantacion de identidad.',
  paste_site: 'Cambiar las credenciales comprometidas identificadas. Revisar y revocar accesos no autorizados.',
  data_broker: 'Ejercer el derecho de supresion conforme a la Ley 1581 de 2012. Contactar cada broker de datos.',
  social_media: 'Revisar y ajustar la configuracion de privacidad en todas las plataformas sociales. Limitar informacion publica.',
  document_exposure: 'Solicitar la eliminacion del documento expuesto. Verificar el alcance de la filtracion.',
  judicial: 'Verificar manualmente los registros en las fuentes oficiales. Consultar con asesoria legal si es necesario.',
};

function catES(cat: string): string {
  return CAT_ES[cat] || cat;
}
function recFor(cat: string): string {
  return REC_MAP[cat] || 'Investigar el hallazgo y tomar medidas correctivas apropiadas.';
}

function formatDate(): string {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

// ── Max findings per severity (8-page constraint) ──
const MAX_FINDINGS: Record<string, number> = {
  critical: 4,
  high: 4,
  medium: 4,
  low: 2,
  info: 2,
};

// ── Paragraph builders (NO TABLES) ──

function emptyPara(spacing?: { before?: number; after?: number }): Paragraph {
  return new Paragraph({ spacing: spacing || { after: 60 }, children: [] });
}

/** Section header with navy background bar */
function sectionHeader(text: string): Paragraph {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 300, after: 150 },
    shading: { type: ShadingType.SOLID, color: C.navy },
    children: [
      new TextRun({
        text: `  ${text.toUpperCase()}`,
        bold: true,
        size: 26,
        font: 'Arial',
        color: C.white,
      }),
    ],
  });
}

/** Sub-section header with navy text */
function subHeader(text: string): Paragraph {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 200, after: 80 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 2, color: C.navy } },
    children: [
      new TextRun({
        text,
        bold: true,
        size: 22,
        font: 'Arial',
        color: C.navy,
      }),
    ],
  });
}

/** Body paragraph with justified alignment */
function bodyPara(
  text: string,
  opts?: { bold?: boolean; color?: string; size?: number; indent?: number; italic?: boolean }
): Paragraph {
  const fs = opts?.size || 18;
  const color = opts?.color || C.text;
  const bold = opts?.bold || false;
  const italic = opts?.italic || false;
  return new Paragraph({
    spacing: { after: 80 },
    indent: opts?.indent ? { left: opts.indent } : undefined,
    alignment: AlignmentType.JUSTIFIED,
    children: [new TextRun({ text, size: fs, font: 'Arial', color, bold, italic })],
  });
}

/** Key-value paragraph: "Label: Value" */
function keyValuePara(key: string, value: string): Paragraph {
  return new Paragraph({
    spacing: { after: 40 },
    indent: { left: 200 },
    children: [
      new TextRun({ text: `${key}: `, bold: true, size: 18, font: 'Arial', color: C.navy }),
      new TextRun({ text: value || 'N/A', size: 18, font: 'Arial', color: C.text }),
    ],
  });
}

/** Bullet point paragraph */
function bulletPara(
  children: TextRun[],
  opts?: { level?: number; spacing?: { before?: number; after?: number } }
): Paragraph {
  return new Paragraph({
    bullet: { level: opts?.level ?? 0 },
    spacing: opts?.spacing || { after: 60 },
    children,
  });
}

/** Severity group header paragraph */
function severityHeader(label: string, sevColor: string, count: number): Paragraph {
  return new Paragraph({
    spacing: { before: 200, after: 80 },
    border: { left: { style: BorderStyle.SINGLE, size: 24, color: sevColor } },
    indent: { left: 100 },
    children: [
      new TextRun({
        text: `  ${label}`,
        bold: true,
        size: 22,
        font: 'Arial',
        color: sevColor,
      }),
      new TextRun({
        text: `  — ${count} hallazgo${count !== 1 ? 's' : ''}`,
        size: 18,
        font: 'Arial',
        color: C.textLight,
      }),
    ],
  });
}

/** Single finding as a set of paragraphs */
function findingParagraphs(
  num: number,
  title: string,
  source: string,
  category: string,
  description: string,
  severity: string,
  url?: string
): Paragraph[] {
  const sev = SEV[severity] || SEV.info;
  const paras: Paragraph[] = [];

  // Title line with severity badge
  paras.push(
    bulletPara(
      [
        new TextRun({ text: `[${sev.label}] `, bold: true, size: 16, font: 'Arial', color: sev.color }),
        new TextRun({ text: title, bold: true, size: 18, font: 'Arial', color: C.navy }),
      ],
      { spacing: { before: 80, after: 30 } }
    )
  );

  // Description
  if (description) {
    paras.push(
      new Paragraph({
        spacing: { after: 20 },
        indent: { left: 720 },
        alignment: AlignmentType.JUSTIFIED,
        children: [
          new TextRun({
            text: description.substring(0, 250),
            size: 16,
            font: 'Arial',
            color: C.textLight,
          }),
        ],
      })
    );
  }

  // Source + Category in italics
  paras.push(
    new Paragraph({
      spacing: { after: 20 },
      indent: { left: 720 },
      children: [
        new TextRun({ text: 'Fuente: ', bold: true, size: 14, font: 'Arial', color: C.gray }),
        new TextRun({ text: source, size: 14, font: 'Arial', color: C.textLight, italic: true }),
        new TextRun({ text: '  |  ', size: 14, font: 'Arial', color: C.lightGray }),
        new TextRun({ text: 'Categoria: ', bold: true, size: 14, font: 'Arial', color: C.gray }),
        new TextRun({ text: category, size: 14, font: 'Arial', color: C.textLight, italic: true }),
      ],
    })
  );

  // URL as separate paragraph
  if (url) {
    paras.push(
      new Paragraph({
        spacing: { after: 30 },
        indent: { left: 720 },
        children: [
          new TextRun({ text: 'URL: ', bold: true, size: 14, font: 'Arial', color: C.blue }),
          new TextRun({ text: url.substring(0, 120), size: 14, font: 'Arial', color: C.blue }),
        ],
      })
    );
  }

  // Separator
  paras.push(
    new Paragraph({
      spacing: { after: 40 },
      indent: { left: 720 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 1, color: C.lightGray } },
      children: [],
    })
  );

  return paras;
}

/** Risk indicator paragraph */
function riskIndicatorPara(label: string, value: string, state: string, stateColor: string): Paragraph {
  return bulletPara([
    new TextRun({ text: `${label}: `, bold: true, size: 17, font: 'Arial', color: C.navy }),
    new TextRun({ text: value, bold: true, size: 17, font: 'Arial', color: C.navy }),
    new TextRun({ text: ` — ${state}`, size: 16, font: 'Arial', color: stateColor }),
  ]);
}

// ════════════════════════════════════════════════════════════════
//  MAIN REPORT FUNCTION — MÁXIMO 8 PÁGINAS — SIN TABLAS
// ════════════════════════════════════════════════════════════════

export async function generateDocxReport(data: {
  results: OSINTResult[];
  fullName: string;
  cedula?: string;
  email?: string;
  phone?: string;
  riskScore?: number;
  scanId?: string;
}): Promise<Buffer> {
  // Reset source map for each report
  resetDocxSourceMap();

  const { results, fullName, cedula, email, phone, riskScore: providedScore, scanId } = data;
  const today = formatDate();
  const reportId = scanId ? `OSINT-${scanId.substring(0, 8).toUpperCase()}` : `OSINT-${Date.now().toString(36).toUpperCase()}`;

  // ── Filter and classify results ──
  const realResults = results.filter(r => r.category !== 'error');
  const crit = realResults.filter(r => r.severity === 'critical');
  const high = realResults.filter(r => r.severity === 'high');
  const med = realResults.filter(r => r.severity === 'medium');
  const low = realResults.filter(r => r.severity === 'low');
  const info = realResults.filter(r => r.severity === 'info');

  const critCount = crit.length;
  const highCount = high.length;
  const medCount = med.length;
  const lowCount = low.length;
  const infoCount = info.length;

  const computedScore = Math.min(100, critCount * 30 + highCount * 15 + medCount * 5 + lowCount * 2);
  const riskScore = providedScore ?? computedScore;
  const riskLevel =
    riskScore >= 70 ? 'CRITICO' : riskScore >= 40 ? 'ALTO' : riskScore >= 15 ? 'MODERADO' : 'BAJO';
  const riskColor =
    riskScore >= 70 ? C.red : riskScore >= 40 ? C.orange : riskScore >= 15 ? C.yellow : C.green;
  // Anonymize all sources
  const anonymizedResults = realResults.map(r => ({
    ...r,
    source: anonymizeSource(r.source),
  }));
  const uniqueSources = [...new Set(anonymizedResults.map(r => r.source))];

  const children: Paragraph[] = [];

  // ════════════════════════════════════════
  //  PÁGINA 1: PORTADA
  // ════════════════════════════════════════

  // Navy header bar
  children.push(
    new Paragraph({
      spacing: { before: 0, after: 0 },
      shading: { type: ShadingType.SOLID, color: C.navyDark },
      children: [
        new TextRun({
          text: '  INFORME OSINT',
          bold: true,
          size: 52,
          font: 'Arial',
          color: C.white,
        }),
      ],
    })
  );

  // Subtitle bar
  children.push(
    new Paragraph({
      spacing: { before: 0, after: 100 },
      shading: { type: ShadingType.SOLID, color: C.navy },
      children: [
        new TextRun({
          text: '  INFORME DE INVESTIGACION OSINT',
          bold: true,
          size: 24,
          font: 'Arial',
          color: C.teal,
        }),
      ],
    })
  );

  children.push(emptyPara({ before: 1200 }));

  // Risk score with visual indicator
  const riskBar = '█'.repeat(Math.ceil(riskScore / 10)) + '░'.repeat(10 - Math.ceil(riskScore / 10));
  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 60 },
      children: [
        new TextRun({ text: 'PUNTAJE DE RIESGO', bold: true, size: 20, font: 'Arial', color: C.navy }),
      ],
    })
  );
  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 40 },
      children: [
        new TextRun({ text: riskBar, size: 28, font: 'Courier New', color: riskColor }),
      ],
    })
  );
  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
      children: [
        new TextRun({ text: `${riskScore}/100`, bold: true, size: 36, font: 'Arial', color: riskColor }),
        new TextRun({ text: `  —  `, size: 24, font: 'Arial', color: C.textLight }),
        new TextRun({ text: riskLevel, bold: true, size: 28, font: 'Arial', color: riskColor }),
      ],
    })
  );

  // Subject identification as paragraphs with bold labels
  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 40 },
      children: [
        new TextRun({ text: 'SUJETO DE INVESTIGACION', bold: true, size: 18, font: 'Arial', color: C.navy }),
      ],
    })
  );

  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 20 },
      children: [
        new TextRun({ text: 'Nombre: ', bold: true, size: 20, font: 'Arial', color: C.textLight }),
        new TextRun({ text: fullName, bold: true, size: 22, font: 'Arial', color: C.navy }),
      ],
    })
  );

  if (cedula) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 20 },
        children: [
          new TextRun({ text: 'Cedula: ', bold: true, size: 18, font: 'Arial', color: C.textLight }),
          new TextRun({ text: cedula, size: 18, font: 'Arial', color: C.text }),
        ],
      })
    );
  }

  if (email) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 20 },
        children: [
          new TextRun({ text: 'Correo: ', bold: true, size: 18, font: 'Arial', color: C.textLight }),
          new TextRun({ text: email, size: 18, font: 'Arial', color: C.text }),
        ],
      })
    );
  }

  if (phone) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 20 },
        children: [
          new TextRun({ text: 'Telefono: ', bold: true, size: 18, font: 'Arial', color: C.textLight }),
          new TextRun({ text: phone, size: 18, font: 'Arial', color: C.text }),
        ],
      })
    );
  }

  children.push(emptyPara({ before: 400 }));

  // Report ID and date
  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 20 },
      children: [
        new TextRun({ text: 'ID del Informe: ', bold: true, size: 18, font: 'Arial', color: C.textLight }),
        new TextRun({ text: reportId, bold: true, size: 18, font: 'Arial', color: C.redBright }),
      ],
    })
  );

  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 20 },
      children: [
        new TextRun({ text: `Fecha: ${today}`, size: 18, font: 'Arial', color: C.textLight }),
      ],
    })
  );

  children.push(emptyPara({ before: 600 }));

  // Classification
  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 40 },
      children: [
        new TextRun({
          text: 'CLASIFICACION: CONFIDENCIAL',
          bold: true,
          size: 20,
          font: 'Arial',
          color: C.redBright,
        }),
      ],
    })
  );

  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({ text: 'OSINT Data Scanner v5.0', size: 14, font: 'Arial', color: C.gray }),
      ],
    })
  );

  // Page break to page 2
  children.push(new Paragraph({ children: [new PageBreak()] }));

  // ════════════════════════════════════════
  //  PÁGINA 2: RESUMEN EJECUTIVO
  // ════════════════════════════════════════

  children.push(sectionHeader('Resumen Ejecutivo'));

  // Executive summary narrative
  const execNarrative =
    critCount > 0
      ? `La investigacion OSINT identifico ${critCount} hallazgo(s) critico(s) que representan un riesgo inmediato para la seguridad digital del sujeto ${fullName}. Se detectaron filtraciones de credenciales y/o exposicion de datos sensibles que requieren accion correctiva inmediata. Se recomienda cambiar contrasenas comprometidas, habilitar autenticacion multifactor y solicitar la eliminacion de datos en brokers de informacion. El nivel de riesgo calculado es ${riskLevel} con un puntaje de ${riskScore}/100.`
      : highCount > 0
        ? `La investigacion identifico ${highCount} hallazgo(s) de severidad alta que indican una exposicion significativa de datos personales del sujeto ${fullName}. Se encontraron menciones en fuentes de riesgo que requieren atencion prioritaria y medidas de proteccion digital. El nivel de riesgo calculado es ${riskLevel} con un puntaje de ${riskScore}/100.`
        : medCount > 0 || lowCount > 0
          ? `La investigacion identifico hallazgos de severidad media/baja que indican cierta exposicion digital del sujeto ${fullName}. Se recomienda implementar medidas de proteccion preventiva y monitoreo periodico. El nivel de riesgo calculado es ${riskLevel} con un puntaje de ${riskScore}/100.`
          : `No se identificaron hallazgos de riesgo significativo en las fuentes consultadas para el sujeto ${fullName}. Se recomienda mantener practicas de higiene digital y monitoreo periodico. El nivel de riesgo calculado es ${riskLevel} con un puntaje de ${riskScore}/100.`;

  children.push(bodyPara(execNarrative, { indent: 200 }));

  children.push(subHeader('Evaluacion de Riesgo'));

  // Risk assessment as bullet points
  children.push(
    bulletPara([
      new TextRun({ text: 'Puntaje de Riesgo: ', bold: true, size: 18, font: 'Arial', color: C.navy }),
      new TextRun({ text: `${riskScore}/100`, bold: true, size: 20, font: 'Arial', color: riskColor }),
      new TextRun({ text: ` — Nivel ${riskLevel}`, size: 18, font: 'Arial', color: riskColor }),
    ])
  );

  children.push(
    bulletPara([
      new TextRun({ text: 'Fuentes consultadas: ', bold: true, size: 18, font: 'Arial', color: C.navy }),
      new TextRun({ text: `${uniqueSources.length} fuentes con ${realResults.length} resultados`, size: 18, font: 'Arial', color: C.text }),
    ])
  );

  children.push(subHeader('Resumen de Hallazgos por Severidad'));

  // Key findings summary — bullet list with counts
  if (critCount > 0) {
    children.push(
      bulletPara([
        new TextRun({ text: `${critCount} Critico(s)`, bold: true, size: 18, font: 'Arial', color: C.red }),
        new TextRun({ text: ' — Requiere accion inmediata', size: 16, font: 'Arial', color: C.textLight }),
      ])
    );
  }
  if (highCount > 0) {
    children.push(
      bulletPara([
        new TextRun({ text: `${highCount} Alto(s)`, bold: true, size: 18, font: 'Arial', color: C.orange }),
        new TextRun({ text: ' — Atencion prioritaria', size: 16, font: 'Arial', color: C.textLight }),
      ])
    );
  }
  if (medCount > 0) {
    children.push(
      bulletPara([
        new TextRun({ text: `${medCount} Medio(s)`, bold: true, size: 18, font: 'Arial', color: C.yellow }),
        new TextRun({ text: ' — Seguimiento recomendado', size: 16, font: 'Arial', color: C.textLight }),
      ])
    );
  }
  if (lowCount > 0) {
    children.push(
      bulletPara([
        new TextRun({ text: `${lowCount} Bajo(s)`, bold: true, size: 18, font: 'Arial', color: C.blue }),
        new TextRun({ text: ' — Monitoreo periodico', size: 16, font: 'Arial', color: C.textLight }),
      ])
    );
  }
  if (critCount === 0 && highCount === 0 && medCount === 0 && lowCount === 0) {
    children.push(
      bulletPara([
        new TextRun({ text: `${infoCount} Informativo(s)`, size: 18, font: 'Arial', color: C.gray }),
      ])
    );
  }

  // Page break to page 3
  children.push(new Paragraph({ children: [new PageBreak()] }));

  // ════════════════════════════════════════
  //  PÁGINAS 3-5: HALLAZGOS DETALLADOS
  // ════════════════════════════════════════

  children.push(sectionHeader('Hallazgos Detallados'));

  const severityOrder = ['critical', 'high', 'medium', 'low'] as const;
  let findingNum = 0;

  for (const severity of severityOrder) {
    const filtered = realResults.filter(r => r.severity === severity);
    if (filtered.length === 0) continue;

    const sev = SEV[severity];
    const maxForSev = MAX_FINDINGS[severity] || 4;
    const toShow = filtered.slice(0, maxForSev);

    // Severity group header
    children.push(severityHeader(sev.label, sev.color, filtered.length));

    for (const r of toShow) {
      findingNum++;
      const paras = findingParagraphs(
        findingNum,
        r.title,
        anonymizeSource(r.source),
        catES(r.category),
        r.description || 'Sin descripcion disponible',
        r.severity,
        r.url
      );
      children.push(...paras);
    }

    // If there are more findings than we show
    if (filtered.length > maxForSev) {
      children.push(
        new Paragraph({
          spacing: { before: 40, after: 80 },
          indent: { left: 720 },
          children: [
            new TextRun({
              text: `... y ${filtered.length - maxForSev} hallazgo(s) adicional(es) de severidad ${sev.label} no incluidos en este resumen.`,
              size: 14,
              font: 'Arial',
              color: C.gray,
              italic: true,
            }),
          ],
        })
      );
    }
  }

  if (findingNum === 0) {
    children.push(
      bodyPara(
        'No se identificaron hallazgos significativos en las fuentes automatizadas consultadas. Se recomienda realizar una verificacion manual en cada motor de busqueda para obtener resultados completos. La ausencia de resultados automaticos no garantiza la no exposicion del sujeto.',
        { indent: 200 }
      )
    );
  }

  // Page break to page 6
  children.push(new Paragraph({ children: [new PageBreak()] }));

  // ════════════════════════════════════════
  //  PÁGINA 6: RECOMENDACIONES
  // ════════════════════════════════════════

  children.push(sectionHeader('Recomendaciones'));

  // Gather unique categories from findings
  const categoriesWithFindings = [...new Set(realResults.map(r => r.category))];

  if (categoriesWithFindings.length === 0) {
    children.push(
      bodyPara(
        'No se requieren acciones correctivas especificas. Se recomienda mantener practicas de higiene digital y monitoreo periodico.',
        { indent: 200 }
      )
    );
  } else {
    for (const cat of categoriesWithFindings) {
      const catLabel = catES(cat);
      const recommendation = recFor(cat);
      const catResults = realResults.filter(r => r.category === cat);
      const maxSev = catResults.reduce(
        (worst, r) => {
          const order = ['critical', 'high', 'medium', 'low', 'info'];
          return order.indexOf(r.severity) < order.indexOf(worst) ? r.severity : worst;
        },
        'info' as string
      );
      const sevColor = SEV[maxSev]?.color || C.gray;

      children.push(
        bulletPara([
          new TextRun({ text: `${catLabel}: `, bold: true, size: 18, font: 'Arial', color: sevColor }),
          new TextRun({ text: recommendation, size: 17, font: 'Arial', color: C.text }),
        ])
      );
    }
  }

  // General recommendations
  children.push(subHeader('Recomendaciones Generales'));

  const generalRecs = [
    'Habilitar autenticacion en dos pasos (2FA) en todas las cuentas de correo y redes sociales.',
    'Utilizar un gestor de contrasenas con contrasenas unicas y robustas para cada servicio.',
    'Revisar periodicamente la configuracion de privacidad en redes sociales y servicios en linea.',
    'Ejercer los derechos de Habeas Data (Ley 1581 de 2012) ante brokers de datos y sitios de exposicion.',
    'Implementar monitoreo continuo de credenciales y datos personales en la dark web.',
    'Realizar verificaciones periodicas en listas restrictivas (OFAC, ONU, Procuraduria, Contraloria).',
  ];

  for (const rec of generalRecs) {
    children.push(bulletPara([new TextRun({ text: rec, size: 17, font: 'Arial', color: C.text })]));
  }

  // Page break to page 7
  children.push(new Paragraph({ children: [new PageBreak()] }));

  // ════════════════════════════════════════
  //  PÁGINA 7: INDICADORES DE RIESGO
  // ════════════════════════════════════════

  children.push(sectionHeader('Indicadores de Riesgo'));

  children.push(
    bodyPara(
      'A continuacion se presentan los indicadores de riesgo identificados durante la investigacion OSINT, junto con su estado y nivel de urgencia.',
      { indent: 200 }
    )
  );

  children.push(riskIndicatorPara('Puntaje de Riesgo Global', `${riskScore}/100`, riskLevel, riskColor));
  children.push(
    riskIndicatorPara(
      'Hallazgos Criticos',
      String(critCount),
      critCount > 0 ? 'REQUIERE ACCION INMEDIATA' : 'SIN ALERTA',
      critCount > 0 ? C.red : C.green
    )
  );
  children.push(
    riskIndicatorPara(
      'Hallazgos de Severidad Alta',
      String(highCount),
      highCount > 0 ? 'ATENCION PRIORITARIA' : 'SIN ALERTA',
      highCount > 0 ? C.orange : C.green
    )
  );
  children.push(
    riskIndicatorPara(
      'Hallazgos de Severidad Media',
      String(medCount),
      medCount > 0 ? 'SEGUIMIENTO RECOMENDADO' : 'SIN ALERTA',
      medCount > 0 ? C.yellow : C.green
    )
  );
  children.push(
    riskIndicatorPara(
      'Hallazgos de Severidad Baja',
      String(lowCount),
      lowCount > 0 ? 'MONITOREO PERIODICO' : 'SIN ALERTA',
      lowCount > 0 ? C.blue : C.green
    )
  );
  children.push(
    riskIndicatorPara(
      'Fuentes Consultadas',
      String(uniqueSources.length),
      `${realResults.length} resultados totales`,
      C.navy
    )
  );
  children.push(
    riskIndicatorPara(
      'Nivel de Certeza',
      critCount > 0 ? 'ALTO' : highCount > 0 ? 'MEDIO-ALTO' : 'MEDIO',
      critCount > 0 ? 'EVIDENCIA DIRECTA' : 'REQUIERE VERIFICACION',
      critCount > 0 ? C.red : C.orange
    )
  );

  // Overall risk assessment as paragraph text
  children.push(subHeader('Evaluacion General de Riesgo'));

  const riskAssessment =
    critCount > 0
      ? `El sujeto ${fullName} presenta un nivel de riesgo ${riskLevel} con ${critCount} hallazgo(s) critico(s). La evidencia indica exposicion directa de datos sensibles que requiere accion inmediata. Se recomienda implementar las medidas correctivas detalladas en la seccion de Recomendaciones y realizar un seguimiento cercano en un plazo no mayor a 30 dias.`
      : highCount > 0
        ? `El sujeto ${fullName} presenta un nivel de riesgo ${riskLevel} con ${highCount} hallazgo(s) de severidad alta. Se detecto exposicion significativa de datos personales que requiere atencion prioritaria. Se recomienda implementar las medidas correctivas y realizar verificacion de seguimiento en 60 dias.`
        : medCount > 0 || lowCount > 0
          ? `El sujeto ${fullName} presenta un nivel de riesgo ${riskLevel}. Los hallazgos indican cierta exposicion digital que requiere medidas preventivas y monitoreo periodico. Se recomienda reevaluar en 90 dias.`
          : `El sujeto ${fullName} presenta un nivel de riesgo ${riskLevel}. No se identificaron hallazgos de riesgo significativo en las fuentes consultadas. Se recomienda mantener las practicas de higiene digital y monitoreo periodico.`;

  children.push(bodyPara(riskAssessment, { indent: 200 }));

  // Page break to page 8
  children.push(new Paragraph({ children: [new PageBreak()] }));

  // ════════════════════════════════════════
  //  PÁGINA 8: FUENTES Y ANEXOS
  // ════════════════════════════════════════

  children.push(sectionHeader('Fuentes Consultadas'));

  // Generic statement instead of listing specific tools
  children.push(
    bodyPara(
      'Se consultaron múltiples fuentes de inteligencia de fuentes abiertas (OSINT) durante esta investigación. Los resultados fueron obtenidos a través de sistemas automatizados de recolección y análisis de datos públicos.',
      { indent: 200 }
    )
  );

  // Anonymized sources summary
  if (uniqueSources.length > 0) {
    children.push(subHeader('Resumen de Fuentes'));

    for (const src of uniqueSources) {
      const count = anonymizedResults.filter(r => r.source === src).length;
      children.push(
        bulletPara([
          new TextRun({ text: `${src}`, bold: true, size: 16, font: 'Arial', color: C.navy }),
          new TextRun({ text: ` — ${count} resultado(s)`, size: 16, font: 'Arial', color: C.textLight }),
        ])
      );
    }
  }

  // Legal disclaimer
  children.push(subHeader('Aviso Legal'));

  children.push(
    bodyPara(
      'Este informe ha sido generado de forma automatizada mediante tecnicas OSINT (Open Source Intelligence). La informacion contenida proviene exclusivamente de fuentes publicas y abiertas. Este documento no constituye una investigacion oficial ni debe ser utilizado como prueba judicial sin la debida validacion por parte de las autoridades competentes.',
      { indent: 200, italic: true, size: 16, color: C.textLight }
    )
  );

  children.push(
    bodyPara(
      'El uso de esta informacion debe cumplir con la Ley 1581 de 2012 (Proteccion de Datos Personales), la Ley 1273 de 2009 (Delitos Informaticos), y la Constitucion Politica de Colombia. El tratamiento de datos personales se realiza bajo los principios de finalidad, libertad y legalidad.',
      { indent: 200, italic: true, size: 16, color: C.textLight }
    )
  );

  // Signature block
  children.push(emptyPara({ before: 600 }));

  children.push(
    new Paragraph({
      spacing: { after: 40 },
      border: { top: { style: BorderStyle.SINGLE, size: 1, color: C.navy } },
      children: [],
    })
  );

  children.push(keyValuePara('Elaborado por', 'OSINT Data Scanner v5.0'));
  children.push(keyValuePara('Codigo del informe', reportId));
  children.push(keyValuePara('Fecha de elaboracion', today));
  children.push(keyValuePara('Revisado por', '_______________________________'));
  children.push(keyValuePara('Aprobado por', '_______________________________'));

  // ════════════════════════════════════════
  //  BUILD DOCUMENT
  // ════════════════════════════════════════

  const doc = new Document({
    styles: {
      default: {
        document: {
          run: {
            font: 'Arial',
            size: 18,
          },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
          },
        },
        children,
      },
    ],
  });

  return await Packer.toBuffer(doc);
}

/**
 * Legacy-compatible wrapper that accepts the ScanData + results signature
 * used by existing callers (report/route.ts, scan/route.ts, upload/route.ts).
 */
interface ScanData {
  id: string;
  fullName: string;
  cedula?: string | null;
  email?: string | null;
  phone?: string | null;
  createdAt: string;
}

export async function generateOSINTReport(scan: ScanData, results: OSINTResult[]): Promise<Buffer> {
  return generateDocxReport({
    results,
    fullName: scan.fullName,
    cedula: scan.cedula ?? undefined,
    email: scan.email ?? undefined,
    phone: scan.phone ?? undefined,
    scanId: scan.id,
  });
}

export function generateReportFileName(fullName: string): string {
  const clean = fullName
    .replace(/[^a-zA-Z0-9áéíóúÁÉÍÓÚñÑ ]/g, '')
    .replace(/\s+/g, '_');
  const date = new Date().toISOString().replace(/[-:T]/g, '').substring(0, 14);
  return `Informe_OSINT_${clean}_${date}.docx`;
}
