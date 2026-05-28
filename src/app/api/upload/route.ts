/**
 * API Route: /api/upload
 * Procesa archivos Excel (.xlsx, .xls) y CSV para investigación OSINT individual + cruce de vínculos.
 *
 * FLUJO PRINCIPAL:
 *  1. Parsear Excel → extraer datos de personas de cada hoja
 *  2. Para las primeras N personas (MAX_OSINT_SCANS), ejecutar escaneo OSINT rápido
 *  3. Para las demás personas, generar resultados baseline desde los datos del Excel
 *  4. Cruzar los hallazgos OSINT entre personas de diferentes hojas
 *  5. Generar informe de vínculos basado en los hallazgos
 *
 * DISEÑO ANTI-TIMEOUT:
 *  - Máximo 5 personas escaneadas con OSINT por hoja
 *  - Timeout de 8 segundos por persona
 *  - Procesamiento paralelo en lotes de 3
 *  - PDF/DOCX con timeout de 15 segundos
 *  - Tiempo total estimado: ~30-45 segundos (dentro del límite de Vercel de 60s)
 */

import { NextRequest, NextResponse } from 'next/server';
import { parseXLSXWithSheets, crossReferenceOSINTResults, PersonWithOSINT, RelationshipAnalysisResult } from '@/lib/relationship-analyzer';
import { createScan, addScanResults, addReport } from '@/lib/memory-store';
import { generateJointPDF } from '@/lib/generate-pdf-report';
import { generateJointDocxReport } from '@/lib/generate-report';
import { jointBuffers } from '@/app/api/joint-analysis/route';
import {
  runFullScan,
  OSINTResult,
  setDeepSeekApiKey,
} from '@/lib/osint-scanner';
import { initZAIConfig } from '@/lib/zai-config';

// ── Configuration ──
const MAX_PERSONS_PER_SHEET = 30;   // Max persons extracted per sheet
const MAX_OSINT_SCANS = 5;          // Max persons to run OSINT scan on per sheet
const PER_PERSON_TIMEOUT = 8_000;   // 8 seconds per person OSINT scan
const BATCH_PARALLELISM = 3;        // Parallel OSINT scans
const REPORT_TIMEOUT = 15_000;      // 15 seconds for PDF/DOCX generation

// ── Fast engines only for batch mode ──
const BATCH_ENGINES = [
  'Google Dorking',
  'Social Media Scan',
  'LeakIX',
  'Data Broker Scan',
];

// Set max duration for Vercel
export const maxDuration = 60;

// ── Person identifier extracted from a row ──
interface PersonIdentifier {
  name: string;
  cedula: string;
  email: string;
  phone: string;
  address: string;
  rawRow: Record<string, string>;
}

// ── Person with OSINT results ──
interface PersonWithOSINTLocal {
  name: string;
  identifiers: PersonIdentifier;
  osintResults: OSINTResult[];
  findingsCount: number;
  sheetName: string;
}

export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get('content-type') || '';

    // ── CASE 1: JSON with pre-parsed XLSX data from client ──
    if (contentType.includes('application/json')) {
      const body = await request.json();

      if (body.type === 'xlsx' && body.sheets && body.sheets.length > 0) {
        return handleParsedXLSX(body);
      }

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
    console.error('[Upload API] Unhandled error:', error);
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    const isEncrypted = errorMsg.startsWith('[ENCRYPTED]');
    return NextResponse.json(
      {
        error: isEncrypted
          ? 'El archivo tiene cifrado real y no puede ser leido. Retire la proteccion y vuelva a intentarlo.'
          : 'Error al procesar archivo Excel. Intente nuevamente o use formato .xlsx.',
        details: errorMsg.replace(/^\[ENCRYPTED\]\s*/, ''),
        isEncrypted,
      },
      { status: isEncrypted ? 400 : 500 }
    );
  }
}

// ══════════════════════════════════════════════════════════════════
//  IDENTIFIER EXTRACTION
// ══════════════════════════════════════════════════════════════════

