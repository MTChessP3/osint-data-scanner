/**
 * Analizador de Archivos de Texto (.txt) para Inteligencia OSINT
 *
 * Extrae entidades de valor para ciberinteligencia desde texto libre:
 * - Nombres completos, emails, teléfonos, cédulas/NIT
 * - Direcciones IP, URLs, usuarios/aliases
 * - Direcciones físicas, empresas mencionadas
 * - Agrupa entidades co-ocurrentes en registros de persona
 *
 * Soporta múltiples formatos de entrada:
 * 1. Key-Value (Nombre: Juan Perez / Email: juan@...)
 * 2. Separado por comas/tabs/pipes
 * 3. Texto libre con entidades embebidas
 * 4. Formato de dump/log
 */

// ════════════════════════════════════════════════════════════
// ── Interfaces ──
// ════════════════════════════════════════════════════════════

export interface ExtractedPerson {
  fullName: string;
  email: string;
  phone: string;
  cedula: string;
  address: string;
  usernames: string[];
  ips: string[];
  urls: string[];
  companies: string[];
  rawLine: string;
  lineNumber: number;
  confidence: 'alta' | 'media' | 'baja';
}

export interface TXTAnalysisResult {
  format: 'key_value' | 'delimited' | 'free_text' | 'log_dump' | 'mixed';
  totalLines: number;
  totalEntities: {
    names: number;
    emails: number;
    phones: number;
    cedulas: number;
    ips: number;
    urls: number;
    usernames: number;
    addresses: number;
    companies: number;
  };
  persons: ExtractedPerson[];
  unlinkedEntities: {
    ips: string[];
    urls: string[];
    usernames: string[];
    emails: string[];
    companies: string[];
  };
  intelligenceSummary: string;
}

// ════════════════════════════════════════════════════════════
// ── Regex Patterns ──
// ════════════════════════════════════════════════════════════

const EMAIL_REGEX = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;

// Colombian phone: +57, 57, or local 10-digit starting with 3 (mobile) or 60 (landline)
const PHONE_REGEX = /(?:\+?57[\s.\-]?)?(?:3[0-9]{2}[\s.\-]?\d{3}[\s.\-]?\d{2}[\s.\-]?\d{2}|6[0-9]{2}[\s.\-]?\d{3}[\s.\-]?\d{2,4})/g;

// Cédula colombiana: 6-10 dígitos opcionalmente con guion y dígito verificador
const CEDULA_REGEX = /\b(?!000|192|127|10\.\d|172\.\d|198\.\d)(\d{6,10}(?:\s*[-]\s*\d{1,2})?)\b/g;

