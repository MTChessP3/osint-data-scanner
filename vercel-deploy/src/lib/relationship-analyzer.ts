import * as xlsx from 'xlsx';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Relationship {
  type:
    | 'empresarial'
    | 'laboral'
    | 'personal'
    | 'familiar'
    | 'coincidencia_documento'
    | 'coincidencia_contacto'
    | 'coincidencia_ubicacion';
  person1: { name: string; sheet: string; row: number; data: Record<string, string> };
  person2: { name: string; sheet: string; row: number; data: Record<string, string> };
  sharedData: string;
  confidence: 'alta' | 'media' | 'baja';
  details: string;
}

export interface RelationshipAnalysisResult {
  sheetNames: string[];
  totalRecordsSheet1: number;
  totalRecordsSheet2: number;
  relationships: Relationship[];
  summary: {
    empresariales: number;
    laborales: number;
    personales: number;
    familiares: number;
    porDocumento: number;
    porContacto: number;
    porUbicacion: number;
  };
}

// ─── Normalized Record ────────────────────────────────────────────────────────

interface NormalizedRecord {
  name: string;
  cedula: string;
  email: string;
  phone: string;
  company: string;
  nit: string;
  address: string;
  city: string;
  position: string;
  raw: Record<string, string>;
  sheet: string;
  row: number;
}

// ─── Column Name Mapping ──────────────────────────────────────────────────────

