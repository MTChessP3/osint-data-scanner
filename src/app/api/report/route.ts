import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';

const execFileAsync = promisify(execFile);
const APP_ROOT = process.env.APP_ROOT || process.cwd();

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const scanId = url.searchParams.get('scanId');
    const download = url.searchParams.get('download') === 'true';

    if (scanId) {
      // Get report for specific scan
      const report = await db.report.findFirst({
        where: { scanId },
        orderBy: { createdAt: 'desc' },
      });

      if (!report) {
        // Generate report on the fly if not yet generated
        const scan = await db.scan.findUnique({
          where: { id: scanId },
          include: { results: true },
        });

        if (!scan) {
          return NextResponse.json({ error: 'Escaneo no encontrado' }, { status: 404 });
        }

        // Generate report
        const inputData = JSON.stringify({
          scan: {
            id: scan.id,
            fullName: scan.fullName,
            cedula: scan.cedula,
            email: scan.email,
            phone: scan.phone,
            createdAt: scan.createdAt.toISOString(),
          },
          results: scan.results,
        });

        const scriptPath = path.join(APP_ROOT, 'scripts', 'generate-report.py');
        const { stdout } = await execFileAsync('python3', [
          scriptPath
        ], {
          input: inputData,
          timeout: 60000,
        });

        const result = JSON.parse(stdout.trim());
        if (!result.success) {
          return NextResponse.json({ error: 'Error generando informe', details: result.error }, { status: 500 });
        }

        // Save report record
        const newReport = await db.report.create({
          data: {
            scanId: scan.id,
            filePath: result.filePath,
            fileName: result.fileName,
            status: 'generated',
          },
        });

        if (download) {
          const fileBuffer = await fs.readFile(result.filePath);
          return new NextResponse(fileBuffer, {
            headers: {
              'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
              'Content-Disposition': `attachment; filename="${result.fileName}"`,
            },
          });
        }

        return NextResponse.json({
          reportId: newReport.id,
          fileName: result.fileName,
          filePath: result.filePath,
          generatedAt: newReport.createdAt,
        });
      }

      if (download) {
        try {
          const fileBuffer = await fs.readFile(report.filePath);
          return new NextResponse(fileBuffer, {
            headers: {
              'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
              'Content-Disposition': `attachment; filename="${report.fileName}"`,
            },
          });
        } catch {
          return NextResponse.json({ error: 'Archivo de informe no encontrado' }, { status: 404 });
        }
      }

      return NextResponse.json({
        reportId: report.id,
        fileName: report.fileName,
        generatedAt: report.createdAt,
      });
    }

    // List all reports
    const reports = await db.report.findMany({
      orderBy: { createdAt: 'desc' },
      include: { scan: { select: { fullName: true, cedula: true, email: true } } },
    });

    return NextResponse.json(reports);
  } catch (error) {
    console.error('Report API Error:', error);
    return NextResponse.json(
      { error: 'Error al obtener informes', details: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 }
    );
  }
}
