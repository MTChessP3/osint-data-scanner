# OSINT Data Scanner

Portal web de escaneo OSINT que busca datos personales expuestos en internet y genera informes profesionales en formato DOCX.

## Funcionalidades

- **Escaneo individual**: Ingresa nombre, cédula, correo y teléfono para verificar exposición
- **Carga por lotes**: Sube archivos `.xlsx` o `.csv` con múltiples personas
- **7 motores de búsqueda**: HIBP, Google Dorking, Pwned Passwords, Social Media, Data Brokers, Dark Web, Document Exposure
- **Informes DOCX automáticos**: Genera un informe de inteligencia digital por cada persona escaneada usando plantilla profesional
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
- **Reportes**: Python (python-docx) + Plantilla DOCX profesional
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
│   └── generate-report.py        # Generador de informes DOCX
├── prisma/
│   └── schema.prisma             # Esquema de base de datos
├── upload/
│   └── Plantilla_de_Informes.docx # Plantilla de informe
├── nixpacks.toml                 # Config Railway (Python + Node)
├── railway.toml                  # Config despliegue Railway
└── start.sh                      # Script de inicio Railway
```
