/**
 * Registered Engines — Registro de los 16 motores OSINT existentes
 * usando el sistema Engine Registry.
 *
 * Para agregar un nuevo motor:
 *   1. Crear la función de escaneo (puede estar en este archivo o importarla)
 *   2. Llamar a registerEngine() con la configuración
 *   3. El motor aparecerá automáticamente en el UI y en runFullScan
 *
 * El orquestador runFullScan() en osint-scanner.ts sigue funcionando
 * con su lógica original para retrocompatibilidad, pero también expone
 * runFullScanViaRegistry() que usa este sistema.
 */

import {
  engineRegistry,
  registerEngine,
  registerCategory,
  type EngineDefinition,
  type EngineCategoryDefinition,
} from './engine-registry';

// ── Importar funciones de escaneo existentes ──
// Estas funciones son internas a osint-scanner.ts, pero las exponemos
// a través de wrappers que cumplen la interfaz EngineScanFunction

import {
  runFullScan,
  type OSINTResult,
} from './osint-scanner';

// ── Importar el motor de validación de correos ──
import { scanEmailValidator } from './engines/email-validator-engine';

// ── Importar el motor de búsqueda Telegram vía xtea.io ──
import { scanTelegramXTEA } from './engines/telegram-xtea-engine';

// ══════════════════════════════════════════════════════
//  CATEGORÍAS
// ══════════════════════════════════════════════════════

const ENGINE_CATEGORIES: EngineCategoryDefinition[] = [
  { id: 'breaches', label: 'Brechas y Credenciales', icon: 'ShieldAlert', color: 'red', order: 1 },
  { id: 'darkweb', label: 'Dark Web y Filtraciones', icon: 'Eye', color: 'orange', order: 2 },
  { id: 'social', label: 'Redes Sociales', icon: 'Globe', color: 'blue', order: 3 },
  { id: 'search', label: 'Búsqueda Avanzada', icon: 'Search', color: 'emerald', order: 4 },
  { id: 'identity', label: 'Identidad y Datos', icon: 'Database', color: 'purple', order: 5 },
  { id: 'judicial', label: 'Judicial y Oficial', icon: 'Shield', color: 'teal', order: 6 },
  { id: 'email-validation', label: 'Validación de Correo', icon: 'Mail', color: 'amber', order: 7 },
];

// ══════════════════════════════════════════════════════
//  DEFINICIONES DE MOTORES
//
//  NOTA: Las funciones de escaneo aquí registradas son wrappers
//  que delegan a runFullScan con el motor seleccionado.
//  Cuando se agreguen NUEVOS motores, sus funciones de escaneo
//  se definen directamente aquí o se importan de un archivo
//  dedicado (ej: src/lib/engines/shodan-engine.ts)
// ══════════════════════════════════════════════════════

