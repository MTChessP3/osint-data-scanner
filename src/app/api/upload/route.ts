/**
 * API Route: /api/upload
 * Procesa archivos Excel (.xlsx, .xls) y CSV para investigación OSINT individual + cruce de vínculos.
 *
 * FLUJO PRINCIPAL (Multi-hoja):
 *  1. Parsear Excel → extraer datos de personas de cada hoja
 *  2. Para cada persona, ejecutar runFullScan() con TODOS los 16 motores OSINT
 *  3. Cruzar los hallazgos OSINT entre personas de diferentes hojas
 *  4. Generar informe de vínculos basado en los hallazgos de inteligencia
 *
 * NUEVO: Ya NO hace comparación directa entre celdas de hojas.
 * Cada persona es investigada individualmente y luego se cruzan los resultados.
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

// ── Max persons per sheet for OSINT scanning ──
const MAX_PERSONS_PER_SHEET = 30;
// ── Selected engines for batch mode (key engines that work without email) ──
const BATCH_ENGINES = [
  'LeakIX', 'Dehashed', 'LeakRadar', 'Social Media Scan',
  'DeepFind Profile Analyzer', 'Google Dorking', 'Document Exposure Scan',
  'Data Broker Scan', 'Pipl', 'DeepFind Deep Search',
  'Policía Nacional Colombia', 'Aleph / OCCRP',
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
//  FULL OSINT INVESTIGATION — Per person using ALL 16 engines
// ══════════════════════════════════════════════════════════════════

async function runFullOSINTInvestigation(person: PersonIdentifier, deepseekKey: string | null): Promise<OSINTResult[]> {
  console.log(`[Upload API] Running FULL OSINT scan for: ${person.name} (CC: ${person.cedula || 'N/A'}, Email: ${person.email || 'N/A'})`);

  try {
    const results = await runFullScan({
      fullName: person.name,
      cedula: person.cedula || undefined,
      email: person.email || undefined,
      phone: person.phone || undefined,
      deepseekKey: deepseekKey || undefined,
      selectedEngines: BATCH_ENGINES,
    });

    console.log(`[Upload API] Full scan completed for ${person.name}: ${results.length} findings`);
    return results;
  } catch (error) {
    console.warn(`[Upload API] Full scan failed for ${person.name}:`, error instanceof Error ? error.message : 'unknown');

    return [{
      source: 'Escaneo OSINT Completo',
      category: 'personal_exposure',
      severity: 'low',
      title: `Investigación OSINT incompleta: ${person.name}`,
      description: `El escaneo OSINT completo para "${person.name}" no pudo completarse. Se recomienda realizar una investigación manual. Identificadores: CC ${person.cedula || 'N/A'}, Email ${person.email || 'N/A'}, Tel ${person.phone || 'N/A'}`,
      url: '',
      dataFound: JSON.stringify({ name: person.name, cedula: person.cedula, email: person.email, phone: person.phone, address: person.address }),
    }];
  }
}

// ══════════════════════════════════════════════════════════════════
//  INVESTIGATE A SHEET — Run full OSINT scan on each person
// ══════════════════════════════════════════════════════════════════

async function investigateSheet(
  sheetData: Record<string, string>[],
  sheetName: string,
  deepseekKey: string | null
): Promise<{
  persons: PersonWithOSINTLocal[];
  allResults: OSINTResult[];
}> {
  const persons = extractPersonsFromSheet(sheetData);

  if (persons.length === 0) {
    const fallbackResults = createResultsFromSheetData(sheetData, sheetName);
    return { persons: [], allResults: fallbackResults };
  }

  console.log(`[Upload API] Investigating ${persons.length} persons from sheet "${sheetName}" with FULL OSINT scan`);

  const personsWithOSINT: PersonWithOSINTLocal[] = [];
  const allResults: OSINTResult[] = [];

  for (const person of persons) {
    try {
      const osintResults = await runFullOSINTInvestigation(person, deepseekKey);
      personsWithOSINT.push({
        name: person.name,
        identifiers: person,
        osintResults,
        findingsCount: osintResults.length,
        sheetName,
      });
      allResults.push(...osintResults);
    } catch (error) {
      console.warn(`[Upload API] Investigation failed for ${person.name}:`, error);
      personsWithOSINT.push({
        name: person.name,
        identifiers: person,
        osintResults: [],
        findingsCount: 0,
        sheetName,
      });
    }
  }

  // Add baseline results for rows not covered
  if (sheetData.length > persons.length) {
    const baselineResults = createResultsFromSheetData(sheetData, sheetName);
    const scannedNames = Array.from(new Set(persons.map(p => p.name.toLowerCase())));
    const uncoveredResults = baselineResults.filter(r => !scannedNames.some(name => r.title.toLowerCase().includes(name)));
    allResults.push(...uncoveredResults.slice(0, 3));
  }

  return { persons: personsWithOSINT, allResults };
}

// ══════════════════════════════════════════════════════════════════
//  HANDLE PARSED XLSX — Main handler with FULL OSINT investigation
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

  // Initialize ZAI config
  await Promise.race([initZAIConfig(), new Promise<void>(resolve => setTimeout(resolve, 3000))]);

  // Set DeepSeek API key
  const deepseekKey = process.env.DEEPSEEK_API_KEY || null;
  if (deepseekKey) {
    setDeepSeekApiKey(deepseekKey);
    console.log('[Upload API] DeepSeek API key configured from environment');
  }

  // ════════════════════════════════════════════════════════════
  //  MULTI-SHEET FLOW: Full OSINT investigation + cross-reference
  // ════════════════════════════════════════════════════════════
  if (nonEmptySheets.length >= 2) {
    // Step 1: Run FULL OSINT investigation for each sheet SEQUENTIALLY
    const sheetInvestigations: Array<{
      sheetName: string;
      persons: PersonWithOSINTLocal[];
      allResults: OSINTResult[];
    }> = [];

    for (const sheet of nonEmptySheets) {
      try {
        const investigation = await investigateSheet(sheet.data, sheet.name, deepseekKey);
        sheetInvestigations.push({
          sheetName: sheet.name,
          persons: investigation.persons,
          allResults: investigation.allResults,
        });
      } catch (error) {
        console.warn(`[Upload API] Investigation failed for sheet "${sheet.name}":`, error);
        const fallbackResults = createResultsFromSheetData(sheet.data, sheet.name);
        sheetInvestigations.push({ sheetName: sheet.name, persons: [], allResults: fallbackResults });
      }
    }

    // Step 2: Create scan records for each sheet
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

    // Step 3: Cross-reference OSINT results ONLY (NO direct sheet comparison)
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

    const osintCrossRef = crossReferenceOSINTResults(persons1ForCrossRef, persons2ForCrossRef, inv1.sheetName, inv2.sheetName);

    // Step 4: Generate joint analysis PDF and DOCX
    let jointAnalysisId: string | null = null;
    let jointReportFileName: string | null = null;

    try {
      const osintResults = [
        { name: inv1.sheetName, results: inv1.allResults },
        { name: inv2.sheetName, results: inv2.allResults },
      ];

      const pdfBuffer = await generateJointPDF(osintCrossRef, osintResults);
      jointAnalysisId = osintCrossRef.sheet1Name.replace(/\s+/g, '_') + '_' + Date.now();
      jointReportFileName = `Informe_Vinculos_${Date.now()}.pdf`;
      jointBuffers.set(jointAnalysisId, { buffer: pdfBuffer, format: 'pdf' });

      // Also generate and cache DOCX
      try {
        const docxBuffer = await generateJointDocxReport(osintCrossRef, osintResults);
        const docxAnalysisId = jointAnalysisId + '_docx';
        jointBuffers.set(docxAnalysisId, { buffer: docxBuffer, format: 'docx' });
        console.log('[Upload API] Joint DOCX report generated and cached');
      } catch (docxErr) {
        console.warn('[Upload API] Failed to generate joint DOCX:', docxErr);
      }

      // Store in memory
      const { createJointAnalysis } = await import('@/lib/memory-store');
      createJointAnalysis({
        analysis: osintCrossRef,
        individualScans: [
          { name: inv1.sheetName, scanId: allSheetResults[0].scanId },
          { name: inv2.sheetName, scanId: allSheetResults[1].scanId },
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
        { error: 'El archivo Excel no contiene datos legibles. Puede estar vacio, danado o protegido con contrasena.', isEncrypted: false },
        { status: 400 }
      );
    }
    return handleParsedXLSX({ sheets: nonEmptySheets.map(s => ({ name: s.name, data: s.data })), sheetNames });
  } catch (parseError) {
    console.error('[Upload API] XLSX parse error:', parseError);
    const errorMsg = parseError instanceof Error ? parseError.message : 'Error desconocido';
    const isEncrypted = errorMsg.startsWith('[ENCRYPTED]');
    return NextResponse.json(
      { error: isEncrypted ? 'El archivo esta protegido con contrasena.' : `No se pudo leer el archivo Excel: ${errorMsg}`, details: errorMsg, isEncrypted },
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

// ── Fallback: Convert sheet data to OSINTResult format ──
function createResultsFromSheetData(
  data: Record<string, string>[],
  sheetName: string
): Array<{ source: string; category: string; severity: 'critical' | 'high' | 'medium' | 'low' | 'info'; title: string; description: string; url: string; dataFound: string }> {
  const results: Array<{ source: string; category: string; severity: 'critical' | 'high' | 'medium' | 'low' | 'info'; title: string; description: string; url: string; dataFound: string }> = [];

  for (const row of data) {
    const entries = Object.entries(row).filter(([, v]) => v && v.trim());
    if (entries.length === 0) continue;
    const nameField = entries.find(([k]) => /nombre|name|razon|empresa|company/i.test(k));
    const personName = nameField ? nameField[1].trim() : entries[0][1].trim();
    const hasEmail = entries.some(([k]) => /correo|email|mail/i.test(k));
    const hasPhone = entries.some(([k]) => /telefono|phone|celular|mobile/i.test(k));
    const hasId = entries.some(([k]) => /cedula|nit|identifica|rut/i.test(k));

    let severity: 'critical' | 'high' | 'medium' | 'low' | 'info' = 'info';
    if (hasEmail && hasPhone && hasId) severity = 'high';
    else if (hasEmail && hasPhone) severity = 'medium';
    else if (hasEmail || hasPhone || hasId) severity = 'low';

    results.push({
      source: `Fuente de datos: ${sheetName}`,
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
