import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken, getAnyValidToken, findUser } from '@/lib/auth';

export async function GET(request: NextRequest) {
  try {
    const tokenPayload = await getAnyValidToken(request);
    
    if (!tokenPayload) {
      return NextResponse.json(
        { authenticated: false, user: null },
        { status: 200 }
      );
    }

    // Full session (authenticated + MFA verified + enrolled)
    if (tokenPayload.mfaVerified && tokenPayload.mfaEnrolled) {
      const user = findUser(tokenPayload.email || tokenPayload.username);
      return NextResponse.json({
        authenticated: true,
        user: {
          username: tokenPayload.username,
          email: tokenPayload.email || user?.email,
          role: tokenPayload.role,
          mfaVerified: true,
          mfaEnrolled: true,
          displayName: user?.displayName,
        },
      });
    }

    // Enrollment token (registered but MFA not yet configured)
    if (!tokenPayload.mfaEnrolled) {
      return NextResponse.json({
        authenticated: false,
        requiresMfaEnrollment: true,
        user: {
          username: tokenPayload.username,
          email: tokenPayload.email,
          role: tokenPayload.role,
          mfaEnrolled: false,
        },
      });
    }

    // MFA temp token (needs to verify MFA code)
    if (!tokenPayload.mfaVerified) {
      return NextResponse.json({
        authenticated: false,
        requiresMfaVerification: true,
        user: {
          username: tokenPayload.username,
          email: tokenPayload.email,
          role: tokenPayload.role,
          mfaEnrolled: true,
        },
      });
    }

    return NextResponse.json(
      { authenticated: false, user: null },
      { status: 200 }
    );
  } catch (error: any) {
    console.error('Session check error:', error);
    return NextResponse.json(
      { authenticated: false, user: null },
      { status: 200 }
    );
  }
}
