import ZAI from 'z-ai-web-dev-sdk';

let zaiInstance: InstanceType<typeof ZAI> | null = null;

async function getZAI() {
  if (!zaiInstance) {
    zaiInstance = await ZAI.create();
  }
  return zaiInstance;
}

export interface OSINTResult {
  source: string;
  category: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  title: string;
  description?: string;
  url?: string;
  dataFound?: string;
}

// ── HIBP Check ──
export async function checkHIBP(email: string): Promise<OSINTResult[]> {
  const results: OSINTResult[] = [];
  try {
    const zai = await getZAI();
    const searchResults = await zai.functions.invoke('web_search', {
      query: `site:haveibeenpwned.com "${email}"`,
      num: 5,
    });
    
    if (searchResults && searchResults.length > 0) {
      results.push({
        source: 'Have I Been Pwned',
        category: 'credential_breach',
        severity: 'critical',
        title: 'Correo encontrado en verificación HIBP',
        description: `Se encontraron resultados al buscar "${email}" en Have I Been Pwned. Visita haveibeenpwned.com para ver las brechas específicas.`,
        url: `https://haveibeenpwned.com/account/${encodeURIComponent(email)}`,
        dataFound: email,
      });
    }
    
    // Also search for the email in breach databases
    const breachSearch = await zai.functions.invoke('web_search', {
      query: `"${email}" data breach leaked`,
      num: 10,
    });
    
    for (const result of breachSearch || []) {
      results.push({
        source: 'Web Search - Breaches',
        category: 'credential_breach',
        severity: 'high',
        title: `Mención en: ${result.name}`,
        description: result.snippet,
        url: result.url,
        dataFound: email,
      });
    }
  } catch (error) {
    results.push({
      source: 'Have I Been Pwned',
      category: 'error',
      severity: 'info',
      title: 'Error al verificar HIBP',
      description: `No se pudo completar la verificación: ${error instanceof Error ? error.message : 'Error desconocido'}`,
    });
  }
  return results;
}

// ── Pwned Passwords ──
export async function checkPwnedPasswords(email: string): Promise<OSINTResult[]> {
  const results: OSINTResult[] = [];
  try {
    const zai = await getZAI();
    const searchResults = await zai.functions.invoke('web_search', {
      query: `"${email}" password leak credentials exposed`,
      num: 10,
    });
    
    for (const result of searchResults || []) {
      results.push({
        source: 'Pwned Passwords Search',
        category: 'password_exposure',
        severity: 'critical',
        title: `Posible exposición de credenciales: ${result.name}`,
        description: result.snippet,
        url: result.url,
        dataFound: email,
      });
    }
  } catch {
    // silent fail
  }
  return results;
}

