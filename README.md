# OSINT Data Scanner

Portal web de escaneo OSINT que busca datos personales expuestos en internet y genera informes profesionales en formato DOCX usando la plantilla VIP de Inteligencia Digital.

## Funcionalidades

- **Escaneo individual**: Ingresa nombre, cédula, correo y teléfono para verificar exposición
- **Carga por lotes**: Sube archivos `.xlsx` o `.csv` con múltiples personas
- **7 motores de búsqueda**: HIBP, Google Dorking, Pwned Passwords, Social Media, Data Brokers, Dark Web, Document Exposure
- **Informes DOCX automáticos**: Genera un informe de Inteligencia Digital VIP por cada persona escaneada con todas las secciones de la plantilla profesional (8 secciones, 17 tablas, cadena de evidencia con hash SHA256)
- **Historial de escaneos**: Consulta resultados previos y descarga informes

## Despliegue en Railway.app

1. Sube este repositorio a GitHub
2. En Railway, crea un nuevo proyecto desde tu repo de GitHub
3. Railway detectará automáticamente la configuración de `nixpacks.toml`
4. Agrega la variable de entorno `DATABASE_URL` = `file:./db/osint-scanner.db`
5. Despliega

## Stack

- **Frontend**: Next.js 16 + React + Tailwind CSS + shadcn/ui
- **Backend**: Next.js API Routes + Prisma ORM + SQLite
- **Reportes**: Python (python-docx) + Plantilla VIP DOCX profesional
- **Búsqueda**: z-ai-web-dev-sdk (web search)

## Desarrollo Local

```bash
# Instalar dependencias
bun install

# Configurar base de datos
cp .env.example .env
npx prisma generate
npx prisma db push

# Instalar dependencias Python
pip install python-docx openpyxl

# Ejecutar en desarrollo
bun run dev
```

Abre [http://localhost:3000](http://localhost:3000)

## Estructura del Proyecto

```
├── src/
│   ├── app/
│   │   ├── page.tsx              # Interfaz principal
│   │   ├── api/scan/route.ts     # API de escaneo individual
│   │   ├── api/upload/route.ts   # API de carga por lotes
│   │   └── api/report/route.ts   # API de descarga de informes
│   └── lib/
│       ├── osint-scanner.ts      # Motores de búsqueda OSINT
│       └── db.ts                 # Cliente Prisma
├── scripts/
│   └── generate-report.py        # Generador de informes DOCX (Plantilla VIP)
├── prisma/
│   └── schema.prisma             # Esquema de base de datos
├── upload/
│   └── Plantilla_de_Informes_VIP.docx # Plantilla VIP de informe
├── nixpacks.toml                 # Config Railway (Python + Node)
├── railway.toml                  # Config despliegue Railway
└── start.sh                      # Script de inicio Railway
```

## Plantilla de Informe VIP

El informe generado incluye las siguientes secciones de la plantilla VIP:

1. **Resumen Ejecutivo** - Hallazgo principal y nivel de riesgo
2. **Identidad del Sujeto** - Datos personales, documentos, fotos
3. **Huella Digital** - Redes sociales, brechas de email, dominios
4. **Red de Relaciones** - Vínculos personales y empresariales
5. **Fuentes Abiertas** - Antecedentes judiciales, medios de comunicación
6. **Análisis y Conclusiones** - Línea de tiempo, IoR, recomendaciones
7. **Cadena de Evidencia** - Trazabilidad con hash SHA256
8. **Firma y Aprobación** - Cierre del informe
