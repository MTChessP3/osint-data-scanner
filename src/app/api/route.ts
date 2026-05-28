import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    message: "OSINT Data Scanner API",
    version: "3.1",
    status: "operational",
    timestamp: new Date().toISOString(),
    auth: "credentials-embedded",
  });
}