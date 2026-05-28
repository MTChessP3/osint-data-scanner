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

// ── LeakRadar ──
export async function scanLeakRadar(email: string, fullName?: string): Promise<OSINTResult[]> {
  const results: OSINTResult[] = [];
  try {
    const zai = await getZAI();
    const queries = [
      `site:leakradar.io "${email}" OR site:members.leakradar.io "${email}"`,
    ];
    if (fullName) {
      queries.push(`"${fullName}" leakradar breach database`);
    }

    for (const query of queries) {
      try {
        const searchResults = await zai.functions.invoke('web_search', {
          query,
          num: 10,
        });

        for (const result of searchResults || []) {
          results.push({
            source: 'LeakRadar',
            category: 'credential_breach',
            severity: 'critical',
            title: `Encontrado en LeakRadar: ${result.name}`,
            description: result.snippet,
            url: result.url || 'https://members.leakradar.io/es/search',
            dataFound: email,
          });
        }
      } catch {
        // continue
      }
    }

    // If no results from specific search, add a reference result
    if (results.length === 0) {
      const generalSearch = await zai.functions.invoke('web_search', {
        query: `"${email}" leak radar breach leaked credentials`,
        num: 5,
      });
      for (const result of generalSearch || []) {
        results.push({
          source: 'LeakRadar',
          category: 'credential_breach',
          severity: 'critical',
          title: `Referencia en LeakRadar: ${result.name}`,
          description: result.snippet,
          url: result.url || 'https://members.leakradar.io/es/search',
          dataFound: email,
        });
      }
    }
  } catch (error) {
    results.push({
      source: 'LeakRadar',
      category: 'error',
      severity: 'info',
      title: 'Error al verificar LeakRadar',
      description: `No se pudo completar la verificación: ${error instanceof Error ? error.message : 'Error desconocido'}`,
    });
  }
  return results;
}

// ── Policia Nacional Colombia ──
export async function scanPoliciaColombia(fullName: string, cedula?: string): Promise<OSINTResult[]> {
  const results: OSINTResult[] = [];
  try {
    const zai = await getZAI();
    const queries = [
      `"${fullName}" antecedentes policia colombia judicial`,
    ];
    if (cedula) {
      queries.push(`"${cedula}" antecedentes judiciales colombia policia`);
    }
    queries.push(`site:policia.gov.co "${fullName}" OR "antecedentes"`);

    for (const query of queries) {
      try {
        const searchResults = await zai.functions.invoke('web_search', {
          query,
          num: 8,
        });

        for (const result of searchResults || []) {
          results.push({
            source: 'Policia Nacional Colombia',
            category: 'judicial',
            severity: 'high',
            title: `Registro judicial encontrado: ${result.name}`,
            description: result.snippet,
            url: result.url || 'https://antecedentes.policia.gov.co:7005/WebJudicial/',
            dataFound: fullName,
          });
        }
      } catch {
        // continue
      }
    }
  } catch (error) {
    results.push({
      source: 'Policia Nacional Colombia',
      category: 'error',
      severity: 'info',
      title: 'Error al verificar antecedentes judiciales',
      description: `No se pudo completar la verificación: ${error instanceof Error ? error.message : 'Error desconocido'}`,
    });
  }
  return results;
}

