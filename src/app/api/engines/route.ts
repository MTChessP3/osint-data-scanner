import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/auth';
import { initializeEngineRegistry, engineRegistry } from '@/lib/registered-engines';

export async function GET(request: NextRequest) {
  try {
    const auth = await verifyAuth(request);
    if (!auth.authenticated) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    // Initialize registry if not already done
    initializeEngineRegistry();

    const url = new URL(request.url);
    const format = url.searchParams.get('format') || 'ui';

    if (format === 'ui') {
      // Return categories with engines in format compatible with the frontend
      const uiCategories = engineRegistry.getUICategories();
      return NextResponse.json({
        categories: uiCategories,
        totalEngines: engineRegistry.enabledCount,
        totalCategories: uiCategories.length,
      });
    }

    if (format === 'flat') {
      // Return flat list of engines
      const engines = engineRegistry.getEnabledEngines().map(e => ({
        id: e.id,
        name: e.name,
        description: e.description,
        categoryId: e.categoryId,
        icon: e.icon,
        color: e.color,
        requirements: e.requirements,
        enabled: e.enabled,
      }));
      return NextResponse.json({ engines, total: engines.length });
    }

    // Full detail format
    const categories = engineRegistry.getActiveCategories();
    const engines = engineRegistry.getEnabledEngines();
    return NextResponse.json({
      categories,
      engines: engines.map(e => ({
        id: e.id,
        name: e.name,
        description: e.description,
        categoryId: e.categoryId,
        defaultSeverity: e.defaultSeverity,
        defaultCategory: e.defaultCategory,
        requirements: e.requirements,
        icon: e.icon,
        color: e.color,
        enabled: e.enabled,
        version: e.version,
        tags: e.tags,
      })),
      totalEngines: engineRegistry.enabledCount,
      totalCategories: categories.length,
    });
  } catch (error) {
    console.error('Engines API error:', error);
    return NextResponse.json({ error: 'Error al obtener motores' }, { status: 500 });
  }
}
