import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/auth';

const SYSTEM_PROMPT = 'Eres SOFIA (Sistema de Orientación para la Investigación de Fuentes Abiertas), un asistente de IA especializado en OSINT integrado en el portal OSINT Data Scanner.\n\n' +
'PERSONALIDAD:\n' +
'- Profesional, analítica y directa, pero también cercana y empática\n' +
'- Respondes SIEMPRE en español\n' +
'- Tono de conversación natural, no robótico\n' +
'- Haces preguntas de seguimiento para entender mejor al usuario\n' +
'- Ofreces recomendaciones prácticas y accionables\n' +
'- Explicas el "por qué" y el "cómo", no solo el "qué"\n' +
'- Usas formato Markdown para organizar respuestas largas\n\n' +
'FORMA DE RESPONDER:\n' +
'- NO des respuestas planas de una sola línea. Siempre amplía con contexto\n' +
'- Si preguntan por una fuente OSINT, explica qué es, cómo funciona y qué puede encontrar\n' +
'- Si preguntan por un resultado, ayuda a interpretar el nivel de riesgo y sugiere acciones\n' +
'- Termina con una pregunta o invitación a continuar\n' +
'- Menciona legislación colombiana cuando sea relevante (Ley 1581/2012, Ley 1273/2009)\n\n' +
'CAPACIDADES DEL PORTAL:\n' +
'1. **Escaneo individual**: Nombre, cédula, correo y/o teléfono → 16 búsquedas OSINT en paralelo\n' +
'2. **Carga por lotes**: Archivo .xlsx o .csv con múltiples personas\n' +
'3. **Análisis de vínculos**: Excel con 2+ hojas → relaciones empresariales, personales, familiares y laborales\n' +
'4. **Informes**: PDF y DOCX profesionales con hallazgos, conclusiones y cadena de evidencia\n' +
'5. **Chat (este)**: Asistente IA orientado a OSINT\n\n' +
'16 MOTORES OSINT CLASIFICADOS:\n' +
'**Brechas y Credenciales**: HIBP, Pwned Passwords, HIBP Deep Check, Dehashed, LeakIX\n' +
'**Dark Web y Filtraciones**: Dark Web/Leak Scan, LeakRadar\n' +
'**Redes Sociales**: Social Media Scan, DeepFind Profile Analyzer\n' +
'**Búsqueda Avanzada**: Google Dorking, Document Exposure Scan\n' +
'**Identidad y Datos**: Data Broker Scan, Pipl, DeepFind Deep Search\n' +
'**Judicial y Oficial**: Policía Nacional Colombia, Aleph/OCCRP\n\n' +
'El escáner ahora integra IA (DeepSeek) para analizar resultados y generar hallazgos contextualizados.';

// ── API Configuration ──
const ZAI_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjoiZWU5M2ViOWYtMDMzYS00MjMwLWE1ZTMtNDFiNDRhYjIyOTUwIiwiY2hhdF9pZCI6ImNoYXQtYTE2NDgwODgtY2FjNi00NWYyLTk2NDEtZmUyYzk2ODdkNjgwIiwicGxhdGZvcm0iOiJ6YWkifQ.YdDhkH93qw_CF0-kXCuL-Rz5c-EbM1j-nqwuA2YP8b0';
const ZAI_USER_ID = 'ee93eb9f-033a-4230-a5e3-41b44ab22950';
const ZAI_CHAT_ID = 'chat-a1648088-cac6-45f2-9641-fe2c9687d680';

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

// ── DeepSeek Chat API (Primary) ──
async function tryDeepSeekChat(messages: ChatMessage[], apiKey: string): Promise<string | null> {
  try {
    const response = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages,
        temperature: 0.8,
        max_tokens: 2048,
      }),
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      console.warn(`[Chat] DeepSeek API returned ${response.status}`);
      return null;
    }

    const completion = await response.json();
    const content = completion.choices?.[0]?.message?.content;
    if (content) {
      console.log('[Chat] Success via DeepSeek API');
      return content;
    }
    return null;
  } catch (error) {
    console.warn('[Chat] DeepSeek API failed:', error instanceof Error ? error.message : 'unknown');
    return null;
  }
}

