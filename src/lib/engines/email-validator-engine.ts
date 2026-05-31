/**
 * Email Validator Engine — Motor de validación de correos electrónicos
 *
 * Consulta https://email-validator.com/es/validate?email=xxx
 * y parsea la respuesta HTML para extraer:
 *   - Validez del formato (sintaxis)
 *   - Accesibilidad del dominio (DNS MX/A/AAAA)
 *   - Detección de correo desechable/temporal
 *   - Registros SPF, DMARC, BIMI
 *   - Información del proveedor
 *   - Estado general del correo
 */

import { performWebSearch, type OSINTResult } from '../osint-scanner';

// ── Interfaces ──

export interface EmailValidationResult {
  email: string;
  normalizedEmail: string;
  isValid: boolean;
  overallStatus: 'valid' | 'suspicious' | 'invalid' | 'unknown';
  overallLabel: string;

  // Syntax check
  syntaxCheck: 'passed' | 'failed' | 'unknown';
  domainAccessibility: 'accessible' | 'inaccessible' | 'unknown';

  // Provider info
  provider: string;
  providerType: string; // 'Proveedor de correo publico', 'Correo desechable', etc.
  providerDomain: string;

  // Disposable check
  isDisposable: boolean;
  disposableStatus: 'safe' | 'warning' | 'danger' | 'unknown';
  disposableDomain?: string;

  // DNS records
  mxPresent: boolean;
  mxRecords: string[];
  aRecordPresent: boolean;
  aaaaRecordPresent: boolean;
  spfPresent: boolean;
  spfRecord?: string;
  dmarcPresent: boolean;
  dmarcPolicy?: string;
  dmarcRecord?: string;
  bimiPresent: boolean;

  // Raw text for AI analysis
  rawValidationText: string;
}

// ── HTML Parser ──

