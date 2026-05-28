import { NextRequest, NextResponse } from 'next/server';
import { getScan, getReportByScanId, addReport } from '@/lib/memory-store';
import { generateOSINTReport, generateReportFileName } from '@/lib/generate-report';
import { generateIndividualPDF, generatePDFFileName } from '@/lib/generate-pdf-report';
import { reportBuffers, reportFormats } from '../scan/route';

// POST handler — accepts scan data in body for on-demand report generation
// This solves the Vercel serverless cold-start issue where in-memory store is empty
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { scanId, fullName, cedula, email, phone, results, format = 'pdf' } = body;

    if (!scanId || !fullName || !results) {
      return NextResponse.json({ error: 'scanId, fullName y results son requeridos' }, { status: 400 });
    }

    const desiredFormat = (format === 'docx' ? 'docx' : 'pdf') as 'docx' | 'pdf';

    // Try to get existing buffer first
    let buffer = reportBuffers.get(scanId);
    const currentFormat = reportFormats.get(scanId);

    if (buffer && currentFormat === desiredFormat) {
      // Use cached buffer
    } else {
      // Generate report from provided data
      const scanData = {
        id: scanId,
        fullName: fullName as string,
        cedula: (cedula as string) || null,
        email: (email as string) || null,
        phone: (phone as string) || null,
        createdAt: new Date().toISOString(),
      };

      const scanResults = (results as Array<{
        source: string;
        category: string;
        severity: string;
        title: string;
        description?: string;
        url?: string;
        dataFound?: string;
      }>).map(r => ({
        source: r.source,
        category: r.category,
        severity: r.severity as 'critical' | 'high' | 'medium' | 'low' | 'info',
        title: r.title,
        description: r.description || undefined,
        url: r.url || undefined,
        dataFound: r.dataFound || undefined,
      }));

      try {
        if (desiredFormat === 'pdf') {
          buffer = await generateIndividualPDF(scanData, scanResults);
        } else {
          buffer = await generateOSINTReport(scanData, scanResults);
        }
        reportBuffers.set(scanId, buffer);
        reportFormats.set(scanId, desiredFormat);
      } catch (genError) {
        console.error('Report generation error:', genError);
        return NextResponse.json({ error: 'Error generando informe', details: genError instanceof Error ? genError.message : 'Unknown' }, { status: 500 });
      }
    }

    if (!buffer) {
      return NextResponse.json({ error: 'No se pudo generar el informe' }, { status: 500 });
    }

    const fileName = desiredFormat === 'pdf'
      ? generatePDFFileName(fullName as string)
      : generateReportFileName(fullName as string);

    const contentType = desiredFormat === 'pdf'
      ? 'application/pdf'
      : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${fileName}"`,
      },
    });
  } catch (error) {
    console.error('Report POST API Error:', error);
    return NextResponse.json(
      { error: 'Error al generar informe', details: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 }
    );
  }
}

// GET handler — tries memory store first, then falls back
export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const scanId = url.searchParams.get('scanId');
    const download = url.searchParams.get('download') === 'true';
    const format = url.searchParams.get('format') as 'docx' | 'pdf' || null;

    if (!scanId) {
      return NextResponse.json({ error: 'scanId es requerido' }, { status: 400 });
    }

    const scan = getScan(scanId);
    if (!scan) {
      return NextResponse.json({ error: 'Escaneo no encontrado. Use POST con los datos del escaneo.' }, { status: 404 });
    }

    const desiredFormat = format || reportFormats.get(scanId) || 'pdf';

    // Check if we have the buffer in memory for the desired format
    let buffer = reportBuffers.get(scanId);
    const currentFormat = reportFormats.get(scanId);

    // If we need a different format or no buffer, regenerate
    if (buffer && currentFormat === desiredFormat) {
      // Use existing buffer
    } else {
      // Generate report on the fly from memory store
      const scanData = {
        id: scan.id,
        fullName: scan.fullName,
        cedula: scan.cedula,
        email: scan.email,
        phone: scan.phone,
        createdAt: scan.createdAt.toISOString(),
      };
      const results = scan.results.map(r => ({
        source: r.source,
        category: r.category,
        severity: r.severity as 'critical' | 'high' | 'medium' | 'low' | 'info',
        title: r.title,
        description: r.description || undefined,
        url: r.url || undefined,
        dataFound: r.dataFound || undefined,
      }));

      try {
        if (desiredFormat === 'pdf') {
          buffer = await generateIndividualPDF(scanData, results);
          const fileName = generatePDFFileName(scan.fullName);
          addReport(scan.id, fileName, 'pdf');
        } else {
          buffer = await generateOSINTReport(scanData, results);
          const fileName = generateReportFileName(scan.fullName);
          addReport(scan.id, fileName, 'docx');
        }
        reportBuffers.set(scanId, buffer);
        reportFormats.set(scanId, desiredFormat);
      } catch (genError) {
        console.error('Report generation error:', genError);
        return NextResponse.json({ error: 'Error generando informe' }, { status: 500 });
      }
    }

    if (download && buffer) {
      const report = getReportByScanId(scanId);
      const fileName = report?.fileName || (desiredFormat === 'pdf' ? 'Informe_OSINT.pdf' : 'Informe_OSINT.docx');

      const contentType = desiredFormat === 'pdf'
        ? 'application/pdf'
        : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

      return new NextResponse(new Uint8Array(buffer), {
        headers: {
          'Content-Type': contentType,
          'Content-Disposition': `attachment; filename="${fileName}"`,
        },
      });
    }

    const report = getReportByScanId(scanId);
    return NextResponse.json({
      reportId: report?.id || null,
      fileName: report?.fileName || null,
      format: desiredFormat,
      generatedAt: report?.createdAt || null,
    });
  } catch (error) {
    console.error('Report API Error:', error);
    return NextResponse.json(
      { error: 'Error al obtener informe', details: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 }
    );
  }
}