const CEDULA_PATTERNS = ['cedula', 'nit', 'identifica', 'rut', 'cc', 'documento', 'dni', 'ced'];
const NAME_PATTERNS = ['nombre', 'name', 'razon_social', 'fullname', 'nombre_completo', 'apellido', 'empresa', 'company', 'solicitante', 'titular'];
const EMAIL_PATTERNS = ['correo', 'email', 'mail', 'e_mail', 'electrónico', 'electronicos'];
const PHONE_PATTERNS = ['telefono', 'phone', 'celular', 'mobile', 'tel', 'whatsapp', 'contacto'];
const ADDRESS_PATTERNS = ['direccion', 'address', 'ubicacion', 'location', 'residencia', 'domicilio', 'barrio', 'ciudad', 'city'];

function findFieldValue(row: Record<string, string>, patterns: string[]): string {
  const keys = Object.keys(row);
  const lowerKeys = keys.map(k => k.toLowerCase().replace(/[^a-z0-9_]/g, '_'));

  for (const pattern of patterns) {
    for (let i = 0; i < lowerKeys.length; i++) {
      if (lowerKeys[i].includes(pattern) || pattern.includes(lowerKeys[i])) {
        const val = row[keys[i]]?.trim();
        if (val && val.length >= 2 && !['na', 'n/a', '-', 'null', 'undefined'].includes(val.toLowerCase())) {
          return val;
        }
      }
    }
  }
  return '';
}

function extractPersonFromRow(row: Record<string, string>): PersonIdentifier | null {
  const name = findFieldValue(row, NAME_PATTERNS);
  const cedula = findFieldValue(row, CEDULA_PATTERNS);
  const email = findFieldValue(row, EMAIL_PATTERNS);
  const phone = findFieldValue(row, PHONE_PATTERNS);
  const address = findFieldValue(row, ADDRESS_PATTERNS);

  if (!name && !cedula) return null;

  return { name: name || cedula, cedula, email, phone, address, rawRow: row };
}

function extractPersonsFromSheet(data: Record<string, string>[]): PersonIdentifier[] {
  const persons: PersonIdentifier[] = [];
  const seenNames = new Set<string>();

  for (const row of data) {
    const person = extractPersonFromRow(row);
    if (person) {
      const key = person.name.toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      if (!seenNames.has(key)) {
        seenNames.add(key);
        persons.push(person);
      }
    }
  }

  return persons.slice(0, MAX_PERSONS_PER_SHEET);
}

// ══════════════════════════════════════════════════════════════════
//  OSINT INVESTIGATION — Per person with hard timeout
// ══════════════════════════════════════════════════════════════════

async function runOSINTScan(person: PersonIdentifier, deepseekKey: string | null): Promise<OSINTResult[]> {
  console.log(`[Upload] OSINT scan: ${person.name} (CC: ${person.cedula || 'N/A'})`);

  try {
    const results = await Promise.race([
      runFullScan({
        fullName: person.name,
        cedula: person.cedula || undefined,
        email: person.email || undefined,
        phone: person.phone || undefined,
        deepseekKey: deepseekKey || undefined,
        selectedEngines: BATCH_ENGINES,
      }),
      new Promise<OSINTResult[]>((resolve) =>
        setTimeout(() => resolve([]), PER_PERSON_TIMEOUT)
      ),
    ]);

    if (results.length === 0) {
      return [makeBaselineResult(person)];
    }

    console.log(`[Upload] Scan done for ${person.name}: ${results.length} findings`);
    return results;
  } catch (error) {
    console.warn(`[Upload] Scan failed for ${person.name}:`, error instanceof Error ? error.message : 'unknown');
    return [makeBaselineResult(person)];
  }
}

function makeBaselineResult(person: PersonIdentifier): OSINTResult {
  return {
    source: 'Escaneo OSINT',
    category: 'personal_exposure',
    severity: 'low',
    title: `Investigación: ${person.name}`,
    description: `Datos de "${person.name}" — CC ${person.cedula || 'N/A'}, Email ${person.email || 'N/A'}, Tel ${person.phone || 'N/A'}. Escaneo OSINT rápido con ${BATCH_ENGINES.length} motores.`,
    url: '',
    dataFound: JSON.stringify({ name: person.name, cedula: person.cedula, email: person.email, phone: person.phone, address: person.address }),
  };
}

// ══════════════════════════════════════════════════════════════════
//  INVESTIGATE A SHEET — OSINT for first N persons + baseline for rest
// ══════════════════════════════════════════════════════════════════

