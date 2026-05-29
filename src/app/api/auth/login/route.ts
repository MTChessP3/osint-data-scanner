import { NextRequest, NextResponse } from 'next/server';
import {
  findUser,
  verifyPassword,
  isMfaConfigured,
  createSessionToken,
  createMfaTempToken,
  getSessionCookieName,
  getMfaCookieName,
  getCookieOptions,
  getMfaCookieOptions,
} from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { username, password } = body;

    if (!username || !password) {
      return NextResponse.json(
        { error: 'Usuario y contraseña son requeridos' },
        { status: 400 }
      );
    }

    const user = findUser(username);
    if (!user) {
      // Don't reveal whether user exists
      return NextResponse.json(
        { error: 'Credenciales inválidas' },
        { status: 401 }
      );
    }

    const passwordValid = await verifyPassword(user, password);
    if (!passwordValid) {
      return NextResponse.json(
        { error: 'Credenciales inválidas' },
        { status: 401 }
      );
    }

    // Check if MFA is configured for this user
    if (isMfaConfigured(user)) {
      // Create temporary MFA token (5 min validity)
      const mfaToken = await createMfaTempToken(user.username, user.role);
      const response = NextResponse.json({
        requiresMfa: true,
        message: 'Se requiere verificación MFA',
      });
      response.cookies.set(
        getMfaCookieName(),
        mfaToken,
        getMfaCookieOptions()
      );
      return response;
    }

    // No MFA configured — create full session
    const sessionToken = await createSessionToken(
      user.username,
      user.role,
      true
    );
    const response = NextResponse.json({
      success: true,
      requiresMfa: false,
      user: {
        username: user.username,
        role: user.role,
        displayName: user.displayName,
        mfaConfigured: false,
      },
    });
    response.cookies.set(
      getSessionCookieName(),
      sessionToken,
      getCookieOptions()
    );
    return response;
  } catch (error: any) {
    console.error('Login error:', error);
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}
