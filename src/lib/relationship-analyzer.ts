/**
 * Analizador de Relaciones entre hojas de un archivo Excel (.xlsx).
 * Detecta vinculos empresariales, personales, familiares y laborales
 * entre los datos de dos pestanas/hojas del mismo archivo.
 */

import * as XLSX from 'xlsx';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

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

// ── Detect file format by magic bytes ──
function detectFileFormat(buffer: Buffer | Uint8Array): 'ole2' | 'xml_spreadsheet' | 'zip' | 'unknown' {
  if (buffer.length < 8) return 'unknown';
  const uint8 = buffer instanceof Uint8Array
    ? buffer
    : new Uint8Array((buffer as unknown as { buffer: ArrayBuffer; byteOffset: number; byteLength: number }).buffer, (buffer as unknown as { byteOffset: number }).byteOffset, (buffer as unknown as { byteLength: number }).byteLength);
  // BIFF5-8 starts with D0 CF 11 E0 A1 B1 1A E1 (OLE2 Compound Document)
  if (
    uint8[0] === 0xD0 && uint8[1] === 0xCF && uint8[2] === 0x11 &&
    uint8[3] === 0xE0 && uint8[4] === 0xA1 && uint8[5] === 0xB1 &&
    uint8[6] === 0x1A && uint8[7] === 0xE1
  ) {
    return 'ole2';
  }
  // ZIP (xlsx is a ZIP container) starts with 50 4B 03 04
  if (uint8[0] === 0x50 && uint8[1] === 0x4B && uint8[2] === 0x03 && uint8[3] === 0x04) {
    return 'zip';
  }
  // XML Spreadsheet 2003 starts with <?xml or BOM + <?xml
  const text = Buffer.from(uint8.slice(0, 100)).toString('utf8');
  if (text.includes('<?xml') || text.includes('<?XML')) {
    return 'xml_spreadsheet';
  }
  return 'unknown';
}

