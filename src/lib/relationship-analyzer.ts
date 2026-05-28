/**
 * Analizador de Relaciones entre hojas de un archivo Excel (.xlsx).
 * Detecta vinculos empresariales, personales, familiares y laborales
 * entre los datos de dos pestanas/hojas del mismo archivo.
 */

import * as XLSX from 'xlsx';

export interface RelationshipLink {
  type: 'empresarial' | 'personal' | 'familiar' | 'laboral' | 'contacto' | 'ubicacion' | 'dato_compartido';
  confidence: 'alta' | 'media' | 'baja';
  description: string;
  sheet1Person: string;
  sheet1Data: Record<string, string>;
  sheet2Person: string;
  sheet2Data: Record<string, string>;
  matchedField: string;
  matchedValue: string;
}

export interface RelationshipAnalysisResult {
  sheet1Name: string;
  sheet2Name: string;
  sheet1RowCount: number;
  sheet2RowCount: number;
  totalLinks: number;
  links: RelationshipLink[];
  summary: {
    empresariales: number;
    personales: number;
    familiares: number;
    laborales: number;
    contacto: number;
    ubicacion: number;
    dato_compartido: number;
  };
  networkMap: {
    person: string;
    connections: number;
    types: string[];
  }[];
}

// ── Field categorization ──
const EMPRESARIAL_FIELDS = [
  'empresa', 'company', 'organizacion', 'organization', 'sociedad', 'nit',
  'razon_social', 'negocio', 'business', 'empleador', 'employer', 'cargo',
  'position', 'departamento', 'department', 'sector', 'industria', 'industry',
  'rues', 'camara_comercio', 'representante_legal', 'socio', 'partner',
  'accionista', 'shareholder', 'junta_directiva', 'board'
];

const PERSONAL_FIELDS = [
  'nombre', 'name', 'apellido', 'lastname', 'correo', 'email', 'email2',
  'telefono', 'phone', 'celular', 'mobile', 'direccion', 'address',
  'ciudad', 'city', 'pais', 'country', 'fecha_nacimiento', 'birthdate',
  'edad', 'age', 'genero', 'gender', 'estado_civil', 'civil_status'
];

const FAMILIAR_FIELDS = [
  'familiar', 'family', 'conyuge', 'spouse', 'padre', 'father', 'madre',
  'mother', 'hijo', 'child', 'hermano', 'sibling', 'parentesco', 'kinship',
  'apellido_materno', 'apellido_paterno', 'familia', 'nucleo_familiar'
];

const LABORAL_FIELDS = [
  'empleador', 'employer', 'cargo', 'position', 'trabajo', 'job', 'profesion',
  'profession', 'oficio', 'occupation', 'salario', 'salary', 'contrato',
  'contract', 'fecha_ingreso', 'hire_date', 'fecha_retiro', 'termination_date',
  'eps', 'afp', 'fondo_pensiones', 'caja_compensacion', 'arl', 'nomina',
  'payroll', 'vinculacion', 'tipo_contrato', 'contract_type'
];

const CONTACT_FIELDS = [
  'telefono', 'phone', 'celular', 'mobile', 'correo', 'email', 'whatsapp',
  'telegram', 'linkedin', 'direccion', 'address', 'contacto', 'contact'
];

const LOCATION_FIELDS = [
  'direccion', 'address', 'ciudad', 'city', 'municipio', 'departamento',
  'barrio', 'vereda', 'localidad', 'zona', 'ubicacion', 'location',
  'pais', 'country', 'codigo_postal', 'zip'
];

function classifyField(fieldName: string): string[] {
  const lower = fieldName.toLowerCase().replace(/[^a-z0-9_]/g, '_');
  const categories: string[] = [];

  const checkCategory = (fields: string[], category: string) => {
    if (fields.some(f => lower.includes(f) || f.includes(lower))) {
      categories.push(category);
    }
  };

  checkCategory(EMPRESARIAL_FIELDS, 'empresarial');
  checkCategory(PERSONAL_FIELDS, 'personal');
  checkCategory(FAMILIAR_FIELDS, 'familiar');
  checkCategory(LABORAL_FIELDS, 'laboral');
  checkCategory(CONTACT_FIELDS, 'contacto');
  checkCategory(LOCATION_FIELDS, 'ubicacion');

  if (categories.length === 0) categories.push('dato_compartido');
  return categories;
}

