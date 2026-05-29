/**
 * EJEMPLO: Cómo agregar un nuevo motor de búsqueda al sistema
 *
 * Este archivo muestra el patrón para agregar un nuevo motor OSINT.
 * Para agregar un motor real:
 *
 *   1. Crear un archivo como este en src/lib/engines/<nombre>-engine.ts
 *   2. Implementar la función de escaneo
 *   3. Registrar el motor con el Engine Registry
 *   4. Importar y llamar a initializeEngineRegistry() en la API route
 *
 * El motor aparecerá automáticamente en:
 *   - La selección de motores en el UI (tab de escaneo)
 *   - La ejecución del orquestador (runFullScanViaRegistry)
 *   - El endpoint GET /api/engines (lista de motores disponibles)
 */

import { registerEngine, type EngineDefinition } from '../engine-registry';
import { performWebSearch, type OSINTResult } from '../osint-scanner';

// ── Función de escaneo del motor ──
// Esta es la lógica real del motor. Puede usar performWebSearch(),
// APIs externas, scraping, o cualquier método de recolección.

async function scanShodan(subject: { fullName: string; email?: string; cedula?: string; phone?: string }): Promise<OSINTResult[]> {
  const results: OSINTResult[] = [];

  // Ejemplo: buscar información de exposición usando web search
  const queries = [
    `"${subject.email}" site:shodan.io`,
    `"${subject.fullName}" exposed services ports`,
  ];

  for (const query of queries) {
    try {
      const searchResults = await performWebSearch(query, 5);
      for (const result of searchResults.slice(0, 3)) {
        results.push({
          source: 'Shodan',
          category: 'service_exposure',
          severity: 'high',
          title: `Servicio expuesto detectado: ${result.name}`,
          description: result.snippet || `Resultado de búsqueda para "${query}"`,
          url: result.url,
          dataFound: `Host: ${result.host_name} | Query: ${query}`,
        });
      }
    } catch {
      // Continuar con la siguiente query
    }
  }

  // Si no hay resultados, agregar un resultado informativo
  if (results.length === 0) {
    results.push({
      source: 'Shodan',
      category: 'service_exposure',
      severity: 'info',
      title: 'Sin servicios expuestos detectados',
      description: `No se encontraron servicios expuestos para "${subject.fullName}" a través de Shodan.`,
    });
  }

  return results;
}

// ── Registrar el motor ──
// Una vez registrado, el motor estará disponible automáticamente
// en todo el ecosistema de la plataforma.

const shodanEngine: EngineDefinition = {
  id: 'shodan',
  name: 'Shodan',
  description: 'Dispositivos y servicios expuestos en Internet',
  categoryId: 'search',           // Categoría existente (search, breaches, darkweb, social, identity, judicial)
  defaultSeverity: 'high',
  defaultCategory: 'service_exposure',
  requirements: {},                // No requiere campos obligatorios
  icon: 'Wifi',                    // Icono de lucide-react
  color: 'cyan',
  order: 3,                        // Orden dentro de la categoría
  version: '1.0.0',
  tags: ['iot', 'services', 'ports', 'exposure'],
  scan: scanShodan,
};

// Registrar (se puede llamar desde cualquier lugar de la app)
// registerEngine(shodanEngine);

// ── Exportar para registro condicional ──
export { shodanEngine };

/**
 * NOTA: Para habilitar este motor, descomentar la línea:
 *   registerEngine(shodanEngine);
 *
 * O importar y registrar desde registered-engines.ts:
 *   import { shodanEngine } from './engines/example-shodan-engine';
 *   registerEngine(shodanEngine);
 *
 * También se puede crear una nueva categoría si el motor no encaja
 * en las existentes:
 *
 *   registerCategory({
 *     id: 'infrastructure',
 *     label: 'Infraestructura y Red',
 *     icon: 'Network',
 *     color: 'cyan',
 *     order: 7,
 *   });
 */
