/**
 * Engine Registry — Sistema escalable para registro de motores de búsqueda OSINT
 *
 * Permite agregar nuevos motores sin modificar el orquestador (runFullScan).
 * Cada motor se registra con su configuración y función de escaneo.
 *
 * USO:
 *   1. Importar `engineRegistry` y `registerEngine`
 *   2. Crear una función de escaneo que cumpla la interfaz `EngineScanFunction`
 *   3. Registrar el motor con `registerEngine({ ... })`
 *   4. El motor aparecerá automáticamente en el UI y será ejecutado por runFullScan
 */

import { OSINTResult } from './osint-scanner';

// ── Tipos ──

export type EngineSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';

export interface EngineSubjectData {
  fullName: string;
  cedula?: string;
  email?: string;
  phone?: string;
}

/** Función de escaneo que recibe los datos del sujeto y devuelve resultados OSINT */
export type EngineScanFunction = (subject: EngineSubjectData) => Promise<OSINTResult[]>;

/** Requisitos de datos del motor (qué campos necesita para funcionar) */
export interface EngineRequirements {
  email?: boolean;   // requiere correo electrónico
  cedula?: boolean;  // requiere cédula
  phone?: boolean;   // requiere teléfono
}

/** Configuración completa de un motor OSINT */
export interface EngineDefinition {
  /** Identificador único del motor (ej: 'shodan') */
  id: string;
  /** Nombre visible del motor (ej: 'Shodan') */
  name: string;
  /** Descripción corta del motor */
  description: string;
  /** Categoría a la que pertenece (debe coincidir con un id de EngineCategory) */
  categoryId: string;
  /** Severidad por defecto de los hallazgos del motor */
  defaultSeverity: EngineSeverity;
  /** Categoría de hallazgo por defecto */
  defaultCategory: string;
  /** Requisitos de datos - si el sujeto no los cumple, el motor se omite */
  requirements?: EngineRequirements;
  /** Función de escaneo — la lógica real del motor */
  scan: EngineScanFunction;
  /** Si el motor está habilitado (por defecto true) */
  enabled?: boolean;
  /** Icono sugerido para el UI (nombre de lucide-react) */
  icon?: string;
  /** Color sugerido para el UI */
  color?: string;
  /** Orden dentro de la categoría (menor = primero) */
  order?: number;
  /** Versión del motor */
  version?: string;
  /** Tags adicionales para filtrado */
  tags?: string[];
}

/** Definición de una categoría de motores */
export interface EngineCategoryDefinition {
  /** Identificador único de la categoría */
  id: string;
  /** Nombre visible */
  label: string;
  /** Icono sugerido (nombre de lucide-react) */
  icon?: string;
  /** Color sugerido */
  color?: string;
  /** Orden de la categoría (menor = primero) */
  order?: number;
}

// ── Registry Singleton ──

class EngineRegistryClass {
  private engines: Map<string, EngineDefinition> = new Map();
  private categories: Map<string, EngineCategoryDefinition> = new Map();
  private initialized = false;

  /** Registrar un motor */
  register(engine: EngineDefinition): void {
    if (this.engines.has(engine.id)) {
      console.warn(`[EngineRegistry] Motor "${engine.id}" ya registrado. Se sobreescribirá.`);
    }
    this.engines.set(engine.id, {
      ...engine,
      enabled: engine.enabled !== false,
      order: engine.order ?? 999,
      version: engine.version ?? '1.0.0',
      tags: engine.tags ?? [],
    });
    console.log(`[EngineRegistry] Motor registrado: ${engine.name} (${engine.id}) → categoría: ${engine.categoryId}`);
  }

  /** Registrar múltiples motores */
  registerAll(engines: EngineDefinition[]): void {
    for (const engine of engines) {
      this.register(engine);
    }
  }

  /** Registrar una categoría */
  registerCategory(category: EngineCategoryDefinition): void {
    if (this.categories.has(category.id)) {
      console.warn(`[EngineRegistry] Categoría "${category.id}" ya registrada. Se sobreescribirá.`);
    }
    this.categories.set(category.id, {
      ...category,
      order: category.order ?? 999,
    });
  }

  /** Registrar múltiples categorías */
  registerCategories(categories: EngineCategoryDefinition[]): void {
    for (const cat of categories) {
      this.registerCategory(cat);
    }
  }

  /** Obtener un motor por ID */
  getEngine(id: string): EngineDefinition | undefined {
    return this.engines.get(id);
  }

  /** Obtener todos los motores registrados */
  getAllEngines(): EngineDefinition[] {
    return Array.from(this.engines.values()).sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
  }

  /** Obtener motores habilitados */
  getEnabledEngines(): EngineDefinition[] {
    return this.getAllEngines().filter(e => e.enabled !== false);
  }