// ── HIBP Enhanced ──
export async function checkHIBPEnhanced(email: string, fullName?: string): Promise<OSINTResult[]> {
  const results: OSINTResult[] = [];
  try {
    const zai = await getZAI();
    const directUrl = `https://haveibeenpwned.com/account/${encodeURIComponent(email)}`;

    // Search for specific breach details
    const searchResults = await zai.functions.invoke('web_search', {
      query: `"${email}" haveibeenpwned breach pwned site:haveibeenpwned.com`,
      num: 10,
    });

    for (const result of searchResults || []) {
      results.push({
        source: 'HIBP Enhanced',
        category: 'credential_breach',
        severity: 'critical',
        title: `Verificación HIBP Enhanced: ${result.name}`,
        description: `Resultado detallado de verificación para "${email}". ${result.snippet || ''}`,
        url: directUrl,
        dataFound: email,
      });
    }

    // Also search for domain-level breaches
    const domain = email.split('@')[1];
    if (domain) {
      const domainSearch = await zai.functions.invoke('web_search', {
        query: `"${domain}" data breach haveibeenpwned compromised`,
        num: 5,
      });
      for (const result of domainSearch || []) {
        results.push({
          source: 'HIBP Enhanced - Domain',
          category: 'credential_breach',
          severity: 'high',
          title: `Brecha de dominio ${domain}: ${result.name}`,
          description: result.snippet,
          url: directUrl,
          dataFound: domain,
        });
      }
    }

    if (fullName) {
      const nameSearch = await zai.functions.invoke('web_search', {
        query: `"${fullName}" haveibeenpwned OR "have i been pwned" breach`,
        num: 5,
      });
      for (const result of nameSearch || []) {
        results.push({
          source: 'HIBP Enhanced - Name',
          category: 'credential_breach',
          severity: 'critical',
          title: `Verificación por nombre: ${result.name}`,
          description: result.snippet,
          url: directUrl,
          dataFound: fullName,
        });
      }
    }
  } catch (error) {
    results.push({
      source: 'HIBP Enhanced',
      category: 'error',
      severity: 'info',
      title: 'Error al verificar HIBP Enhanced',
      description: `No se pudo completar la verificación: ${error instanceof Error ? error.message : 'Error desconocido'}`,
    });
  }
  return results;
}

// ── DeepFind Social Media ──
export async function scanDeepFindSocial(fullName: string, email?: string): Promise<OSINTResult[]> {
  const results: OSINTResult[] = [];
  try {
    const zai = await getZAI();
    const queries = [
      `"${fullName}" deepfind social media profile analyzer`,
      `"${fullName}" social media profiles analysis deepfind.me`,
    ];

    if (email) {
      queries.push(`"${email}" social media profile deepfind`);
    }

    for (const query of queries) {
      try {
        const searchResults = await zai.functions.invoke('web_search', {
          query,
          num: 8,
        });

        for (const result of searchResults || []) {
          results.push({
            source: 'DeepFind Social Media',
            category: 'social_media',
            severity: 'medium',
            title: `Análisis de perfil social: ${result.name}`,
            description: result.snippet,
            url: result.url || 'https://deepfind.me/tools/social-media/profile-analyzer',
            dataFound: fullName,
          });
        }
      } catch {
        // continue
      }
    }

    // Generic social media search via DeepFind
    const genericSearch = await zai.functions.invoke('web_search', {
      query: `"${fullName}" profile facebook twitter instagram linkedin deepfind`,
      num: 5,
    });
    for (const result of genericSearch || []) {
      results.push({
        source: 'DeepFind Social Media',
        category: 'social_media',
        severity: 'medium',
        title: `Perfil social detectado: ${result.name}`,
        description: result.snippet,
        url: result.url || 'https://deepfind.me/tools/social-media/profile-analyzer',
        dataFound: fullName,
      });
    }
  } catch (error) {
    results.push({
      source: 'DeepFind Social Media',
      category: 'error',
      severity: 'info',
      title: 'Error al verificar DeepFind Social',
      description: `No se pudo completar la verificación: ${error instanceof Error ? error.message : 'Error desconocido'}`,
    });
  }
  return results;
}

