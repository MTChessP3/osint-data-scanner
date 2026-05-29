import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';

const SESSION_COOKIE_NAME = 'osint_session';
const MFA_COOKIE_NAME = 'osint_mfa_temp';
const ENROLLMENT_COOKIE_NAME = 'osint_enrollment';
const ISSUER = 'OSINT-DataScanner';

// Routes that don't require any authentication
const PUBLIC_ROUTES = [
  '/login',
  '/register',
  '/api/auth/login',
  '/api/auth/register',
  '/api/auth/mfa/verify',
];

// Routes accessible with enrollment token (MFA enrollment flow)
const ENROLLMENT_ROUTES = [
  '/enroll-mfa',
  '/api/auth/mfa/setup',
  '/api/auth/session',
];

function getSecretKey(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    return new TextEncoder().encode('default-secret-change-me');
  }
  return new TextEncoder().encode(secret);
}

async function verifyToken(token: string): Promise<any> {
  try {
    const { payload } = await jwtVerify(token, getSecretKey(), {
      issuer: ISSUER,
    });
    return payload;
  } catch {
    return null;
  }
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip auth for static files, Next.js internals
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon') ||
    (pathname.includes('.') && !pathname.startsWith('/api/'))
  ) {
    return NextResponse.next();
  }

  // If AUTH_SECRET is not configured, skip auth entirely (setup mode)
  if (!process.env.AUTH_SECRET) {
    return NextResponse.next();
  }

  // Allow public routes
  if (PUBLIC_ROUTES.some(route => pathname === route || pathname.startsWith(route + '/'))) {
    return NextResponse.next();
  }

  // Parse cookies
  const cookieHeader = request.headers.get('cookie') || '';
  const cookies = Object.fromEntries(
    cookieHeader.split('; ').map(c => {
      const [key, ...vals] = c.split('=');
      return [key, vals.join('=')];
    })
  );

  const sessionToken = cookies[SESSION_COOKIE_NAME];
  const mfaToken = cookies[MFA_COOKIE_NAME];
  const enrollmentToken = cookies[ENROLLMENT_COOKIE_NAME];

  // Check for valid full session (authenticated + MFA verified)
  if (sessionToken) {
    const session = await verifyToken(sessionToken);
    if (session && session.mfaVerified && session.mfaEnrolled) {
      // Fully authenticated — allow access to everything
      return NextResponse.next();
    }
  }

  // Check for enrollment token (user registered but needs to complete MFA)
  if (enrollmentToken) {
    const enrollmentSession = await verifyToken(enrollmentToken);
    if (enrollmentSession && !enrollmentSession.mfaEnrolled) {
      // User is in enrollment flow — only allow enrollment routes
      if (ENROLLMENT_ROUTES.some(route => pathname === route || pathname.startsWith(route + '/'))) {
        return NextResponse.next();
      }
      // Redirect other pages to enrollment
      if (!pathname.startsWith('/api/')) {
        const enrollUrl = new URL('/enroll-mfa', request.url);
        return NextResponse.redirect(enrollUrl);
      }
      return NextResponse.json(
        { error: 'MFA enrollment required' },
        { status: 401 }
      );
    }
  }

  // Check for MFA temp token (user logged in, needs to enter MFA code)
  if (mfaToken) {
    const mfaSession = await verifyToken(mfaToken);
    if (mfaSession && !mfaSession.mfaVerified && mfaSession.mfaEnrolled) {
      // User needs to complete MFA verification
      if (pathname === '/login' || pathname === '/api/auth/mfa/verify' || pathname === '/api/auth/session') {
        return NextResponse.next();
      }
      if (pathname.startsWith('/api/')) {
        return NextResponse.json(
          { error: 'MFA verification required' },
          { status: 401 }
        );
      }
      const loginUrl = new URL('/login', request.url);
      return NextResponse.redirect(loginUrl);
    }
  }

  // Not authenticated — redirect API calls to 401, pages to login
  if (pathname.startsWith('/api/')) {
    return NextResponse.json(
      { error: 'Authentication required' },
      { status: 401 }
    );
  }

  const loginUrl = new URL('/login', request.url);
  loginUrl.searchParams.set('callbackUrl', pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