  /** Obtener motores por categoría */
  getEnginesByCategory(categoryId: string): EngineDefinition[] {
    return this.getEnabledEngines().filter(e => e.categoryId === categoryId);
  }

  /** Obtener todas las categorías */
  getAllCategories(): EngineCategoryDefinition[] {
    return Array.from(this.categories.values()).sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
  }

  /** Obtener categorías que tienen al menos un motor habilitado */
  getActiveCategories(): EngineCategoryDefinition[] {
    const activeCategoryIds = new Set(this.getEnabledEngines().map(e => e.categoryId));
    return this.getAllCategories().filter(c => activeCategoryIds.has(c.id));
  }

  /** Obtener todos los nombres de motores (para el UI) */
  getAllEngineNames(): string[] {
    return this.getEnabledEngines().map(e => e.name);
  }

  /** Verificar si un motor cumple los requisitos de datos */
  meetsRequirements(engineId: string, subject: EngineSubjectData): boolean {
    const engine = this.engines.get(engineId);
    if (!engine) return false;
    if (!engine.requirements) return true;

    if (engine.requirements.email && !subject.email) return false;
    if (engine.requirements.cedula && !subject.cedula) return false;
    if (engine.requirements.phone && !subject.phone) return false;

    return true;
  }

  /** Habilitar/deshabilitar un motor */
  setEngineEnabled(id: string, enabled: boolean): boolean {
    const engine = this.engines.get(id);
    if (!engine) return false;
    engine.enabled = enabled;
    return true;
  }

  /** Desregistrar un motor */
  unregister(id: string): boolean {
    return this.engines.delete(id);
  }

  /** Obtener formato de categorías para el UI (compatible con el page.tsx actual) */
  getUICategories(): Array<{
    id: string;
    label: string;
    icon?: string;
    color?: string;
    engines: Array<{ name: string; desc: string; id: string; icon?: string; color?: string }>;
  }> {
    const categories = this.getActiveCategories();
    return categories.map(cat => ({
      id: cat.id,
      label: cat.label,
      icon: cat.icon,
      color: cat.color,
      engines: this.getEnginesByCategory(cat.id).map(e => ({
        id: e.id,
        name: e.name,
        desc: e.description,
        icon: e.icon,
        color: e.color,
      })),
    }));
  }

  /** Ejecutar un motor específico */
  async runEngine(id: string, subject: EngineSubjectData): Promise<OSINTResult[]> {
    const engine = this.engines.get(id);
    if (!engine) {
      console.warn(`[EngineRegistry] Motor "${id}" no encontrado`);
      return [];
    }
    if (!engine.enabled) {
      console.warn(`[EngineRegistry] Motor "${id}" está deshabilitado`);
      return [];
    }
    if (!this.meetsRequirements(id, subject)) {
      console.log(`[EngineRegistry] Motor "${id}" omitido - requisitos no cumplidos`);
      return [];
    }

    try {
      const startTime = Date.now();
      const results = await engine.scan(subject);
      console.log(`[EngineRegistry] ${engine.name}: ${results.length} resultados (${Date.now() - startTime}ms)`);
      return results;
    } catch (error) {
      console.error(`[EngineRegistry] Error en motor "${id}":`, error);
      return [];
    }
  }

  /** Ejecutar todos los motores habilitados que cumplan los requisitos */
  async runAllEngines(
    subject: EngineSubjectData,
    selectedEngineIds?: string[],
  ): Promise<OSINTResult[]> {
    const engines = selectedEngineIds && selectedEngineIds.length > 0
      ? this.getEnabledEngines().filter(e => selectedEngineIds.includes(e.id))
      : this.getEnabledEngines();

    const scanPromises = engines
      .filter(e => this.meetsRequirements(e.id, subject))
      .map(e => this.runEngine(e.id, subject));

    const batchResults = await Promise.allSettled(scanPromises);

    const allResults: OSINTResult[] = [];
    for (const result of batchResults) {
      if (result.status === 'fulfilled') {
        allResults.push(...result.value);
      } else {
        console.warn('[EngineRegistry] Motor falló:', result.reason);
      }
    }

    return allResults;
  }

  /** Número total de motores registrados */
  get engineCount(): number {
    return this.engines.size;
  }

  /** Número de motores habilitados */
  get enabledCount(): number {
    return this.getEnabledEngines().length;
  }
}

// ── Singleton export ──
export const engineRegistry = new EngineRegistryClass();

// ── Convenience function ──
export function registerEngine(engine: EngineDefinition): void {
  engineRegistry.register(engine);
}

export function registerCategory(category: EngineCategoryDefinition): void {
  engineRegistry.registerCategory(category);
}
