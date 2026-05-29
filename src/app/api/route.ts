import { NextResponse } from "next/server";
import { verifyAuth } from '@/lib/auth';

export async function GET(request: Request) {
  const auth = await verifyAuth(request);
  if (!auth.authenticated) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  return NextResponse.json({
    message: "OSINT Data Scanner API",
    version: "3.1",
    status: "operational",
    timestamp: new Date().toISOString(),
    auth: "credentials-embedded",
  });
}