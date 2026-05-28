import { NextRequest, NextResponse } from 'next/server';
import { runFullScan, OSINTResult } from '@/lib/osint-scanner';
import { generateOSINTReport, generateReportFileName } from '@/lib/generate-report';
import { generateIndividualPDF, generatePDFFileName } from '@/lib/generate-pdf-report';
import {
  createScan, updateScanStatus, addScanResults, addReport, getAllScans, getScan
} from '@/lib/memory-store';
import { initZAIConfig } from '@/lib/zai-config';

// Set max duration for Vercel
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    // Initialize ZAI config with timeout protection
    await Promise.race([
      initZAIConfig(),
      new Promise<void>(resolve => setTimeout(resolve, 3000)),
    ]);
    const body = await request.json();
    const { fullName, cedula, email, phone, generateReport = true, reportFormat = 'docx', deepseekKey, selectedEngines } = body;

    if (!fullName) {
      return NextResponse.json({ error: 'El nombre completo es requerido' }, { status: 400 });
    }

    // Create scan record
    const scan = createScan({ fullName, cedula, email, phone, status: 'running', scanType: 'data_intelligence' });

    // Run OSINT scan — prefer server-side DEEPSEEK_API_KEY env var over client-provided key
    const effectiveDeepseekKey = process.env.DEEPSEEK_API_KEY || deepseekKey;
    let results: OSINTResult[] = [];
    try {
      results = await runFullScan({ fullName, cedula, email, phone, deepseekKey: effectiveDeepseekKey, selectedEngines });
    } catch (scanError) {
      console.error('Scan error:', scanError);
    }

    // Save results
    if (results.length > 0) {
      addScanResults(scan.id, results);
    }

    updateScanStatus(scan.id, 'completed');

    // Generate report
    let reportFileName = null;
    if (generateReport) {
      try {
        const scanData = {
          id: scan.id,
          fullName,
          cedula: cedula || null,
          email: email || null,
          phone: phone || null,
          createdAt: scan.createdAt.toISOString(),
        };

        if (reportFormat === 'pdf') {
          const pdfBuffer = await generateIndividualPDF(scanData, results);
          const pdfFileName = generatePDFFileName(fullName);
          addReport(scan.id, pdfFileName, 'pdf');
          reportBuffers.set(scan.id, pdfBuffer);
          reportFormats.set(scan.id, 'pdf');
          reportFileName = pdfFileName;
        } else {
          const reportBuffer = await generateOSINTReport(scanData, results);
          const fileName = generateReportFileName(fullName);
          addReport(scan.id, fileName, 'docx');
          reportBuffers.set(scan.id, reportBuffer);
          reportFormats.set(scan.id, 'docx');
          reportFileName = fileName;
        }
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

// In-memory buffer store for reports
export const reportBuffers = new Map<string, Buffer>();
export const reportFormats = new Map<string, 'docx' | 'pdf'>();
