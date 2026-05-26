import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { runFullScan, OSINTResult } from '@/lib/osint-scanner';
import { execFile } from 'child_process';
import { promisify } from 'util';
import path from 'path';

const execFileAsync = promisify(execFile);
const APP_ROOT = process.env.APP_ROOT || process.cwd();

async function generateDocxReport(scanData: {
  scan: Record<string, unknown>;
  results: OSINTResult[];
}): Promise<{ filePath: string; fileName: string }> {
  const inputData = JSON.stringify(scanData);
  const scriptPath = path.join(APP_ROOT, 'scripts', 'generate-report.py');

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
    const body = await request.json();
    const { fullName, cedula, email, phone, generateReport = true } = body;

    if (!fullName) {
      return NextResponse.json({ error: 'El nombre completo es requerido' }, { status: 400 });
    }

    const scan = await db.scan.create({
      data: {
        fullName,
        cedula: cedula || null,
        email: email || null,
        phone: phone || null,
        status: 'running',
      },
    });

    let results: OSINTResult[] = [];
    try {
      results = await runFullScan({ fullName, cedula, email, phone });
    } catch (scanError) {
      console.error('Scan error:', scanError);
    }

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
    let reportFileName = null;
    if (generateReport) {
      try {
        const reportInfo = await generateDocxReport({
          scan: {
            id: scan.id,
            fullName,
            cedula: cedula || null,
            email: email || null,
            phone: phone || null,
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

        reportFileName = reportInfo.fileName;
      } catch (reportError) {
        console.error('Report generation error:', reportError);
      }
    }

    return NextResponse.json({
      scanId: scan.id,
      totalResults: results.length,
      results,
      reportFileName,
      summary: {
        critical: results.filter(r => r.severity === 'critical').length,
        high: results.filter(r => r.severity === 'high').length,
        medium: results.filter(r => r.severity === 'medium').length,
        low: results.filter(r => r.severity === 'low').length,
        info: results.filter(r => r.severity === 'info').length,
      },
    });
  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json(
      { error: 'Error interno del servidor', details: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const scanId = url.searchParams.get('scanId');

    if (scanId) {
      const scan = await db.scan.findUnique({
        where: { id: scanId },
        include: {
          results: true,
          reports: true,
        },
      });
      if (!scan) {
        return NextResponse.json({ error: 'Escaneo no encontrado' }, { status: 404 });
      }
      return NextResponse.json(scan);
    }

    const scans = await db.scan.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        results: { select: { id: true, severity: true } },
        reports: { select: { id: true, fileName: true } },
      },
    });

    return NextResponse.json(scans);
  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json({ error: 'Error al obtener escaneos' }, { status: 500 });
  }
}
