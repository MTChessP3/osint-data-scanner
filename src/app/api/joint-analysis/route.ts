import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/auth';
import { getJointAnalysis } from '@/lib/memory-store';
import { generateJointPDF, generateJointPDFFileName } from '@/lib/generate-pdf-report';
import { generateJointDocxReport } from '@/lib/generate-report';
import { RelationshipAnalysisResult } from '@/lib/relationship-analyzer';

// In-memory buffer store for joint analysis reports
export const jointBuffers = new Map<string, { buffer: Buffer; format: 'pdf' | 'docx' }>();

export async function POST(request: NextRequest) {
  try {
    const auth = await verifyAuth(request);
    if (!auth.authenticated) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const body = await request.json();
    const { analysisId, format, analysis, individualScans } = body;

    if (!analysisId) {
      return NextResponse.json({ error: 'analysisId es requerido' }, { status: 400 });
    }

    const desiredFormat = format === 'docx' ? 'docx' : 'pdf';

    // Check if we have a cached buffer in the desired format
    const cached = jointBuffers.get(analysisId);
    if (cached && cached.format === desiredFormat) {
      const contentType = desiredFormat === 'pdf'
        ? 'application/pdf'
        : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

      return new NextResponse(new Uint8Array(cached.buffer), {
        headers: {
          'Content-Type': contentType,
          'Content-Disposition': `attachment; filename="Informe_Vinculos.${desiredFormat}"`,
        },
      });
    }

    // Need to generate the report - use provided analysis data or try to get from memory
    let analysisData: RelationshipAnalysisResult | null = null;
    let scansData: { name: string; results: Array<{ source: string; category: string; severity: string; title: string; description?: string; url?: string; dataFound?: string }> }[] = [];

    if (analysis) {
      analysisData = analysis as RelationshipAnalysisResult;
      scansData = individualScans || [];
    } else {
      const stored = getJointAnalysis(analysisId);
      if (stored) {
        analysisData = stored.analysis as unknown as RelationshipAnalysisResult;
      }
    }

    if (!analysisData) {
      return NextResponse.json(
        { error: 'Datos de analisis no disponibles. Proporcione los datos del analisis en el cuerpo de la peticion.' },
        { status: 404 }
      );
    }

    try {
      let buffer: Buffer;
      const osintResults = scansData.map(s => ({
        name: s.name,
        results: (s.results || []).map(r => ({
          source: r.source || '',
          category: r.category || 'document_exposure',
          severity: (r.severity as 'critical' | 'high' | 'medium' | 'low' | 'info') || 'info',
          title: r.title || '',
          description: r.description || undefined,
          url: r.url || undefined,
          dataFound: r.dataFound || undefined,
        })),
      }));

      if (desiredFormat === 'pdf') {
        buffer = await generateJointPDF(analysisData, osintResults);
      } else {
        buffer = await generateJointDocxReport(analysisData, osintResults);
      }

      // Cache the buffer
      jointBuffers.set(analysisId, { buffer, format: desiredFormat });

      const contentType = desiredFormat === 'pdf'
        ? 'application/pdf'
        : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

      return new NextResponse(new Uint8Array(buffer), {
        headers: {
          'Content-Type': contentType,
          'Content-Disposition': `attachment; filename="Informe_Vinculos.${desiredFormat}"`,
        },
      });
    } catch (genError) {
      console.error('Joint report generation error:', genError);
      return NextResponse.json(
        { error: 'Error generando informe conjunto', details: genError instanceof Error ? genError.message : 'Unknown' },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('Joint Analysis POST API Error:', error);
    return NextResponse.json(
      { error: 'Error al generar informe conjunto' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const auth = await verifyAuth(request);
    if (!auth.authenticated) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const url = new URL(request.url);
    const analysisId = url.searchParams.get('analysisId');
    const download = url.searchParams.get('download') === 'true';
    const format = url.searchParams.get('format') as 'docx' | 'pdf' || 'pdf';

    if (!analysisId) {
      return NextResponse.json({ error: 'analysisId es requerido' }, { status: 400 });
    }

    const analysis = getJointAnalysis(analysisId);
    if (!analysis) {
      return NextResponse.json({ error: 'Análisis conjunto no encontrado' }, { status: 404 });
    }

    if (download) {
      const cached = jointBuffers.get(analysisId);
      const desiredFormat = format || cached?.format || 'pdf';

      if (cached && cached.format === desiredFormat) {
        const contentType = desiredFormat === 'pdf'
          ? 'application/pdf'
          : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

        return new NextResponse(new Uint8Array(cached.buffer), {
          headers: {
            'Content-Type': contentType,
            'Content-Disposition': `attachment; filename="${analysis.fileName}"`,
          },
        });
      }

      // Buffer not available in desired format
      return NextResponse.json(
        { error: `Informe en formato ${desiredFormat.toUpperCase()} no disponible. Genérelo nuevamente.` },
        { status: 404 }
      );
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
