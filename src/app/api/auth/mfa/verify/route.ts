import { NextRequest, NextResponse } from 'next/server';
import {
  findUser,
  verifyTotp,
  createSessionToken,
  verifySessionToken,
  getSessionCookieName,
  getMfaCookieName,
  getCookieOptions,
  getMfaCookieOptions,
} from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { code } = body;

    if (!code) {
      return NextResponse.json(
        { error: 'Código MFA requerido' },
        { status: 400 }
      );
    }

    // Get the MFA temp token from cookies
    const mfaToken = request.cookies.get(getMfaCookieName())?.value;
    if (!mfaToken) {
      return NextResponse.json(
        { error: 'Sesión de autenticación expirada. Inicie sesión nuevamente.' },
        { status: 401 }
      );
    }

    // Verify the MFA temp token
    const mfaSession = await verifySessionToken(mfaToken);
    if (!mfaSession || mfaSession.mfaVerified) {
      return NextResponse.json(
        { error: 'Token MFA inválido. Inicie sesión nuevamente.' },
        { status: 401 }
      );
    }

    // Find user and verify TOTP code
    const user = findUser(mfaSession.email || mfaSession.username);
    if (!user || !user.totpSecret) {
      return NextResponse.json(
        { error: 'Usuario no encontrado o MFA no configurado' },
        { status: 401 }
      );
    }

    const isValid = verifyTotp(user.totpSecret, code);
    if (!isValid) {
      return NextResponse.json(
        { error: 'Código MFA inválido. Intente nuevamente.' },
        { status: 401 }
      );
    }

    // MFA verified — create full session
    const sessionToken = await createSessionToken(
      user.username,
      user.email,
      user.role,
      true,
      true
    );

    const response = NextResponse.json({
      success: true,
      user: {
        username: user.username,
        email: user.email,
        role: user.role,
        displayName: user.displayName,
        mfaConfigured: true,
      },
    });

    response.cookies.set(
      getSessionCookieName(),
      sessionToken,
      getCookieOptions()
    );

    // Clear MFA temp cookie
    response.cookies.set(getMfaCookieName(), '', {
      ...getMfaCookieOptions(),
      maxAge: 0,
    });

    return response;
  } catch (error: any) {
    console.error('MFA verify error:', error);
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}
