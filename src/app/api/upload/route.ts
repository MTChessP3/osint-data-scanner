/**
 * API Route: /api/upload
 * Procesa archivos Excel (.xlsx) y CSV para análisis de vínculos y escaneo OSINT por lote.
 *
 * FLUJO PRINCIPAL (Multi-hoja):
 *  1. Parsear Excel → extraer datos de personas de cada hoja
 *  2. Para cada persona, extraer identificadores (cédula, nombre, email, teléfono, dirección)
 *  3. Ejecutar escaneo OSINT abreviado para cada persona (web search + AI analysis)
 *  4. Cruzar los resultados OSINT entre hojas para generar análisis de vínculos
 *  5. Generar informes comprensivos con hallazgos individuales + referencias cruzadas
 *
 * Soporta 3 formatos de entrada:
 *  1. JSON { type: 'xlsx', sheets, sheetNames } — datos ya parseados desde el cliente
 *  2. FormData con archivo — archivo binario procesado server-side
 *  3. JSON { type: 'xlsx', fileName, fileBase64 } — archivo en base64
 */

import { NextRequest, NextResponse } from 'next/server';
import { parseXLSXWithSheets, analyzeRelationships, crossReferenceOSINTResults } from '@/lib/relationship-analyzer';
import { createScan, addScanResults, addReport } from '@/lib/memory-store';
import { generateJointPDF } from '@/lib/generate-pdf-report';
import { jointBuffers } from '@/app/api/joint-analysis/route';
import {
  performWebSearch,
  analyzeWithDeepSeek,
  setDeepSeekApiKey,
  OSINTResult,
  WebSearchResult,
} from '@/lib/osint-scanner';
import { initZAIConfig } from '@/lib/zai-config';

// ── Max persons per sheet for OSINT scanning (avoid Vercel timeout) ──
const MAX_PERSONS_PER_SHEET = 5;
// ── Max search queries per person ──
const MAX_QUERIES_PER_PERSON = 3;
// ── Timeout per individual search query (ms) ──
const SEARCH_TIMEOUT_MS = 5000;

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
interface PersonWithOSINT {
  name: string;
  identifiers: PersonIdentifier;
  osintResults: OSINTResult[];
  findingsCount: number;
}

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

// ══════════════════════════════════════════════════════════════════
//  IDENTIFIER EXTRACTION — Map row fields to person identifiers
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

  // A person must have at least a name or a cedula
  if (!name && !cedula) return null;

  return {
    name: name || cedula,
    cedula,
    email,
    phone,
    address,
    rawRow: row,
  };
}

function extractPersonsFromSheet(data: Record<string, string>[]): PersonIdentifier[] {
  const persons: PersonIdentifier[] = [];
  const seenNames = new Set<string>();

  for (const row of data) {
    const person = extractPersonFromRow(row);
    if (person) {
      // Deduplicate by name (case-insensitive, normalized)
      const key = person.name.toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      if (!seenNames.has(key)) {
        seenNames.add(key);
        persons.push(person);
      }
    }
  }

  // Limit to max persons per sheet
  return persons.slice(0, MAX_PERSONS_PER_SHEET);
}

// ══════════════════════════════════════════════════════════════════
//  LIGHTWEIGHT OSINT INVESTIGATION — Per person
//  Uses 2-3 key search queries + AI analysis
// ══════════════════════════════════════════════════════════════════