function parseEmailValidatorHTML(html: string, email: string): EmailValidationResult {
  // Strip scripts and styles
  let text = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, '\n')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#160;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"');

  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);

  // Helper: find value after a label
  const findAfter = (label: string, startFrom = 0): string => {
    for (let i = startFrom; i < lines.length - 1; i++) {
      if (lines[i].toLowerCase() === label.toLowerCase()) {
        return lines[i + 1] || '';
      }
    }
    return '';
  };

  // Helper: find all lines between two labels
  const findBetween = (startLabel: string, endLabel: string): string[] => {
    const result: string[] = [];
    let capturing = false;
    for (const line of lines) {
      if (line.toLowerCase().includes(startLabel.toLowerCase())) {
        capturing = true;
        continue;
      }
      if (capturing && line.toLowerCase().includes(endLabel.toLowerCase())) {
        break;
      }
      if (capturing) {
        result.push(line);
      }
    }
    return result;
  };

  // Check overall validity
  const isValidText = lines.some(l =>
    l.toLowerCase().includes('direccion de correo es valida') ||
    l.toLowerCase().includes('email address is valid')
  );

  // Overall status
  let overallStatus: EmailValidationResult['overallStatus'] = 'unknown';
  let overallLabel = 'Desconocido';

  if (lines.some(l => l.toLowerCase().includes('sospechoso') || l.toLowerCase().includes('suspicious'))) {
    overallStatus = 'suspicious';
    overallLabel = 'Sospechoso';
  } else if (lines.some(l => l.toLowerCase().includes('no es valida') || l.toLowerCase().includes('not valid') || l.toLowerCase().includes('invalid'))) {
    overallStatus = 'invalid';
    overallLabel = 'Inválido';
  } else if (isValidText) {
    overallStatus = 'valid';
    overallLabel = 'Válido';
  }

  // Syntax check
  const syntaxLine = findAfter('Comprobacion de sintaxis') || findAfter('Syntax check');
  const syntaxCheck: EmailValidationResult['syntaxCheck'] =
    syntaxLine.toLowerCase().includes('superado') || syntaxLine.toLowerCase().includes('passed') ? 'passed' :
    syntaxLine.toLowerCase().includes('fallido') || syntaxLine.toLowerCase().includes('failed') ? 'failed' : 'unknown';

  // Domain accessibility
  const domainLine = findAfter('Accesibilidad del dominio') || findAfter('Domain accessibility');
  const domainAccessibility: EmailValidationResult['domainAccessibility'] =
    domainLine.toLowerCase().includes('accesible') || domainLine.toLowerCase().includes('accessible') ? 'accessible' :
    domainLine.toLowerCase().includes('no accesible') || domainLine.toLowerCase().includes('inaccessible') ? 'inaccessible' : 'unknown';

  // Provider info
  const provider = findAfter('Proveedor') || findAfter('Provider');
  const providerType = findAfter('Tipo') || findAfter('Type');
  const providerDomain = findAfter('Dominio del proveedor') || findAfter('Provider domain');

  // Disposable check
  const isDisposable = lines.some(l =>
    l.toLowerCase().includes('desechable detectado') ||
    l.toLowerCase().includes('disposable detected') ||
    l.toLowerCase().includes('correo desechable') ||
    l.toLowerCase().includes('disposable email')
  );

  const disposableStatusLine = findAfter('Comprobacion de correo desechable') || findAfter('Disposable check');
  const disposableStatus: EmailValidationResult['disposableStatus'] =
    disposableStatusLine.toLowerCase().includes('advertencia') || disposableStatusLine.toLowerCase().includes('warning') ? 'warning' :
    disposableStatusLine.toLowerCase().includes('peligro') || disposableStatusLine.toLowerCase().includes('danger') ? 'danger' :
    isDisposable ? 'warning' : 'safe';

  const disposableDomain = findAfter('Dominio desechable detectado') || findAfter('Disposable domain detected');

  // MX records
  const mxPresent = lines.some(l =>
    (l.includes('MX') && (l.includes('Presente') || l.includes('Present'))) ||
    l.includes('Registros MX')
  );
  const mxRecords: string[] = [];
  let inMxSection = false;
  for (const line of lines) {
    if (line.includes('Registros MX') || line.includes('MX records')) {
      inMxSection = true;
      continue;
    }
    if (inMxSection) {
      if (line.includes('Presente') || line.includes('Present') || line.includes('No presente') ||
          line.includes('A ') || line.includes('AAAA') || line.includes('SPF') || line.includes('DMARC') ||
          line.includes('BIMI') || line.includes('Registros TXT')) {
        break;
      }
      if (line.includes('(') && line.includes(')')) {
        mxRecords.push(line);
      }
    }
  }

  // Other DNS records
  const aRecordPresent = lines.some(l => l.includes('A') && (l.includes('Presente') || l.includes('Present')));
  const aaaaRecordPresent = lines.some(l => l.includes('AAAA') && (l.includes('Presente') || l.includes('Present')));

  // SPF
  const spfPresent = lines.some(l => l.includes('SPF') && (l.includes('Presente') || l.includes('Present')));
  let spfRecord = '';
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('v=spf1')) {
      spfRecord = lines[i];
      break;
    }
  }

  // DMARC
  const dmarcPresent = lines.some(l => l.includes('DMARC') && (l.includes('Presente') || l.includes('Present')));
  let dmarcPolicy = '';
  let dmarcRecord = '';
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('Policy:')) {
      dmarcPolicy = lines[i].replace('Policy:', '').trim();
    }
    if (lines[i].includes('v=DMARC1')) {
      dmarcRecord = lines[i];
    }
  }

  // BIMI
  const bimiPresent = lines.some(l => l.includes('BIMI') && (l.includes('Presente') || l.includes('Present')));
  // Also check for "Falta" / "Missing"
  const bimiMissing = lines.some(l => l.includes('BIMI') && (l.includes('Falta') || l.includes('Missing')));

  // Normalized email
  const normalizedEmail = findAfter('Correo normalizado') || findAfter('Normalized email') || email;

  // Build raw text for AI
  const validationStart = lines.findIndex(l => l.includes('Validacion de correo') || l.includes('Validation for'));
  const rawValidationText = validationStart >= 0
    ? lines.slice(validationStart, validationStart + 80).join('\n')
    : '';

  return {
    email,
    normalizedEmail,
    isValid: isValidText,
    overallStatus,
    overallLabel,
    syntaxCheck,
    domainAccessibility,
    provider,
    providerType,
    providerDomain,
    isDisposable,
    disposableStatus,
    disposableDomain,
    mxPresent,
    mxRecords,
    aRecordPresent,
    aaaaRecordPresent,
    spfPresent,
    spfRecord,
    dmarcPresent,
    dmarcPolicy,
    dmarcRecord,
    bimiPresent: bimiPresent && !bimiMissing,
    rawValidationText,
  };
}

// ── Main validation function ──

export async function validateEmail(email: string): Promise<EmailValidationResult> {
  const url = `https://email-validator.com/es/validate?email=${encodeURIComponent(email)}`;

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'es,en;q=0.9',
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      console.warn(`[EmailValidator] HTTP ${response.status} for ${email}`);
      return createFallbackResult(email, `HTTP ${response.status}`);
    }

    const html = await response.text();

    // Check if the page actually contains validation results
    if (!html.includes('Validacion de correo') && !html.includes('Validation for')) {
      console.warn(`[EmailValidator] No validation data found for ${email}`);
      return createFallbackResult(email, 'No se encontraron datos de validación');
    }

    return parseEmailValidatorHTML(html, email);
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : 'Error desconocido';
    console.warn(`[EmailValidator] Error validating ${email}:`, errMsg);
    return createFallbackResult(email, errMsg);
  }
}