const ENGINE_DEFINITIONS: EngineDefinition[] = [
  // ── Brechas y Credenciales ──
  {
    id: 'hibp',
    name: 'Have I Been Pwned',
    description: 'Verifica filtraciones de credenciales',
    categoryId: 'breaches',
    defaultSeverity: 'critical',
    defaultCategory: 'credential_breach',
    requirements: { email: true },
    icon: 'ShieldAlert',
    color: 'red',
    order: 1,
    scan: async (subject) => {
      const results = await runFullScan({
        fullName: subject.fullName,
        email: subject.email,
        cedula: subject.cedula,
        phone: subject.phone,
        selectedEngines: ['Have I Been Pwned'],
      });
      return results;
    },
  },
  {
    id: 'pwned-passwords',
    name: 'Pwned Passwords',
    description: 'Contraseñas comprometidas',
    categoryId: 'breaches',
    defaultSeverity: 'critical',
    defaultCategory: 'password_exposure',
    requirements: { email: true },
    icon: 'AlertTriangle',
    color: 'red',
    order: 2,
    scan: async (subject) => {
      const results = await runFullScan({
        fullName: subject.fullName,
        email: subject.email,
        selectedEngines: ['Pwned Passwords'],
      });
      return results;
    },
  },
  {
    id: 'hibp-deep',
    name: 'HIBP Deep Check',
    description: 'Verificación profunda de brechas',
    categoryId: 'breaches',
    defaultSeverity: 'high',
    defaultCategory: 'credential_breach',
    requirements: { email: true },
    icon: 'ShieldAlert',
    color: 'red',
    order: 3,
    scan: async (subject) => {
      const results = await runFullScan({
        fullName: subject.fullName,
        email: subject.email,
        selectedEngines: ['HIBP Deep Check'],
      });
      return results;
    },
  },
  {
    id: 'dehashed',
    name: 'Dehashed',
    description: 'Credenciales filtradas en BD',
    categoryId: 'breaches',
    defaultSeverity: 'high',
    defaultCategory: 'credential_breach',
    requirements: {},
    icon: 'ShieldAlert',
    color: 'red',
    order: 4,
    scan: async (subject) => {
      const results = await runFullScan({
        fullName: subject.fullName,
        email: subject.email,
        cedula: subject.cedula,
        selectedEngines: ['Dehashed'],
      });
      return results;
    },
  },
  {
    id: 'leakix',
    name: 'LeakIX',
    description: 'Bases de datos expuestas',
    categoryId: 'breaches',
    defaultSeverity: 'high',
    defaultCategory: 'database_exposure',
    requirements: {},
    icon: 'Database',
    color: 'red',
    order: 5,
    scan: async (subject) => {
      const results = await runFullScan({
        fullName: subject.fullName,
        email: subject.email,
        cedula: subject.cedula,
        selectedEngines: ['LeakIX'],
      });
      return results;
    },
  },

  // ── Dark Web y Filtraciones ──
  {
    id: 'darkweb-scan',
    name: 'Dark Web / Leak Scan',
    description: 'Menciones en filtraciones',
    categoryId: 'darkweb',
    defaultSeverity: 'critical',
    defaultCategory: 'dark_web_mention',
    requirements: { email: true },
    icon: 'Eye',
    color: 'orange',
    order: 1,
    scan: async (subject) => {
      const results = await runFullScan({
        fullName: subject.fullName,
        email: subject.email,
        selectedEngines: ['Dark Web / Leak Scan'],
      });
      return results;
    },
  },
  {
    id: 'leakradar',
    name: 'LeakRadar',
    description: 'Filtraciones masivas de datos',
    categoryId: 'darkweb',
    defaultSeverity: 'high',
    defaultCategory: 'data_leak',
    requirements: {},
    icon: 'ShieldAlert',
    color: 'orange',
    order: 2,
    scan: async (subject) => {
      const results = await runFullScan({
        fullName: subject.fullName,
        email: subject.email,
        cedula: subject.cedula,
        selectedEngines: ['LeakRadar'],
      });
      return results;
    },
  },

  // ── Redes Sociales ──
  {
    id: 'social-media-scan',
    name: 'Social Media Scan',
    description: 'Perfiles en redes sociales',
    categoryId: 'social',
    defaultSeverity: 'medium',
    defaultCategory: 'social_profile',
    requirements: {},
    icon: 'Globe',
    color: 'blue',
    order: 1,
    scan: async (subject) => {
      const results = await runFullScan({
        fullName: subject.fullName,
        email: subject.email,
        selectedEngines: ['Social Media Scan'],
      });
      return results;
    },
  },
  {
    id: 'deepfind-profile',
    name: 'DeepFind Profile Analyzer',
    description: 'Análisis de perfil en redes',
    categoryId: 'social',
    defaultSeverity: 'medium',
    defaultCategory: 'profile_analysis',
    requirements: {},
    icon: 'User',
    color: 'blue',
    order: 2,
    scan: async (subject) => {
      const results = await runFullScan({
        fullName: subject.fullName,
        email: subject.email,
        selectedEngines: ['DeepFind Profile Analyzer'],
      });
      return results;
    },
  },

  // ── Búsqueda Avanzada ──
  {
    id: 'google-dorking',
    name: 'Google Dorking',
    description: 'Búsqueda avanzada con operadores',
    categoryId: 'search',
    defaultSeverity: 'medium',
    defaultCategory: 'search_exposure',
    requirements: {},
    icon: 'Search',
    color: 'emerald',
    order: 1,
    scan: async (subject) => {
      const results = await runFullScan({
        fullName: subject.fullName,
        email: subject.email,
        phone: subject.phone,
        cedula: subject.cedula,
        selectedEngines: ['Google Dorking'],
      });
      return results;
    },
  },
  {
    id: 'document-exposure',
    name: 'Document Exposure Scan',
    description: 'Documentos PDF/DOC expuestos',
    categoryId: 'search',
    defaultSeverity: 'medium',
    defaultCategory: 'document_exposure',
    requirements: {},
    icon: 'FileText',
    color: 'emerald',
    order: 2,
    scan: async (subject) => {
      const results = await runFullScan({
        fullName: subject.fullName,
        cedula: subject.cedula,
        selectedEngines: ['Document Exposure Scan'],
      });
      return results;
    },
  },

  // ── Identidad y Datos ──
  {
    id: 'data-broker',
    name: 'Data Broker Scan',
    description: 'Directorios y brokers de datos',
    categoryId: 'identity',
    defaultSeverity: 'medium',
    defaultCategory: 'data_broker',
    requirements: {},
    icon: 'Database',
    color: 'purple',
    order: 1,
    scan: async (subject) => {
      const results = await runFullScan({
        fullName: subject.fullName,
        email: subject.email,
        phone: subject.phone,
        selectedEngines: ['Data Broker Scan'],
      });
      return results;
    },
  },
  {
    id: 'pipl',
    name: 'Pipl',
    description: 'Búsqueda de identidades',
    categoryId: 'identity',
    defaultSeverity: 'medium',
    defaultCategory: 'identity_search',
    requirements: {},
    icon: 'Search',
    color: 'purple',
    order: 2,
    scan: async (subject) => {
      const results = await runFullScan({
        fullName: subject.fullName,
        email: subject.email,
        phone: subject.phone,
        selectedEngines: ['Pipl'],
      });
      return results;
    },
  },
  {
    id: 'deepfind-deep',
    name: 'DeepFind Deep Search',
    description: 'Búsqueda profunda de personas',
    categoryId: 'identity',
    defaultSeverity: 'medium',
    defaultCategory: 'deep_search',
    requirements: {},
    icon: 'Eye',
    color: 'purple',
    order: 3,
    scan: async (subject) => {
      const results = await runFullScan({
        fullName: subject.fullName,
        email: subject.email,
        phone: subject.phone,
        cedula: subject.cedula,
        selectedEngines: ['DeepFind Deep Search'],
      });
      return results;
    },
  },

  // ── Judicial y Oficial ──
  {
    id: 'policia-colombia',
    name: 'Policía Nacional Colombia',
    description: 'Antecedentes judiciales',
    categoryId: 'judicial',
    defaultSeverity: 'high',
    defaultCategory: 'judicial_record',
    requirements: {},
    icon: 'Shield',
    color: 'teal',
    order: 1,
    scan: async (subject) => {
      const results = await runFullScan({
        fullName: subject.fullName,
        cedula: subject.cedula,
        selectedEngines: ['Policía Nacional Colombia'],
      });
      return results;
    },
  },
  {
    id: 'aleph-occrp',
    name: 'Aleph / OCCRP',
    description: 'Documentos de investigación',
    categoryId: 'judicial',
    defaultSeverity: 'medium',
    defaultCategory: 'investigative_document',
    requirements: {},
    icon: 'FileDigit',
    color: 'teal',
    order: 2,
    scan: async (subject) => {
      const results = await runFullScan({
        fullName: subject.fullName,
        cedula: subject.cedula,
        selectedEngines: ['Aleph / OCCRP'],
      });
      return results;
    },
  },

  // ── Redes Sociales: Telegram ──
  {
    id: 'telegram-xtea',
    name: 'Telegram XTEA',
    description: 'Búsqueda Telegram vía xtea.io (canales, grupos, bots, perfiles)',
    categoryId: 'social',
    defaultSeverity: 'medium',
    defaultCategory: 'telegram_search',
    requirements: {},
    icon: 'Send',
    color: 'cyan',
    order: 3,
    version: '1.0.0',
    tags: ['telegram', 'xtea', 'channels', 'groups', 'bots', 'social', 'nickname'],
    scan: async (subject) => {
      // The engine uses nickname if available, otherwise email username or name
      return scanTelegramXTEA(subject);
    },
  },

  // ── Validación de Correo ──
  {
    id: 'email-validator',
    name: 'Email Validator',
    description: 'Validación de correo: sintaxis, DNS, desechables, SPF/DMARC',
    categoryId: 'email-validation',
    defaultSeverity: 'info',
    defaultCategory: 'email_validation',
    requirements: { email: true },
    icon: 'Mail',
    color: 'amber',
    order: 1,
    version: '1.0.0',
    tags: ['email', 'validation', 'dns', 'mx', 'spf', 'dmarc', 'disposable'],
    scan: scanEmailValidator,
  },
];