async function runLightweightOSINTScan(person: PersonIdentifier): Promise<OSINTResult[]> {
  const results: OSINTResult[] = [];
  const queries: string[] = [];

  // Build search queries from identifiers (max 3)
  if (person.cedula) {
    queries.push(`"CC ${person.cedula}" OR "NIT ${person.cedula}" OR "${person.cedula}" Colombia`);
  }
  if (person.name) {
    const nameQuery = person.email
      ? `"${person.name}" "${person.email}"`
      : `"${person.name}" Colombia`;
    queries.push(nameQuery);
  }
  if (person.phone && queries.length < MAX_QUERIES_PER_PERSON) {
    queries.push(`"${person.phone}" Colombia contacto`);
  }
  if (person.email && !queries.some(q => q.includes(person.email)) && queries.length < MAX_QUERIES_PER_PERSON) {
    queries.push(`"${person.email}" breach leak`);
  }

  // Limit queries
  const limitedQueries = queries.slice(0, MAX_QUERIES_PER_PERSON);

  if (limitedQueries.length === 0) {
    // No identifiers to search — create a minimal result
    results.push({
      source: 'Escaneo OSINT Automático',
      category: 'personal_exposure',
      severity: 'info',
      title: `Sin identificadores suficientes para investigación OSINT: ${person.name}`,
      description: `No se encontraron identificadores (cédula, nombre, email, teléfono) suficientes para realizar una búsqueda OSINT significativa para "${person.name}". Se recomienda ingresar más datos para una investigación completa.`,
      url: '',
      dataFound: JSON.stringify({ name: person.name, cedula: person.cedula, email: person.email, phone: person.phone }),
    });
    return results;
  }

  // Run searches concurrently with Promise.allSettled
  const searchPromises = limitedQueries.map(query =>
    Promise.race([
      performWebSearch(query, 5),
      new Promise<WebSearchResult[]>((_, reject) =>
        setTimeout(() => reject(new Error('Search timeout')), SEARCH_TIMEOUT_MS)
      ),
    ]).catch(() => [] as WebSearchResult[])
  );

  const searchSettled = await Promise.allSettled(searchPromises);

  // Process each search query with AI analysis
  const analysisPromises: Promise<OSINTResult[]>[] = [];

  for (let i = 0; i < searchSettled.length; i++) {
    const settled = searchSettled[i];
    if (settled.status !== 'fulfilled') continue;

    const searchResults = settled.value;
    if (!searchResults || searchResults.length === 0) continue;

    const context = `Investigación OSINT de "${person.name}" — consulta: ${limitedQueries[i]}`;

    analysisPromises.push(
      analyzeWithDeepSeek(
        context,
        searchResults,
        `Escaneo Lote - Consulta ${i + 1}`,
        {
          fullName: person.name,
          cedula: person.cedula || undefined,
          email: person.email || undefined,
          phone: person.phone || undefined,
        }
      ).then(findings => findings.map(f => ({
        source: 'Escaneo OSINT Automático',
        category: f.category,
        severity: f.severity,
        title: f.title,
        description: f.description,
        url: searchResults[0]?.url || '',
        dataFound: f.dataFound,
        rawSnippet: searchResults.map(r => r.snippet).join(' | ').substring(0, 500),
      }))).catch(() => [] as OSINTResult[])
    );
  }

  const analysisSettled = await Promise.allSettled(analysisPromises);

  for (const settled of analysisSettled) {
    if (settled.status === 'fulfilled') {
      results.push(...settled.value);
    }
  }

  // If no results from any search, add a baseline result
  if (results.length === 0) {
    results.push({
      source: 'Escaneo OSINT Automático',
      category: 'personal_exposure',
      severity: 'low',
      title: `Búsqueda OSINT sin resultados significativos: ${person.name}`,
      description: `Se realizaron ${limitedQueries.length} consultas OSINT para "${person.name}" sin encontrar hallazgos significativos en las fuentes automatizadas. La ausencia de resultados no descarta la existencia de información relevante en fuentes no consultadas.`,
      url: '',
      dataFound: `Consultas: ${limitedQueries.join('; ')}`,
    });
  }

  return results;
}

// ══════════════════════════════════════════════════════════════════
//  OSINT INVESTIGATION FOR A SHEET
//  Scans up to MAX_PERSONS_PER_SHEET persons concurrently
// ══════════════════════════════════════════════════════════════════

async function investigateSheet(
  sheetData: Record<string, string>[],
  sheetName: string
): Promise<{
  persons: PersonWithOSINT[];
  allResults: OSINTResult[];
}> {
  const persons = extractPersonsFromSheet(sheetData);

  if (persons.length === 0) {
    // No persons identified — create a single data-exposure result
    const fallbackResults = createResultsFromSheetData(sheetData, sheetName);
    return {
      persons: [],
      allResults: fallbackResults,
    };
  }

  console.log(`[Upload API] Investigating ${persons.length} persons from sheet "${sheetName}"`);

  // Run OSINT scans concurrently (with allSettled to handle timeouts)
  const scanPromises = persons.map(person => runLightweightOSINTScan(person));
  const scanSettled = await Promise.allSettled(scanPromises);

  const personsWithOSINT: PersonWithOSINT[] = [];
  const allResults: OSINTResult[] = [];

  for (let i = 0; i < scanSettled.length; i++) {
    const settled = scanSettled[i];
    const person = persons[i];

    if (settled.status === 'fulfilled') {
      const osintResults = settled.value;
      personsWithOSINT.push({
        name: person.name,
        identifiers: person,
        osintResults,
        findingsCount: osintResults.length,
      });
      allResults.push(...osintResults);
    } else {
      // Scan failed/timed out for this person — add error result
      const errorResult: OSINTResult = {
        source: 'Escaneo OSINT Automático',
        category: 'personal_exposure',
        severity: 'low',
        title: `Escaneo OSINT incompleto: ${person.name}`,
        description: `El escaneo OSINT para "${person.name}" no se completó dentro del tiempo límite. Se recomienda realizar una investigación manual para esta persona.`,
        url: '',
        dataFound: `Cédula: ${person.cedula || 'N/A'}, Email: ${person.email || 'N/A'}, Teléfono: ${person.phone || 'N/A'}`,
      };
      personsWithOSINT.push({
        name: person.name,
        identifiers: person,
        osintResults: [errorResult],
        findingsCount: 1,
      });
      allResults.push(errorResult);
    }
  }

  // Also add baseline data exposure results for rows that weren't in the top MAX_PERSONS_PER_SHEET
  if (sheetData.length > persons.length) {
    const baselineResults = createResultsFromSheetData(sheetData, sheetName);
    // Only add results for rows not already covered by OSINT-scanned persons
    const scannedNames = Array.from(new Set(persons.map(p => p.name.toLowerCase())));
    const uncoveredResults = baselineResults.filter(r => {
      // Check if this result is about a person we already scanned
      return !scannedNames.some(name => r.title.toLowerCase().includes(name));
    });
    allResults.push(...uncoveredResults.slice(0, 5)); // Limit extra results
  }

  return { persons: personsWithOSINT, allResults };
}