function createFallbackResult(email: string, error: string): EmailValidationResult {
  return {
    email,
    normalizedEmail: email,
    isValid: false,
    overallStatus: 'unknown',
    overallLabel: `Error: ${error}`,
    syntaxCheck: 'unknown',
    domainAccessibility: 'unknown',
    provider: '',
    providerType: '',
    providerDomain: '',
    isDisposable: false,
    disposableStatus: 'unknown',
    mxPresent: false,
    mxRecords: [],
    aRecordPresent: false,
    aaaaRecordPresent: false,
    spfPresent: false,
    dmarcPresent: false,
    bimiPresent: false,
    rawValidationText: `Error al validar: ${error}`,
  };
}

// ── Convert to OSINTResult[] ──

export function emailValidationToOSINTResults(validation: EmailValidationResult): OSINTResult[] {
  const results: OSINTResult[] = [];
  const { email } = validation;

  // 1. Overall result
  if (validation.overallStatus === 'invalid') {
    results.push({
      source: 'Email Validator',
      category: 'email_invalid',
      severity: 'high',
      title: `Correo inválido: ${email}`,
      description: `La dirección de correo "${email}" no es válida. La sintaxis o el dominio no superaron las comprobaciones. Esto indica que el correo no existe o no puede recibir mensajes.`,
      url: `https://email-validator.com/es/validate?email=${encodeURIComponent(email)}`,
      dataFound: `Estado: Inválido | Sintaxis: ${validation.syntaxCheck} | Dominio: ${validation.domainAccessibility}`,
    });
  } else if (validation.overallStatus === 'suspicious') {
    results.push({
      source: 'Email Validator',
      category: 'email_suspicious',
      severity: 'critical',
      title: `Correo sospechoso: ${email}`,
      description: `La dirección de correo "${email}" es sospechosa. ${validation.isDisposable ? 'El dominio está clasificado como correo desechable/temporal, lo que indica que podría ser utilizado para registros falsos o actividades fraudulentas.' : 'Se detectaron anomalías en la validación del correo.'}`,
      url: `https://email-validator.com/es/validate?email=${encodeURIComponent(email)}`,
      dataFound: `Estado: Sospechoso | Desechable: ${validation.isDisposable ? 'Sí' : 'No'} | Proveedor: ${validation.provider} (${validation.providerType})`,
    });
  } else if (validation.overallStatus === 'valid') {
    results.push({
      source: 'Email Validator',
      category: 'email_validation',
      severity: 'info',
      title: `Correo válido: ${email}`,
      description: `La dirección de correo "${email}" superó las comprobaciones de sintaxis y dominio. Proveedor: ${validation.provider} (${validation.providerType}). ${validation.isDisposable ? '⚠️ Sin embargo, el dominio está marcado como desechable.' : 'No se detectaron señales de correo desechable.'}`,
      url: `https://email-validator.com/es/validate?email=${encodeURIComponent(email)}`,
      dataFound: `Estado: Válido | Sintaxis: ${validation.syntaxCheck} | Dominio: ${validation.domainAccessibility} | Proveedor: ${validation.provider}`,
    });
  }

  // 2. Disposable email warning
  if (validation.isDisposable) {
    results.push({
      source: 'Email Validator',
      category: 'disposable_email',
      severity: 'critical',
      title: `Correo desechable/temporal detectado: ${validation.disposableDomain || validation.providerDomain}`,
      description: `El dominio "${validation.disposableDomain || validation.providerDomain}" está clasificado como proveedor de correo desechable o temporal (${validation.provider}). Este tipo de correos se utilizan frecuentemente para registros falsos, evasión de verificaciones, actividades de spam o fraude. Se recomienda no confiar en este correo para comunicaciones oficiales o verificaciones de identidad.`,
      url: `https://email-validator.com/es/validate?email=${encodeURIComponent(email)}`,
      dataFound: `Dominio desechable: ${validation.disposableDomain || validation.providerDomain} | Proveedor: ${validation.provider} | Tipo: ${validation.providerType}`,
    });
  }

  // 3. DNS security analysis
  const dnsFindings: string[] = [];
  if (!validation.mxPresent) dnsFindings.push('Sin registros MX');
  if (!validation.spfPresent) dnsFindings.push('Sin SPF');
  if (!validation.dmarcPresent) dnsFindings.push('Sin DMARC');
  if (!validation.bimiPresent) dnsFindings.push('Sin BIMI');

  if (dnsFindings.length > 0 && validation.overallStatus !== 'invalid') {
    results.push({
      source: 'Email Validator',
      category: 'dns_security',
      severity: dnsFindings.length >= 3 ? 'high' : 'medium',
      title: `Configuración DNS débil para ${validation.providerDomain}`,
      description: `El dominio "${validation.providerDomain}" presenta deficiencias en su configuración DNS de seguridad: ${dnsFindings.join(', ')}. ${!validation.spfPresent ? 'La ausencia de SPF permite que cualquier servidor envíe correos en nombre de este dominio. ' : ''}${!validation.dmarcPresent ? 'Sin DMARC, no hay política de protección contra suplantación. ' : ''}${!validation.mxPresent ? 'Sin registros MX, el dominio no puede recibir correos. ' : ''}Esto puede indicar un dominio mal configurado o de baja confianza.`,
      url: `https://email-validator.com/es/validate?email=${encodeURIComponent(email)}`,
      dataFound: `MX: ${validation.mxPresent ? 'Presente' : 'Ausente'} | SPF: ${validation.spfPresent ? 'Presente' : 'Ausente'} | DMARC: ${validation.dmarcPresent ? 'Presente' : 'Ausente'} | BIMI: ${validation.bimiPresent ? 'Presente' : 'Ausente'}${validation.spfRecord ? ` | SPF: ${validation.spfRecord}` : ''}${validation.dmarcPolicy ? ` | DMARC Policy: ${validation.dmarcPolicy}` : ''}`,
    });
  } else if (validation.spfPresent && validation.dmarcPresent && validation.mxPresent) {
    results.push({
      source: 'Email Validator',
      category: 'dns_security',
      severity: 'info',
      title: `Configuración DNS completa para ${validation.providerDomain}`,
      description: `El dominio "${validation.providerDomain}" cuenta con una configuración DNS robusta: MX presente (${validation.mxRecords.length} registros), SPF configurado${validation.dmarcPresent ? ', DMARC activo' : ''}${validation.bimiPresent ? ', BIMI presente' : ''}. Esto indica un proveedor de correo legítimo y bien configurado.`,
      url: `https://email-validator.com/es/validate?email=${encodeURIComponent(email)}`,
      dataFound: `MX: ${validation.mxRecords.length} registros | SPF: ${validation.spfRecord || 'Presente'} | DMARC: ${validation.dmarcPolicy || 'Presente'}${validation.dmarcRecord ? ` | ${validation.dmarcRecord}` : ''}`,
    });
  }

  // 4. Provider type detail
  if (validation.providerType && validation.providerType.toLowerCase().includes('desechable')) {
    results.push({
      source: 'Email Validator',
      category: 'email_provider',
      severity: 'high',
      title: `Proveedor de correo desechable: ${validation.provider}`,
      description: `El correo "${email}" pertenece al proveedor "${validation.provider}", clasificado como "${validation.providerType}". Los proveedores de correo desechable ofrecen direcciones temporales que se autodestruyen, frecuentemente utilizadas para evadir verificaciones de identidad, crear cuentas falsas o realizar actividades maliciosas sin rastro.`,
      url: `https://email-validator.com/es/validate?email=${encodeURIComponent(email)}`,
      dataFound: `Proveedor: ${validation.provider} | Tipo: ${validation.providerType} | Dominio: ${validation.providerDomain}`,
    });
  }

  // If no results were generated (unknown state), add a basic info result
  if (results.length === 0) {
    results.push({
      source: 'Email Validator',
      category: 'email_validation',
      severity: 'info',
      title: `Validación de correo: ${email}`,
      description: `No se pudo determinar el estado exacto del correo "${email}". La validación retornó un estado desconocido. Se recomienda verificar manualmente en email-validator.com.`,
      url: `https://email-validator.com/es/validate?email=${encodeURIComponent(email)}`,
      dataFound: validation.rawValidationText.substring(0, 500),
    });
  }

  return results;
}

// ── Scan function compatible with Engine Registry ──

export async function scanEmailValidator(subject: {
  fullName: string;
  email?: string;
  cedula?: string;
  phone?: string;
}): Promise<OSINTResult[]> {
  if (!subject.email) {
    return [{
      source: 'Email Validator',
      category: 'email_validation',
      severity: 'info',
      title: 'Validación de correo no disponible',
      description: `No se proporcionó una dirección de correo electrónico para "${subject.fullName}". El motor de validación de correo requiere un email para funcionar.`,
    }];
  }

  try {
    const validation = await validateEmail(subject.email);
    return emailValidationToOSINTResults(validation);
  } catch (error) {
    console.error('[EmailValidator] Scan error:', error);
    return [{
      source: 'Email Validator',
      category: 'email_validation',
      severity: 'info',
      title: `Error al validar correo: ${subject.email}`,
      description: `No se pudo completar la validación del correo "${subject.email}". Error: ${error instanceof Error ? error.message : 'Desconocido'}`,
    }];
  }
}