async function investigateSheet(
  sheetData: Record<string, string>[],
  sheetName: string,
  deepseekKey: string | null
): Promise<{
  persons: PersonWithOSINTLocal[];
  allResults: OSINTResult[];
}> {
  const allPersons = extractPersonsFromSheet(sheetData);

  if (allPersons.length === 0) {
    const fallbackResults = createResultsFromSheetData(sheetData, sheetName);
    return { persons: [], allResults: fallbackResults };
  }

  // Only scan the first MAX_OSINT_SCANS persons with OSINT
  const personsToScan = allPersons.slice(0, MAX_OSINT_SCANS);
  const personsBaseline = allPersons.slice(MAX_OSINT_SCANS);

  console.log(`[Upload] Sheet "${sheetName}": ${allPersons.length} persons, scanning ${personsToScan.length} with OSINT, ${personsBaseline.length} baseline`);

  const personsWithOSINT: PersonWithOSINTLocal[] = [];
  const allResults: OSINTResult[] = [];

  // ── Phase 1: OSINT scan for first N persons (parallel batches) ──
  for (let i = 0; i < personsToScan.length; i += BATCH_PARALLELISM) {
    const batch = personsToScan.slice(i, i + BATCH_PARALLELISM);
    const batchResults = await Promise.allSettled(
      batch.map(person => runOSINTScan(person, deepseekKey))
    );

    for (let j = 0; j < batch.length; j++) {
      const person = batch[j];
      const result = batchResults[j];
      const osintResults = result.status === 'fulfilled' ? result.value : [makeBaselineResult(person)];

      personsWithOSINT.push({
        name: person.name,
        identifiers: person,
        osintResults,
        findingsCount: osintResults.length,
        sheetName,
      });
      allResults.push(...osintResults);
    }
  }

  // ── Phase 2: Baseline results for remaining persons (instant, no network) ──
  for (const person of personsBaseline) {
    const baselineResult = makeBaselineResult(person);
    personsWithOSINT.push({
      name: person.name,
      identifiers: person,
      osintResults: [baselineResult],
      findingsCount: 1,
      sheetName,
    });
    allResults.push(baselineResult);
  }

  return { persons: personsWithOSINT, allResults };
}

// ══════════════════════════════════════════════════════════════════
//  HANDLE PARSED XLSX — Main handler
// ══════════════════════════════════════════════════════════════════

