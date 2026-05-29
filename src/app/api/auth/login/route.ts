import { NextRequest, NextResponse } from 'next/server';
import {
  findUser,
  verifyPassword,
  isMfaConfigured,
  createSessionToken,
  createMfaTempToken,
  createEnrollmentToken,
  getSessionCookieName,
  getMfaCookieName,
  getEnrollmentCookieName,
  getCookieOptions,
  getMfaCookieOptions,
  getEnrollmentCookieOptions,
} from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, password } = body;

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Correo electrónico y contraseña son requeridos' },
        { status: 400 }
      );
    }

    const user = findUser(email);
    if (!user) {
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
      // MFA configured — create temp token for MFA verification
      const mfaToken = await createMfaTempToken(user.username, user.email, user.role);
      const response = NextResponse.json({
        requiresMfa: true,
        message: 'Se requiere verificación de doble factor',
      });
      response.cookies.set(
        getMfaCookieName(),
        mfaToken,
        getMfaCookieOptions()
      );
      return response;
    }

    // MFA NOT configured — user must enroll in MFA before accessing the app
    const enrollmentToken = await createEnrollmentToken(
      user.username,
      user.email,
      user.role
    );
    const response = NextResponse.json({
      requiresMfaEnrollment: true,
      message: 'Debe configurar la autenticación de doble factor antes de continuar',
    });
    response.cookies.set(
      getEnrollmentCookieName(),
      enrollmentToken,
      getEnrollmentCookieOptions()
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