function normalizeValue(value: string): string {
  return value.trim().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // remove accents
    .replace(/[^a-z0-9@._\-+]/g, '');
}

function isSignificantMatch(field: string, value: string): boolean {
  // Skip empty, too short, or generic values
  const normalized = normalizeValue(value);
  if (normalized.length < 2) return false;
  if (['na', 'n/a', 'no', 'si', 'none', 'null', 'undefined', '-', '0'].includes(normalized)) return false;

  // For names, require at least 3 chars
  const lower = field.toLowerCase();
  if ((lower.includes('nombre') || lower.includes('name') || lower.includes('apellido')) && normalized.length < 3) return false;

  return true;
}

function determineLinkType(
  field1: string, field2: string,
  categories1: string[], categories2: string[]
): { type: RelationshipLink['type']; confidence: RelationshipLink['confidence'] } {
  const allCategories = [...categories1, ...categories2];

  // Priority-based type determination
  if (allCategories.includes('familiar')) {
    return { type: 'familiar', confidence: categories1.includes('familiar') && categories2.includes('familiar') ? 'alta' : 'media' };
  }
  if (allCategories.includes('empresarial')) {
    return { type: 'empresarial', confidence: categories1.includes('empresarial') && categories2.includes('empresarial') ? 'alta' : 'media' };
  }
  if (allCategories.includes('laboral')) {
    return { type: 'laboral', confidence: categories1.includes('laboral') && categories2.includes('laboral') ? 'alta' : 'media' };
  }
  if (allCategories.includes('contacto')) {
    return { type: 'contacto', confidence: 'alta' };
  }
  if (allCategories.includes('ubicacion')) {
    return { type: 'ubicacion', confidence: 'media' };
  }
  if (allCategories.includes('personal')) {
    return { type: 'personal', confidence: 'media' };
  }

  return { type: 'dato_compartido', confidence: 'baja' };
}

function getPersonIdentifier(row: Record<string, string>): string {
  // Try to find a name-like field
  const nameFields = ['nombre_completo', 'fullname', 'nombre', 'name', 'razon_social', 'empresa', 'company'];
  for (const f of nameFields) {
    for (const key of Object.keys(row)) {
      if (key.toLowerCase().replace(/[^a-z0-9_]/g, '_').includes(f) && row[key]?.trim()) {
        return row[key].trim();
      }
    }
  }
  // Fallback: use first non-empty field
  for (const val of Object.values(row)) {
    if (val?.trim()) return val.trim();
  }
  return 'Desconocido';
}

