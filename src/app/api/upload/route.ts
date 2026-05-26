import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { runFullScan, OSINTResult } from '@/lib/osint-scanner';
import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

const execFileAsync = promisify(execFile);

// Parse CSV line handling quotes
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

// Parse uploaded file content into rows
function parseFileContent(content: string, fileName: string): { fullName: string; cedula?: string; email?: string; phone?: string }[] {
  const ext = path.extname(fileName).toLowerCase();

  if (ext === '.csv') {
    const lines = content.split('\n').filter(l => l.trim());
    if (lines.length < 2) return [];

    const header = parseCSVLine(lines[0]).map(h => h.toLowerCase().replace(/[^a-z0-9áéíóúñ_]/g, ''));
    const nameIdx = header.findIndex(h => h.includes('nombre') || h.includes('name'));
    const cedulaIdx = header.findIndex(h => h.includes('cedula') || h.includes('documento') || h.includes('cc') || h.includes('id'));
    const emailIdx = header.findIndex(h => h.includes('correo') || h.includes('email') || h.includes('mail'));
    const phoneIdx = header.findIndex(h => h.includes('telefono') || h.includes('phone') || h.includes('celular') || h.includes('tel'));

    if (nameIdx === -1) return [];

    return lines.slice(1).map(line => {
      const cols = parseCSVLine(line);
      return {
        fullName: cols[nameIdx] || '',
        cedula: cedulaIdx >= 0 ? cols[cedulaIdx] : undefined,
        email: emailIdx >= 0 ? cols[emailIdx] : undefined,
        phone: phoneIdx >= 0 ? cols[phoneIdx] : undefined,
      };
    }).filter(r => r.fullName.trim());
  }

  // For .xlsx we return empty - handled by Python parser
  return [];
}