// ── Parse XLSX file with multiple sheets ──
// REWRITTEN: Robust handling for .xls (BIFF), .xlsx (ZIP), and XML Spreadsheet formats.
// NEVER includes "protegido con contrasena" in error messages to avoid false positives
// in the upload route's encrypted-file detection regex.
export function parseXLSXWithSheets(buffer: Buffer | ArrayBuffer | Uint8Array): {
  sheets: { name: string; data: Record<string, string>[] }[];
  sheetNames: string[];
} {
  // Ensure we have a Uint8Array for the most compatible method
  let uint8: Uint8Array;
  if (buffer instanceof Uint8Array) {
    uint8 = buffer;
  } else if (buffer instanceof ArrayBuffer) {
    uint8 = new Uint8Array(buffer);
  } else if (Buffer.isBuffer(buffer)) {
    const bufAny = buffer as unknown as { buffer: ArrayBuffer; byteOffset: number; byteLength: number };
    uint8 = new Uint8Array(bufAny.buffer, bufAny.byteOffset, bufAny.byteLength);
  } else {
    uint8 = new Uint8Array(buffer as ArrayBuffer);
  }

  const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(uint8);
  const format = detectFileFormat(uint8);

  const errors: string[] = [];

  // ── For OLE2 (.xls) files, only use binary-compatible methods ──
  // binary/base64 string conversion corrupts OLE2 format
  const readMethods: Array<{ type: string; label: string; getData: () => unknown }> =
    format === 'ole2'
      ? [
          // OLE2: only buffer and array methods (binary/base64 corrupt OLE2)
          { type: 'buffer', label: 'buffer_full', getData: () => buf },
          { type: 'array', label: 'array_full', getData: () => uint8 },
          // Try with dense mode for .xls (different internal representation)
          { type: 'buffer', label: 'buffer_dense', getData: () => buf },
          { type: 'array', label: 'array_dense', getData: () => uint8 },
          // Last resort: binary/base64 (may corrupt OLE2 but worth trying)
          { type: 'binary', label: 'binary', getData: () => buf.toString('binary') },
          { type: 'base64', label: 'base64', getData: () => buf.toString('base64') },
        ]
      : [
          // Non-OLE2: all methods work fine
          { type: 'buffer', label: 'buffer', getData: () => buf },
          { type: 'array', label: 'array', getData: () => uint8 },
          { type: 'binary', label: 'binary', getData: () => buf.toString('binary') },
          { type: 'base64', label: 'base64', getData: () => buf.toString('base64') },
        ];

  for (let i = 0; i < readMethods.length; i++) {
    const method = readMethods[i];
    try {
      let readOptions: Record<string, unknown>;

      if (format === 'ole2') {
        // For OLE2, try different option combinations
        if (i <= 1) {
          // First attempts: full options
          readOptions = { type: method.type, cellNF: true, cellDates: true, cellText: true, sheetStubs: true };
        } else if (i <= 3) {
          // Dense mode attempts
          readOptions = { type: method.type, cellNF: true, cellDates: true, cellText: true, sheetStubs: true, dense: true };
        } else {
          // Last resort: string-based
          readOptions = { type: method.type, cellNF: true, cellDates: true, cellText: true, sheetStubs: true };
        }
      } else if (format === 'xml_spreadsheet') {
        readOptions = { type: method.type, cellNF: false, cellStyles: false };
      } else {
        readOptions = { type: method.type, cellNF: true, cellDates: true };
      }

      const workbook = XLSX.read(method.getData(), readOptions);

      if (!workbook || !workbook.SheetNames || workbook.SheetNames.length === 0) {
        errors.push(`${method.label}: workbook vacio o sin hojas`);
        continue;
      }

      const result = buildSheetsFromWorkbook(workbook);
      const nonEmptySheets = result.sheets.filter(s => s.data.length > 0);

      if (nonEmptySheets.length > 0) {
        return result;
      }

      // All sheets came back empty with this method
      errors.push(`${method.label}: todas las hojas vacias (hojas: ${workbook.SheetNames.join(', ')})`);

      // ── OLE2 FALLBACK: Try .xls → .xlsx conversion ──
      // If we got sheet names but no data, the BIFF parsing failed.
      // Convert the workbook to .xlsx in memory and re-read.
      if (format === 'ole2' && workbook.SheetNames.length > 0 && i === readMethods.length - 1) {
        try {
          const xlsxBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
          const reReadWb = XLSX.read(xlsxBuffer, { type: 'buffer', cellNF: true, cellDates: true, cellText: true, sheetStubs: true });
          if (reReadWb && reReadWb.SheetNames.length > 0) {
            const reReadResult = buildSheetsFromWorkbook(reReadWb);
            const reReadNonEmpty = reReadResult.sheets.filter(s => s.data.length > 0);
            if (reReadNonEmpty.length > 0) {
              return reReadResult;
            }
            errors.push('xls_to_xlsx_conversion: hojas convertidas pero sin datos extraibles');
          }
        } catch (convErr) {
          const convMsg = convErr instanceof Error ? convErr.message : String(convErr);
          errors.push(`xls_to_xlsx_conversion: ${convMsg}`);
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // Only throw for genuine encryption errors from the library itself
      if (/unsupported encryption|password.*protected|file is encrypted/i.test(msg)) {
        // Use a distinctive prefix so the upload route can identify real encryption
        throw new Error('[ENCRYPTED] El archivo tiene cifrado y no puede ser leido. Retire la proteccion y vuelva a intentarlo.');
      }
      errors.push(`${method.label}: ${msg}`);
    }
  }

  // ── FINAL OLE2 FALLBACK: Write to temp file and read with readFile ──
  if (format === 'ole2') {
    try {
      const tmpDir = os.tmpdir();
      const tmpFile = path.join(tmpDir, `osint_upload_${Date.now()}.xls`);
      fs.writeFileSync(tmpFile, buf);
      const fileWb = XLSX.readFile(tmpFile, { cellNF: true, cellDates: true, cellText: true, sheetStubs: true });
      // Clean up temp file
      try { fs.unlinkSync(tmpFile); } catch { /* ignore */ }

      if (fileWb && fileWb.SheetNames.length > 0) {
        const fileResult = buildSheetsFromWorkbook(fileWb);
        const fileNonEmpty = fileResult.sheets.filter(s => s.data.length > 0);
        if (fileNonEmpty.length > 0) {
          return fileResult;
        }
        errors.push('readFile: hojas leidas pero sin datos extraibles');
      }
    } catch (tmpErr) {
      const tmpMsg = tmpErr instanceof Error ? tmpErr.message : String(tmpErr);
      errors.push(`readFile_fallback: ${tmpMsg}`);
    }
  }

  // If we get here, all methods failed or returned empty data
  if (format === 'ole2') {
    throw new Error(
      'No se pudo extraer datos del archivo .xls (formato BIFF). ' +
      'El archivo puede usar caracteristicas no soportadas o tener proteccion de hoja. ' +
      'Recomendacion: abre el archivo en Excel y guardalo como .xlsx. ' +
      'Detalles: ' + errors.join(' | ')
    );
  }

  throw new Error(
    'No se pudo leer el archivo Excel. Verifica que el archivo no este danado. ' +
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

    // Method 1: sheet_to_json with header row (most common approach)
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

    // Method 2: If method 1 returns empty, try with header row extraction (raw: false for string values)
    if (data.length === 0) {
      try {
        const aoaData: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', blankrows: false, raw: false });
        if (aoaData && aoaData.length >= 2) {
          const headers = aoaData[0].map((h: unknown) => h != null ? String(h).trim() : '');
          for (let i = 1; i < aoaData.length; i++) {
            const row: Record<string, string> = {};
            let hasData = false;
            headers.forEach((header, idx) => {
              const val = aoaData[i][idx];
              const strVal = val != null ? String(val).trim() : '';
              row[header || `Columna_${idx + 1}`] = strVal;
              if (strVal) hasData = true;
            });
            if (hasData) data.push(row);
          }
        }
      } catch (e) {
        console.error(`sheet_to_json method 2 failed for ${name}:`, e);
      }
    }

    // Method 3: Try raw: true with header: 1 (for .xls files where raw parsing works better)
    if (data.length === 0) {
      try {
        const aoaData: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', blankrows: false, raw: true });
        if (aoaData && aoaData.length >= 2) {
          const headers = aoaData[0].map((h: unknown) => h != null ? String(h).trim() : '');
          for (let i = 1; i < aoaData.length; i++) {
            const row: Record<string, string> = {};
            let hasData = false;
            headers.forEach((header, idx) => {
              const val = aoaData[i][idx];
              const strVal = val != null ? String(val).trim() : '';
              row[header || `Columna_${idx + 1}`] = strVal;
              if (strVal) hasData = true;
            });
            if (hasData) data.push(row);
          }
        }
      } catch (e) {
        console.error(`sheet_to_json method 3 failed for ${name}:`, e);
      }
    }

    // Method 4: Manual cell-by-cell extraction as last resort
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

    // Method 5: Dense mode — check ws['!data'] array (some .xls files use this format)
    if (data.length === 0 && (ws as Record<string, unknown>)['!data']) {
      try {
        const denseData = (ws as Record<string, unknown>)['!data'] as unknown[][];
        if (denseData && denseData.length >= 2) {
          const headers = denseData[0].map((h: unknown) => {
            if (h && typeof h === 'object' && 'v' in (h as Record<string, unknown>)) {
              return String((h as Record<string, unknown>)['v']).trim();
            }
            return h != null ? String(h).trim() : '';
          });
          for (let i = 1; i < denseData.length; i++) {
            const row: Record<string, string> = {};
            let hasData = false;
            headers.forEach((header, idx) => {
              const cell = denseData[i][idx];
              let strVal = '';
              if (cell && typeof cell === 'object' && 'v' in (cell as Record<string, unknown>)) {
                strVal = String((cell as Record<string, unknown>)['v']).trim();
              } else if (cell != null) {
                strVal = String(cell).trim();
              }
              row[header || `Columna_${idx + 1}`] = strVal;
              if (strVal) hasData = true;
            });
            if (hasData) data.push(row);
          }
        }
      } catch (e) {
        console.error(`Dense mode extraction failed for ${name}:`, e);
      }
    }

    return { name, data };
  });

  return { sheets, sheetNames: workbook.SheetNames };
}
