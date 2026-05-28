import { NextRequest, NextResponse } from 'next/server';
import { getScan, getReportByScanId } from '@/lib/memory-store';
import { generateOSINTReport, generateReportFileName } from '@/lib/generate-report';
import { addReport } from '@/lib/memory-store';
import { reportBuffers } from '../scan/route';

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const scanId = url.searchParams.get('scanId');
    const download = url.searchParams.get('download') === 'true';

    if (!scanId) {
      return NextResponse.json({ error: 'scanId es requerido' }, { status: 400 });
    }

    const scan = getScan(scanId);
    if (!scan) {
      return NextResponse.json({ error: 'Escaneo no encontrado' }, { status: 404 });
    }

    // Check if we have the buffer in memory
    let buffer = reportBuffers.get(scanId);

    if (!buffer) {
      // Generate report on the fly
      try {
        buffer = await generateOSINTReport(
          {
            id: scan.id,
            fullName: scan.fullName,
            cedula: scan.cedula,
            email: scan.email,
            phone: scan.phone,
            createdAt: scan.createdAt.toISOString(),
          },
          scan.results.map(r => ({
            source: r.source,
            category: r.category,
            severity: r.severity as 'critical' | 'high' | 'medium' | 'low' | 'info',
            title: r.title,
            description: r.description || undefined,
            url: r.url || undefined,
            dataFound: r.dataFound || undefined,
          })),
        );

        const fileName = generateReportFileName(scan.fullName);
        addReport(scan.id, fileName);
        reportBuffers.set(scanId, buffer);
      } catch (genError) {
        console.error('Report generation error:', genError);
        return NextResponse.json({ error: 'Error generando informe' }, { status: 500 });
      }
    }

    if (download) {
      const report = getReportByScanId(scanId);
      const fileName = report?.fileName || 'Informe_OSINT.docx';

      return new NextResponse(buffer, {
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'Content-Disposition': `attachment; filename="${fileName}"`,
        },
      });
    }

    const report = getReportByScanId(scanId);
    return NextResponse.json({
      reportId: report?.id || null,
      fileName: report?.fileName || null,
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