const COLUMN_ALIASES: Record<string, string[]> = {
  name: [
    'nombre', 'nombre completo', 'nombrecompleto', 'nombres',
    'name', 'full name', 'fullname', 'full_name',
    'nombre y apellido', 'nombrerazon social', 'razon social',
    'razonsocial', 'razón social', 'representante legal',
    'titular', 'solicitante', 'propietario',
  ],
  cedula: [
    'cedula', 'cédula', 'cedula de ciudadania', 'cedula de identidad',
    'cedulaciudadania', 'cc', 'documento', 'numero de documento',
    'numerodocumento', 'nro documento', 'nro. documento',
    'nit/cc', 'dni', 'identificacion', 'identificación',
    'num documento', 'no documento', 'no. documento',
    'doc identidad', 'documento de identidad', 'rut',
    'número de documento', 'num_identificacion',
  ],
  email: [
    'correo', 'correo electronico', 'correoelectronico',
    'email', 'e-mail', 'mail', 'correo electrónico',
    'email address', 'direccion correo', 'dirección correo',
  ],
  phone: [
    'telefono', 'teléfono', 'telefonocelular', 'celular',
    'phone', 'tel', 'telefono fijo', 'telefono celular',
    'mobile', 'cell', 'cellphone', 'telefono movil',
    'nro telefono', 'número telefono', 'numero telefono',
    'contacto', 'telefono contacto', 'tel contacto',
  ],
  company: [
    'empresa', 'compania', 'compañía', 'company',
    'empleador', 'empleadora', 'organizacion', 'organización',
    'entidad', 'institucion', 'institución', 'empresa nombre',
    'nombre empresa', 'firmarazon social', 'razon social empresa',
    'sociedad', 'negocio', 'establecimiento',
  ],
  nit: [
    'nit', 'nit empresa', 'numero nit', 'nro nit',
    'tax id', 'taxid', 'ruc', 'registro unico',
  ],
  address: [
    'direccion', 'dirección', 'direccion de residencia',
    'direccion domicilio', 'domicilio', 'address',
    'direccion completa', 'dir', 'ubicacion', 'ubicación',
    'residencia', 'domicilio fiscal',
  ],
  city: [
    'ciudad', 'city', 'municipio', 'localidad',
    'departamento', 'provincia', 'region', 'región',
  ],
  position: [
    'cargo', 'posición', 'posicion', 'position',
    'titulo', 'título', 'rol', 'puesto', 'ocupacion',
    'ocupación', 'profesion', 'profesión',
  ],
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Normalize a string for comparison: lowercase, trim, collapse whitespace. */
function normalize(str: string): string {
  return str
    .toString()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip diacritics
    .replace(/[^a-z0-9@.\s]/g, ' ') // keep alphanumeric, @, ., spaces
    .replace(/\s+/g, ' ')
    .trim();
}

/** Normalize a column header to one of our canonical keys. */
function mapColumnKey(header: string): string | null {
  const h = normalize(header).replace(/[^a-z0-9 ]/g, '');
  for (const [canonical, aliases] of Object.entries(COLUMN_ALIASES)) {
    for (const alias of aliases) {
      const a = normalize(alias).replace(/[^a-z0-9 ]/g, '');
      if (h === a || h.includes(a) || a.includes(h)) {
        return canonical;
      }
    }
  }
  return null;
}

/** Normalize a phone number: strip all non-digit characters, keep leading zeros for some formats. */
function normalizePhone(phone: string): string {
  return phone.replace(/[^0-9]/g, '');
}

/** Extract email domain (lowercased). */
function emailDomain(email: string): string {
  const parts = email.split('@');
  return parts.length > 1 ? parts[1].toLowerCase().trim() : '';
}

/** Check if an email domain is corporate (not free provider). */
const FREE_EMAIL_DOMAINS = new Set([
  'gmail.com', 'yahoo.com', 'yahoo.es', 'hotmail.com', 'hotmail.es',
  'outlook.com', 'outlook.es', 'live.com', 'live.es', 'aol.com',
  'icloud.com', 'me.com', 'mail.com', 'protonmail.com', 'proton.me',
  'zoho.com', 'yandex.com', 'gmx.com', 'inbox.com', 'mail.ru',
  'terra.com', 'terra.es', 'latinmail.com', 'mixmail.com',
  'telefonica.net', 'ono.com', 'wanadoo.es', 'eresmas.com',
]);

function isCorporateEmail(email: string): boolean {
  const domain = emailDomain(email);
  return domain.length > 0 && !FREE_EMAIL_DOMAINS.has(domain);
}

/**
 * Compute a similarity score between two names (0-1).
 * Uses token-set-similarity: splits names into word sets and compares.
 */
function nameSimilarity(nameA: string, nameB: string): number {
  const a = normalize(nameA).split(' ').filter(Boolean);
  const b = normalize(nameB).split(' ').filter(Boolean);

  if (a.length === 0 || b.length === 0) return 0;

  const setA = new Set(a);
  const setB = new Set(b);

  // Full match
  if (setA.size === setB.size) {
    let allMatch = true;
    for (const word of setA) {
      if (!setB.has(word)) { allMatch = false; break; }
    }
    if (allMatch) return 1.0;
  }

  // Count shared words
  let shared = 0;
  for (const word of setA) {
    if (setB.has(word)) shared++;
  }

  const maxLen = Math.max(setA.size, setB.size);
  return shared / maxLen;
}

/**
 * Check for possible family relationship by last name overlap.
 * In Spanish naming conventions, last names are typically the last 1-2 words.
 */
function sharedLastName(nameA: string, nameB: string): boolean {
  const aWords = normalize(nameA).split(' ').filter(Boolean);
  const bWords = normalize(nameB).split(' ').filter(Boolean);

  if (aWords.length < 2 || bWords.length < 2) return false;

  // Get the last 1-2 words as potential last names
  const aLastNames = aWords.slice(-2);
  const bLastNames = bWords.slice(-2);

  for (const ln of aLastNames) {
    for (const bln of bLastNames) {
      if (ln === bln && ln.length > 2) return true;
    }
  }
  return false;
}

/** Normalize address for comparison: lowercase, strip diacritics, collapse spaces, remove common suffixes. */
function normalizeAddress(addr: string): string {
  return normalize(addr)
    .replace(/\b(calle|cll|cl|cra|kr|carrera|av|avenida|diag|dg|diagonal|trans|transversal|no|nro|num|#|n°|apt|apto|apartamento|piso|bloque|torre|int|interior|of|oficina|ed|edificio|barrio|br|sector|urbanizacion|urb)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Compare two addresses for partial match. */
function addressMatch(addrA: string, addrB: string): boolean {
  const a = normalizeAddress(addrA);
  const b = normalizeAddress(addrB);

  if (!a || !b) return false;

  // Exact match after normalization
  if (a === b) return true;

  // One contains the other
  if (a.includes(b) || b.includes(a)) return true;

  // Check if they share significant tokens (at least 2 non-trivial words)
  const tokensA = a.split(' ').filter(t => t.length > 2);
  const tokensB = b.split(' ').filter(t => t.length > 2);

  if (tokensA.length >= 2 && tokensB.length >= 2) {
    let shared = 0;
    for (const t of tokensA) {
      if (tokensB.includes(t)) shared++;
    }
    if (shared >= 2) return true;
  }

  return false;
}

/** Normalize a cedula/document number: uppercase, strip dots/dashes/spaces. */
function normalizeDocument(doc: string): string {
  return doc
    .toString()
    .toUpperCase()
    .replace(/[\s.\-_,]/g, '')
    .trim();
}

/** Create a deduplication key for a relationship to avoid duplicates. */
function relationshipKey(r: Relationship): string {
  // Sort person keys so direction doesn't matter
  const k1 = `${r.person1.sheet}:${r.person1.row}`;
  const k2 = `${r.person2.sheet}:${r.person2.row}`;
  const [pk1, pk2] = k1 < k2 ? [k1, k2] : [k2, k1];
  return `${pk1}|${pk2}|${r.type}|${r.sharedData}`;
}

// ─── Core: Normalize Raw Row to Record ────────────────────────────────────────

function normalizeRow(rawRow: Record<string, unknown>, sheetName: string, rowIndex: number): NormalizedRecord {
  const strRow: Record<string, string> = {};
  for (const [k, v] of Object.entries(rawRow)) {
    strRow[k] = v != null ? String(v).trim() : '';
  }

  // Map raw columns to canonical fields
  const mapped: Record<string, string> = {};
  for (const [header, value] of Object.entries(strRow)) {
    const key = mapColumnKey(header);
    if (key && value) {
      // If the canonical key already has a value, keep the longer one (more informative)
      if (!mapped[key] || value.length > mapped[key].length) {
        mapped[key] = value;
      }
    }
  }

  return {
    name: mapped.name || '',
    cedula: mapped.cedula ? normalizeDocument(mapped.cedula) : '',
    email: mapped.email ? mapped.email.toLowerCase().trim() : '',
    phone: mapped.phone ? normalizePhone(mapped.phone) : '',
    company: mapped.company ? normalize(mapped.company) : '',
    nit: mapped.nit ? normalizeDocument(mapped.nit) : '',
    address: mapped.address || '',
    city: mapped.city ? normalize(mapped.city) : '',
    position: mapped.position || '',
    raw: strRow,
    sheet: sheetName,
    row: rowIndex,
  };
}

// ─── Cross-Sheet Relationship Detection ───────────────────────────────────────

function findCrossSheetRelationships(
  records1: NormalizedRecord[],
  records2: NormalizedRecord[],
  relationships: Relationship[],
  seen: Set<string>,
): void {
  for (const r1 of records1) {
    for (const r2 of records2) {
      // ── Exact name match ──
      if (r1.name && r2.name && normalize(r1.name) === normalize(r2.name)) {
        addRelationship(relationships, seen, {
          type: 'personal',
          person1: mkPerson(r1),
          person2: mkPerson(r2),
          sharedData: `Mismo nombre: "${r1.name}"`,
          confidence: 'alta',
          details: `La persona "${r1.name}" aparece en ambas hojas. Hoja1 fila ${r1.row}, Hoja2 fila ${r2.row}.`,
        });
      }
      // ── Partial name match (similarity >= 0.6 but not exact) ──
      else if (r1.name && r2.name) {
        const sim = nameSimilarity(r1.name, r2.name);
        if (sim >= 0.6 && sim < 1.0) {
          const hasSharedLN = sharedLastName(r1.name, r2.name);
          addRelationship(relationships, seen, {
            type: hasSharedLN ? 'familiar' : 'personal',
            person1: mkPerson(r1),
            person2: mkPerson(r2),
            sharedData: `Nombre similar: "${r1.name}" / "${r2.name}" (similitud: ${(sim * 100).toFixed(0)}%)`,
            confidence: sim >= 0.8 ? 'alta' : sim >= 0.7 ? 'media' : 'baja',
            details: hasSharedLN
              ? `Posible relación familiar: "${r1.name}" y "${r2.name}" comparten apellido y aparecen en diferentes hojas.`
              : `Nombres con similitud del ${(sim * 100).toFixed(0)}% en diferentes hojas. Posible misma persona o familiar.`,
          });
        }
      }

      // ── Shared email ──
      if (r1.email && r2.email && r1.email === r2.email) {
        addRelationship(relationships, seen, {
          type: 'coincidencia_contacto',
          person1: mkPerson(r1),
          person2: mkPerson(r2),
          sharedData: `Mismo correo: ${r1.email}`,
          confidence: 'alta',
          details: `"${r1.name}" y "${r2.name}" comparten el correo electrónico "${r1.email}".`,
        });
      }

      // ── Shared phone ──
      if (r1.phone && r2.phone && r1.phone === r2.phone && r1.phone.length >= 7) {
        addRelationship(relationships, seen, {
          type: 'coincidencia_contacto',
          person1: mkPerson(r1),
          person2: mkPerson(r2),
          sharedData: `Mismo teléfono: ${r1.phone}`,
          confidence: 'alta',
          details: `"${r1.name}" y "${r2.name}" comparten el número telefónico "${r1.phone}".`,
        });
      }

      // ── Shared cedula/document ──
      if (r1.cedula && r2.cedula && r1.cedula === r2.cedula) {
        addRelationship(relationships, seen, {
          type: 'coincidencia_documento',
          person1: mkPerson(r1),
          person2: mkPerson(r2),
          sharedData: `Misma cédula/documento: ${r1.cedula}`,
          confidence: 'alta',
          details: `"${r1.name}" y "${r2.name}" comparten el número de documento "${r1.cedula}".`,
        });
      }

      // ── Shared company/employer ──
      if (r1.company && r2.company && r1.company === r2.company) {
        addRelationship(relationships, seen, {
          type: 'empresarial',
          person1: mkPerson(r1),
          person2: mkPerson(r2),
          sharedData: `Misma empresa: ${r1.company}`,
          confidence: 'alta',
          details: `"${r1.name}" y "${r2.name}" están vinculados a la empresa "${r1.company}" (en diferentes hojas).`,
        });
      }

      // ── Shared NIT ──
      if (r1.nit && r2.nit && r1.nit === r2.nit) {
        addRelationship(relationships, seen, {
          type: 'empresarial',
          person1: mkPerson(r1),
          person2: mkPerson(r2),
          sharedData: `Mismo NIT: ${r1.nit}`,
          confidence: 'alta',
          details: `"${r1.name}" y "${r2.name}" comparten el NIT "${r1.nit}", lo que sugiere vínculo empresarial.`,
        });
      }

      // ── Shared address ──
      if (r1.address && r2.address && addressMatch(r1.address, r2.address)) {
        addRelationship(relationships, seen, {
          type: 'coincidencia_ubicacion',
          person1: mkPerson(r1),
          person2: mkPerson(r2),
          sharedData: `Dirección coincidente: "${r1.address}" / "${r2.address}"`,
          confidence: r1.address.toLowerCase() === r2.address.toLowerCase() ? 'alta' : 'media',
          details: `"${r1.name}" y "${r2.name}" tienen direcciones coincidentes entre las hojas.`,
        });
      }

      // ── Shared city (low confidence on its own, only add if other data is sparse) ──
      if (r1.city && r2.city && r1.city === r2.city && !r1.company && !r2.company) {
        // Only add city match if no company match exists (avoid noise)
        if (r1.email !== r2.email && r1.phone !== r2.phone && r1.cedula !== r2.cedula) {
          addRelationship(relationships, seen, {
            type: 'coincidencia_ubicacion',
            person1: mkPerson(r1),
            person2: mkPerson(r2),
            sharedData: `Misma ciudad: ${r1.city}`,
            confidence: 'baja',
            details: `"${r1.name}" y "${r2.name}" se encuentran en la misma ciudad "${r1.city}" (hojas diferentes).`,
          });
        }
      }

      // ── Shared corporate email domain ──
      if (r1.email && r2.email) {
        const d1 = emailDomain(r1.email);
        const d2 = emailDomain(r2.email);
        if (d1 && d2 && d1 === d2 && isCorporateEmail(r1.email) && r1.email !== r2.email) {
          addRelationship(relationships, seen, {
            type: 'empresarial',
            person1: mkPerson(r1),
            person2: mkPerson(r2),
            sharedData: `Dominio corporativo compartido: @${d1}`,
            confidence: 'media',
            details: `"${r1.name}" (${r1.email}) y "${r2.name}" (${r2.email}) usan el mismo dominio corporativo @${d1}.`,
          });
        }
      }
    }
  }
}

// ─── Within-Sheet Relationship Detection ──────────────────────────────────────

function findWithinSheetRelationships(
  records: NormalizedRecord[],
  relationships: Relationship[],
  seen: Set<string>,
): void {
  for (let i = 0; i < records.length; i++) {
    for (let j = i + 1; j < records.length; j++) {
      const r1 = records[i];
      const r2 = records[j];

      // Skip self-comparison (same row)
      if (r1.row === r2.row) continue;

      // ── Same employer/company → laboral ──
      if (r1.company && r2.company && r1.company === r2.company) {
        addRelationship(relationships, seen, {
          type: 'laboral',
          person1: mkPerson(r1),
          person2: mkPerson(r2),
          sharedData: `Mismo empleador: ${r1.company}`,
          confidence: 'alta',
          details: `"${r1.name}" y "${r2.name}" trabajan en la misma empresa "${r1.company}" (hoja "${r1.sheet}").${
            r1.position || r2.position
              ? ` Cargos: ${r1.position || 'N/A'} / ${r2.position || 'N/A'}.`
              : ''
          }`,
        });
      }

      // ── Same NIT → empresarial ──
      if (r1.nit && r2.nit && r1.nit === r2.nit) {
        addRelationship(relationships, seen, {
          type: 'empresarial',
          person1: mkPerson(r1),
          person2: mkPerson(r2),
          sharedData: `Mismo NIT: ${r1.nit}`,
          confidence: 'alta',
          details: `"${r1.name}" y "${r2.name}" comparten NIT "${r1.nit}" en la hoja "${r1.sheet}", sugiriendo vínculo empresarial.`,
        });
      }

      // ── Same address → co-location ──
      if (r1.address && r2.address && addressMatch(r1.address, r2.address)) {
        const isExact = normalizeAddress(r1.address) === normalizeAddress(r2.address);
        addRelationship(relationships, seen, {
          type: 'coincidencia_ubicacion',
          person1: mkPerson(r1),
          person2: mkPerson(r2),
          sharedData: `Misma dirección: "${r1.address}"`,
          confidence: isExact ? 'alta' : 'media',
          details: `"${r1.name}" y "${r2.name}" comparten dirección en la hoja "${r1.sheet}". Posible co-locación o relación de residencia.`,
        });
      }

      // ── Same phone number → personal/family ──
      if (r1.phone && r2.phone && r1.phone === r2.phone && r1.phone.length >= 7) {
        addRelationship(relationships, seen, {
          type: 'personal',
          person1: mkPerson(r1),
          person2: mkPerson(r2),
          sharedData: `Mismo teléfono: ${r1.phone}`,
          confidence: 'alta',
          details: `"${r1.name}" y "${r2.name}" comparten el número telefónico "${r1.phone}" en la hoja "${r1.sheet}". Posible relación personal o familiar.`,
        });
      }

      // ── Same email → personal/contact ──
      if (r1.email && r2.email && r1.email === r2.email) {
        addRelationship(relationships, seen, {
          type: 'coincidencia_contacto',
          person1: mkPerson(r1),
          person2: mkPerson(r2),
          sharedData: `Mismo correo: ${r1.email}`,
          confidence: 'alta',
          details: `"${r1.name}" y "${r2.name}" comparten el correo "${r1.email}" en la hoja "${r1.sheet}".`,
        });
      }

      // ── Same corporate email domain → empresarial ──
      if (r1.email && r2.email && r1.email !== r2.email) {
        const d1 = emailDomain(r1.email);
        const d2 = emailDomain(r2.email);
        if (d1 && d2 && d1 === d2 && isCorporateEmail(r1.email)) {
          addRelationship(relationships, seen, {
            type: 'empresarial',
            person1: mkPerson(r1),
            person2: mkPerson(r2),
            sharedData: `Dominio corporativo compartido: @${d1}`,
            confidence: 'media',
            details: `"${r1.name}" (${r1.email}) y "${r2.name}" (${r2.email}) comparten dominio corporativo @${d1} en la hoja "${r1.sheet}".`,
          });
        }
      }

      // ── Similar names (possible family) → familiar ──
      if (r1.name && r2.name) {
        const sim = nameSimilarity(r1.name, r2.name);
        if (sim >= 0.5 && sim < 1.0 && sharedLastName(r1.name, r2.name)) {
          addRelationship(relationships, seen, {
            type: 'familiar',
            person1: mkPerson(r1),
            person2: mkPerson(r2),
            sharedData: `Apellido compartido, nombres similares: "${r1.name}" / "${r2.name}"`,
            confidence: sim >= 0.7 ? 'alta' : sim >= 0.6 ? 'media' : 'baja',
            details: `"${r1.name}" y "${r2.name}" comparten apellido y tienen nombres similares (similitud: ${(sim * 100).toFixed(0)}%) en la hoja "${r1.sheet}". Posible vínculo familiar.`,
          });
        }
      }

      // ── Same cedula/document → coincidence ──
      if (r1.cedula && r2.cedula && r1.cedula === r2.cedula) {
        addRelationship(relationships, seen, {
          type: 'coincidencia_documento',
          person1: mkPerson(r1),
          person2: mkPerson(r2),
          sharedData: `Misma cédula/documento: ${r1.cedula}`,
          confidence: 'alta',
          details: `"${r1.name}" y "${r2.name}" comparten documento "${r1.cedula}" en la hoja "${r1.sheet}".`,
        });
      }
    }
  }
}

// ─── Utility: Create person reference ─────────────────────────────────────────

function mkPerson(record: NormalizedRecord): Relationship['person1'] {
  return {
    name: record.name || `Registro fila ${record.row}`,
    sheet: record.sheet,
    row: record.row,
    data: record.raw,
  };
}

// ─── Utility: Add relationship with dedup ─────────────────────────────────────

function addRelationship(
  relationships: Relationship[],
  seen: Set<string>,
  rel: Relationship,
): void {
  const key = relationshipKey(rel);
  if (!seen.has(key)) {
    seen.add(key);
    relationships.push(rel);
  }
}

// ─── Main Export ──────────────────────────────────────────────────────────────

export function analyzeRelationships(buffer: Buffer, fileName: string): RelationshipAnalysisResult {
  // 1. Parse workbook
  const workbook = xlsx.read(buffer, { type: 'buffer' });
  const sheetNames = workbook.SheetNames;

  if (sheetNames.length < 2) {
    // If there's only one sheet, still analyze within-sheet relationships
    const singleName = sheetNames[0] || 'Hoja1';
    const singleSheet = workbook.Sheets[singleName];
    const singleData: Record<string, unknown>[] = singleSheet
      ? xlsx.utils.sheet_to_json(singleSheet, { defval: '' })
      : [];

    const singleRecords = singleData.map((row, i) => normalizeRow(row, singleName, i + 2));

    const relationships: Relationship[] = [];
    const seen = new Set<string>();

    findWithinSheetRelationships(singleRecords, relationships, seen);

    return {
      sheetNames,
      totalRecordsSheet1: singleRecords.length,
      totalRecordsSheet2: 0,
      relationships,
      summary: buildSummary(relationships),
    };
  }

  // 2. Extract data from first two sheets
  const sheet1Name = sheetNames[0];
  const sheet2Name = sheetNames[1];

  const sheet1 = workbook.Sheets[sheet1Name];
  const sheet2 = workbook.Sheets[sheet2Name];

  const rawData1: Record<string, unknown>[] = sheet1
    ? xlsx.utils.sheet_to_json(sheet1, { defval: '' })
    : [];
  const rawData2: Record<string, unknown>[] = sheet2
    ? xlsx.utils.sheet_to_json(sheet2, { defval: '' })
    : [];

  // 3. Normalize all records
  const records1 = rawData1.map((row, i) => normalizeRow(row, sheet1Name, i + 2));
  const records2 = rawData2.map((row, i) => normalizeRow(row, sheet2Name, i + 2));

  // 4. Find relationships
  const relationships: Relationship[] = [];
  const seen = new Set<string>();

  // Cross-sheet: compare every record in sheet1 with every record in sheet2
  findCrossSheetRelationships(records1, records2, relationships, seen);

  // Within-sheet: compare records within each sheet
  findWithinSheetRelationships(records1, relationships, seen);
  findWithinSheetRelationships(records2, relationships, seen);

  // 5. Sort relationships: alta first, then media, then baja
  const confidenceOrder: Record<string, number> = { alta: 0, media: 1, baja: 2 };
  relationships.sort((a, b) => confidenceOrder[a.confidence] - confidenceOrder[b.confidence]);

  // 6. Build result
  return {
    sheetNames,
    totalRecordsSheet1: records1.length,
    totalRecordsSheet2: records2.length,
    relationships,
    summary: buildSummary(relationships),
  };
}

// ─── Build Summary ────────────────────────────────────────────────────────────

function buildSummary(relationships: Relationship[]): RelationshipAnalysisResult['summary'] {
  const summary: RelationshipAnalysisResult['summary'] = {
    empresariales: 0,
    laborales: 0,
    personales: 0,
    familiares: 0,
    porDocumento: 0,
    porContacto: 0,
    porUbicacion: 0,
  };

  for (const rel of relationships) {
    switch (rel.type) {
      case 'empresarial':
        summary.empresariales++;
        break;
      case 'laboral':
        summary.laborales++;
        break;
      case 'personal':
        summary.personales++;
        break;
      case 'familiar':
        summary.familiares++;
        break;
      case 'coincidencia_documento':
        summary.porDocumento++;
        break;
      case 'coincidencia_contacto':
        summary.porContacto++;
        break;
      case 'coincidencia_ubicacion':
        summary.porUbicacion++;
        break;
    }
  }

  return summary;
}
