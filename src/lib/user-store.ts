import bcrypt from 'bcryptjs';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface AuthUser {
  username: string;
  email: string;
  passwordHash: string;
  totpSecret: string;       // empty = MFA not configured
  role: 'admin' | 'analyst' | 'viewer';
  displayName: string;
  createdAt: string;
}

// ─── In-Memory User Store ────────────────────────────────────────────────────
// Combines AUTH_USERS (from env) as seed + runtime registrations

let runtimeUsers: AuthUser[] = [];
let initialized = false;

function seedFromEnv(): AuthUser[] {
  const raw = process.env.AUTH_USERS;
  if (!raw) return [];
  try {
    const users = JSON.parse(raw);
    return users.map((u: any) => ({
      ...u,
      email: u.email || '',
      createdAt: u.createdAt || new Date().toISOString(),
    }));
  } catch {
    console.error('Failed to parse AUTH_USERS env variable');
    return [];
  }
}

function ensureInitialized(): void {
  if (!initialized) {
    runtimeUsers = seedFromEnv();
    initialized = true;
  }
}

// ─── CRUD Operations ─────────────────────────────────────────────────────────

export function findUserByEmail(email: string): AuthUser | undefined {
  ensureInitialized();
  return runtimeUsers.find(u => u.email.toLowerCase() === email.toLowerCase());
}

export function findUserByUsername(username: string): AuthUser | undefined {
  ensureInitialized();
  return runtimeUsers.find(u => u.username === username);
}

export function findUser(identifier: string): AuthUser | undefined {
  ensureInitialized();
  return runtimeUsers.find(u => 
    u.email.toLowerCase() === identifier.toLowerCase() || 
    u.username === identifier
  );
}

export function getAllUsers(): AuthUser[] {
  ensureInitialized();
  return [...runtimeUsers];
}

export async function registerUser(data: {
  email: string;
  displayName: string;
  password: string;
}): Promise<{ success: boolean; user?: AuthUser; error?: string }> {
  ensureInitialized();

  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(data.email)) {
    return { success: false, error: 'Formato de correo electrónico inválido' };
  }

  // Check if email already exists
  if (findUserByEmail(data.email)) {
    return { success: false, error: 'Este correo electrónico ya está registrado' };
  }

  // Validate password strength
  if (data.password.length < 8) {
    return { success: false, error: 'La contraseña debe tener al menos 8 caracteres' };
  }
  if (!/[A-Z]/.test(data.password)) {
    return { success: false, error: 'La contraseña debe contener al menos una letra mayúscula' };
  }
  if (!/[0-9]/.test(data.password)) {
    return { success: false, error: 'La contraseña debe contener al menos un número' };
  }

  // Create user
  const passwordHash = await bcrypt.hash(data.password, 10);
  const username = data.email.split('@')[0].replace(/[^a-zA-Z0-9]/g, '_');
  
  // Ensure unique username
  let finalUsername = username;
  let counter = 1;
  while (findUserByUsername(finalUsername)) {
    finalUsername = `${username}_${counter}`;
    counter++;
  }

  const newUser: AuthUser = {
    username: finalUsername,
    email: data.email.toLowerCase().trim(),
    passwordHash,
    totpSecret: '',  // MFA not yet configured — will be set during enrollment
    role: 'analyst',
    displayName: data.displayName.trim(),
    createdAt: new Date().toISOString(),
  };

  runtimeUsers.push(newUser);
  console.log(`[UserStore] New user registered: ${newUser.email} (${newUser.username})`);

  return { success: true, user: newUser };
}

export function updateUserMfaSecret(email: string, totpSecret: string): boolean {
  ensureInitialized();
  const user = runtimeUsers.find(u => u.email.toLowerCase() === email.toLowerCase());
  if (!user) return false;
  user.totpSecret = totpSecret;
  console.log(`[UserStore] MFA secret updated for: ${user.email}`);
  return true;
}

export function isMfaConfigured(user: AuthUser): boolean {
  return !!user.totpSecret && user.totpSecret.length > 0;
}

export async function verifyPassword(user: AuthUser, password: string): Promise<boolean> {
  return bcrypt.compare(password, user.passwordHash);
}

// Export current users config for persistence instructions
export function exportUsersConfig(): string {
  ensureInitialized();
  return JSON.stringify(runtimeUsers, null, 2);
}