// IP Address (v4)
const IP_REGEX = /\b(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\b/g;

// URL
const URL_REGEX = /https?:\/\/[^\s<>"'{}|\\^`\[\]]+/gi;

// Username / alias (@username) — excludes email @ patterns
const USERNAME_REGEX = /(?:^|[\s,;|])(@([a-zA-Z0-9_]{3,30}))(?![@.\w]*\.\w{2,})/g;

// Colombian address patterns
const ADDRESS_REGEX = /(?:Calle|Cra|Carrera|Diagonal|Diag|Transversal|Trans|Av|Avenida|Autopista|Camino|Vereda|Barrio|Municipio|Urbanización|Kra|Cl|Dg|Tv|Ak)\s*\.?\s*\d+[a-zA-Z]?\s*[\-#]?\s*\d*[a-zA-Z]?(?:\s*[-,]\s*\d+)?(?:\s+(?:Sur|Norte|Este|Oeste|Bis|BIS))?(?:[,.\s]+(?:Apartamento|Apto|Ap|Casa|Bloque|Torre|Piso|Local|Oficina|Int)\s*\.?\s*\d+)?/gi;

// Company name patterns (S.A., Ltda, & Cía, etc.)
const COMPANY_REGEX = /[A-ZÁÉÍÓÚÑ][a-záéíóúñA-Z\s&]+(?:S\.?\s*A\.?|LTDA|Ltda|S\.?\s*A\.?S\.?|&\s*(?:Cía|Cia|Co|Hijos)|SUCESORES|E\.?U\.?|E\.?S\.?P\.?|FUNDACIÓN|Fundación|ASOCIACIÓN|Asociación|COOPERATIVA|Cooperativa)(?:\s+[A-ZÁÉÍÓÚÑa-záéíóúñ]+)*/g;

// Colombian city/department names for address context
const COLOMBIAN_LOCATIONS = [
  'Bogotá', 'Medellín', 'Cali', 'Barranquilla', 'Cartagena', 'Cúcuta',
  'Bucaramanga', 'Pereira', 'Santa Marta', 'Ibagué', 'Manizales',
  'Villavicencio', 'Pasto', 'Montería', 'Neiva', 'Armenia', 'Popayán',
  'Sincelejo', 'Valledupar', 'Tunja', 'Florencia', 'Riohacha', 'Quibdó',
  'Mocoa', 'Yopal', 'Arauca', 'Leticia', 'San José', 'Mitu', 'Inírida',
  'Puerto Carreño', 'San Andrés', 'Amazonas', 'Antioquia', 'Arauca',
  'Atlántico', 'Bolívar', 'Boyacá', 'Caldas', 'Caquetá', 'Casanare',
  'Cauca', 'Cesar', 'Chocó', 'Córdoba', 'Cundinamarca', 'Guainía',
  'Guaviare', 'Huila', 'La Guajira', 'Magdalena', 'Meta', 'Nariño',
  'Norte de Santander', 'Putumayo', 'Quindío', 'Risaralda',
  'San Andrés', 'Santander', 'Sucre', 'Tolima', 'Valle del Cauca',
  'Vaupés', 'Vichada',
];

// ── Name extraction patterns ──
// Colombian names: typically 2-4 words, first letter uppercase
// Must be filtered against common false positives
const FALSE_NAME_WORDS = new Set([
  'the', 'and', 'for', 'not', 'you', 'all', 'can', 'had', 'her',
  'was', 'one', 'our', 'out', 'are', 'has', 'been', 'have', 'its',
  'who', 'will', 'each', 'make', 'like', 'been', 'long', 'look',
  'many', 'some', 'them', 'than', 'this', 'that', 'with', 'from',
  'they', 'would', 'about', 'which', 'their', 'there', 'could',
  'other', 'after', 'first', 'these', 'click', 'more', 'info',
  'date', 'time', 'type', 'note', 'text', 'item', 'code', 'name',
  'data', 'file', 'user', 'page', 'list', 'form', 'case', 'null',
  'true', 'false', 'none', 'void', 'este', 'esta', 'esto', 'esta',
  'para', 'por', 'con', 'sin', 'sobre', 'entre', 'hacia', 'hasta',
  'desde', 'como', 'pero', 'mas', 'tambien', 'aunque', 'donde',
  'cuando', 'porque', 'aqui', 'alli', 'muy', 'bien', 'todo',
  'cada', 'algo', 'nada', 'otro', 'otros', 'misma', 'mismo',
  'donde', 'puede', 'son', 'era', 'fueron', 'ser', 'tiene',
  'puede', 'hace', 'hacer', 'forma', 'parte', 'numero', 'valor',
  'total', 'resultado', 'informacion', 'numero', 'general',
  'colombia', 'bogota', 'medellin', 'cali', 'centro', 'sur',
  'norte', 'occidente', 'oriente', 'primero', 'segundo', 'tercero',
  'fecha', 'hora', 'dia', 'mes', 'ano', 'enero', 'febrero',
  'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto',
  'septiembre', 'octubre', 'noviembre', 'diciembre',
]);

// Key-value field patterns for name extraction
const NAME_FIELD_PATTERNS = [
  'nombre_completo', 'fullname', 'full_name', 'nombre', 'name',
  'razon_social', 'empresa', 'company', 'persona', 'sujeto',
  'investigado', 'contacto_nombre', 'nombres', 'apellidos',
  'propietario', 'representante', 'titular', 'responsable',
  'solicitante', 'requerido', 'afectado', 'denunciado',
  'denunciante', 'demandado', 'demandante', 'implicado',
  'receptor', 'remitente', 'destinatario', 'beneficiario',
  'vinculado', 'relacionado', 'sosp', 'sospechoso',
];

const EMAIL_FIELD_PATTERNS = [
  'correo', 'email', 'e_mail', 'mail', 'correo_electronico',
  'email_principal', 'email_contacto',
];

const PHONE_FIELD_PATTERNS = [
  'telefono', 'phone', 'celular', 'mobile', 'tel',
  'telefono_celular', 'telefono_fijo', 'whatsapp',
  'contacto_telefonico',
];

const CEDULA_FIELD_PATTERNS = [
  'cedula', 'nit', 'documento', 'identificacion', 'id', 'cc',
  'numero_documento', 'dni', 'cedula_ciudadania', 'rut', 'nif',
  'cedula_asociada', 'ip_asociada',
];

const ADDRESS_FIELD_PATTERNS = [
  'direccion', 'address', 'ubicacion', 'location', 'dir',
  'residencia', 'domicilio', 'habita',
];

const USERNAME_FIELD_PATTERNS = [
  'usuario', 'username', 'alias', 'nickname', 'nick', 'login',
  'cuenta', 'perfil', 'handle',
];

// ════════════════════════════════════════════════════════════
// ── Format Detection ──
// ════════════════════════════════════════════════════════════

function detectFormat(text: string): TXTAnalysisResult['format'] {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length === 0) return 'free_text';

  // Check for key-value pattern (field: value or field = value)
  const kvLines = lines.filter(l => /^[a-zA-ZáéíóúñÁÉÍÓÚÑ_\s]+[:=]\s*.+/i.test(l.trim()));
  if (kvLines.length / lines.length > 0.5) return 'key_value';

  // Check for delimited format (consistent separator)
  const commaCount = lines.filter(l => l.includes(',')).length;
  const pipeCount = lines.filter(l => l.includes('|')).length;
  const tabCount = lines.filter(l => l.includes('\t')).length;
  const semiCount = lines.filter(l => l.includes(';')).length;

  const total = lines.length;
  if (commaCount / total > 0.6 || pipeCount / total > 0.6 ||
      tabCount / total > 0.6 || semiCount / total > 0.6) {
    return 'delimited';
  }

  // Check for log/dump format (timestamps, IP addresses, structured entries)
  const logLines = lines.filter(l =>
    /\d{4}[-/]\d{2}[-/]\d{2}/.test(l) ||  // dates
    /\d{2}:\d{2}:\d{2}/.test(l) ||          // timestamps
    /\[\d+\]/.test(l)                         // bracketed IDs
  );
  if (logLines.length / total > 0.4) return 'log_dump';

  return 'free_text';
}

// ════════════════════════════════════════════════════════════
// ── Entity Extraction Functions ──
// ════════════════════════════════════════════════════════════

function extractEmails(text: string): string[] {
  const matches = text.match(EMAIL_REGEX);
  return matches ? [...new Set(matches)] : [];
}

function extractPhones(text: string): string[] {
  const matches = text.match(PHONE_REGEX);
  if (!matches) return [];
  // Clean and validate
  const cleaned = matches.map(p =>
    p.replace(/[\s.\-]/g, '').replace(/^\+?57/, '')
  ).filter(p => /^\d{7,10}$/.test(p));
  return [...new Set(cleaned)];
}

function extractCedulas(text: string): string[] {
  const matches = text.match(CEDULA_REGEX);
  if (!matches) return [];
  // Filter out obvious non-cedulas (IP octets, years, common numbers)
  const filtered = matches.filter(m => {
    const digits = m.replace(/[\s\-]/g, '');
    // Must be 6-12 digits
    if (!/^\d{6,12}$/.test(digits)) return false;
    // Not a year
    const num = parseInt(digits);
    if (num >= 1900 && num <= 2100) return false;
    // Not an IP-like sequence
    if (/^\d{1,3}\.\d{1,3}/.test(m)) return false;
    return true;
  });
  return [...new Set(filtered)];
}

function extractIPs(text: string): string[] {
  const matches = text.match(IP_REGEX);
  if (!matches) return [];
  // Filter out private/reserved IPs
  const publicIPs = matches.filter(ip => {
    const parts = ip.split('.').map(Number);
    if (parts[0] === 10) return false;
    if (parts[0] === 127) return false;
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return false;
    if (parts[0] === 192 && parts[1] === 168) return false;
    if (parts[0] === 0) return false;
    if (parts[0] === 169 && parts[1] === 254) return false;
    return true;
  });
  return [...new Set(publicIPs)];
}

function extractURLs(text: string): string[] {
  const matches = text.match(URL_REGEX);
  return matches ? [...new Set(matches.map(u => u.replace(/[.,;:]+$/, '')))] : [];
}

function extractUsernames(text: string): string[] {
  const results: string[] = [];
  const regex = new RegExp(USERNAME_REGEX.source, USERNAME_REGEX.flags);
  let match;
  while ((match = regex.exec(text)) !== null) {
    const username = match[1]; // includes the @
    const name = match[2]; // without the @
    if (name.length >= 3 && !FALSE_NAME_WORDS.has(name.toLowerCase())) {
      // Skip if it looks like an email domain (e.g. @gmail, @hotmail, @yahoo)
      // These are email providers, not usernames
      const emailDomains = ['gmail', 'hotmail', 'yahoo', 'outlook', 'live', 'icloud', 'aol', 'proton', 'mail', 'zoho'];
      if (!emailDomains.includes(name.toLowerCase())) {
        results.push(username);
      }
    }
  }

  // Also extract email usernames (the part before @ from email addresses)
  // e.g. from juanperez@gmail.com → @juanperez as a username
  const emails = text.match(EMAIL_REGEX);
  if (emails) {
    for (const email of emails) {
      const localPart = email.split('@')[0];
      if (localPart.length >= 3 && !/^\d+$/.test(localPart)) {
        const usernameFromEmail = `@${localPart}`;
        if (!results.includes(usernameFromEmail)) {
          results.push(usernameFromEmail);
        }
      }
    }
  }

  return [...new Set(results)];
}

function extractAddresses(text: string): string[] {
  const matches = text.match(ADDRESS_REGEX);
  return matches ? [...new Set(matches)] : [];
}

function extractCompanies(text: string): string[] {
  const matches = text.match(COMPANY_REGEX);
  if (!matches) return [];
  // Clean and deduplicate
  const cleaned = matches
    .map(c => c.trim())
    .filter(c => c.length >= 5);
  return [...new Set(cleaned)];
}

// ── Name extraction ──
// Strategy: Look for sequences of 2-4 capitalized words that look like names
function extractNamesFromFreeText(text: string): string[] {
  const names: string[] = [];
  const lines = text.split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Skip lines that look like labels, headers, or metadata
    if (/^[a-záéíóúñ]/.test(trimmed)) continue;
    if (trimmed.length < 5 || trimmed.length > 100) continue;
    if (/^\d+$/.test(trimmed)) continue;
    if (/^[\-=*#>{]/.test(trimmed)) continue;

    // Extract sequences of 2-4 capitalized words
    const namePattern = /\b([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+){1,3})\b/g;
    let match;
    while ((match = namePattern.exec(trimmed)) !== null) {
      const candidate = match[1];
      const words = candidate.split(/\s+/);

      // Validate: at least 2 words, each 2+ chars, not false positive
      if (words.length < 2) continue;
      if (words.some(w => w.length < 2 || FALSE_NAME_WORDS.has(w.toLowerCase()))) continue;

      // Must have at least one word that looks like a common Spanish name/surname
      const looksLikeName = words.some(w => {
        const lower = w.toLowerCase();
        // Common Colombian name/surname indicators
        const commonSurnames = [
          'garcia', 'rodriguez', 'martinez', 'lopez', 'gonzalez', 'hernandez',
          'diaz', 'perez', 'torres', 'ramirez', 'flores', 'rivera', 'gomez',
          'morales', 'ortiz', 'sanchez', 'castro', 'romero', 'munoz', 'rojas',
          'jimenez', 'ruiz', 'alvarez', 'mendoza', 'castillo', 'moreno',
          'herrera', 'medina', 'vargas', 'delgado', 'guerra', 'ospina',
          'restrepo', 'aristizabal', 'cardona', 'sierra', 'velez', 'arias',
          'cano', 'correa', 'duque', 'escobar', 'figueroa', 'gaviria',
          'henao', 'jaramillo', 'londoño', 'mejia', 'montoya', 'ossa',
          'palacio', 'quintero', 'ramirez', 'salazar', 'tamayo', 'uribe',
          'valencia', 'zapata', 'marin', 'cortes', 'agudelo', 'bernal',
          'cifuentes', 'duarte', 'espinosa', 'franco', 'galvis', 'holguin',
          'ibarra', 'juarez', 'karten', 'leon', 'martin', 'naranjo',
          'otero', 'pardo', 'quiroz', 'reyes', 'suarez', 'trujillo',
          'umaña', 'villamil', 'yarce', 'zuluaga',
        ];
        return commonSurnames.includes(lower);
      });

      if (looksLikeName || words.length >= 3) {
        names.push(candidate);
      }
    }
  }

  return [...new Set(names)];
}

// ════════════════════════════════════════════════════════════
// ── Key-Value Parser ──
// ════════════════════════════════════════════════════════════

function parseKeyValueFormat(text: string): ExtractedPerson[] {
  const persons: ExtractedPerson[] = [];
  const lines = text.split(/\r?\n/).filter(l => l.trim());

  interface KVRecord {
    [key: string]: string;
  }

  const records: KVRecord[] = [];
  let currentRecord: KVRecord = {};

  for (const line of lines) {
    const kvMatch = line.match(/^([a-zA-ZáéíóúñÁÉÍÓÚÑ_\s]+?)[:=]\s*(.+)$/);
    if (kvMatch) {
      const key = kvMatch[1].trim().toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // remove accents for matching
        .replace(/[^a-z0-9_]/g, '_');
      const value = kvMatch[2].trim();
      currentRecord[key] = value;
    } else if (line.trim() === '' || /^[-=]{3,}$/.test(line.trim())) {
      // Separator — save current record and start new one
      if (Object.keys(currentRecord).length > 0) {
        records.push(currentRecord);
        currentRecord = {};
      }
    }
  }
  if (Object.keys(currentRecord).length > 0) {
    records.push(currentRecord);
  }

  for (const record of records) {
    const person = extractPersonFromKV(record);
    if (person.fullName || person.email || person.phone || person.cedula) {
      persons.push(person);
    }
  }

  return persons;
}

function extractPersonFromKV(record: Record<string, string>): ExtractedPerson {
  const getFieldValue = (patterns: string[]): string => {
    for (const key of Object.keys(record)) {
      const keyLower = key.toLowerCase().replace(/[^a-z0-9_]/g, '_');
      for (const pattern of patterns) {
        if (keyLower.includes(pattern) && record[key]?.trim()) {
          return record[key].trim();
        }
      }
    }
    return '';
  };

  // Priority name patterns — person names (higher priority)
  const PERSON_NAME_PATTERNS = [
    'nombre_completo', 'fullname', 'full_name', 'nombre', 'name',
    'persona', 'sujeto', 'investigado', 'contacto_nombre',
    'nombres', 'apellidos', 'propietario', 'representante',
    'titular', 'responsable', 'solicitante', 'requerido',
    'afectado', 'denunciado', 'denunciante', 'demandado',
    'demandante', 'implicado', 'receptor', 'remitente',
    'destinatario', 'beneficiario', 'vinculado', 'relacionado',
    'sospechoso',
  ];
  // Fallback name patterns — company names (lower priority, only if no person name found)
  const COMPANY_NAME_PATTERNS = ['razon_social', 'empresa', 'company'];

  const fullName = getFieldValue(PERSON_NAME_PATTERNS) || getFieldValue(COMPANY_NAME_PATTERNS);
  const email = getFieldValue(EMAIL_FIELD_PATTERNS);
  const phone = getFieldValue(PHONE_FIELD_PATTERNS);
  const cedula = getFieldValue(CEDULA_FIELD_PATTERNS);
  const address = getFieldValue(ADDRESS_FIELD_PATTERNS);
  const username = getFieldValue(USERNAME_FIELD_PATTERNS);

  // Also extract regex-based entities from all field values
  const allValues = Object.values(record).join(' ');
  const ips = extractIPs(allValues);
  const urls = extractURLs(allValues);
  const companies = extractCompanies(allValues);
  let usernames: string[] = username ? [username.startsWith('@') ? username : `@${username}`] : [];
  // Also extract @username patterns from values
  const extractedUsernames = extractUsernames(allValues);
  for (const u of extractedUsernames) {
    if (!usernames.includes(u)) usernames.push(u);
  }
  // Also add email username (local part before @) as a username
  if (email && email.includes('@')) {
    const localPart = email.split('@')[0];
    if (localPart.length >= 3 && !/^\d+$/.test(localPart)) {
      const emailUsername = `@${localPart}`;
      if (!usernames.includes(emailUsername)) usernames.push(emailUsername);
    }
  }

  const hasData = !!(fullName || email || phone || cedula);
  const dataPoints = [fullName, email, phone, cedula].filter(Boolean).length;
  const confidence: ExtractedPerson['confidence'] =
    dataPoints >= 3 ? 'alta' : dataPoints >= 2 ? 'media' : 'baja';

  return {
    fullName: fullName || '',
    email: email || '',
    phone: phone || '',
    cedula: cedula || '',
    address: address || '',
    usernames,
    ips,
    urls,
    companies,
    rawLine: Object.entries(record).map(([k, v]) => `${k}: ${v}`).join(' | '),
    lineNumber: 0,
    confidence,
  };
}

// ════════════════════════════════════════════════════════════
// ── Delimited Parser ──
// ════════════════════════════════════════════════════════════

function parseDelimitedFormat(text: string): ExtractedPerson[] {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return [];

  // Detect delimiter
  const firstLine = lines[0];
  let delimiter = ',';
  if (firstLine.split(';').length > firstLine.split(',').length) delimiter = ';';
  if (firstLine.split('\t').length > firstLine.split(delimiter).length) delimiter = '\t';
  if (firstLine.split('|').length > firstLine.split(delimiter).length) delimiter = '|';

  const headers = firstLine.split(delimiter).map(h => h.trim().replace(/^["']|["']$/g, ''));
  const persons: ExtractedPerson[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(delimiter).map(v => v.trim().replace(/^["']|["']$/g, ''));
    const row: Record<string, string> = {};
    headers.forEach((header, idx) => {
      row[header || `Columna_${idx + 1}`] = values[idx] || '';
    });

    const person = extractPersonFromKV(row);
    person.lineNumber = i + 1;
    person.rawLine = lines[i];
    if (person.fullName || person.email || person.phone || person.cedula) {
      persons.push(person);
    }
  }

  return persons;
}

// ════════════════════════════════════════════════════════════
// ── Free Text / Log Parser ──
// ════════════════════════════════════════════════════════════

function parseFreeTextOrLog(text: string): ExtractedPerson[] {
  const persons: ExtractedPerson[] = [];
  const lines = text.split(/\r?\n/);

  // ── Strategy: Extract all entities, then group by proximity ──

  // 1. Extract all entities from the full text
  const allEmails = extractEmails(text);
  const allPhones = extractPhones(text);
  const allCedulas = extractCedulas(text);
  const allIPs = extractIPs(text);
  const allURLs = extractURLs(text);
  const allUsernames = extractUsernames(text);
  const allAddresses = extractAddresses(text);
  const allCompanies = extractCompanies(text);
  const allNames = extractNamesFromFreeText(text);

  // 2. Group entities by line proximity
  // If a name and email/phone appear on the same or adjacent lines, they likely belong to the same person
  const lineEntityMap = new Map<number, {
    names: string[];
    emails: string[];
    phones: string[];
    cedulas: string[];
    ips: string[];
    urls: string[];
    usernames: string[];
    addresses: string[];
    companies: string[];
  }>();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineEmails = extractEmails(line);
    const linePhones = extractPhones(line);
    const lineCedulas = extractCedulas(line);
    const lineIPs = extractIPs(line);
    const lineURLs = extractURLs(line);
    const lineUsernames = extractUsernames(line);
    const lineAddresses = extractAddresses(line);
    const lineCompanies = extractCompanies(line);
    const lineNames = extractNamesFromFreeText(line);

    if (lineEmails.length || linePhones.length || lineCedulas.length || lineNames.length) {
      lineEntityMap.set(i, {
        names: lineNames,
        emails: lineEmails,
        phones: linePhones,
        cedulas: lineCedulas,
        ips: lineIPs,
        urls: lineURLs,
        usernames: lineUsernames,
        addresses: lineAddresses,
        companies: lineCompanies,
      });
    }
  }

  // 3. Merge adjacent lines into person records
  const visited = new Set<number>();
  const personGroups: Array<{
    names: Set<string>;
    emails: Set<string>;
    phones: Set<string>;
    cedulas: Set<string>;
    ips: Set<string>;
    urls: Set<string>;
    usernames: Set<string>;
    addresses: Set<string>;
    companies: Set<string>;
    lineNumbers: number[];
  }> = [];

  for (const [lineNum] of lineEntityMap) {
    if (visited.has(lineNum)) continue;

    // Start a new group with this line and adjacent lines (±2 lines)
    const group = {
      names: new Set<string>(),
      emails: new Set<string>(),
      phones: new Set<string>(),
      cedulas: new Set<string>(),
      ips: new Set<string>(),
      urls: new Set<string>(),
      usernames: new Set<string>(),
      addresses: new Set<string>(),
      companies: new Set<string>(),
      lineNumbers: [] as number[],
    };

    // Collect entities from this line and nearby lines
    for (let offset = -2; offset <= 2; offset++) {
      const nearbyLine = lineNum + offset;
      const entities = lineEntityMap.get(nearbyLine);
      if (entities) {
        visited.add(nearbyLine);
        group.lineNumbers.push(nearbyLine);
        entities.names.forEach(n => group.names.add(n));
        entities.emails.forEach(e => group.emails.add(e));
        entities.phones.forEach(p => group.phones.add(p));
        entities.cedulas.forEach(c => group.cedulas.add(c));
        entities.ips.forEach(ip => group.ips.add(ip));
        entities.urls.forEach(u => group.urls.add(u));
        entities.usernames.forEach(u => group.usernames.add(u));
        entities.addresses.forEach(a => group.addresses.add(a));
        entities.companies.forEach(c => group.companies.add(c));
      }
    }

    if (group.names.size > 0 || group.emails.size > 0 || group.phones.size > 0 || group.cedulas.size > 0) {
      personGroups.push(group);
    }
  }

  // 4. Convert groups to ExtractedPerson objects
  for (const group of personGroups) {
    const fullName = Array.from(group.names)[0] || '';

    // Assign emails/phones/cedulas — take the first of each if multiple
    const email = Array.from(group.emails)[0] || '';
    const phone = Array.from(group.phones)[0] || '';
    const cedula = Array.from(group.cedulas)[0] || '';
    const address = Array.from(group.addresses)[0] || '';

    const dataPoints = [fullName, email, phone, cedula].filter(Boolean).length;
    const confidence: ExtractedPerson['confidence'] =
      dataPoints >= 3 ? 'alta' : dataPoints >= 2 ? 'media' : 'baja';

    persons.push({
      fullName,
      email,
      phone,
      cedula,
      address,
      usernames: Array.from(group.usernames),
      ips: Array.from(group.ips),
      urls: Array.from(group.urls),
      companies: Array.from(group.companies),
      rawLine: group.lineNumbers.map(n => lines[n]?.trim()).filter(Boolean).join(' | '),
      lineNumber: group.lineNumbers[0] + 1,
      confidence,
    });
  }

  // 5. Handle unlinked entities — create persons from standalone emails/phones
  const linkedEmails = new Set(persons.flatMap(p => [p.email, ...extractEmails(p.rawLine)]).filter(Boolean));
  const linkedPhones = new Set(persons.flatMap(p => [p.phone, ...extractPhones(p.rawLine)]).filter(Boolean));

  for (const email of allEmails) {
    if (!linkedEmails.has(email)) {
      // Extract email username (local part) as a username
      const localPart = email.split('@')[0];
      const emailUsernames: string[] = [];
      if (localPart.length >= 3 && !/^\d+$/.test(localPart)) {
        emailUsernames.push(`@${localPart}`);
      }
      persons.push({
        fullName: localPart.replace(/[._]/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
        email,
        phone: '',
        cedula: '',
        address: '',
        usernames: emailUsernames,
        ips: [],
        urls: [],
        companies: [],
        rawLine: `Email independiente: ${email}`,
        lineNumber: 0,
        confidence: 'baja',
      });
    }
  }

  for (const phone of allPhones) {
    if (!linkedPhones.has(phone)) {
      persons.push({
        fullName: `Tel: ${phone}`,
        email: '',
        phone,
        cedula: '',
        address: '',
        usernames: [],
        ips: [],
        urls: [],
        companies: [],
        rawLine: `Teléfono independiente: ${phone}`,
        lineNumber: 0,
        confidence: 'baja',
      });
    }
  }

  return persons;
}

// ════════════════════════════════════════════════════════════
// ── Main Analysis Function ──
// ════════════════════════════════════════════════════════════

export function analyzeTXT(text: string): TXTAnalysisResult {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  const format = detectFormat(text);

  let persons: ExtractedPerson[] = [];

  switch (format) {
    case 'key_value':
      persons = parseKeyValueFormat(text);
      break;
    case 'delimited':
      persons = parseDelimitedFormat(text);
      // Also run free text extraction for entities not in the table
      const freeTextPersons = parseFreeTextOrLog(text);
      // Merge: add entities only found in free text that aren't in delimited
      const delimitedEmails = new Set(persons.flatMap(p => extractEmails(p.rawLine)));
      const delimitedPhones = new Set(persons.flatMap(p => extractPhones(p.rawLine)));
      for (const ftp of freeTextPersons) {
        if (!delimitedEmails.has(ftp.email) && !delimitedPhones.has(ftp.phone)) {
          persons.push(ftp);
        }
      }
      break;
    case 'free_text':
    case 'log_dump':
    case 'mixed':
    default:
      persons = parseFreeTextOrLog(text);
      break;
  }

  // Remove duplicate persons (by name + email + phone combo)
  const seen = new Set<string>();
  persons = persons.filter(p => {
    const key = `${p.fullName}|${p.email}|${p.phone}|${p.cedula}`.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Cap at 30 persons
  persons = persons.slice(0, 30);

  // Count all entities
  const allEmails = extractEmails(text);
  const allPhones = extractPhones(text);
  const allCedulas = extractCedulas(text);
  const allIPs = extractIPs(text);
  const allURLs = extractURLs(text);
  const allUsernames = extractUsernames(text);
  const allAddresses = extractAddresses(text);
  const allCompanies = extractCompanies(text);

  // Collect unlinked entities
  const linkedEmails = new Set(persons.flatMap(p => [p.email, ...extractEmails(p.rawLine)]).filter(Boolean));
  const linkedIPs = new Set(persons.flatMap(p => p.ips));
  const linkedURLs = new Set(persons.flatMap(p => p.urls));
  const linkedUsernames = new Set(persons.flatMap(p => p.usernames));
  const linkedCompanies = new Set(persons.flatMap(p => p.companies));

  const unlinkedIPs = allIPs.filter(ip => !linkedIPs.has(ip));
  const unlinkedURLs = allURLs.filter(url => !linkedURLs.has(url));
  const unlinkedUsernames = allUsernames.filter(u => !linkedUsernames.has(u));
  const unlinkedEmails = allEmails.filter(e => !linkedEmails.has(e));
  const unlinkedCompanies = allCompanies.filter(c => !linkedCompanies.has(c));

  // Generate intelligence summary
  const highConfPersons = persons.filter(p => p.confidence === 'alta').length;
  const medConfPersons = persons.filter(p => p.confidence === 'media').length;
  const lowConfPersons = persons.filter(p => p.confidence === 'baja').length;

  const summaryParts: string[] = [];
  summaryParts.push(`Formato detectado: ${format.replace('_', ' ')}`);
  summaryParts.push(`${lines.length} líneas analizadas`);
  summaryParts.push(`${persons.length} sujetos identificados (${highConfPersons} alta, ${medConfPersons} media, ${lowConfPersons} baja confianza)`);
  if (allEmails.length) summaryParts.push(`${allEmails.length} correos electrónicos`);
  if (allPhones.length) summaryParts.push(`${allPhones.length} números telefónicos`);
  if (allCedulas.length) summaryParts.push(`${allCedulas.length} documentos de identidad`);
  if (allIPs.length) summaryParts.push(`${allIPs.length} direcciones IP públicas`);
  if (allURLs.length) summaryParts.push(`${allURLs.length} URLs`);
  if (allUsernames.length) summaryParts.push(`${allUsernames.length} usuarios/aliases`);
  if (allAddresses.length) summaryParts.push(`${allAddresses.length} direcciones físicas`);
  if (allCompanies.length) summaryParts.push(`${allCompanies.length} empresas mencionadas`);
  if (unlinkedIPs.length) summaryParts.push(`${unlinkedIPs.length} IPs sin vincular a persona`);
  if (unlinkedURLs.length) summaryParts.push(`${unlinkedURLs.length} URLs sin vincular a persona`);

  const intelligenceSummary = summaryParts.join('. ') + '.';

  return {
    format,
    totalLines: lines.length,
    totalEntities: {
      names: persons.filter(p => p.fullName && p.fullName !== p.email && !p.fullName.startsWith('Tel:')).length,
      emails: allEmails.length,
      phones: allPhones.length,
      cedulas: allCedulas.length,
      ips: allIPs.length,
      urls: allURLs.length,
      usernames: allUsernames.length,
      addresses: allAddresses.length,
      companies: allCompanies.length,
    },
    persons,
    unlinkedEntities: {
      ips: unlinkedIPs,
      urls: unlinkedURLs,
      usernames: unlinkedUsernames,
      emails: unlinkedEmails,
      companies: unlinkedCompanies,
    },
    intelligenceSummary,
  };
}