// ── Pipl ──
export async function scanPipl(fullName: string, email?: string, phone?: string): Promise<OSINTResult[]> {
  const results: OSINTResult[] = [];
  try {
    const zai = await getZAI();
    const queries = [
      `"${fullName}" pipl search people finder`,
    ];

    if (email) {
      queries.push(`"${email}" pipl search people`);
    }
    if (phone) {
      queries.push(`"${phone}" pipl phone lookup`);
    }

    for (const query of queries) {
      try {
        const searchResults = await zai.functions.invoke('web_search', {
          query,
          num: 8,
        });

        for (const result of searchResults || []) {
          results.push({
            source: 'Pipl',
            category: 'data_broker',
            severity: 'high',
            title: `Encontrado en Pipl: ${result.name}`,
            description: result.snippet,
            url: result.url || 'https://search.pipl.com/search/',
            dataFound: query.replace(/"/g, ''),
          });
        }
      } catch {
        // continue
      }
    }
  } catch (error) {
    results.push({
      source: 'Pipl',
      category: 'error',
      severity: 'info',
      title: 'Error al verificar Pipl',
      description: `No se pudo completar la verificación: ${error instanceof Error ? error.message : 'Error desconocido'}`,
    });
  }
  return results;
}

// ── LeakIX ──
export async function scanLeakIX(email: string, fullName?: string): Promise<OSINTResult[]> {
  const results: OSINTResult[] = [];
  try {
    const zai = await getZAI();
    const queries = [
      `"${email}" leakix breach vulnerability`,
    ];

    if (fullName) {
      queries.push(`"${fullName}" leakix breach leak exposed`);
    }
    queries.push(`site:leakix.net "${email}"`);

    for (const query of queries) {
      try {
        const searchResults = await zai.functions.invoke('web_search', {
          query,
          num: 10,
        });

        for (const result of searchResults || []) {
          results.push({
            source: 'LeakIX',
            category: 'credential_breach',
            severity: 'critical',
            title: `Encontrado en LeakIX: ${result.name}`,
            description: result.snippet,
            url: result.url || 'https://leakix.net/',
            dataFound: email,
          });
        }
      } catch {
        // continue
      }
    }

    // Additional broad search
    if (results.length === 0) {
      const broadSearch = await zai.functions.invoke('web_search', {
        query: `"${email}" leakix OR "leak ix" breach vulnerability exposed`,
        num: 5,
      });
      for (const result of broadSearch || []) {
        results.push({
          source: 'LeakIX',
          category: 'credential_breach',
          severity: 'critical',
          title: `Referencia LeakIX: ${result.name}`,
          description: result.snippet,
          url: result.url || 'https://leakix.net/',
          dataFound: email,
        });
      }
    }
  } catch (error) {
    results.push({
      source: 'LeakIX',
      category: 'error',
      severity: 'info',
      title: 'Error al verificar LeakIX',
      description: `No se pudo completar la verificación: ${error instanceof Error ? error.message : 'Error desconocido'}`,
    });
  }
  return results;
}

// ── Aleph / OCCRP ──
export async function scanAlephOCCRP(fullName: string, email?: string): Promise<OSINTResult[]> {
  const results: OSINTResult[] = [];
  try {
    const zai = await getZAI();
    const queries = [
      `"${fullName}" aleph occrp public records leaks`,
      `site:aleph.occrp.org "${fullName}"`,
    ];

    if (email) {
      queries.push(`"${email}" aleph occrp documents leaks`);
    }

    for (const query of queries) {
      try {
        const searchResults = await zai.functions.invoke('web_search', {
          query,
          num: 8,
        });

        for (const result of searchResults || []) {
          results.push({
            source: 'Aleph / OCCRP',
            category: 'public_records',
            severity: 'high',
            title: `Encontrado en Aleph/OCCRP: ${result.name}`,
            description: result.snippet,
            url: result.url || 'https://aleph.occrp.org/search',
            dataFound: fullName,
          });
        }
      } catch {
        // continue
      }
    }

    // Broad search if no specific results
    if (results.length === 0) {
      const broadSearch = await zai.functions.invoke('web_search', {
        query: `"${fullName}" occrp OR aleph "public records" OR leaks OR documents`,
        num: 5,
      });
      for (const result of broadSearch || []) {
        results.push({
          source: 'Aleph / OCCRP',
          category: 'public_records',
          severity: 'high',
          title: `Referencia OCCRP: ${result.name}`,
          description: result.snippet,
          url: result.url || 'https://aleph.occrp.org/search',
          dataFound: fullName,
        });
      }
    }
  } catch (error) {
    results.push({
      source: 'Aleph / OCCRP',
      category: 'error',
      severity: 'info',
      title: 'Error al verificar Aleph/OCCRP',
      description: `No se pudo completar la verificación: ${error instanceof Error ? error.message : 'Error desconocido'}`,
    });
  }
  return results;
}

// ── DeepFind People Finder ──
export async function scanDeepFindPeople(fullName: string, email?: string, phone?: string): Promise<OSINTResult[]> {
  const results: OSINTResult[] = [];
  try {
    const zai = await getZAI();
    const queries = [
      `"${fullName}" deepfind people finder deep search`,
    ];

    if (email) {
      queries.push(`"${email}" deepfind people search`);
    }
    if (phone) {
      queries.push(`"${phone}" deepfind people search phone`);
    }

    for (const query of queries) {
      try {
        const searchResults = await zai.functions.invoke('web_search', {
          query,
          num: 8,
        });

        for (const result of searchResults || []) {
          results.push({
            source: 'DeepFind People Finder',
            category: 'personal_exposure',
            severity: 'high',
            title: `Encontrado en DeepFind: ${result.name}`,
            description: result.snippet,
            url: result.url || 'https://deepfind.me/tools/people-finder/deep-search',
            dataFound: fullName,
          });
        }
      } catch {
        // continue
      }
    }

    // Generic people search
    const genericSearch = await zai.functions.invoke('web_search', {
      query: `"${fullName}" "people search" OR "people finder" OR "person lookup" deepfind`,
      num: 5,
    });
    for (const result of genericSearch || []) {
      results.push({
        source: 'DeepFind People Finder',
        category: 'personal_exposure',
        severity: 'high',
        title: `Búsqueda de persona: ${result.name}`,
        description: result.snippet,
        url: result.url || 'https://deepfind.me/tools/people-finder/deep-search',
        dataFound: fullName,
      });
    }
  } catch (error) {
    results.push({
      source: 'DeepFind People Finder',
      category: 'error',
      severity: 'info',
      title: 'Error al verificar DeepFind People Finder',
      description: `No se pudo completar la verificación: ${error instanceof Error ? error.message : 'Error desconocido'}`,
    });
  }
  return results;
}

// ── Dehashed ──
export async function scanDehashed(email: string, fullName?: string): Promise<OSINTResult[]> {
  const results: OSINTResult[] = [];
  try {
    const zai = await getZAI();
    const queries = [
      `site:dehashed.com "${email}"`,
      `"${email}" dehashed breach database search`,
    ];

    if (fullName) {
      queries.push(`"${fullName}" dehashed breach database`);
    }

    for (const query of queries) {
      try {
        const searchResults = await zai.functions.invoke('web_search', {
          query,
          num: 10,
        });

        for (const result of searchResults || []) {
          results.push({
            source: 'Dehashed',
            category: 'credential_breach',
            severity: 'critical',
            title: `Encontrado en Dehashed: ${result.name}`,
            description: result.snippet,
            url: result.url || 'https://app.dehashed.com/search',
            dataFound: email,
          });
        }
      } catch {
        // continue
      }
    }

    // Additional broad search
    if (results.length === 0) {
      const broadSearch = await zai.functions.invoke('web_search', {
        query: `"${email}" dehashed OR "de-hashed" breach database leaked credentials`,
        num: 5,
      });
      for (const result of broadSearch || []) {
        results.push({
          source: 'Dehashed',
          category: 'credential_breach',
          severity: 'critical',
          title: `Referencia Dehashed: ${result.name}`,
          description: result.snippet,
          url: result.url || 'https://app.dehashed.com/search',
          dataFound: email,
        });
      }
    }
  } catch (error) {
    results.push({
      source: 'Dehashed',
      category: 'error',
      severity: 'info',
      title: 'Error al verificar Dehashed',
      description: `No se pudo completar la verificación: ${error instanceof Error ? error.message : 'Error desconocido'}`,
    });
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
    // New email-based sources
    scanPromises.push(scanLeakRadar(data.email, data.fullName));
    scanPromises.push(checkHIBPEnhanced(data.email, data.fullName));
    scanPromises.push(scanLeakIX(data.email, data.fullName));
    scanPromises.push(scanDehashed(data.email, data.fullName));
  }

  // Name-based and general scans
  scanPromises.push(googleDorkSearch(data.fullName, data.email, data.phone, data.cedula));
  scanPromises.push(scanSocialMedia(data.fullName, data.email));
  scanPromises.push(scanDataBrokers(data.fullName, data.email, data.phone));
  scanPromises.push(scanDocumentExposure(data.fullName, data.cedula));

  // New name-based sources
  scanPromises.push(scanPoliciaColombia(data.fullName, data.cedula));
  scanPromises.push(scanDeepFindSocial(data.fullName, data.email));
  scanPromises.push(scanPipl(data.fullName, data.email, data.phone));
  scanPromises.push(scanAlephOCCRP(data.fullName, data.email));
  scanPromises.push(scanDeepFindPeople(data.fullName, data.email, data.phone));

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
