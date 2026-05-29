import { NextRequest, NextResponse } from 'next/server';
import { getSessionCookieName, getMfaCookieName, getCookieOptions } from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
    const response = NextResponse.json({ success: true, message: 'Sesión cerrada' });

    // Clear session cookie
    response.cookies.set(getSessionCookieName(), '', {
      ...getCookieOptions(),
      maxAge: 0,
    });

    // Clear MFA temp cookie
    response.cookies.set(getMfaCookieName(), '', {
      maxAge: 0,
      path: '/',
    });

    return response;
  } catch (error: any) {
    console.error('Logout error:', error);
    return NextResponse.json(
      { error: 'Error al cerrar sesión' },
      { status: 500 }
    );
  }
}