async function handleParsedXLSX(body: {
  sheets: { name: string; data: Record<string, string>[] }[];
  sheetNames: string[];
}): Promise<NextResponse> {
  const { sheets, sheetNames } = body;

  if (!sheets || sheets.length === 0) {
    return NextResponse.json({ error: 'No se encontraron hojas en el archivo' }, { status: 400 });
  }

  const nonEmptySheets = sheets.filter(s => s.data && s.data.length > 0);
  if (nonEmptySheets.length === 0) {
    return NextResponse.json(
      { error: 'Todas las hojas del archivo están vacías. Verifica que el archivo contenga datos.', isEncrypted: false },
      { status: 400 }
    );
  }

  // Check for genuine Rights Management / IRM protection (not just sheet protection)
  // Only check for IRM-specific signals that indicate the file content was replaced by a notice
  for (const sheet of nonEmptySheets) {
    if (isIRMProtected(sheet.data)) {
      return NextResponse.json(
        { error: 'El archivo Excel está protegido con gestión de derechos (Rights Management). No se pueden extraer datos. Solicite al propietario una copia sin protección.', isEncrypted: true },
        { status: 400 }
      );
    }
  }

  // Initialize ZAI config (with 3s timeout)
  await Promise.race([initZAIConfig(), new Promise<void>(resolve => setTimeout(resolve, 3000))]);

  // Set DeepSeek API key
  const deepseekKey = process.env.DEEPSEEK_API_KEY || null;
  if (deepseekKey) {
    setDeepSeekApiKey(deepseekKey);
  }

  // ════════════════════════════════════════════════════════════
  //  MULTI-SHEET FLOW
  // ════════════════════════════════════════════════════════════
  if (nonEmptySheets.length >= 2) {
    const sheetInvestigations: Array<{
      sheetName: string;
      persons: PersonWithOSINTLocal[];
      allResults: OSINTResult[];
    }> = [];

    // Investigate each sheet
    for (const sheet of nonEmptySheets) {
      try {
        const investigation = await investigateSheet(sheet.data, sheet.name, deepseekKey);
        sheetInvestigations.push({
          sheetName: sheet.name,
          persons: investigation.persons,
          allResults: investigation.allResults,
        });
      } catch (error) {
        console.warn(`[Upload] Investigation failed for sheet "${sheet.name}":`, error);
        const fallbackResults = createResultsFromSheetData(sheet.data, sheet.name);
        sheetInvestigations.push({ sheetName: sheet.name, persons: [], allResults: fallbackResults });
      }
    }

    // Create scan records for each sheet
    const allSheetResults: Array<{
      sheetName: string;
      rowCount: number;
      scanId: string;
      fullName: string;
      totalResults: number;
      reportGenerated: boolean;
      reportFileName: string | null;
      summary: { critical: number; high: number; medium: number; low: number; info: number };
      personsInvestigated: Array<{ name: string; identifiers: Record<string, string>; findingsCount: number }>;
    }> = [];

    for (const investigation of sheetInvestigations) {
      const primaryPerson = investigation.persons[0];
      const scanFullName = primaryPerson ? primaryPerson.name : `Fuente de datos: ${investigation.sheetName}`;
      const scan = createScan({
        fullName: scanFullName,
        cedula: primaryPerson?.identifiers.cedula || null,
        email: primaryPerson?.identifiers.email || null,
        phone: primaryPerson?.identifiers.phone || null,
        scanType: 'data_intelligence',
      });
      addScanResults(scan.id, investigation.allResults);
      const summary = {
        critical: investigation.allResults.filter(r => r.severity === 'critical').length,
        high: investigation.allResults.filter(r => r.severity === 'high').length,
        medium: investigation.allResults.filter(r => r.severity === 'medium').length,
        low: investigation.allResults.filter(r => r.severity === 'low').length,
        info: investigation.allResults.filter(r => r.severity === 'info').length,
      };
      allSheetResults.push({
        sheetName: investigation.sheetName,
        rowCount: nonEmptySheets.find(s => s.name === investigation.sheetName)?.data.length || 0,
        scanId: scan.id,
        fullName: scanFullName,
        totalResults: investigation.allResults.length,
        reportGenerated: false,
        reportFileName: null,
        summary,
        personsInvestigated: investigation.persons.map(p => ({
          name: p.name,
          identifiers: { cedula: p.identifiers.cedula, email: p.identifiers.email, phone: p.identifiers.phone, address: p.identifiers.address },
          findingsCount: p.findingsCount,
        })),
      });
    }

    // Cross-reference OSINT results
    let osintCrossRef: RelationshipAnalysisResult;
    try {
      const inv1 = sheetInvestigations[0];
      const inv2 = sheetInvestigations[1];

      const persons1ForCrossRef: PersonWithOSINT[] = inv1.persons.map(p => ({
        name: p.name,
        identifiers: { name: p.identifiers.name, cedula: p.identifiers.cedula, email: p.identifiers.email, phone: p.identifiers.phone, address: p.identifiers.address, rawRow: p.identifiers.rawRow },
        osintResults: p.osintResults,
        findingsCount: p.findingsCount,
      }));

      const persons2ForCrossRef: PersonWithOSINT[] = inv2.persons.map(p => ({
        name: p.name,
        identifiers: { name: p.identifiers.name, cedula: p.identifiers.cedula, email: p.identifiers.email, phone: p.identifiers.phone, address: p.identifiers.address, rawRow: p.identifiers.rawRow },
        osintResults: p.osintResults,
        findingsCount: p.findingsCount,
      }));

      osintCrossRef = crossReferenceOSINTResults(persons1ForCrossRef, persons2ForCrossRef, inv1.sheetName, inv2.sheetName);
    } catch (crossRefError) {
      console.warn('[Upload] Cross-reference failed, using fallback:', crossRefError);
      const inv1 = sheetInvestigations[0];
      const inv2 = sheetInvestigations[1];
      osintCrossRef = {
        sheet1Name: inv1.sheetName,
        sheet2Name: inv2.sheetName,
        sheet1RowCount: inv1.allResults.length,
        sheet2RowCount: inv2.allResults.length,
        totalLinks: 0,
        links: [],
        summary: { empresariales: 0, personales: 0, familiares: 0, laborales: 0, contacto: 0, ubicacion: 0, dato_compartido: 0 },
        networkMap: [],
      };
    }

    // Generate joint PDF and DOCX (with timeouts)
    let jointAnalysisId: string | null = null;
    let jointReportFileName: string | null = null;

    try {
      const inv1 = sheetInvestigations[0];
      const inv2 = sheetInvestigations[1];
      const osintResults = [
        { name: inv1.sheetName, results: inv1.allResults },
        { name: inv2.sheetName, results: inv2.allResults },
      ];

      const pdfBuffer = await Promise.race([
        generateJointPDF(osintCrossRef, osintResults),
        new Promise<Buffer>((resolve) => setTimeout(() => resolve(Buffer.alloc(0)), REPORT_TIMEOUT)),
      ]);

      if (pdfBuffer.length > 0) {
        jointAnalysisId = osintCrossRef.sheet1Name.replace(/\s+/g, '_') + '_' + Date.now();
        jointReportFileName = `Informe_Vinculos_${Date.now()}.pdf`;
        jointBuffers.set(jointAnalysisId, { buffer: pdfBuffer, format: 'pdf' });

        // DOCX (with timeout)
        try {
          const docxBuffer = await Promise.race([
            generateJointDocxReport(osintCrossRef, osintResults),
            new Promise<Buffer>((resolve) => setTimeout(() => resolve(Buffer.alloc(0)), REPORT_TIMEOUT)),
          ]);
          if (docxBuffer.length > 0) {
            jointBuffers.set(jointAnalysisId + '_docx', { buffer: docxBuffer, format: 'docx' });
          }
        } catch { /* ignore DOCX failure */ }

        // Store in memory
        try {
          const { createJointAnalysis } = await import('@/lib/memory-store');
          createJointAnalysis({
            analysis: osintCrossRef,
            individualScans: [
              { name: inv1.sheetName, scanId: allSheetResults[0].scanId },
              { name: inv2.sheetName, scanId: allSheetResults[1].scanId },
            ],
            fileName: jointReportFileName,
          });
        } catch { /* ignore memory store failure */ }
      }
    } catch (pdfError) {
      console.warn('[Upload] Failed to generate joint PDF:', pdfError);
    }

    return NextResponse.json({
      type: 'xlsx_multi_sheet',
      sheetNames: nonEmptySheets.map(s => s.name),
      results: allSheetResults,
      relationshipAnalysis: {
        sheet1Name: osintCrossRef.sheet1Name,
        sheet2Name: osintCrossRef.sheet2Name,
        sheet1RowCount: osintCrossRef.sheet1RowCount,
        sheet2RowCount: osintCrossRef.sheet2RowCount,
        totalLinks: osintCrossRef.totalLinks,
        links: osintCrossRef.links.slice(0, 100),
        summary: osintCrossRef.summary,
        networkMap: osintCrossRef.networkMap,
        osintCrossReferenceLinks: osintCrossRef.links.length,
      },
      jointAnalysisId,
      jointReportFileName,
    });
  }

  // ════════════════════════════════════════════════════════════
  //  SINGLE-SHEET FLOW
  // ════════════════════════════════════════════════════════════
  const sheet = nonEmptySheets[0];
  const investigation = await investigateSheet(sheet.data, sheet.name, deepseekKey);

  const primaryPerson = investigation.persons[0];
  const scanFullName = primaryPerson ? primaryPerson.name : `Fuente de datos: ${sheet.name}`;
  const scan = createScan({
    fullName: scanFullName,
    cedula: primaryPerson?.identifiers.cedula || null,
    email: primaryPerson?.identifiers.email || null,
    phone: primaryPerson?.identifiers.phone || null,
    scanType: 'data_intelligence',
  });
  addScanResults(scan.id, investigation.allResults);
  const summary = {
    critical: investigation.allResults.filter(r => r.severity === 'critical').length,
    high: investigation.allResults.filter(r => r.severity === 'high').length,
    medium: investigation.allResults.filter(r => r.severity === 'medium').length,
    low: investigation.allResults.filter(r => r.severity === 'low').length,
    info: investigation.allResults.filter(r => r.severity === 'info').length,
  };

  return NextResponse.json({
    type: 'xlsx_single_sheet',
    sheetNames,
    results: [{
      sheetName: sheet.name,
      rowCount: sheet.data.length,
      scanId: scan.id,
      fullName: scanFullName,
      totalResults: investigation.allResults.length,
      reportGenerated: false,
      reportFileName: null,
      summary,
      personsInvestigated: investigation.persons.map(p => ({
        name: p.name,
        identifiers: { cedula: p.identifiers.cedula, email: p.identifiers.email, phone: p.identifiers.phone, address: p.identifiers.address },
        findingsCount: p.findingsCount,
      })),
    }],
  });
}

