import { NextRequest, NextResponse } from 'next/server';
import { getJointAnalysis } from '@/lib/memory-store';

// In-memory buffer store for joint analysis PDFs
export const jointBuffers = new Map<string, Buffer>();

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const analysisId = url.searchParams.get('analysisId');
    const download = url.searchParams.get('download') === 'true';

    if (!analysisId) {
      return NextResponse.json({ error: 'analysisId es requerido' }, { status: 400 });
    }

    const analysis = getJointAnalysis(analysisId);
    if (!analysis) {
      return NextResponse.json({ error: 'Análisis conjunto no encontrado' }, { status: 404 });
    }

    if (download) {
      const buffer = jointBuffers.get(analysisId);
      if (!buffer) {
        return NextResponse.json({ error: 'PDF del análisis conjunto no disponible. Genérelo nuevamente.' }, { status: 404 });
      }

      return new NextResponse(buffer, {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="${analysis.fileName}"`,
        },
      });
    }

    // Return analysis metadata
    return NextResponse.json({
      id: analysis.id,
      fileName: analysis.fileName,
      sheet1Name: analysis.sheet1Name,
      sheet2Name: analysis.sheet2Name,
      sheet1RowCount: analysis.sheet1RowCount,
      sheet2RowCount: analysis.sheet2RowCount,
      totalLinks: analysis.analysis.totalLinks,
      summary: analysis.analysis.summary,
      createdAt: analysis.createdAt,
    });
  } catch (error) {
    console.error('Joint Analysis API Error:', error);
    return NextResponse.json(
      { error: 'Error al obtener análisis conjunto' },
      { status: 500 }
    );
  }
}