// ── Main Analysis Function ──
export function analyzeRelationships(
  sheet1Data: Record<string, string>[],
  sheet2Data: Record<string, string>[],
  sheet1Name: string = 'Hoja 1',
  sheet2Name: string = 'Hoja 2'
): RelationshipAnalysisResult {
  const links: RelationshipLink[] = [];

  // Get field names from both sheets
  const sheet1Fields = sheet1Data.length > 0 ? Object.keys(sheet1Data[0]) : [];
  const sheet2Fields = sheet2Data.length > 0 ? Object.keys(sheet2Data[0]) : [];

  // For each row in sheet1, compare with each row in sheet2
  for (const row1 of sheet1Data) {
    const person1 = getPersonIdentifier(row1);

    for (const row2 of sheet2Data) {
      const person2 = getPersonIdentifier(row2);

      // Compare all field combinations
      for (const field1 of sheet1Fields) {
        const val1 = row1[field1];
        if (!val1 || !isSignificantMatch(field1, val1)) continue;

        const categories1 = classifyField(field1);

        for (const field2 of sheet2Fields) {
          const val2 = row2[field2];
          if (!val2 || !isSignificantMatch(field2, val2)) continue;

          // Check if values match
          const norm1 = normalizeValue(val1);
          const norm2 = normalizeValue(val2);

          if (norm1 === norm2 && norm1.length >= 2) {
            const categories2 = classifyField(field2);
            const { type, confidence } = determineLinkType(field1, field2, categories1, categories2);

            // Skip duplicate links between same pair
            const existingLink = links.find(l =>
              l.sheet1Person === person1 && l.sheet2Person === person2 && l.type === type
            );

            if (!existingLink) {
              links.push({
                type,
                confidence,
                description: generateLinkDescription(type, person1, person2, field1, field2, val1),
                sheet1Person: person1,
                sheet1Data: { [field1]: val1 },
                sheet2Person: person2,
                sheet2Data: { [field2]: val2 },
                matchedField: `${field1} / ${field2}`,
                matchedValue: val1,
              });
            }
          }

          // Partial match for names (if one name contains the other or shares surname)
          if ((field1.toLowerCase().includes('nombre') || field1.toLowerCase().includes('name') || field1.toLowerCase().includes('apellido')) &&
              (field2.toLowerCase().includes('nombre') || field2.toLowerCase().includes('name') || field2.toLowerCase().includes('apellido'))) {
            const parts1 = norm1.split(/\s+/);
            const parts2 = norm2.split(/\s+/);
            const sharedParts = parts1.filter(p => p.length >= 3 && parts2.includes(p));
            if (sharedParts.length >= 2 && norm1 !== norm2) {
              const existingFamilyLink = links.find(l =>
                l.sheet1Person === person1 && l.sheet2Person === person2 && l.type === 'familiar'
              );
              if (!existingFamilyLink) {
                links.push({
                  type: 'familiar',
                  confidence: 'baja',
                  description: `Posible vinculo familiar entre "${person1}" y "${person2}" por coincidencia en apellidos: ${sharedParts.join(', ')}`,
                  sheet1Person: person1,
                  sheet1Data: { [field1]: val1 },
                  sheet2Person: person2,
                  sheet2Data: { [field2]: val2 },
                  matchedField: `${field1} / ${field2}`,
                  matchedValue: sharedParts.join(', '),
                });
              }
            }
          }
        }
      }
    }
  }

  // Build summary
  const summary = {
    empresariales: links.filter(l => l.type === 'empresarial').length,
    personales: links.filter(l => l.type === 'personal').length,
    familiares: links.filter(l => l.type === 'familiar').length,
    laborales: links.filter(l => l.type === 'laboral').length,
    contacto: links.filter(l => l.type === 'contacto').length,
    ubicacion: links.filter(l => l.type === 'ubicacion').length,
    dato_compartido: links.filter(l => l.type === 'dato_compartido').length,
  };

  // Build network map
  const connectionMap = new Map<string, { connections: number; types: Set<string> }>();
  for (const link of links) {
    for (const person of [link.sheet1Person, link.sheet2Person]) {
      if (!connectionMap.has(person)) {
        connectionMap.set(person, { connections: 0, types: new Set<string>() });
      }
      const entry = connectionMap.get(person)!;
      entry.connections++;
      entry.types.add(link.type);
    }
  }

  const networkMap = Array.from(connectionMap.entries())
    .map(([person, data]) => ({
      person,
      connections: data.connections,
      types: Array.from(data.types),
    }))
    .sort((a, b) => b.connections - a.connections);

  return {
    sheet1Name,
    sheet2Name,
    sheet1RowCount: sheet1Data.length,
    sheet2RowCount: sheet2Data.length,
    totalLinks: links.length,
    links,
    summary,
    networkMap,
  };
}