// ── Z.ai Chat API (Fallback 1) ──
async function tryZaiChat(messages: ChatMessage[]): Promise<string | null> {
  const endpoints = [
    { name: 'internal', url: 'https://internal-api.z.ai/v1/chat/completions', timeout: 10000 },
    { name: 'public', url: 'https://api.z.ai/api/v1/chat/completions', timeout: 8000 },
  ];

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer Z.ai',
    'X-Z-AI-From': 'Z',
    'X-Chat-Id': ZAI_CHAT_ID,
    'X-User-Id': ZAI_USER_ID,
    'X-Token': ZAI_TOKEN,
  };

  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint.url, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          messages,
          temperature: 0.8,
          max_tokens: 2048,
          thinking: { type: 'disabled' },
        }),
        signal: AbortSignal.timeout(endpoint.timeout),
      });

      if (!response.ok) continue;

      const completion = await response.json();
      const content = completion.choices?.[0]?.message?.content;
      if (content) {
        console.log(`[Chat] Success via Z.ai ${endpoint.name}`);
        return content;
      }
    } catch { /* try next */ }
  }

  return null;
}

// ── Knowledge Base Fallback ──
const OSINT_KNOWLEDGE: Array<{ keywords: string[]; response: string }> = [
  {
    keywords: ['osint', 'qué es', 'que es', 'definición', 'definicion', 'significa'],
    response: '**OSINT** (Open Source Intelligence) es la recopilación y análisis de información disponible públicamente para producir inteligencia accionable.\n\nLas fuentes incluyen:\n- **Internet público**: sitios web, foros, redes sociales\n- **Documentos públicos**: registros gubernamentales, bases judiciales\n- **Bases de filtraciones**: registros de brechas, credenciales expuestos\n- **Metadados**: información en documentos, fotos y archivos\n\nEl OSINT Data Scanner automatiza búsqueda en 16 fuentes OSINT diferentes. **Importante**: El OSINT se limita a información públicamente disponible.'
  },
  {
    keywords: ['haveibeenpwned', 'hibp', 'brecha', 'brechas', 'filtración', 'comprometido'],
    response: '**Have I Been Pwned (HIBP)** verifica si tu correo ha sido comprometido en filtraciones. Contiene más de 12 mil millones de cuentas comprometidas.\n\nEl escáner incluye:\n- **HIBP Check**: Verificación estándar\n- **HIBP Deep Check**: Búsqueda profunda\n\n**¿Qué hacer si apareces en una brecha?**\n1. Cambia la contraseña inmediatamente\n2. Habilita 2FA\n3. No reutilices contraseñas\n4. Monitorea regularmente\n\n¿Quieres saber más sobre cómo proteger tus cuentas?'
  },
  {
    keywords: ['contraseña', 'password', 'credenciales', 'dehashed'],
    response: '**Exposición de credenciales** es uno de los riesgos más críticos. El escáner verifica vía Pwned Passwords, Dehashed y LeakIX.\n\n**Recomendaciones:**\n1. Contraseñas únicas por servicio (mínimo 12 caracteres)\n2. Gestor de contraseñas (Bitwarden, 1Password)\n3. 2FA en todas las cuentas\n4. Verificación periódica en HIBP\n\n¿Necesitas ayuda con alguna brecha específica?'
  },
  {
    keywords: ['redes sociales', 'social media', 'facebook', 'linkedin', 'perfil'],
    response: '**Escaneo de Redes Sociales** busca tu huella digital en LinkedIn, Facebook, Twitter, Instagram y TikTok.\n\n**Cómo proteger tu huella:**\n1. Revisa configuración de privacidad en cada plataforma\n2. Limita información personal visible\n3. Desactiva indexación por buscadores\n4. Revisa periódicamente qué aparece al buscar tu nombre\n\n¿Te gustaría saber más sobre configuración de privacidad?'
  },
  {
    keywords: ['ley', 'protección', 'datos', '1581', '1273', 'colombia', 'habeas data'],
    response: '**Marco legal colombiano:**\n\n**Ley 1581 de 2012**: Derecho a conocer, actualizar, rectificar y solicitar supresión de datos personales. La SIC vela por su cumplimiento.\n\n**Ley 1273 de 2009**: Delitos informáticos — acceso abusivo (36-72 meses), daño informático (48-96 meses), hurto informático (48-120 meses).\n\n**Si tus datos fueron expuestos:**\n1. Documenta la exposición\n2. Denuncia ante la Fiscalía\n3. Queja ante la SIC\n4. Solicita eliminación de datos\n\n¿Necesitas orientación sobre algún caso específico?'
  },
  {
    keywords: ['dark web', 'leak', 'leakradar', 'leakix', 'filtración masiva'],
    response: '**Escaneo Dark Web** identifica si tus datos aparecen en filtraciones masivas.\n\nMotores: Dark Web/Leak Scan, LeakRadar, LeakIX\n\n**Si tus datos están comprometidos:**\n1. Cambia todas las contraseñas afectadas\n2. Activa 2FA\n3. Monitorea estados financieros\n4. Presenta denuncia\n\n¿Tienes alguna consulta sobre filtraciones?'
  },
  {
    keywords: ['cedula', 'documento', 'identidad', 'antecedentes', 'policía', 'judicial'],
    response: '**Búsqueda por documento** verifica exposición de tu cédula en fuentes públicas.\n\nEl escáner busca en: Google Dorking, Document Exposure, Policía Nacional, Aleph/OCCRP, Dehashed y LeakIX.\n\n**Protección:**\n- No compartas digitalmente sin necesidad\n- Verifica legitimidad del sitio que la solicita\n- Si aparece expuesta, solicita eliminación\n- Presenta queja ante la SIC\n\n¿Te puedo ayudar con algo más?'
  },
  {
    keywords: ['informe', 'reporte', 'pdf', 'docx', 'descargar'],
    response: '**Informes del Portal:**\n\n- Disponibles en **PDF** y **DOCX**\n- Incluyen hallazgos con severidad, recomendaciones, cadena de evidencia\n- Portada profesional con número de caso\n\n**Flujo:**\n1. Ingresa datos → Escaneo con 16 motores → Revisa resultados → Descarga informe\n\n¿Necesitas ayuda generando un informe?'
  },
];

