import { SignJWT, jwtVerify } from 'jose';
import bcrypt from 'bcryptjs';
import { generateSecret, generate as otplibGenerate, verify as otplibVerify, generateURI } from 'otplib';
import { NobleCryptoPlugin, ScureBase32Plugin } from 'otplib';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface AuthUser {
  username: string;
  passwordHash: string;
  totpSecret: string;       // empty = MFA not configured
  role: 'admin' | 'analyst' | 'viewer';
  displayName: string;
}

export interface SessionPayload {
  username: string;
  role: string;
  mfaVerified: boolean;
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
const SESSION_DURATION = '8h';
const MFA_TEMP_DURATION = '5m';
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

function parseUsers(): AuthUser[] {
  const raw = process.env.AUTH_USERS;
  if (!raw) {
    // Default admin user if no users configured
    return [{
      username: 'admin',
      passwordHash: '$2b$10$e0oaErwXhRtHToX6xX1qaeR8JawP0B6VHxEZ0rznMdmHnymfHFlbO', // "admin123"
      totpSecret: '',
      role: 'admin',
      displayName: 'Administrador',
    }];
  }
  try {
    return JSON.parse(raw);
  } catch {
    console.error('Failed to parse AUTH_USERS env variable');
    return [];
  }
}

// ─── User Management ─────────────────────────────────────────────────────────

export function findUser(username: string): AuthUser | undefined {
  const users = parseUsers();
  return users.find(u => u.username === username);
}

export async function verifyPassword(user: AuthUser, password: string): Promise<boolean> {
  return bcrypt.compare(password, user.passwordHash);
}

export function isMfaConfigured(user: AuthUser): boolean {
  return !!user.totpSecret && user.totpSecret.length > 0;
}

export async function verifyTotp(secret: string, token: string): Promise<boolean> {
  try {
    const result = await otplibVerify({
      secret,
      token,
      type: 'totp',
      crypto: cryptoPlugin,
      base32: base32Plugin,
      epochTolerance: [1, 1], // Allow ±1 time step (30s drift)
    });
    return result.valid;
  } catch {
    return false;
  }
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

// ─── JWT Session Management ──────────────────────────────────────────────────

export async function createSessionToken(
  username: string,
  role: string,
  mfaVerified: boolean
): Promise<string> {
  return new SignJWT({ username, role, mfaVerified })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(SESSION_DURATION)
    .setIssuer(ISSUER)
    .sign(getSecretKey());
}

export async function createMfaTempToken(username: string, role: string): Promise<string> {
  return new SignJWT({ username, role, mfaVerified: false })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(MFA_TEMP_DURATION)
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

export function getCookieOptions(): {
  httpOnly: boolean;
  secure: boolean;
  sameSite: 'lax' | 'strict';
  path: string;
  maxAge: number;
} {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 8 * 60 * 60, // 8 hours
  };
}

export function getMfaCookieOptions(): {
  httpOnly: boolean;
  secure: boolean;
  sameSite: 'lax' | 'strict';
  path: string;
  maxAge: number;
} {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 5 * 60, // 5 minutes
  };
}

// ─── MFA Setup ───────────────────────────────────────────────────────────────

export async function setupMfa(
  username: string,
  _displayName: string
): Promise<MfaSetupResult> {
  const secret = generateSecret();
  const otpauthUrl = generateURI({
    secret,
    type: 'totp',
    label: username,
    issuer: ISSUER,
  });

  // Generate QR code
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

  // Parse cookies
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

// ─── Middleware Auth Check (Edge-compatible) ─────────────────────────────────

export async function verifyAuthEdge(request: Request): Promise<{
  authenticated: boolean;
  session: SessionPayload | null;
}> {
  const cookieHeader = request.headers.get('cookie');
  if (!cookieHeader) {
    return { authenticated: false, session: null };
  }

  const cookies = Object.fromEntries(
    cookieHeader.split('; ').map(c => {
      const [key, ...vals] = c.split('=');
      return [key, vals.join('=')];
    })
  );

  const sessionToken = cookies[SESSION_COOKIE_NAME];
  if (!sessionToken) {
    // Check for MFA temp token (user is in the middle of MFA flow)
    const mfaToken = cookies[MFA_COOKIE_NAME];
    if (mfaToken) {
      const mfaSession = await verifySessionToken(mfaToken);
      if (mfaSession && !mfaSession.mfaVerified) {
        // Redirect to MFA verification
        return { authenticated: false, session: { ...mfaSession, mfaVerified: false, iat: 0, exp: 0 } };
      }
    }
    return { authenticated: false, session: null };
  }

  const session = await verifySessionToken(sessionToken);
  if (!session) {
    return { authenticated: false, session: null };
  }

  if (!session.mfaVerified) {
    return { authenticated: false, session };
  }

  return { authenticated: true, session };
}
