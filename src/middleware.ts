import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';

const SESSION_COOKIE_NAME = 'osint_session';
const MFA_COOKIE_NAME = 'osint_mfa_temp';
const ISSUER = 'OSINT-DataScanner';

// Routes that don't require authentication
const PUBLIC_ROUTES = [
  '/login',
  '/api/auth/login',
  '/api/auth/mfa/verify',
];

// Routes accessible during MFA flow (temp token)
const MFA_FLOW_ROUTES = [
  '/api/auth/mfa/verify',
  '/login',
];

function getSecretKey(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    // If AUTH_SECRET is not set, allow all access (setup mode)
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
    pathname.includes('.') && !pathname.startsWith('/api/')
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

  // Check for valid session
  if (sessionToken) {
    const session = await verifyToken(sessionToken);
    if (session && session.mfaVerified) {
      // Fully authenticated — allow access
      return NextResponse.next();
    }
  }

  // Check for MFA temp token (user is in MFA verification flow)
  if (mfaToken) {
    const mfaSession = await verifyToken(mfaToken);
    if (mfaSession && !mfaSession.mfaVerified) {
      // User needs to complete MFA — redirect to login MFA step
      if (pathname.startsWith('/api/')) {
        return NextResponse.json(
          { error: 'MFA verification required' },
          { status: 401 }
        );
      }
      // Redirect to login page (it will show MFA step)
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
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico (favicon)
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
