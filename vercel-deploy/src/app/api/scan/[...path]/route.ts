import { NextRequest, NextResponse } from 'next/server';
import { deleteScan, getScan } from '@/lib/memory-store';

export async function DELETE(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const scanId = url.searchParams.get('scanId');

    if (!scanId) {
      return NextResponse.json({ error: 'scanId es requerido' }, { status: 400 });
    }

    const deleted = deleteScan(scanId);
    if (!deleted) {
      return NextResponse.json({ error: 'Escaneo no encontrado' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Delete error:', error);
    return NextResponse.json({ error: 'Error al eliminar' }, { status: 500 });
  }
}
