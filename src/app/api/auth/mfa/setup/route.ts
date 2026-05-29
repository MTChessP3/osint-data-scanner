import { NextRequest, NextResponse } from 'next/server';
import {
  getAnyValidToken,
  setupMfa,
  verifyTotp,
  findUser,
  updateUserMfaSecret,
  createSessionToken,
  getSessionCookieName,
  getEnrollmentCookieName,
  getCookieOptions,
  getEnrollmentCookieOptions,
} from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
    // Must have some valid token (session, mfa, or enrollment)
    const tokenPayload = await getAnyValidToken(request);
    if (!tokenPayload) {
      return NextResponse.json(
        { error: 'No autorizado. Inicie sesión o regístrese primero.' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { action } = body;

    if (action === 'generate') {
      // Generate new TOTP secret and QR code
      const user = findUser(tokenPayload.email || tokenPayload.username);
      const displayName = user?.displayName || tokenPayload.email || tokenPayload.username;
      const email = tokenPayload.email || user?.email || tokenPayload.username;

      const result = await setupMfa(email, displayName);

      return NextResponse.json({
        secret: result.secret,
        otpauthUrl: result.otpauthUrl,
        qrCodeDataUrl: result.qrCodeDataUrl,
        message: 'Escanea este código QR con tu aplicación autenticadora (Google Authenticator, Authy, etc.) y luego verifica con un código para completar el enrolamiento.',
      });
    }

    if (action === 'verify-and-enroll') {
      // Verify the TOTP code and activate MFA for the user
      const { code, secret } = body;
      if (!code || !secret) {
        return NextResponse.json(
          { error: 'Código y secreto requeridos' },
          { status: 400 }
        );
      }

      const isValid = verifyTotp(secret, code);
      if (!isValid) {
        return NextResponse.json(
          { error: 'Código inválido. Intente nuevamente.' },
          { status: 400 }
        );
      }

      // Save the TOTP secret to the user store
      const email = tokenPayload.email || tokenPayload.username;
      const saved = updateUserMfaSecret(email, secret);
      if (!saved) {
        return NextResponse.json(
          { error: 'No se pudo guardar la configuración MFA. Intente nuevamente.' },
          { status: 500 }
        );
      }

      // MFA enrollment complete — create full session
      const user = findUser(email);
      const sessionToken = await createSessionToken(
        user!.username,
        user!.email,
        user!.role,
        true,
        true
      );

      const response = NextResponse.json({
        success: true,
        enrolled: true,
        message: 'Autenticación de doble factor configurada exitosamente',
        user: {
          username: user!.username,
          email: user!.email,
          displayName: user!.displayName,
          role: user!.role,
        },
      });

      // Set full session cookie
      response.cookies.set(
        getSessionCookieName(),
        sessionToken,
        getCookieOptions()
      );

      // Clear enrollment cookie
      response.cookies.set(getEnrollmentCookieName(), '', {
        ...getEnrollmentCookieOptions(),
        maxAge: 0,
      });

      return response;
    }

    return NextResponse.json(
      { error: 'Acción no reconocida. Use "generate" o "verify-and-enroll".' },
      { status: 400 }
    );
  } catch (error: any) {
    console.error('MFA setup error:', error);
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}