// ── Handle raw XLSX/XLS file (server-side parsing) ──
async function handleRawXLSX(buffer: Buffer, fileName: string): Promise<NextResponse> {
  try {
    const { sheets, sheetNames } = parseXLSXWithSheets(buffer);
    const nonEmptySheets = sheets.filter(s => s.data.length > 0);
    if (nonEmptySheets.length === 0) {
      return NextResponse.json(
        { error: 'El archivo Excel no contiene datos legibles. Puede estar vacio o danado. Si es formato .xls, intenta guardarlo como .xlsx.', isEncrypted: false },
        { status: 400 }
      );
    }
    return handleParsedXLSX({ sheets: nonEmptySheets.map(s => ({ name: s.name, data: s.data })), sheetNames });
  } catch (parseError) {
    console.error('[Upload] XLSX parse error:', parseError);
    const errorMsg = parseError instanceof Error ? parseError.message : 'Error desconocido';
    const isEncrypted = errorMsg.startsWith('[ENCRYPTED]');
    return NextResponse.json(
      {
        error: isEncrypted
          ? 'El archivo tiene cifrado real y no puede ser leido. Retire la proteccion y vuelva a intentarlo.'
          : `No se pudo leer el archivo Excel: ${errorMsg.replace(/^\[ENCRYPTED\]\s*/, '')}`,
        details: errorMsg,
        isEncrypted
      },
      { status: 400 }
    );
  }
}

