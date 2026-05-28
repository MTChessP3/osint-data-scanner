import { NextRequest, NextResponse } from 'next/server';
import { runSocialMediaScan, SOCIAL_PLATFORMS, SocialScanResponse } from '@/lib/social-media-scanner';
import { initZAIConfig } from '@/lib/zai-config';

// Set max duration for this API route (Vercel Pro supports up to 60s)
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    // Initialize ZAI config (non-blocking, with timeout)
    await Promise.race([
      initZAIConfig(),
      new Promise<void>(resolve => setTimeout(resolve, 3000)), // Don't block more than 3s on config
    ]);

    const body = await request.json();
    const { fullName, email, phone, cedula, selectedPlatforms, deepseekKey, searchMode, nickname } = body;

    console.log(`[SocialScan API] Request: mode=${searchMode}, nickname=${nickname}, platforms=${selectedPlatforms?.length}`);

    // Validate searchMode
    const validModes = ['nickname', 'email', 'name'];
    if (!searchMode || !validModes.includes(searchMode)) {
      return NextResponse.json(
        { error: `searchMode es requerido y debe ser uno de: ${validModes.join(', ')}` },
        { status: 400 }
      );
    }

    // Validate required fields per search mode
    if (searchMode === 'nickname' && (!nickname || !nickname.trim())) {
      return NextResponse.json(
        { error: 'El nickname es requerido para el modo de busqueda por nickname' },
        { status: 400 }
      );
    }
    if (searchMode === 'email' && (!email || !email.trim())) {
      return NextResponse.json(
        { error: 'El email es requerido para el modo de busqueda por email' },
        { status: 400 }
      );
    }
    if (searchMode === 'name' && (!fullName || !fullName.trim())) {
      return NextResponse.json(
        { error: 'El nombre completo es requerido para el modo de busqueda por nombre' },
        { status: 400 }
      );
    }

    if (!selectedPlatforms || !Array.isArray(selectedPlatforms) || selectedPlatforms.length === 0) {
      return NextResponse.json(
        { error: 'Selecciona al menos una red social para escanear' },
        { status: 400 }
      );
    }

    // Validate platform IDs
    const validPlatformIds = SOCIAL_PLATFORMS.map(p => p.id);
    const invalidPlatforms = selectedPlatforms.filter((id: string) => !validPlatformIds.includes(id));
    if (invalidPlatforms.length > 0) {
      return NextResponse.json(
        { error: `Plataformas no validas: ${invalidPlatforms.join(', ')}` },
        { status: 400 }
      );
    }

    // Prefer server-side DEEPSEEK_API_KEY env var over client-provided key
    const effectiveDeepseekKey = process.env.DEEPSEEK_API_KEY || deepseekKey;

    // Run scan with overall timeout protection
    const scanPromise = runSocialMediaScan({
      fullName: fullName?.trim() || undefined,
      email: email?.trim() || undefined,
      phone: phone?.trim() || undefined,
      cedula: cedula?.trim() || undefined,
      nickname: nickname?.trim() || undefined,
      searchMode,
      selectedPlatforms,
      deepseekKey: effectiveDeepseekKey,
    });

    // 55-second overall timeout
    const result: SocialScanResponse = await Promise.race([
      scanPromise,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('El escaneo excedio el tiempo limite (55s). Intenta con menos plataformas.')), 55000)
      ),
    ]);

    const elapsed = Date.now() - startTime;
    console.log(`[SocialScan API] Completed in ${elapsed}ms — ${result.summary.profilesFound} profiles found, ${result.summary.totalFindings} findings`);

    return NextResponse.json(result);
  } catch (error) {
    const elapsed = Date.now() - startTime;
    console.error(`[SocialScan API] Error after ${elapsed}ms:`, error);
    return NextResponse.json(
      {
        error: 'Error en el escaneo de redes sociales',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  // Return available platforms
  const platforms = SOCIAL_PLATFORMS.map(p => ({
    id: p.id,
    name: p.name,
    domain: p.domain,
    description: p.description,
    verifiableByHead: p.verifiableByHead,
    profileUrlTemplates: {
      nickname: p.profileUrlTemplates.nickname('__USERNAME__'),
      email: p.profileUrlTemplates.email('__EMAIL__'),
      name: p.profileUrlTemplates.name('__FIRST__', '__LAST__'),
    },
  }));

  return NextResponse.json({ platforms, searchModes: ['nickname', 'email', 'name'] });
}