function generateLinkDescription(
  type: RelationshipLink['type'],
  person1: string, person2: string,
  field1: string, field2: string, value: string
): string {
  switch (type) {
    case 'empresarial':
      return `Vinculo empresarial entre "${person1}" y "${person2}" - comparten ${field1} / ${field2}: "${value}". Posible relacion societaria, vinculo contractual o asociacion comercial.`;
    case 'personal':
      return `Vinculo personal entre "${person1}" y "${person2}" - coincidencia en ${field1} / ${field2}: "${value}". Los datos sugieren una conexion personal identificable.`;
    case 'familiar':
      return `Posible vinculo familiar entre "${person1}" y "${person2}" - coincidencia en ${field1} / ${field2}: "${value}". Los datos compartidos sugieren una relacion de parentesco.`;
    case 'laboral':
      return `Vinculo laboral entre "${person1}" y "${person2}" - comparten ${field1} / ${field2}: "${value}". Posible relacion de empleo, misma empresa o vinculacion contractual.`;
    case 'contacto':
      return `Vinculo de contacto entre "${person1}" y "${person2}" - mismo dato en ${field1} / ${field2}: "${value}". Comparten medio de contacto directo.`;
    case 'ubicacion':
      return `Vinculo de ubicacion entre "${person1}" y "${person2}" - coincidencia en ${field1} / ${field2}: "${value}". Comparten ubicacion geografica.`;
    default:
      return `Dato compartido entre "${person1}" y "${person2}" - coincidencia en ${field1} / ${field2}: "${value}". Se requiere investigacion adicional para determinar la naturaleza del vinculo.`;
  }
}

// ── Detect if file is a legacy .xls (BIFF) format by magic bytes ──
function isLegacyXLS(buffer: Buffer | Uint8Array): boolean {
  if (buffer.length < 8) return false;
  const uint8 = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer.buffer || buffer);
  // BIFF5-8 starts with D0 CF 11 E0 A1 B1 1A E1 (OLE2 Compound Document)
  return (
    uint8[0] === 0xD0 && uint8[1] === 0xCF && uint8[2] === 0x11 &&
    uint8[3] === 0xE0 && uint8[4] === 0xA1 && uint8[5] === 0xB1 &&
    uint8[6] === 0x1A && uint8[7] === 0xE1
  );
}

