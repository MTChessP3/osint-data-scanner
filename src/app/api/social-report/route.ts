import { NextRequest, NextResponse } from 'next/server';
import { generateSocialPDFReport } from '@/lib/generate-pdf-report';
import { addReport } from '@/lib/memory-store';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { searchMode, searchQuery, results, summary, scanId } = body;

    if (!searchMode || !searchQuery || !results || !summary) {
      return NextResponse.json(
        { error: 'searchMode, searchQuery, results y summary son requeridos' },
        { status: 400 }
      );
    }

    const buffer = await generateSocialPDFReport({
      searchMode,
      searchQuery,
      results,
      summary,
      scanId,
    });

    const fileName = `Informe_Redes_Sociales_${Date.now()}.pdf`;

    // Save report to memory store if scanId is provided
    if (scanId) {
      try {
        addReport(scanId, fileName, 'pdf');
        console.log(`[SocialReport API] Report saved to memory store for scan ${scanId}`);
      } catch (storeError) {
        console.warn('[SocialReport API] Failed to save report to memory store:', storeError);
      }
    }

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${fileName}"`,
      },
    });
  } catch (error) {
    console.error('Social report error:', error);
    return NextResponse.json(
      { error: 'Error generando informe de redes sociales', details: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 }
    );
  }
}
