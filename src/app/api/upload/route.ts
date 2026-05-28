/**
 * API Route: /api/upload
 * Procesa archivos Excel (.xlsx) y CSV para análisis de vínculos y escaneo por lote.
 *
 * Soporta 3 formatos de entrada:
 *  1. JSON { type: 'xlsx', sheets, sheetNames } — datos ya parseados desde el cliente
 *  2. FormData con archivo — archivo binario procesado server-side
 *  3. JSON { type: 'xlsx', fileName, fileBase64 } — archivo en base64
 */

import { NextRequest, NextResponse } from 'next/server';
import { parseXLSXWithSheets, analyzeRelationships } from '@/lib/relationship-analyzer';
import { createScan, addScanResults, addReport } from '@/lib/memory-store';
import { generateJointPDF } from '@/lib/generate-pdf-report';
import { jointBuffers } from '@/app/api/joint-analysis/route';

export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get('content-type') || '';

    // ── CASE 1: JSON with pre-parsed XLSX data from client ──
    if (contentType.includes('application/json')) {
      const body = await request.json();

      // Sub-case 1a: Client already parsed the sheets
      if (body.type === 'xlsx' && body.sheets && body.sheets.length > 0) {
        return handleParsedXLSX(body);
      }

      // Sub-case 1b: Base64 encoded file
      if (body.type === 'xlsx' && body.fileBase64) {
        const buffer = Buffer.from(body.fileBase64, 'base64');
        return handleRawXLSX(buffer, body.fileName || 'upload.xlsx');
      }

      return NextResponse.json(
        { error: 'Formato JSON no reconocido. Se requiere sheets[] o fileBase64.' },
        { status: 400 }
      );
    }

    // ── CASE 2: FormData with raw file ──
    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      const file = formData.get('file') as File | null;

      if (!file) {
        return NextResponse.json({ error: 'No se encontró archivo en el FormData' }, { status: 400 });
      }

      const buffer = Buffer.from(await file.arrayBuffer());
      const fileName = file.name.toLowerCase();

      if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
        return handleRawXLSX(buffer, file.name);
      }

      if (fileName.endsWith('.csv')) {
        return handleCSV(buffer, file.name);
      }

      return NextResponse.json(
        { error: 'Formato no soportado. Use .xlsx, .xls o .csv' },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Content-Type no soportado. Use application/json o multipart/form-data.' },
      { status: 400 }
    );
  } catch (error) {
    console.error('[Upload API] Error:', error);
    return NextResponse.json(
      {
        error: 'Error al procesar archivo',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

// ── Handle pre-parsed XLSX data (from client-side SheetJS) ──
async function handleParsedXLSX(body: {
  sheets: { name: string; data: Record<string, string>[] }[];
  sheetNames: string[];
}): Promise<NextResponse> {
  const { sheets, sheetNames } = body;

  if (!sheets || sheets.length === 0) {
    return NextResponse.json({ error: 'No se encontraron hojas en el archivo' }, { status: 400 });
  }

  // Filter to sheets that actually have data
  const nonEmptySheets = sheets.filter(s => s.data && s.data.length > 0);
  if (nonEmptySheets.length === 0) {
    return NextResponse.json(
      { error: 'Todas las hojas del archivo están vacías. Verifica que el archivo contenga datos.', isEncrypted: false },
      { status: 400 }
    );
  }

  // If 2+ non-empty sheets → relationship analysis + comparative report
  if (nonEmptySheets.length >= 2) {
    const sheet1 = nonEmptySheets[0];
    const sheet2 = nonEmptySheets[1];

    // Run relationship analysis between primary pair
    const analysis = analyzeRelationships(
      sheet1.data,
      sheet2.data,
      sheet1.name,
      sheet2.name
    );

    // Create scans for ALL non-empty sheets (not just the first two)
    const allSheetResults: Array<{
      sheetName: string;
      rowCount: number;
      scanId: string;
      fullName: string;
      totalResults: number;
      reportGenerated: boolean;
      reportFileName: string | null;
      summary: { critical: number; high: number; medium: number; low: number; info: number };
    }> = [];
    for (const sheet of nonEmptySheets) {
      const sheetResults = createResultsFromSheetData(sheet.data, sheet.name);
      const scan = createScan({
        fullName: `Hoja: ${sheet.name}`,
        scanType: 'data_intelligence',
      });
      addScanResults(scan.id, sheetResults);
      const summary = {
        critical: sheetResults.filter(r => r.severity === 'critical').length,
        high: sheetResults.filter(r => r.severity === 'high').length,
        medium: sheetResults.filter(r => r.severity === 'medium').length,
        low: sheetResults.filter(r => r.severity === 'low').length,
        info: sheetResults.filter(r => r.severity === 'info').length,
      };
      allSheetResults.push({
        sheetName: sheet.name,
        rowCount: sheet.data.length,
        scanId: scan.id,
        fullName: `Hoja: ${sheet.name}`,
        totalResults: sheetResults.length,
        reportGenerated: false,
        reportFileName: null,
        summary,
      });
    }

    // Generate joint analysis PDF for the primary pair
    let jointAnalysisId: string | null = null;
    let jointReportFileName: string | null = null;

    const results1 = createResultsFromSheetData(sheet1.data, sheet1.name);
    const results2 = createResultsFromSheetData(sheet2.data, sheet2.name);
    const scan1 = allSheetResults[0];
    const scan2 = allSheetResults[1];

    try {
      const pdfBuffer = await generateJointPDF(
        analysis,
        [
          { name: sheet1.name, results: results1 },
          { name: sheet2.name, results: results2 },
        ],
      );

      jointAnalysisId = analysis.sheet1Name.replace(/\s+/g, '_') + '_' + Date.now();
      jointReportFileName = `Informe_Vinculos_${Date.now()}.pdf`;

      jointBuffers.set(jointAnalysisId, { buffer: pdfBuffer, format: 'pdf' });

      // Also store in memory store
      const { createJointAnalysis } = await import('@/lib/memory-store');
      createJointAnalysis({
        analysis,
        individualScans: [
          { name: sheet1.name, scanId: scan1.scanId },
          { name: sheet2.name, scanId: scan2.scanId },
        ],
        fileName: jointReportFileName,
      });
    } catch (pdfError) {
      console.warn('[Upload API] Failed to generate joint PDF:', pdfError);
    }

    return NextResponse.json({
      type: 'xlsx_multi_sheet',
      sheetNames: nonEmptySheets.map(s => s.name),
      results: allSheetResults,
      relationshipAnalysis: {
        sheet1Name: analysis.sheet1Name,
        sheet2Name: analysis.sheet2Name,
        sheet1RowCount: analysis.sheet1RowCount,
        sheet2RowCount: analysis.sheet2RowCount,
        totalLinks: analysis.totalLinks,
        links: analysis.links.slice(0, 100), // Limit for client
        summary: analysis.summary,
        networkMap: analysis.networkMap,
      },
      jointAnalysisId,
      jointReportFileName,
    });
  }

  // Single non-empty sheet → just scan the data
  const sheet = nonEmptySheets[0];
  const results = createResultsFromSheetData(sheet.data, sheet.name);
  const scan = createScan({
    fullName: `Hoja: ${sheet.name}`,
    scanType: 'data_intelligence',
  });
  addScanResults(scan.id, results);
  const summary = {
    critical: results.filter(r => r.severity === 'critical').length,
    high: results.filter(r => r.severity === 'high').length,
    medium: results.filter(r => r.severity === 'medium').length,
    low: results.filter(r => r.severity === 'low').length,
    info: results.filter(r => r.severity === 'info').length,
  };

  return NextResponse.json({
    type: 'xlsx_single_sheet',
    sheetNames,
    results: [{
      sheetName: sheet.name,
      rowCount: sheet.data.length,
      scanId: scan.id,
      fullName: `Hoja: ${sheet.name}`,
      totalResults: results.length,
      reportGenerated: false,
      reportFileName: null,
      summary,
    }],
  });
}

// ── Handle raw XLSX/XLS file (server-side parsing) ──
async function handleRawXLSX(buffer: Buffer, fileName: string): Promise<NextResponse> {
  try {
    const { sheets, sheetNames } = parseXLSXWithSheets(buffer);

    // Verify sheets actually contain data
    const nonEmptySheets = sheets.filter(s => s.data.length > 0);
    if (nonEmptySheets.length === 0) {
      return NextResponse.json(
        {
          error: 'El archivo Excel no contiene datos legibles. Puede estar vacio, danado o protegido con contrasena.',
          isEncrypted: false,
        },
        { status: 400 }
      );
    }

    // Convert to the same format as pre-parsed and reuse handler
    const body = {
      sheets: nonEmptySheets.map(s => ({ name: s.name, data: s.data })),
      sheetNames,
    };

    return handleParsedXLSX(body);
  } catch (parseError) {
    console.error('[Upload API] XLSX parse error:', parseError);

    const errorMsg = parseError instanceof Error ? parseError.message : 'Error desconocido';
    // Only flag as encrypted if the error has our distinctive [ENCRYPTED] prefix
    // (set by parseXLSXWithSheets when the library itself detects encryption).
    // NEVER flag based on generic error messages that mention "contrasena" to avoid false positives.
    const isEncrypted = errorMsg.startsWith('[ENCRYPTED]');

    return NextResponse.json(
      {
        error: isEncrypted
          ? 'El archivo esta protegido con contrasena. Abre el archivo en Excel, elimina la proteccion y guardalo como .xlsx.'
          : `No se pudo leer el archivo Excel: ${errorMsg}`,
        details: errorMsg,
        isEncrypted,
      },
      { status: 400 }
    );
  }
}

// ── Handle CSV file ──
async function handleCSV(buffer: Buffer, fileName: string): Promise<NextResponse> {
  try {
    const { parseXLSXWithSheets } = await import('@/lib/relationship-analyzer');
    // CSV can be parsed by xlsx library too
    const { sheets, sheetNames } = parseXLSXWithSheets(buffer);
    return handleParsedXLSX({ sheets, sheetNames });
  } catch {
    // Fallback: manual CSV parse
    const text = buffer.toString('utf-8');
    const lines = text.split(/\r?\n/).filter(l => l.trim());
    if (lines.length < 2) {
      return NextResponse.json({ error: 'El archivo CSV está vacío o tiene menos de 2 filas' }, { status: 400 });
    }

    const headers = lines[0].split(/[,;\t]/).map(h => h.trim().replace(/^"|"$/g, ''));
    const data: Record<string, string>[] = [];

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(/[,;\t]/).map(v => v.trim().replace(/^"|"$/g, ''));
      const row: Record<string, string> = {};
      let hasData = false;
      headers.forEach((h, idx) => {
        row[h] = values[idx] || '';
        if (values[idx]) hasData = true;
      });
      if (hasData) data.push(row);
    }

    const results = createResultsFromSheetData(data, fileName);
    const scan = createScan({
      fullName: `CSV: ${fileName}`,
      scanType: 'data_intelligence',
    });
    addScanResults(scan.id, results);
    const csvSummary = {
      critical: results.filter(r => r.severity === 'critical').length,
      high: results.filter(r => r.severity === 'high').length,
      medium: results.filter(r => r.severity === 'medium').length,
      low: results.filter(r => r.severity === 'low').length,
      info: results.filter(r => r.severity === 'info').length,
    };

    return NextResponse.json({
      type: 'csv',
      results: [{
        sheetName: fileName,
        rowCount: data.length,
        scanId: scan.id,
        fullName: `CSV: ${fileName}`,
        totalResults: results.length,
        reportGenerated: false,
        reportFileName: null,
        summary: csvSummary,
      }],
    });
  }
}

// ── Convert sheet data to OSINTResult format ──
function createResultsFromSheetData(
  data: Record<string, string>[],
  sheetName: string
): Array<{
  source: string;
  category: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  title: string;
  description: string;
  url: string;
  dataFound: string;
}> {
  const results: Array<{
    source: string;
    category: string;
    severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
    title: string;
    description: string;
    url: string;
    dataFound: string;
  }> = [];

  for (const row of data) {
    const entries = Object.entries(row).filter(([, v]) => v && v.trim());
    if (entries.length === 0) continue;

    // Try to find a name-like field for the title
    const nameField = entries.find(([k]) =>
      /nombre|name|razon|empresa|company/i.test(k)
    );
    const personName = nameField ? nameField[1].trim() : entries[0][1].trim();

    // Check for sensitive data indicators
    const hasEmail = entries.some(([k]) => /correo|email|mail/i.test(k));
    const hasPhone = entries.some(([k]) => /telefono|phone|celular|mobile/i.test(k));
    const hasAddress = entries.some(([k]) => /direccion|address|ubicacion/i.test(k));
    const hasId = entries.some(([k]) => /cedula|nit|identifica|rut/i.test(k));

    let severity: 'critical' | 'high' | 'medium' | 'low' | 'info' = 'info';
    if (hasEmail && hasPhone && hasId) severity = 'high';
    else if (hasEmail && hasPhone) severity = 'medium';
    else if (hasEmail || hasPhone || hasId) severity = 'low';

    results.push({
      source: `Hoja: ${sheetName}`,
      category: hasId ? 'personal_exposure' : hasEmail ? 'credential_breach' : 'document_exposure',
      severity,
      title: `Registro: ${personName}`,
      description: `Datos encontrados en hoja "${sheetName}": ${entries.map(([k, v]) => `${k}=${v}`).join(', ')}`,
      url: '',
      dataFound: JSON.stringify(row),
    });
  }

  return results;
}