// Generate DOCX report using Python script
async function generateDocxReport(scanData: {
  scan: Record<string, unknown>;
  results: OSINTResult[];
}): Promise<{ filePath: string; fileName: string }> {
  const inputData = JSON.stringify(scanData);
  const scriptPath = path.join(process.env.APP_ROOT || process.cwd(), 'scripts', 'generate-report.py');

  const { stdout } = await execFileAsync('python3', [
    scriptPath
  ], {
    input: inputData,
    timeout: 60000,
  });

  const result = JSON.parse(stdout.trim());
  if (!result.success) {
    throw new Error(result.error || 'Error generating report');
  }
  return { filePath: result.filePath, fileName: result.fileName };
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const manualData = formData.get('data') as string | null;

    let subjects: { fullName: string; cedula?: string; email?: string; phone?: string }[] = [];

    // Parse manual JSON data
    if (manualData) {
      try {
        const parsed = JSON.parse(manualData);
        if (Array.isArray(parsed)) {
          subjects = parsed;
        } else {
          subjects = [parsed];
        }
      } catch {
        return NextResponse.json({ error: 'Formato de datos invalido' }, { status: 400 });
      }
    }
    // Parse uploaded file
    else if (file) {
      const fileName = file.name.toLowerCase();

      if (fileName.endsWith('.csv') || fileName.endsWith('.txt')) {
        const content = await file.text();
        subjects = parseFileContent(content, file.name);
      } else if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
        // Use Python to parse xlsx
        const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osint-upload-'));
        const tmpFile = path.join(tmpDir, file.name);
        const buffer = Buffer.from(await file.arrayBuffer());
        await fs.writeFile(tmpFile, buffer);

        try {
          const { stdout } = await execFileAsync('python3', [
            '-c',
            `
import json
import sys
try:
    import openpyxl
    wb = openpyxl.load_workbook("${tmpFile.replace(/"/g, '\\"')}")
    ws = wb.active
    rows = list(ws.iter_rows(values_only=True))
    if len(rows) < 2:
        print(json.dumps([]))
        sys.exit(0)
    header = [str(h or '').lower().replace(' ', '') for h in rows[0]]
    name_idx = next((i for i, h in enumerate(header) if 'nombre' in h or 'name' in h), -1)
    cedula_idx = next((i for i, h in enumerate(header) if 'cedula' in h or 'documento' in h or 'cc' in h), -1)
    email_idx = next((i for i, h in enumerate(header) if 'correo' in h or 'email' in h or 'mail' in h), -1)
    phone_idx = next((i for i, h in enumerate(header) if 'telefono' in h or 'phone' in h or 'celular' in h), -1)
    if name_idx == -1:
        print(json.dumps([]))
        sys.exit(0)
    result = []
    for row in rows[1:]:
        name = str(row[name_idx] or '').strip()
        if not name:
            continue
        entry = {"fullName": name}
        if cedula_idx >= 0 and row[cedula_idx]:
            entry["cedula"] = str(row[cedula_idx])
        if email_idx >= 0 and row[email_idx]:
            entry["email"] = str(row[email_idx])
        if phone_idx >= 0 and row[phone_idx]:
            entry["phone"] = str(row[phone_idx])
        result.append(entry)
    print(json.dumps(result))
except Exception as e:
    print(json.dumps([]))
    sys.exit(0)
`
          ], { timeout: 30000 });
          subjects = JSON.parse(stdout.trim());
        } finally {
          await fs.rm(tmpDir, { recursive: true, force: true });
        }
      } else {
        return NextResponse.json({ error: 'Formato no soportado. Use .csv, .xlsx o .xls' }, { status: 400 });
      }
    } else {
      return NextResponse.json({ error: 'No se proporcionaron datos ni archivo' }, { status: 400 });
    }

    if (subjects.length === 0) {
      return NextResponse.json({ error: 'No se encontraron datos validos en el archivo. Asegurese de tener una columna "nombre" o "name"' }, { status: 400 });
    }

    if (subjects.length > 50) {
      return NextResponse.json({ error: 'Maximo 50 sujetos por lote' }, { status: 400 });
    }

    // Process each subject
    const batchResults = [];
    for (const subject of subjects) {
      if (!subject.fullName?.trim()) continue;

      // Create scan record
      const scan = await db.scan.create({
        data: {
          fullName: subject.fullName.trim(),
          cedula: subject.cedula?.trim() || null,
          email: subject.email?.trim() || null,
          phone: subject.phone?.trim() || null,
          status: 'running',
        },
      });

      // Run OSINT scan
      let results: OSINTResult[] = [];
      try {
        results = await runFullScan({
          fullName: subject.fullName.trim(),
          cedula: subject.cedula?.trim(),
          email: subject.email?.trim(),
          phone: subject.phone?.trim(),
        });
      } catch (scanError) {
        console.error(`Scan error for ${subject.fullName}:`, scanError);
      }

      // Save results
      if (results.length > 0) {
        await db.scanResult.createMany({
          data: results.map(r => ({
            scanId: scan.id,
            source: r.source,
            category: r.category,
            severity: r.severity,
            title: r.title,
            description: r.description || null,
            url: r.url || null,
            dataFound: r.dataFound || null,
          })),
        });
      }

      await db.scan.update({
        where: { id: scan.id },
        data: { status: 'completed' },
      });

      // Generate DOCX report
      let reportInfo = null;
      try {
        reportInfo = await generateDocxReport({
          scan: {
            id: scan.id,
            fullName: subject.fullName.trim(),
            cedula: subject.cedula?.trim() || null,
            email: subject.email?.trim() || null,
            phone: subject.phone?.trim() || null,
            createdAt: scan.createdAt.toISOString(),
          },
          results,
        });

        await db.report.create({
          data: {
            scanId: scan.id,
            filePath: reportInfo.filePath,
            fileName: reportInfo.fileName,
            status: 'generated',
          },
        });
      } catch (reportError) {
        console.error(`Report generation error for ${subject.fullName}:`, reportError);
      }

      batchResults.push({
        scanId: scan.id,
        fullName: subject.fullName.trim(),
        totalResults: results.length,
        reportGenerated: !!reportInfo,
        reportFileName: reportInfo?.fileName || null,
        summary: {
          critical: results.filter(r => r.severity === 'critical').length,
          high: results.filter(r => r.severity === 'high').length,
          medium: results.filter(r => r.severity === 'medium').length,
          low: results.filter(r => r.severity === 'low').length,
          info: results.filter(r => r.severity === 'info').length,
        },
      });
    }

    return NextResponse.json({
      totalSubjects: subjects.length,
      processed: batchResults.length,
      results: batchResults,
    });
  } catch (error) {
    console.error('Upload API Error:', error);
    return NextResponse.json(
      { error: 'Error interno del servidor', details: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 }
    );
  }
}
