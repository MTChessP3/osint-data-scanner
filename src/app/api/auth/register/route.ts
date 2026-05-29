import { NextRequest, NextResponse } from 'next/server';
import { registerUser } from '@/lib/user-store';
import {
  createEnrollmentToken,
  getEnrollmentCookieName,
  getEnrollmentCookieOptions,
} from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, displayName, password, confirmPassword } = body;

    // Validate required fields
    if (!email || !displayName || !password) {
      return NextResponse.json(
        { error: 'Todos los campos son requeridos' },
        { status: 400 }
      );
    }

    // Validate password confirmation
    if (password !== confirmPassword) {
      return NextResponse.json(
        { error: 'Las contraseñas no coinciden' },
        { status: 400 }
      );
    }

    // Attempt registration
    const result = await registerUser({ email, displayName, password });

    if (!result.success) {
      return NextResponse.json(
        { error: result.error },
        { status: 400 }
      );
    }

    // Registration successful — create enrollment token (user must complete MFA setup)
    const enrollmentToken = await createEnrollmentToken(
      result.user!.username,
      result.user!.email,
      result.user!.role
    );

    const response = NextResponse.json({
      success: true,
      message: 'Registro exitoso. Ahora debe configurar la autenticación de doble factor.',
      requiresMfaEnrollment: true,
      user: {
        username: result.user!.username,
        email: result.user!.email,
        displayName: result.user!.displayName,
        role: result.user!.role,
      },
    });

    // Set enrollment cookie (10 min to complete MFA setup)
    response.cookies.set(
      getEnrollmentCookieName(),
      enrollmentToken,
      getEnrollmentCookieOptions()
    );

    return response;
  } catch (error: any) {
    console.error('Registration error:', error);
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}
