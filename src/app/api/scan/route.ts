import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { runFullScan, OSINTResult } from '@/lib/osint-scanner';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { fullName, cedula, email, phone } = body;

    if (!fullName) {
      return NextResponse.json({ error: 'El nombre completo es requerido' }, { status: 400 });
    }

    const scan = await db.scan.create({
      data: {
        fullName,
        cedula: cedula || null,
        email: email || null,
        phone: phone || null,
        status: 'running',
      },
    });

    let results: OSINTResult[] = [];
    try {
      results = await runFullScan({ fullName, cedula, email, phone });
    } catch (scanError) {
      console.error('Scan error:', scanError);
    }

    if (results.length > 0) {
      await db.scanResult.createMany({
        data: results.map(r => ({
          scanId: scan.id,
          source: r.source,
          category: r.category,
          severity: r.severity,
          title: r.title,
          description: r.description || null,
          url: r.url || null,
          dataFound: r.dataFound || null,
        })),
      });
    }

    await db.scan.update({
      where: { id: scan.id },
      data: { status: 'completed' },
    });

    return NextResponse.json({
      scanId: scan.id,
      totalResults: results.length,
      results,
      summary: {
        critical: results.filter(r => r.severity === 'critical').length,
        high: results.filter(r => r.severity === 'high').length,
        medium: results.filter(r => r.severity === 'medium').length,
        low: results.filter(r => r.severity === 'low').length,
        info: results.filter(r => r.severity === 'info').length,
      },
    });
  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json(
      { error: 'Error interno del servidor', details: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const scanId = url.searchParams.get('scanId');

    if (scanId) {
      const scan = await db.scan.findUnique({
        where: { id: scanId },
        include: { results: true },
      });
      if (!scan) {
        return NextResponse.json({ error: 'Escaneo no encontrado' }, { status: 404 });
      }
      return NextResponse.json(scan);
    }

    const scans = await db.scan.findMany({
      orderBy: { createdAt: 'desc' },
      include: { results: { select: { id: true, severity: true } } },
    });

    return NextResponse.json(scans);
  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json({ error: 'Error al obtener escaneos' }, { status: 500 });
  }
}