// ── Parse XLSX file with multiple sheets ──
// REWRITTEN: Removed isEncryptedWorkbook() which caused false positives.
// Now tries each method and checks if actual data was extracted.
export function parseXLSXWithSheets(buffer: Buffer | ArrayBuffer | Uint8Array): {
  sheets: { name: string; data: Record<string, string>[] }[];
  sheetNames: string[];
} {
  // Ensure we have a Uint8Array for the most compatible method
  const uint8 = buffer instanceof Uint8Array
    ? buffer
    : buffer instanceof ArrayBuffer
      ? new Uint8Array(buffer)
      : new Uint8Array(buffer.buffer || buffer);

  const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(uint8);
  const isXLS = isLegacyXLS(uint8);

  // Read options: use different strategies based on file format
  // For .xls: NO cellStyles/cellNF/cellDates which can cause issues with legacy BIFF
  // For .xlsx: use full options
  const xlsxReadOptions = { cellNF: true, cellDates: true };
  const xlsReadOptions = {};  // Minimal options for legacy .xls

  // Try different read methods — most compatible first
  const readMethods: Array<{ type: string; label: string; getData: () => unknown }> = [
    { type: 'buffer', label: 'buffer', getData: () => buf },
    { type: 'array', label: 'array', getData: () => uint8 },
    { type: 'binary', label: 'binary', getData: () => buf.toString('binary') },
    { type: 'base64', label: 'base64', getData: () => buf.toString('base64') },
  ];

  const errors: string[] = [];

  for (const method of readMethods) {
    try {
      const readOptions = isXLS
        ? { type: method.type as 'buffer' | 'array' | 'binary' | 'base64', ...xlsReadOptions }
        : { type: method.type as 'buffer' | 'array' | 'binary' | 'base64', ...xlsxReadOptions };

      const workbook = XLSX.read(method.getData(), readOptions);

      if (!workbook || !workbook.SheetNames || workbook.SheetNames.length === 0) {
        errors.push(`${method.label}: workbook vacio o sin hojas`);
        continue;
      }

      // Build sheets from workbook — DO NOT use isEncryptedWorkbook check here
      // because that check gives false positives for valid .xls files where
      // SheetJS might not fully parse all cells in certain read modes.
      // Instead, we try to extract data and only flag encrypted if we get
      // zero data from ALL methods.
      const result = buildSheetsFromWorkbook(workbook);
      const nonEmptySheets = result.sheets.filter(s => s.data.length > 0);

      if (nonEmptySheets.length > 0) {
        // We got data — file is NOT encrypted
        return result;
      }

      // All sheets came back empty with this method
      errors.push(`${method.label}: todas las hojas vacias`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // Only throw for genuine encryption errors from the library itself
      // The library itself will throw with "password" or "encryption" keywords
      if (/unsupported encryption|password.*protected|file is encrypted/i.test(msg)) {
        throw new Error('El archivo esta protegido con contrasena. Retire la proteccion y vuelva a intentarlo.');
      }
      errors.push(`${method.label}: ${msg}`);
    }
  }

  // If we get here, all methods failed or returned empty data
  // For .xls files, this often means the file is encrypted (SheetJS can't read encrypted BIFF)
  // For .xlsx files, this could also mean encryption or corruption
  if (isXLS) {
    throw new Error(
      'No se pudo leer el archivo .xls. Puede estar protegido con contrasena o usar un formato no soportado. ' +
      'Intenta abrirlo en Excel y guardarlo como .xlsx.'
    );
  }

  throw new Error(
    'No se pudo leer el archivo Excel. Verifica que el archivo no este danado ni protegido con contrasena. ' +
    'Detalles tecnicos: ' + errors.join(' | ')
  );
}

function buildSheetsFromWorkbook(workbook: XLSX.WorkBook): {
  sheets: { name: string; data: Record<string, string>[] }[];
  sheetNames: string[];
} {
  const sheets = workbook.SheetNames.map(name => {
    const ws = workbook.Sheets[name];
    let data: Record<string, string>[] = [];

    // Method 1: sheet_to_json with raw values (most reliable)
    try {
      const rawData = XLSX.utils.sheet_to_json(ws, { defval: '', blankrows: false });
      if (rawData && rawData.length > 0) {
        data = rawData.map(row => {
          const strRow: Record<string, string> = {};
          for (const [key, val] of Object.entries(row as Record<string, unknown>)) {
            strRow[key] = val != null ? String(val) : '';
          }
          return strRow;
        });
      }
    } catch (e) {
      console.error(`sheet_to_json method 1 failed for ${name}:`, e);
    }

    // Method 2: If method 1 returns empty, try with header row extraction
    if (data.length === 0) {
      try {
        const aoaData: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', blankrows: false });
        if (aoaData && aoaData.length >= 2) {
          const headers = aoaData[0].map((h: unknown) => h != null ? String(h).trim() : '');
          for (let i = 1; i < aoaData.length; i++) {
            const row: Record<string, string> = {};
            let hasData = false;
            headers.forEach((header, idx) => {
              const val = aoaData[i][idx];
              const strVal = val != null ? String(val).trim() : '';
              row[header] = strVal;
              if (strVal) hasData = true;
            });
            if (hasData) data.push(row);
          }
        }
      } catch (e) {
        console.error(`sheet_to_json method 2 failed for ${name}:`, e);
      }
    }

    // Method 3: Manual cell-by-cell extraction as last resort
    if (data.length === 0 && ws['!ref']) {
      try {
        const range = XLSX.utils.decode_range(ws['!ref']);
        // First row = headers
        const headers: string[] = [];
        for (let c = range.s.c; c <= range.e.c; c++) {
          const addr = XLSX.utils.encode_cell({ r: range.s.r, c });
          const cell = ws[addr];
          headers.push(cell ? String(cell.v).trim() : `Columna_${c + 1}`);
        }
        // Data rows
        for (let r = range.s.r + 1; r <= range.e.r; r++) {
          const row: Record<string, string> = {};
          let hasData = false;
          for (let c = range.s.c; c <= range.e.c; c++) {
            const addr = XLSX.utils.encode_cell({ r, c });
            const cell = ws[addr];
            const val = cell ? String(cell.v).trim() : '';
            row[headers[c - range.s.c]] = val;
            if (val) hasData = true;
          }
          if (hasData) data.push(row);
        }
      } catch (e) {
        console.error(`Manual cell extraction failed for ${name}:`, e);
      }
    }

    return { name, data };
  });

  return { sheets, sheetNames: workbook.SheetNames };
}
