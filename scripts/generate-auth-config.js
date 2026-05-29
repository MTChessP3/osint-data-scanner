#!/usr/bin/env node
/**
 * Script para generar la configuración de usuarios para AUTH_USERS
 * Uso: node scripts/generate-auth-config.js
 */

const bcrypt = require('bcryptjs');
const { generateSecret } = require('otplib');
const crypto = require('crypto');

async function main() {
  // Generate AUTH_SECRET
  const authSecret = crypto.randomBytes(32).toString('hex');
  
  // Default admin user
  const adminPassword = 'Admin2025!OSINT';
  const adminPasswordHash = await bcrypt.hash(adminPassword, 10);
  
  // Generate TOTP secret for admin (optional - leave empty to set up later)
  const adminTotpSecret = ''; // Leave empty to set up MFA after first login
  
  // Analyst user example
  const analystPassword = 'Analyst2025!OSINT';
  const analystPasswordHash = await bcrypt.hash(analystPassword, 10);
  
  const users = [
    {
      username: 'admin',
      passwordHash: adminPasswordHash,
      totpSecret: adminTotpSecret,
      role: 'admin',
      displayName: 'Administrador'
    },
    {
      username: 'analista',
      passwordHash: analystPasswordHash,
      totpSecret: '',
      role: 'analyst',
      displayName: 'Analista OSINT'
    }
  ];
  
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  CONFIGURACIÓN DE SEGURIDAD - OSINT Data Scanner');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log();
  console.log('1. AUTH_SECRET (JWT signing key):');
  console.log(`   ${authSecret}`);
  console.log();
  console.log('2. AUTH_USERS (JSON array of users):');
  console.log(`   ${JSON.stringify(users)}`);
  console.log();
  console.log('3. CREDENCIALES DE ACCESO:');
  console.log(`   Usuario: admin     Contraseña: ${adminPassword}`);
  console.log(`   Usuario: analista  Contraseña: ${analystPassword}`);
  console.log();
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  INSTRUCCIONES PARA VERCEL:');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log();
  console.log('  1. Ve a https://vercel.com/dashboard');
  console.log('  2. Selecciona tu proyecto (osint-data-scanner)');
  console.log('  3. Ve a Settings → Environment Variables');
  console.log('  4. Agrega las siguientes variables:');
  console.log();
  console.log('     AUTH_SECRET = [valor de AUTH_SECRET arriba]');
  console.log('     AUTH_USERS  = [valor de AUTH_USERS arriba]');
  console.log();
  console.log('  5. Selecciona los ambientes: Production, Preview, Development');
  console.log('  6. Haz clic en "Save"');
  console.log('  7. Redeploy la aplicación');
  console.log();
  console.log('  ⚠️  IMPORTANTE: Cambia las contraseñas después del primer login!');
  console.log('  Para generar un nuevo hash: node -e "require(\'bcryptjs\').hash(\'TU_CLAVE\', 10).then(h => console.log(h))"');
  console.log();
  console.log('═══════════════════════════════════════════════════════════════');
}

main().catch(console.error);
