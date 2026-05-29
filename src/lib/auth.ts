import { SignJWT, jwtVerify } from 'jose';
import { generateSecret, verify as otplibVerify, generateURI } from 'otplib';
import { NobleCryptoPlugin, ScureBase32Plugin } from 'otplib';
import {
  findUser as findUserFromStore,
  isMfaConfigured as isMfaConfiguredInStore,
  verifyPassword,
  updateUserMfaSecret,
  AuthUser,
} from '@/lib/user-store';

// Re-export AuthUser from user-store
export type { AuthUser } from '@/lib/user-store';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface SessionPayload {
  username: string;
  email: string;
  role: string;
  mfaVerified: boolean;
  mfaEnrolled: boolean;  // whether user has completed MFA enrollment
  iat: number;
  exp: number;
}

export interface MfaSetupResult {
  secret: string;
  otpauthUrl: string;
  qrCodeDataUrl: string;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const SESSION_COOKIE_NAME = 'osint_session';
const MFA_COOKIE_NAME = 'osint_mfa_temp';
const ENROLLMENT_COOKIE_NAME = 'osint_enrollment';
const SESSION_DURATION = '8h';
const MFA_TEMP_DURATION = '5m';
const ENROLLMENT_DURATION = '10m'; // time to complete MFA enrollment after registration
const ISSUER = 'OSINT-DataScanner';

// ─── TOTP Plugin Instances ───────────────────────────────────────────────────

const cryptoPlugin = new NobleCryptoPlugin();
const base32Plugin = new ScureBase32Plugin();

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getSecretKey(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error('AUTH_SECRET environment variable is required');
  }
  return new TextEncoder().encode(secret);
}

// ─── User Management (delegated to user-store) ──────────────────────────────

export const findUser = findUserFromStore;
export const isMfaConfigured = isMfaConfiguredInStore;
export { verifyPassword, updateUserMfaSecret };

// ─── TOTP Verification ──────────────────────────────────────────────────────

export async function verifyTotp(secret: string, token: string): Promise<boolean> {
  try {
    const result = await otplibVerify({
      secret,
      token,
      type: 'totp',
      crypto: cryptoPlugin,
      base32: base32Plugin,
      epochTolerance: [1, 1],
    });
    return result.valid;
  } catch {
    return false;
  }
}

// ─── JWT Session Management ──────────────────────────────────────────────────

export async function createSessionToken(
  username: string,
  email: string,
  role: string,
  mfaVerified: boolean,
  mfaEnrolled: boolean
): Promise<string> {
  return new SignJWT({ username, email, role, mfaVerified, mfaEnrolled })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(SESSION_DURATION)
    .setIssuer(ISSUER)
    .sign(getSecretKey());
}

export async function createMfaTempToken(
  username: string,
  email: string,
  role: string
): Promise<string> {
  return new SignJWT({ username, email, role, mfaVerified: false, mfaEnrolled: true })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(MFA_TEMP_DURATION)
    .setIssuer(ISSUER)
    .sign(getSecretKey());
}

export async function createEnrollmentToken(
  username: string,
  email: string,
  role: string
): Promise<string> {
  // Token for users who need to complete MFA enrollment
  return new SignJWT({ username, email, role, mfaVerified: false, mfaEnrolled: false })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(ENROLLMENT_DURATION)
    .setIssuer(ISSUER)
    .sign(getSecretKey());
}

export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecretKey(), {
      issuer: ISSUER,
    });
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}

// ─── Cookie Utilities ────────────────────────────────────────────────────────

export function getSessionCookieName(): string {
  return SESSION_COOKIE_NAME;
}

export function getMfaCookieName(): string {
  return MFA_COOKIE_NAME;
}

export function getEnrollmentCookieName(): string {
  return ENROLLMENT_COOKIE_NAME;
}

export function getCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: 8 * 60 * 60,
  };
}

export function getMfaCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: 5 * 60,
  };
}

export function getEnrollmentCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: 10 * 60,
  };
}

// ─── MFA Setup / Enrollment ─────────────────────────────────────────────────

export async function setupMfa(
  email: string,
  displayName: string
): Promise<MfaSetupResult> {
  const secret = generateSecret();
  const otpauthUrl = generateURI({
    secret,
    type: 'totp',
    label: email,
    issuer: ISSUER,
  });

  const QRCode = await import('qrcode');
  const qrCodeDataUrl = await QRCode.toDataURL(otpauthUrl, {
    width: 256,
    margin: 2,
    color: { dark: '#000000', light: '#ffffff' },
  });

  return { secret, otpauthUrl, qrCodeDataUrl };
}

// ─── Auth Verification for API Routes ────────────────────────────────────────

export async function verifyAuth(request: Request): Promise<{
  authenticated: boolean;
  session: SessionPayload | null;
  error?: string;
}> {
  const cookieHeader = request.headers.get('cookie');
  if (!cookieHeader) {
    return { authenticated: false, session: null, error: 'No session found' };
  }

  const cookies = Object.fromEntries(
    cookieHeader.split('; ').map(c => {
      const [key, ...vals] = c.split('=');
      return [key, vals.join('=')];
    })
  );

  const sessionToken = cookies[SESSION_COOKIE_NAME];
  if (!sessionToken) {
    return { authenticated: false, session: null, error: 'No session token' };
  }

  const session = await verifySessionToken(sessionToken);
  if (!session) {
    return { authenticated: false, session: null, error: 'Invalid or expired session' };
  }

  if (!session.mfaVerified) {
    return { authenticated: false, session: null, error: 'MFA verification required' };
  }

  return { authenticated: true, session };
}

// ─── Parse cookies helper ────────────────────────────────────────────────────

export function parseCookies(request: Request): Record<string, string> {
  const cookieHeader = request.headers.get('cookie') || '';
  return Object.fromEntries(
    cookieHeader.split('; ').map(c => {
      const [key, ...vals] = c.split('=');
      return [key, vals.join('=')];
    })
  );
}

// ─── Get any valid token from request (session, mfa, or enrollment) ─────────

export async function getAnyValidToken(request: Request): Promise<SessionPayload | null> {
  const cookies = parseCookies(request);
  
  // Try full session first
  if (cookies[SESSION_COOKIE_NAME]) {
    const session = await verifySessionToken(cookies[SESSION_COOKIE_NAME]);
    if (session) return session;
  }
  
  // Try MFA temp token
  if (cookies[MFA_COOKIE_NAME]) {
    const session = await verifySessionToken(cookies[MFA_COOKIE_NAME]);
    if (session) return session;
  }
  
  // Try enrollment token
  if (cookies[ENROLLMENT_COOKIE_NAME]) {
    const session = await verifySessionToken(cookies[ENROLLMENT_COOKIE_NAME]);
    if (session) return session;
  }
  
  return null;
}