// ══════════════════════════════════════════════════════════════════
//  HANDLE PARSED XLSX — Main handler with OSINT investigation flow
// ══════════════════════════════════════════════════════════════════

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

  // ── Initialize ZAI config with timeout protection ──
  await Promise.race([
    initZAIConfig(),
    new Promise<void>(resolve => setTimeout(resolve, 3000)),
  ]);

  // ── Set DeepSeek API key from environment ──
  const deepseekKey = process.env.DEEPSEEK_API_KEY || null;
  if (deepseekKey) {
    setDeepSeekApiKey(deepseekKey);
    console.log('[Upload API] DeepSeek API key configured from environment');
  }

  // ════════════════════════════════════════════════════════════
  //  MULTI-SHEET FLOW: OSINT investigation + cross-reference
  // ════════════════════════════════════════════════════════════
  if (nonEmptySheets.length >= 2) {
    // Step 1: Run OSINT investigation for each sheet concurrently
    const sheetInvestigationPromises = nonEmptySheets.map(sheet =>
      investigateSheet(sheet.data, sheet.name)
    );
    const investigationSettled = await Promise.allSettled(sheetInvestigationPromises);

    const sheetInvestigations: Array<{
      sheetName: string;
      persons: PersonWithOSINT[];
      allResults: OSINTResult[];
    }> = [];

    for (let i = 0; i < investigationSettled.length; i++) {
      const settled = investigationSettled[i];
      const sheetName = nonEmptySheets[i].name;

      if (settled.status === 'fulfilled') {
        sheetInvestigations.push({
          sheetName,
          persons: settled.value.persons,
          allResults: settled.value.allResults,
        });
      } else {
        // Investigation failed for this sheet — fallback to basic data results
        const fallbackResults = createResultsFromSheetData(nonEmptySheets[i].data, sheetName);
        sheetInvestigations.push({
          sheetName,
          persons: [],
          allResults: fallbackResults,
        });
        console.warn(`[Upload API] OSINT investigation failed for sheet "${sheetName}", using fallback`);
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
      // Use the primary person's name and identifiers for the scan record
      const primaryPerson = investigation.persons[0];
      const scanFullName = primaryPerson
        ? primaryPerson.name
        : `Hoja: ${investigation.sheetName}`;
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
          identifiers: {
            cedula: p.identifiers.cedula,
            email: p.identifiers.email,
            phone: p.identifiers.phone,
            address: p.identifiers.address,
          },
          findingsCount: p.findingsCount,
        })),
      });
    }

    // Step 3: Cross-reference analysis
    // First, run the existing raw-data relationship analysis
    const sheet1 = nonEmptySheets[0];
    const sheet2 = nonEmptySheets[1];
    const rawAnalysis = analyzeRelationships(
      sheet1.data,
      sheet2.data,
      sheet1.name,
      sheet2.name
    );

    // Then, cross-reference OSINT results between sheets
    const inv1 = sheetInvestigations[0];
    const inv2 = sheetInvestigations[1];
    const osintCrossRef = crossReferenceOSINTResults(
      inv1.persons,
      inv2.persons,
      inv1.sheetName,
      inv2.sheetName
    );

    // Merge OSINT cross-reference links into the raw analysis
    const mergedAnalysis: typeof rawAnalysis = {
      ...rawAnalysis,
      totalLinks: rawAnalysis.totalLinks + osintCrossRef.links.length,
      links: [...rawAnalysis.links, ...osintCrossRef.links],
      summary: {
        empresariales: rawAnalysis.summary.empresariales + osintCrossRef.summary.empresariales,
        personales: rawAnalysis.summary.personales + osintCrossRef.summary.personales,
        familiares: rawAnalysis.summary.familiares + osintCrossRef.summary.familiares,
        laborales: rawAnalysis.summary.laborales + osintCrossRef.summary.laborales,
        contacto: rawAnalysis.summary.contacto + osintCrossRef.summary.contacto,
        ubicacion: rawAnalysis.summary.ubicacion + osintCrossRef.summary.ubicacion,
        dato_compartido: rawAnalysis.summary.dato_compartido + osintCrossRef.summary.dato_compartido,
      },
      networkMap: mergeNetworkMaps(rawAnalysis.networkMap, osintCrossRef.networkMap),
    };

    // Step 4: Generate joint analysis PDF
    let jointAnalysisId: string | null = null;
    let jointReportFileName: string | null = null;

    const scan1 = allSheetResults[0];
    const scan2 = allSheetResults[1];

    try {
      const pdfBuffer = await generateJointPDF(
        mergedAnalysis,
        [
          { name: inv1.sheetName, results: inv1.allResults },
          { name: inv2.sheetName, results: inv2.allResults },
        ],
      );

      jointAnalysisId = mergedAnalysis.sheet1Name.replace(/\s+/g, '_') + '_' + Date.now();
      jointReportFileName = `Informe_Vinculos_${Date.now()}.pdf`;

      jointBuffers.set(jointAnalysisId, { buffer: pdfBuffer, format: 'pdf' });

      // Also store in memory store
      const { createJointAnalysis } = await import('@/lib/memory-store');
      createJointAnalysis({
        analysis: mergedAnalysis,
        individualScans: [
          { name: inv1.sheetName, scanId: scan1.scanId },
          { name: inv2.sheetName, scanId: scan2.scanId },
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
        sheet1Name: mergedAnalysis.sheet1Name,
        sheet2Name: mergedAnalysis.sheet2Name,
        sheet1RowCount: mergedAnalysis.sheet1RowCount,
        sheet2RowCount: mergedAnalysis.sheet2RowCount,
        totalLinks: mergedAnalysis.totalLinks,
        links: mergedAnalysis.links.slice(0, 100), // Limit for client
        summary: mergedAnalysis.summary,
        networkMap: mergedAnalysis.networkMap,
        osintCrossReferenceLinks: osintCrossRef.links.length,
      },
      jointAnalysisId,
      jointReportFileName,
    });
  }

  // ════════════════════════════════════════════════════════════
  //  SINGLE-SHEET FLOW: OSINT investigation for one sheet
  // ════════════════════════════════════════════════════════════
  const sheet = nonEmptySheets[0];

  // Initialize ZAI config
  await Promise.race([
    initZAIConfig(),
    new Promise<void>(resolve => setTimeout(resolve, 3000)),
  ]);

  if (deepseekKey) {
    setDeepSeekApiKey(deepseekKey);
  }

  const investigation = await investigateSheet(sheet.data, sheet.name);

  // Use the primary person's name and identifiers for the scan record
  const primaryPerson = investigation.persons[0];
  const scanFullName = primaryPerson
    ? primaryPerson.name
    : `Hoja: ${sheet.name}`;
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
        identifiers: {
          cedula: p.identifiers.cedula,
          email: p.identifiers.email,
          phone: p.identifiers.phone,
          address: p.identifiers.address,
        },
        findingsCount: p.findingsCount,
      })),
    }],
  });
}

// ── Merge network maps from raw analysis and OSINT cross-reference ──
function mergeNetworkMaps(
  map1: { person: string; connections: number; types: string[] }[],
  map2: { person: string; connections: number; types: string[] }[]
): { person: string; connections: number; types: string[] }[] {
  const merged = new Map<string, { connections: number; types: Set<string> }>();

  for (const entry of [...map1, ...map2]) {
    const existing = merged.get(entry.person);
    if (existing) {
      existing.connections += entry.connections;
      entry.types.forEach(t => existing.types.add(t));
    } else {
      merged.set(entry.person, { connections: entry.connections, types: new Set(entry.types) });
    }
  }

  return Array.from(merged.entries())
    .map(([person, data]) => ({
      person,
      connections: data.connections,
      types: Array.from(data.types),
    }))
    .sort((a, b) => b.connections - a.connections);
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

// ══════════════════════════════════════════════════════════════════
//  FALLBACK: Convert sheet data to OSINTResult format
//  Used when no person identifiers are found or as supplementary data
// ══════════════════════════════════════════════════════════════════

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