// ── Handle CSV file ──
async function handleCSV(buffer: Buffer, fileName: string): Promise<NextResponse> {
  try {
    const { parseXLSXWithSheets } = await import('@/lib/relationship-analyzer');
    const { sheets, sheetNames } = parseXLSXWithSheets(buffer);
    return handleParsedXLSX({ sheets, sheetNames });
  } catch {
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
      headers.forEach((h, idx) => { row[h] = values[idx] || ''; if (values[idx]) hasData = true; });
      if (hasData) data.push(row);
    }
    const results = createResultsFromSheetData(data, fileName);
    const scan = createScan({ fullName: `CSV: ${fileName}`, scanType: 'data_intelligence' });
    addScanResults(scan.id, results);
    return NextResponse.json({
      type: 'csv',
      results: [{
        sheetName: fileName, rowCount: data.length, scanId: scan.id,
        fullName: `CSV: ${fileName}`, totalResults: results.length,
        reportGenerated: false, reportFileName: null,
        summary: {
          critical: results.filter(r => r.severity === 'critical').length,
          high: results.filter(r => r.severity === 'high').length,
          medium: results.filter(r => r.severity === 'medium').length,
          low: results.filter(r => r.severity === 'low').length,
          info: results.filter(r => r.severity === 'info').length,
        },
      }],
    });
  }
}

// ══════════════════════════════════════════════════════════════════
//  IRM PROTECTION DETECTION — Only for genuine Rights Management
//  Does NOT flag .xls files with mere sheet protection
// ══════════════════════════════════════════════════════════════════

// These signals are ONLY present when Office Information Rights Management (IRM)
// replaces the entire file content with a protection notice.
// We do NOT check for generic terms like "password protected" or "encrypted"
// because those can appear in normal data or .xls files with sheet protection.
const IRM_SIGNALS = [
  'permiso de acceso a este documento está restringido actualmente',
  'solo se puede abrir utilizando microsoft office',
  'complemento rights management',
  'rights management add-in',
  'irm protected',
  'information rights management',
];

