import { NextRequest, NextResponse } from 'next/server';
import {
  verifyAuth,
  setupMfa,
  verifyTotp,
  findUser,
} from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
    // Must be authenticated to set up MFA
    const auth = await verifyAuth(request);
    if (!auth.authenticated || !auth.session) {
      return NextResponse.json(
        { error: 'No autorizado' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { action } = body;

    if (action === 'generate') {
      // Generate new TOTP secret and QR code
      const user = findUser(auth.session.username);
      const displayName = user?.displayName || auth.session.username;

      const result = await setupMfa(auth.session.username, displayName);

      return NextResponse.json({
        secret: result.secret,
        otpauthUrl: result.otpauthUrl,
        qrCodeDataUrl: result.qrCodeDataUrl,
        message: 'Escanea este código QR con tu aplicación autenticadora (Google Authenticator, Authy, etc.). Luego verifica con un código para activar MFA. IMPORTANTE: Guarda el secreto en la variable AUTH_USERS de entorno para que persista.',
      });
    }

    if (action === 'verify-and-activate') {
      // Verify the TOTP code and return the secret to be stored
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

      // Return the configuration that needs to be saved
      // Since Vercel is read-only, we tell the user to update the env var
      const user = findUser(auth.session.username);
      const currentUsers = process.env.AUTH_USERS 
        ? JSON.parse(process.env.AUTH_USERS) 
        : [];

      const updatedUsers = currentUsers.map((u: any) => {
        if (u.username === auth.session.username) {
          return { ...u, totpSecret: secret };
        }
        return u;
      });

      // If user wasn't in the env var (default user), add them
      if (!currentUsers.find((u: any) => u.username === auth.session.username)) {
        updatedUsers.push({
          username: auth.session.username,
          passwordHash: user?.passwordHash || '',
          totpSecret: secret,
          role: auth.session.role,
          displayName: user?.displayName || auth.session.username,
        });
      }

      return NextResponse.json({
        success: true,
        activated: true,
        updatedConfig: JSON.stringify(updatedUsers, null, 2),
        instructions: `MFA verificado exitosamente. Para que el cambio persista, actualiza la variable de entorno AUTH_USERS en Vercel con el siguiente valor JSON, y redeploya la aplicación.`,
      });
    }

    return NextResponse.json(
      { error: 'Acción no reconocida. Use "generate" o "verify-and-activate".' },
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
