import { NextRequest, NextResponse } from 'next/server';
import { relationshipBuffers } from '../upload/route';

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const reportId = url.searchParams.get('reportId');

  if (!reportId || !relationshipBuffers.has(reportId)) {
    return NextResponse.json({ error: 'Informe no encontrado' }, { status: 404 });
  }

  const data = relationshipBuffers.get(reportId)!;

  return new NextResponse(new Uint8Array(data.docxBuffer), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': `attachment; filename="Informe_Conjunto_Relaciones.docx"`,
    },
  });
}