function isIRMProtected(data: Record<string, string>[]): boolean {
  if (data.length === 0) return false;
  // Only check the first row AND require at least 2 IRM signals to match
  // This prevents false positives from normal data that happens to contain one keyword
  const firstRow = data[0];
  const allText = Object.entries(firstRow)
    .map(([k, v]) => `${k} ${v}`)
    .join(' ')
    .toLowerCase();

  const matchCount = IRM_SIGNALS.filter(signal => allText.includes(signal)).length;
  // Require at least 2 matching signals to confirm IRM protection
  return matchCount >= 2;
}

// ── Clean row data: filter out undefined values and garbage keys ──
function cleanRowData(row: Record<string, string>): Record<string, string> {
  const cleaned: Record<string, string> = {};
  for (const [key, value] of Object.entries(row)) {
    const cleanKey = key.trim();
    const cleanValue = (value || '').trim();
    if (
      !cleanKey ||
      cleanKey === 'undefined' ||
      cleanKey === 'null' ||
      cleanKey.startsWith('El permiso de acceso') ||
      cleanKey.startsWith('Columna_') && !cleanValue
    ) continue;
    if (
      !cleanValue ||
      cleanValue === 'undefined' ||
      cleanValue === 'null' ||
      cleanValue === 'NaN'
    ) continue;
    // Skip IRM protection notice content
    if (cleanKey.toLowerCase().includes('permiso de acceso') ||
        cleanKey.toLowerCase().includes('restringido actualmente') ||
        cleanKey.toLowerCase().includes('rights management') ||
        cleanKey.toLowerCase().includes('complemento rights') ||
        cleanKey.toLowerCase().includes('solo se puede abrir')) continue;
    if (cleanValue.toLowerCase().includes('permiso de acceso') ||
        cleanValue.toLowerCase().includes('restringido actualmente') ||
        cleanValue.toLowerCase().includes('rights management')) continue;
    cleaned[cleanKey] = cleanValue;
  }
  return cleaned;
}

// ── Fallback: Convert sheet data to OSINTResult format ──
function createResultsFromSheetData(
  data: Record<string, string>[],
  sheetName: string
): Array<{ source: string; category: string; severity: 'critical' | 'high' | 'medium' | 'low' | 'info'; title: string; description: string; url: string; dataFound: string }> {
  const results: Array<{ source: string; category: string; severity: 'critical' | 'high' | 'medium' | 'low' | 'info'; title: string; description: string; url: string; dataFound: string }> = [];

  for (const row of data) {
    const cleanedRow = cleanRowData(row);
    const entries = Object.entries(cleanedRow).filter(([, v]) => v && v.trim() && v.trim() !== 'undefined');
    if (entries.length === 0) continue;

    const nameField = entries.find(([k]) => /nombre|name|razon|empresa|company/i.test(k));
    let personName = nameField ? nameField[1].trim() : '';
    
    if (!personName || personName === 'undefined') {
      const firstValidEntry = entries.find(([, v]) => v && v !== 'undefined' && v.length >= 2);
      personName = firstValidEntry ? firstValidEntry[1].trim() : '';
    }
    
    if (!personName || personName === 'undefined') continue;

    const hasEmail = entries.some(([k]) => /correo|email|mail/i.test(k));
    const hasPhone = entries.some(([k]) => /telefono|phone|celular|mobile/i.test(k));
    const hasId = entries.some(([k]) => /cedula|nit|identifica|rut/i.test(k));

    let severity: 'critical' | 'high' | 'medium' | 'low' | 'info' = 'info';
    if (hasEmail && hasPhone && hasId) severity = 'high';
    else if (hasEmail && hasPhone) severity = 'medium';
    else if (hasEmail || hasPhone || hasId) severity = 'low';

    const cleanEntries = entries
      .filter(([k, v]) => v && v !== 'undefined' && k !== 'undefined')
      .map(([k, v]) => `${k}=${v}`)
      .join(', ');

    results.push({
      source: `Fuente de datos: ${sheetName}`,
      category: hasId ? 'personal_exposure' : hasEmail ? 'credential_breach' : 'document_exposure',
      severity,
      title: `Registro: ${personName}`,
      description: `Datos encontrados en hoja "${sheetName}": ${cleanEntries}`,
      url: '',
      dataFound: JSON.stringify(cleanedRow),
    });
  }
  return results;
}
