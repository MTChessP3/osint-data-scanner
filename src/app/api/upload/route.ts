/**
 * /api/upload — Excel/CSV file upload and batch processing
 *
 * Handles:
 * - .xlsx / .xls files (multi-sheet support with relationship analysis)
 * - .csv files (single sheet)
 * - Batch OSINT scans for each person in the file
 * - Max 30 persons per sheet (configurable)
 *
 * Returns:
 * - For multi-sheet xlsx: { type: 'xlsx_multi_sheet', sheetNames, results, relationshipAnalysis, jointAnalysisId, jointReportFileName }
 * - For single-sheet xlsx or CSV: { results: BatchResult[] }
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/auth';
import { runFullScan, OSINTResult, setDeepSeekApiKey } from '@/lib/osint-scanner';
import { parseXLSXWithSheets, analyzeRelationships, crossReferenceOSINTResults, PersonWithOSINT } from '@/lib/relationship-analyzer';
import { createScan, updateScanStatus, addScanResults, addReport, createJointAnalysis } from '@/lib/memory-store';
import { generateOSINTReport, generateReportFileName } from '@/lib/generate-report';
import { generateIndividualPDF, generatePDFFileName } from '@/lib/generate-pdf-report';
import { initZAIConfig } from '@/lib/zai-config';

export const maxDuration = 300; // 5 minutes for batch processing
const MAX_PERSONS_PER_SHEET = 30;
const MAX_SHEETS = 10;
const SCAN_TIMEOUT_MS = 60000; // 60s per individual scan

// ── Name/identifier extraction helpers ──

function extractFieldValue(row: Record<string, string>, patterns: string[]): string {
  for (const key of Object.keys(row)) {
    const keyLower = key.toLowerCase().replace(/[^a-z0-9_]/g, '_');
    for (const pattern of patterns) {
      if (keyLower.includes(pattern)) {
        const val = row[key]?.trim();
        if (val) return val;
      }
    }
  }
  return '';
}

function extractPersonData(row: Record<string, string>): {
  fullName: string;
  email: string;
  phone: string;
  cedula: string;
} {
  const fullName = extractFieldValue(row, [
    'nombre_completo', 'fullname', 'full_name', 'nombre', 'name',
    'razon_social', 'empresa', 'company', 'persona', 'sujeto',
    'investigado', 'contacto_nombre', 'nombre_completo_',
  ]) || extractFieldValue(row, ['nombres', 'apellidos', 'apellido']);

  const email = extractFieldValue(row, [
    'correo', 'email', 'e_mail', 'mail', 'correo_electronico',
    'email_principal', 'email_contacto',
  ]);

  const phone = extractFieldValue(row, [
    'telefono', 'phone', 'celular', 'mobile', 'tel', 'telefono_celular',
    'telefono_fijo', 'whatsapp', 'contacto_telefonico',
  ]);

  const cedula = extractFieldValue(row, [
    'cedula', 'nit', 'documento', 'identificacion', 'id', 'cc',
    'numero_documento', 'dni', 'cedula_ciudadania', 'rut', 'nif',
  ]);

  return { fullName, email, phone, cedula };
}

// ── CSV Parsing ──

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return [];

  // Detect delimiter (comma, semicolon, tab)
  const firstLine = lines[0];
  let delimiter = ',';
  if (firstLine.split(';').length > firstLine.split(',').length) delimiter = ';';
  if (firstLine.split('\t').length > firstLine.split(delimiter).length) delimiter = '\t';

  const headers = parseCSVLine(lines[0], delimiter);
  const data: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i], delimiter);
    const row: Record<string, string> = {};
    let hasData = false;
    headers.forEach((header, idx) => {
      const val = values[idx]?.trim() || '';
      row[header || `Columna_${idx + 1}`] = val;
      if (val) hasData = true;
    });
    if (hasData) data.push(row);
  }

  return data;
}

function parseCSVLine(line: string, delimiter: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === delimiter && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

// ── Main POST handler ──

export async function POST(request: NextRequest) {
  try {
    const auth = await verifyAuth(request);
    if (!auth.authenticated) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    // Initialize ZAI config with timeout protection
    await Promise.race([
      initZAIConfig(),
      new Promise<void>(resolve => setTimeout(resolve, 3000)),
    ]);

    // Parse FormData
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    if (!file) {
      return NextResponse.json({ error: 'No se proporcionó ningún archivo' }, { status: 400 });
    }

    const fileName = file.name.toLowerCase();
    const isXLSX = fileName.endsWith('.xlsx') || fileName.endsWith('.xls');
    const isCSV = fileName.endsWith('.csv');

    if (!isXLSX && !isCSV) {
      return NextResponse.json(
        { error: 'Formato no soportado. Use .xlsx, .xls o .csv' },
        { status: 400 }
      );
    }

    // Set DeepSeek key from env
    const effectiveDeepseekKey = process.env.DEEPSEEK_API_KEY || null;
    if (effectiveDeepseekKey) {
      setDeepSeekApiKey(effectiveDeepseekKey);
    }

    let sheets: { name: string; data: Record<string, string>[] }[] = [];
    let sheetNames: string[] = [];

    if (isXLSX) {
      // Parse Excel file
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      try {
        const parsed = parseXLSXWithSheets(buffer);
        sheets = parsed.sheets;
        sheetNames = parsed.sheetNames;
      } catch (parseError) {
        const msg = parseError instanceof Error ? parseError.message : 'Error desconocido';

        // Check for genuine encryption
        if (msg.includes('[ENCRYPTED]')) {
          return NextResponse.json(
            { error: 'El archivo tiene cifrado real y no puede ser leido. Abre el archivo en Excel, elimina la protección y guárdalo como .xlsx.', isEncrypted: true },
            { status: 400 }
          );
        }

        return NextResponse.json(
          { error: msg },
          { status: 400 }
        );
      }
    } else {
      // Parse CSV
      const text = await file.text();
      const data = parseCSV(text);
      if (data.length === 0) {
        return NextResponse.json(
          { error: 'El archivo CSV está vacío o no tiene datos válidos' },
          { status: 400 }
        );
      }
      sheets = [{ name: 'Datos CSV', data }];
      sheetNames = ['Datos CSV'];
    }

    // Filter empty sheets and enforce limits
    sheets = sheets
      .filter(s => s.data.length > 0)
      .slice(0, MAX_SHEETS);

    if (sheets.length === 0) {
      return NextResponse.json(
        { error: 'El archivo no contiene datos válidos en ninguna hoja' },
        { status: 400 }
      );
    }

    // ── Process each sheet: run OSINT scans for each person ──
    const allBatchResults: Array<{
      scanId: string;
      fullName: string;
      totalResults: number;
      reportGenerated: boolean;
      reportFileName: string | null;
      summary: { critical: number; high: number; medium: number; low: number; info: number };
      sheetName?: string;
      rowCount?: number;
      personsInvestigated?: Array<{ name: string; identifiers: Record<string, string>; findingsCount: number }>;
    }> = [];

    const personsWithOSINTBySheet: Map<string, PersonWithOSINT[]> = new Map();

    for (const sheet of sheets) {
      const rows = sheet.data.slice(0, MAX_PERSONS_PER_SHEET);
      const sheetPersonsWithOSINT: PersonWithOSINT[] = [];

      for (const row of rows) {
        const personData = extractPersonData(row);
        if (!personData.fullName) continue;

        // Create scan record
        const scan = createScan({
          fullName: personData.fullName,
          cedula: personData.cedula || null,
          email: personData.email || null,
          phone: personData.phone || null,
          status: 'running',
          scanType: 'data_intelligence',
        });

        // Run OSINT scan with timeout protection
        let results: OSINTResult[] = [];
        try {
          results = await Promise.race([
            runFullScan({
              fullName: personData.fullName,
              email: personData.email || undefined,
              phone: personData.phone || undefined,
              cedula: personData.cedula || undefined,
              deepseekKey: effectiveDeepseekKey,
            }),
            new Promise<OSINTResult[]>((resolve) =>
              setTimeout(() => resolve([]), SCAN_TIMEOUT_MS)
            ),
          ]);
        } catch (scanError) {
          console.error(`[Upload] Scan error for ${personData.fullName}:`, scanError);
        }

        // Save results
        if (results.length > 0) {
          addScanResults(scan.id, results);
        }
        updateScanStatus(scan.id, 'completed');

        // Generate report
        let reportFileName: string | null = null;
        try {
          const scanData = {
            id: scan.id,
            fullName: personData.fullName,
            cedula: personData.cedula || null,
            email: personData.email || null,
            phone: personData.phone || null,
            createdAt: scan.createdAt.toISOString(),
          };
          const pdfBuffer = await generateIndividualPDF(scanData, results);
          const pdfName = generatePDFFileName(personData.fullName);
          addReport(scan.id, pdfName, 'pdf');
          reportFileName = pdfName;
        } catch (reportError) {
          console.error(`[Upload] Report error for ${personData.fullName}:`, reportError);
        }

        const summary = {
          critical: results.filter(r => r.severity === 'critical').length,
          high: results.filter(r => r.severity === 'high').length,
          medium: results.filter(r => r.severity === 'medium').length,
          low: results.filter(r => r.severity === 'low').length,
          info: results.filter(r => r.severity === 'info').length,
        };

        allBatchResults.push({
          scanId: scan.id,
          fullName: personData.fullName,
          totalResults: results.length,
          reportGenerated: !!reportFileName,
          reportFileName,
          summary,
          sheetName: sheet.name,
          rowCount: rows.length,
        });

        // Build person with OSINT data for cross-reference analysis
        sheetPersonsWithOSINT.push({
          name: personData.fullName,
          identifiers: {
            name: personData.fullName,
            cedula: personData.cedula || '',
            email: personData.email || '',
            phone: personData.phone || '',
            address: extractFieldValue(row, ['direccion', 'address', 'ubicacion', 'location', 'dir']),
            rawRow: row,
          },
          osintResults: results,
          findingsCount: results.length,
        });

        // Add personsInvestigated to the last result for each person
        if (allBatchResults.length > 0) {
          const lastResult = allBatchResults[allBatchResults.length - 1];
          if (!lastResult.personsInvestigated) lastResult.personsInvestigated = [];
          lastResult.personsInvestigated!.push({
            name: personData.fullName,
            identifiers: {
              cedula: personData.cedula || '',
              email: personData.email || '',
              phone: personData.phone || '',
            },
            findingsCount: results.length,
          });
        }
      }

      personsWithOSINTBySheet.set(sheet.name, sheetPersonsWithOSINT);
    }

    // ── Multi-sheet: Run relationship analysis ──
    let relationshipAnalysis = null;
    let jointAnalysisId = null;
    let jointReportFileName = null;

    if (sheets.length >= 2) {
      try {
        const sheet1Name = sheets[0].name;
        const sheet2Name = sheets[1].name;
        const persons1 = personsWithOSINTBySheet.get(sheet1Name) || [];
        const persons2 = personsWithOSINTBySheet.get(sheet2Name) || [];

        // Strategy 1: Raw data relationship analysis (comparing field values)
        relationshipAnalysis = analyzeRelationships(
          sheets[0].data.slice(0, MAX_PERSONS_PER_SHEET),
          sheets[1].data.slice(0, MAX_PERSONS_PER_SHEET),
          sheet1Name,
          sheet2Name,
        );

        // Strategy 2: OSINT cross-reference analysis (if we have results)
        if (persons1.length > 0 && persons2.length > 0) {
          const osintCrossRef = crossReferenceOSINTResults(
            persons1,
            persons2,
            sheet1Name,
            sheet2Name,
          );

          // Merge OSINT cross-reference links into the main analysis
          if (osintCrossRef.totalLinks > 0) {
            relationshipAnalysis.links = [
              ...relationshipAnalysis.links,
              ...osintCrossRef.links,
            ];
            relationshipAnalysis.totalLinks = relationshipAnalysis.links.length;
            // Update summary
            relationshipAnalysis.summary.empresariales = relationshipAnalysis.links.filter((l: any) => l.type === 'empresarial').length;
            relationshipAnalysis.summary.personales = relationshipAnalysis.links.filter((l: any) => l.type === 'personal').length;
            relationshipAnalysis.summary.familiares = relationshipAnalysis.links.filter((l: any) => l.type === 'familiar').length;
            relationshipAnalysis.summary.laborales = relationshipAnalysis.links.filter((l: any) => l.type === 'laboral').length;
            relationshipAnalysis.summary.contacto = relationshipAnalysis.links.filter((l: any) => l.type === 'contacto').length;
            relationshipAnalysis.summary.ubicacion = relationshipAnalysis.links.filter((l: any) => l.type === 'ubicacion').length;
            relationshipAnalysis.summary.dato_compartido = relationshipAnalysis.links.filter((l: any) => l.type === 'dato_compartido').length;
            // Update network map
            const connectionMap = new Map<string, { connections: number; types: Set<string> }>();
            for (const link of relationshipAnalysis.links) {
              for (const person of [link.sheet1Person, link.sheet2Person]) {
                if (!connectionMap.has(person)) {
                  connectionMap.set(person, { connections: 0, types: new Set<string>() });
                }
                const entry = connectionMap.get(person)!;
                entry.connections++;
                entry.types.add(link.type);
              }
            }
            relationshipAnalysis.networkMap = Array.from(connectionMap.entries())
              .map(([person, data]) => ({
                person,
                connections: data.connections,
                types: Array.from(data.types),
              }))
              .sort((a, b) => b.connections - a.connections);
          }
        }

        // Create joint analysis record
        const individualScans = allBatchResults
          .filter(r => r.sheetName === sheet1Name || r.sheetName === sheet2Name)
          .map(r => ({ name: r.fullName, scanId: r.scanId }));

        jointAnalysisId = `joint_${Date.now()}`;
        jointReportFileName = `Informe_Conjunto_${sheet1Name}_${sheet2Name}_${Date.now()}`;

        createJointAnalysis({
          analysis: relationshipAnalysis,
          individualScans,
          fileName: jointReportFileName,
        });

      } catch (analysisError) {
        console.error('[Upload] Relationship analysis error:', analysisError);
        // Continue without analysis — don't fail the entire upload
      }
    }

    // ── Build response ──
    if (sheets.length >= 2) {
      return NextResponse.json({
        type: 'xlsx_multi_sheet',
        sheetNames,
        results: allBatchResults,
        relationshipAnalysis,
        jointAnalysisId,
        jointReportFileName,
      });
    }

    return NextResponse.json({
      results: allBatchResults,
    });

  } catch (error) {
    console.error('[Upload] Error:', error);
    const message = error instanceof Error ? error.message : 'Error desconocido';
    return NextResponse.json(
      { error: `Error al procesar archivo: ${message}` },
      { status: 500 }
    );
  }
}