function generateFallbackResponse(userMessage: string): string {
  const lowerMsg = userMessage.toLowerCase();

  let bestMatch: { keywords: string[]; response: string } | null = null;
  let bestMatchCount = 0;

  for (const entry of OSINT_KNOWLEDGE) {
    const matchCount = entry.keywords.filter(kw => lowerMsg.includes(kw)).length;
    if (matchCount > bestMatchCount) {
      bestMatchCount = matchCount;
      bestMatch = entry;
    }
  }

  if (bestMatch && bestMatchCount > 0) {
    return bestMatch.response;
  }

  if (lowerMsg.match(/^(hola|buenos|buenas|saludos|hey|hi|hello)/)) {
    return '¡Hola! 👋 Soy **SOFIA**, tu asistente OSINT. Puedo ayudarte con:\n\n' +
      '🔍 **Escáner** — Cómo funciona, qué busca, cómo interpretar resultados\n' +
      '🛡️ **Ciberseguridad** — Protección de datos, contraseñas, huella digital\n' +
      '📋 **Legislación** — Ley 1581/2012, Ley 1273/2009\n' +
      '📊 **Informes** — Cómo generar informes PDF/DOCX\n\n' +
      '¿En qué te puedo ayudar?';
  }

  return 'Soy **SOFIA**, asistente OSINT. Puedo orientarte sobre:\n\n' +
    '- **OSINT y fuentes abiertas**: Qué es, cómo funciona\n' +
    '- **Protección de datos**: Ley 1581 de 2012, derechos\n' +
    '- **Ciberseguridad**: Contraseñas, brechas, dark web\n' +
    '- **Uso del escáner**: Escaneo individual, lotes, informes\n\n' +
    '¿En qué puedo ayudarte?';
}

export async function POST(request: NextRequest) {
  try {
    const auth = await verifyAuth(request);
    if (!auth.authenticated) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const body = await request.json();
    const { messages, deepseekKey } = body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ error: 'Se requieren mensajes' }, { status: 400 });
    }

    const lastMessage = messages[messages.length - 1]?.content || '';

    const apiMessages: ChatMessage[] = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...messages.slice(-20).map((m: { role: string; content: string }) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
    ];

    // Strategy 1: DeepSeek (prefer server env var over client key)
    const effectiveKey = process.env.DEEPSEEK_API_KEY || deepseekKey;
    if (effectiveKey) {
      const result = await tryDeepSeekChat(apiMessages, effectiveKey);
      if (result) {
        return NextResponse.json({ message: result });
      }
    }

    // Strategy 2: Z.ai API
    const zaiResult = await tryZaiChat(apiMessages);
    if (zaiResult) {
      return NextResponse.json({ message: zaiResult });
    }

    // Strategy 3: Knowledge base fallback
    console.log('[Chat] All APIs unavailable, using knowledge base');
    const fallbackResponse = generateFallbackResponse(lastMessage);
    return NextResponse.json({ message: fallbackResponse });

  } catch (error) {
    console.error('[Chat] Error:', error);
    try {
      const body2 = await request.clone().json();
      const msgs = body2.messages;
      const lastMsg = msgs?.[msgs.length - 1]?.content || '';
      return NextResponse.json({ message: generateFallbackResponse(lastMsg) });
    } catch {
      return NextResponse.json(
        { error: 'Error al generar respuesta' },
        { status: 500 }
      );
    }
  }
}
