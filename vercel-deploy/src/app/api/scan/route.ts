import { NextRequest, NextResponse } from 'next/server';
import { runFullScan, OSINTResult } from '@/lib/osint-scanner';
import { generateOSINTReport, generateReportFileName } from '@/lib/generate-report';
import {
  createScan, updateScanStatus, addScanResults, addReport, getAllScans, getScan
} from '@/lib/memory-store';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { fullName, cedula, email, phone, generateReport = true } = body;

    if (!fullName) {
      return NextResponse.json({ error: 'El nombre completo es requerido' }, { status: 400 });
    }

    // Create scan record
    const scan = createScan({ fullName, cedula, email, phone, status: 'running' });

    // Run OSINT scan
    let results: OSINTResult[] = [];
    try {
      results = await runFullScan({ fullName, cedula, email, phone });
    } catch (scanError) {
      console.error('Scan error:', scanError);
    }

    // Save results
    if (results.length > 0) {
      addScanResults(scan.id, results);
    }

    updateScanStatus(scan.id, 'completed');

    // Generate DOCX report
    let reportFileName = null;
    if (generateReport) {
      try {
        const reportBuffer = await generateOSINTReport(
          {
            id: scan.id,
            fullName,
            cedula: cedula || null,
            email: email || null,
            phone: phone || null,
            createdAt: scan.createdAt.toISOString(),
          },
          results,
        );

        const fileName = generateReportFileName(fullName);

        // Store report buffer in memory (attached to scan record)
        addReport(scan.id, fileName);

        // Store buffer for later download
        reportBuffers.set(scan.id, reportBuffer);

        reportFileName = fileName;
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
      const scan = getScan(scanId);
      if (!scan) {
        return NextResponse.json({ error: 'Escaneo no encontrado' }, { status: 404 });
      }
      return NextResponse.json(scan);
    }

    const allScans = getAllScans();
    return NextResponse.json(allScans);
  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json({ error: 'Error al obtener escaneos' }, { status: 500 });
  }
}

// In-memory buffer store for DOCX reports
export const reportBuffers = new Map<string, Buffer>();
