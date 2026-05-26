import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function DELETE(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const scanId = url.searchParams.get('scanId');

    if (!scanId) {
      return NextResponse.json({ error: 'scanId es requerido' }, { status: 400 });
    }

    await db.scanResult.deleteMany({ where: { scanId } });
    await db.scan.delete({ where: { id: scanId } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Delete error:', error);
    return NextResponse.json({ error: 'Error al eliminar' }, { status: 500 });
  }
}
