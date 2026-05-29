import { SignJWT, jwtVerify } from 'jose';
import crypto from 'crypto';
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
  mfaEnrolled: boolean;
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
const ENROLLMENT_DURATION = '30m'; // Increased to 30 min for MFA enrollment
const ISSUER = 'OSINT-DataScanner';

// ─── TOTP Implementation (native Node.js crypto) ────────────────────────────

function base32Encode(buffer: Buffer): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const byte of buffer) {
    bits += byte.toString(2).padStart(8, '0');
  }
  let result = '';
  for (let i = 0; i < bits.length; i += 5) {
    const chunk = bits.substring(i, i + 5);
    if (chunk.length < 5) break;
    result += alphabet[parseInt(chunk, 2)];
  }
  return result;
}

function base32Decode(str: string): Buffer {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  str = str.toUpperCase().replace(/=+$/, '');
  let bits = '';
  for (const char of str) {
    const val = alphabet.indexOf(char);
    if (val === -1) continue;
    bits += val.toString(2).padStart(5, '0');
  }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.substring(i, i + 8), 2));
  }
  return Buffer.from(bytes);
}

function generateTotpSecret(): string {
  const bytes = crypto.randomBytes(20);
  return base32Encode(bytes);
}

function totpCounter(time: number, period: number = 30): number {
  return Math.floor(time / period);
}

function totpCode(secret: string, counter: number, digits: number = 6): string {
  const decodedSecret = base32Decode(secret);
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter));
  const hmac = crypto.createHmac('sha1', decodedSecret);
  hmac.update(counterBuffer);
  const hmacResult = hmac.digest();
  const offset = hmacResult[hmacResult.length - 1] & 0x0f;
  const code = ((hmacResult[offset] & 0x7f) << 24 |
    (hmacResult[offset + 1] & 0xff) << 16 |
    (hmacResult[offset + 2] & 0xff) << 8 |
    (hmacResult[offset + 3] & 0xff)) % Math.pow(10, digits);
  return code.toString().padStart(digits, '0');
}

function verifyTotpCode(secret: string, token: string, window: number = 1): boolean {
  const now = Math.floor(Date.now() / 1000);
  const currentCounter = totpCounter(now);
  for (let i = -window; i <= window; i++) {
    const counter = currentCounter + i;
    const expectedCode = totpCode(secret, counter);
    if (expectedCode === token) {
      return true;
    }
  }
  return false;
}

function buildOtpauthUrl(secret: string, email: string, issuer: string): string {
  const params = new URLSearchParams({
    secret,
    issuer,
    algorithm: 'SHA1',
    digits: '6',
    period: '30',
  });
  return `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(email)}?${params.toString()}`;
}

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

// ─── TOTP Verification (public API) ─────────────────────────────────────────

export function verifyTotp(secret: string, token: string): boolean {
  try {
    return verifyTotpCode(secret, token, 1);
  } catch (error) {
    console.error('[Auth] TOTP verification error:', error);
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
    maxAge: 30 * 60, // 30 minutes
  };
}

// ─── MFA Setup / Enrollment ─────────────────────────────────────────────────

export async function setupMfa(
  email: string,
  displayName: string
): Promise<MfaSetupResult> {
  const secret = generateTotpSecret();
  const otpauthUrl = buildOtpauthUrl(secret, email, ISSUER);

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
