import { NextRequest, NextResponse } from 'next/server';
import { generateSocialPDFReport } from '@/lib/generate-pdf-report';
import { generateSocialDocxReport } from '@/lib/generate-report';
import { addReport } from '@/lib/memory-store';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { searchMode, searchQuery, results, summary, scanId, format } = body;

    if (!searchMode || !searchQuery || !results || !summary) {
      return NextResponse.json(
        { error: 'searchMode, searchQuery, results y summary son requeridos' },
        { status: 400 }
      );
    }

    const fmt = format === 'docx' ? 'docx' : 'pdf';

    if (fmt === 'docx') {
      const buffer = await generateSocialDocxReport({
        searchMode,
        searchQuery,
        results,
        summary,
        scanId,
      });

      const fileName = `Informe_Redes_Sociales_${Date.now()}.docx`;

      if (scanId) {
        try {
          addReport(scanId, fileName, 'docx');
          console.log(`[SocialReport API] DOCX report saved to memory store for scan ${scanId}`);
        } catch (storeError) {
          console.warn('[SocialReport API] Failed to save report to memory store:', storeError);
        }
      }

      return new NextResponse(new Uint8Array(buffer), {
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'Content-Disposition': `attachment; filename="${fileName}"`,
        },
      });
    }

    // Default: PDF
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

    return new NextResponse(new Uint8Array(buffer), {
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
