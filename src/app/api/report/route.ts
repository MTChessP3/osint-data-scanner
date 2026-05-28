import { NextRequest, NextResponse } from 'next/server';
import { getScan, getReportByScanId } from '@/lib/memory-store';
import { generateOSINTReport, generateReportFileName } from '@/lib/generate-report';
import { generateIndividualPDF, generatePDFFileName } from '@/lib/generate-pdf-report';
import { addReport } from '@/lib/memory-store';
import { reportBuffers, reportFormats } from '../scan/route';

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
      return NextResponse.json({ error: 'Escaneo no encontrado' }, { status: 404 });
    }

    const desiredFormat = format || reportFormats.get(scanId) || 'docx';

    // Check if we have the buffer in memory for the desired format
    let buffer = reportBuffers.get(scanId);
    const currentFormat = reportFormats.get(scanId);

    // If we need a different format, regenerate
    if (buffer && currentFormat === desiredFormat) {
      // Use existing buffer
    } else {
      // Generate report on the fly
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

      return new NextResponse(buffer, {
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