// ── Google Dorking ──
export async function googleDorkSearch(fullName: string, email?: string, phone?: string, cedula?: string): Promise<OSINTResult[]> {
  const results: OSINTResult[] = [];
  const zai = await getZAI();
  
  const queries = [
    `"${fullName}" -facebook -instagram -twitter -linkedin`,
    `"${fullName}" filetype:pdf OR filetype:doc OR filetype:xlsx`,
    `"${fullName}" "cedula" OR "identificacion" OR "documento"`,
  ];
  
  if (email) {
    queries.push(`"${email}" -site:${email.split('@')[1]}`);
    queries.push(`"${email}" pastebin OR paste`);
  }
  if (phone) {
    queries.push(`"${phone}" "telefono" OR "celular" OR "contacto"`);
  }
  if (cedula) {
    queries.push(`"${cedula}" "cedula" OR "documento" OR "identidad"`);
  }
  
  for (const query of queries) {
    try {
      const searchResults = await zai.functions.invoke('web_search', {
        query,
        num: 8,
      });
      
      for (const result of searchResults || []) {
        results.push({
          source: 'Google Dorking',
          category: 'personal_exposure',
          severity: 'medium',
          title: `Dato encontrado: ${result.name}`,
          description: result.snippet,
          url: result.url,
          dataFound: query.replace(/"/g, ''),
        });
      }
    } catch {
      // continue with next query
    }
  }
  return results;
}

// ── Social Media Scan ──
export async function scanSocialMedia(fullName: string, email?: string): Promise<OSINTResult[]> {
  const results: OSINTResult[] = [];
  const zai = await getZAI();
  
  const platforms = ['linkedin', 'facebook', 'twitter', 'instagram', 'tiktok'];
  
  for (const platform of platforms) {
    try {
      const searchResults = await zai.functions.invoke('web_search', {
        query: `site:${platform}.com "${fullName}"`,
        num: 5,
      });
      
      for (const result of searchResults || []) {
        results.push({
          source: 'Social Media Scan',
          category: 'social_media',
          severity: 'low',
          title: `Perfil en ${platform}: ${result.name}`,
          description: result.snippet,
          url: result.url,
          dataFound: fullName,
        });
      }
    } catch {
      // continue
    }
  }
  
  // Also check for username variations from email
  if (email) {
    const username = email.split('@')[0];
    try {
      const searchResults = await zai.functions.invoke('web_search', {
        query: `"${username}" profile account -site:${email.split('@')[1]}`,
        num: 5,
      });
      
      for (const result of searchResults || []) {
        results.push({
          source: 'Username Scan',
          category: 'social_media',
          severity: 'low',
          title: `Cuenta con username "${username}": ${result.name}`,
          description: result.snippet,
          url: result.url,
          dataFound: username,
        });
      }
    } catch {
      // continue
    }
  }
  
  return results;
}

// ── Data Broker / People Search ──
export async function scanDataBrokers(fullName: string, email?: string, phone?: string): Promise<OSINTResult[]> {
  const results: OSINTResult[] = [];
  const zai = await getZAI();
  
  const queries = [
    `"${fullName}" "directorio" OR "phonebook" OR "white pages" OR "people finder"`,
  ];
  
  if (email) {
    queries.push(`"${email}" "email finder" OR "email lookup" OR directorio`);
  }
  if (phone) {
    queries.push(`"${phone}" "phone lookup" OR "who called" OR "numero"`);
  }
  
  for (const query of queries) {
    try {
      const searchResults = await zai.functions.invoke('web_search', {
        query,
        num: 8,
      });
      
      for (const result of searchResults || []) {
        results.push({
          source: 'Data Broker Scan',
          category: 'data_broker',
          severity: 'high',
          title: `Encontrado en directorio: ${result.name}`,
          description: result.snippet,
          url: result.url,
          dataFound: query.replace(/"/g, ''),
        });
      }
    } catch {
      // continue
    }
  }
  return results;
}

// ── Dark Web Mention ──
export async function scanDarkWeb(email: string, fullName?: string): Promise<OSINTResult[]> {
  const results: OSINTResult[] = [];
  const zai = await getZAI();
  
  const queries = [
    `"${email}" leak OR breach OR dump OR paste`,
  ];
  if (fullName) {
    queries.push(`"${fullName}" leak OR breach OR "datos filtrados" OR "datos expuestos"`);
  }
  
  for (const query of queries) {
    try {
      const searchResults = await zai.functions.invoke('web_search', {
        query,
        num: 10,
      });
      
      for (const result of searchResults || []) {
        const hostName = result.host_name || '';
        const isPaste = hostName.includes('paste') || hostName.includes('ghostbin') || hostName.includes('justpaste');
        results.push({
          source: 'Dark Web / Leak Scan',
          category: isPaste ? 'paste_site' : 'dark_web_mention',
          severity: isPaste ? 'critical' : 'high',
          title: `Mención en filtración: ${result.name}`,
          description: result.snippet,
          url: result.url,
          dataFound: query.replace(/"/g, ''),
        });
      }
    } catch {
      // continue
    }
  }
  return results;
}

// ── Document Exposure ──
export async function scanDocumentExposure(fullName: string, cedula?: string): Promise<OSINTResult[]> {
  const results: OSINTResult[] = [];
  const zai = await getZAI();
  
  const queries = [
    `"${fullName}" filetype:pdf OR filetype:doc OR filetype:xlsx OR filetype:csv`,
  ];
  
  if (cedula) {
    queries.push(`"${cedula}" filetype:pdf OR filetype:doc OR filetype:xlsx`);
    queries.push(`"${cedula}" "cedula" OR "identidad" OR "documento" -site:gov`);
  }
  
  for (const query of queries) {
    try {
      const searchResults = await zai.functions.invoke('web_search', {
        query,
        num: 8,
      });
      
      for (const result of searchResults || []) {
        results.push({
          source: 'Document Exposure Scan',
          category: 'document_exposure',
          severity: 'high',
          title: `Documento expuesto: ${result.name}`,
          description: result.snippet,
          url: result.url,
          dataFound: query.replace(/"/g, ''),
        });
      }
    } catch {
      // continue
    }
  }
  return results;
}

// ── Full Scan Orchestrator ──
export async function runFullScan(data: {
  fullName: string;
  cedula?: string;
  email?: string;
  phone?: string;
}): Promise<OSINTResult[]> {
  const allResults: OSINTResult[] = [];
  
  // Run scans in parallel batches
  const scanPromises: Promise<OSINTResult[]>[] = [];
  
  if (data.email) {
    scanPromises.push(checkHIBP(data.email));
    scanPromises.push(checkPwnedPasswords(data.email));
    scanPromises.push(scanDarkWeb(data.email, data.fullName));
  }
  
  scanPromises.push(googleDorkSearch(data.fullName, data.email, data.phone, data.cedula));
  scanPromises.push(scanSocialMedia(data.fullName, data.email));
  scanPromises.push(scanDataBrokers(data.fullName, data.email, data.phone));
  scanPromises.push(scanDocumentExposure(data.fullName, data.cedula));
  
  const batchResults = await Promise.allSettled(scanPromises);
  
  for (const result of batchResults) {
    if (result.status === 'fulfilled') {
      allResults.push(...result.value);
    }
  }
  
  // Deduplicate by URL
  const seen = new Set<string>();
  const deduped = allResults.filter(r => {
    const key = r.url ? `${r.source}:${r.url}` : `${r.source}:${r.title}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  
  return deduped;
}