// ══════════════════════════════════════════════════════
//  INICIALIZACIÓN — Registrar categorías y motores
// ══════════════════════════════════════════════════════

let isInitialized = false;

export function initializeEngineRegistry(): void {
  if (isInitialized) return;

  // Registrar categorías
  registerCategories(ENGINE_CATEGORIES);

  // Registrar motores
  registerAllEngines(ENGINE_DEFINITIONS);

  isInitialized = true;
  console.log(`[EngineRegistry] Inicializado: ${engineRegistry.engineCount} motores en ${engineRegistry.getAllCategories().length} categorías`);
}

// ── Helpers ──

function registerCategories(categories: EngineCategoryDefinition[]) {
  for (const cat of categories) {
    registerCategory(cat);
  }
}

function registerAllEngines(engines: EngineDefinition[]) {
  for (const engine of engines) {
    registerEngine(engine);
  }
}

/**
 * Ejecutar un escaneo completo usando el Engine Registry.
 * Esta función es una alternativa a runFullScan() que usa el sistema de registro,
 * permitiendo que los motores agregados dinámicamente también sean ejecutados.
 */
export async function runFullScanViaRegistry(params: {
  fullName: string;
  cedula?: string;
  email?: string;
  phone?: string;
  deepseekKey?: string;
  selectedEngines?: string[];
}): Promise<OSINTResult[]> {
  initializeEngineRegistry();

  // Set DeepSeek key if provided
  if (params.deepseekKey) {
    const { setDeepSeekApiKey } = await import('./osint-scanner');
    setDeepSeekApiKey(params.deepseekKey);
  }

  // Convertir nombres de motor a IDs del registry si es necesario
  const selectedIds = params.selectedEngines && params.selectedEngines.length > 0
    ? params.selectedEngines
    : undefined;

  const allResults = await engineRegistry.runAllEngines(
    {
      fullName: params.fullName,
      cedula: params.cedula,
      email: params.email,
      phone: params.phone,
    },
    selectedIds,
  );

  return allResults;
}

// ── Exportar para uso directo ──
export { engineRegistry, ENGINE_CATEGORIES as REGISTERED_CATEGORIES };
