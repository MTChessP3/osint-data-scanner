# OSINT Data Scanner - Guia de Despliegue en Railway.app

## Requisitos Previos
- Una cuenta en [GitHub](https://github.com) (gratuita)
- Una cuenta en [Railway.app](https://railway.app) (gratuita - incluye $5 USD/mes)
- El archivo ZIP: `OSINT-Data-Scanner.zip`

---

## PASO 1: Subir el codigo a GitHub

### 1.1 Descomprimir el proyecto
```bash
# En tu computadora, descomprime el ZIP
unzip OSINT-Data-Scanner.zip -d osint-data-scanner
cd osint-data-scanner
```

### 1.2 Crear repositorio en GitHub
1. Ve a https://github.com/new
2. Nombre del repo: `osint-data-scanner`
3. Selecciona **Private** (recomendado - contiene la plantilla)
4. NO marques "Add a README"
5. Clic en **Create repository**

### 1.3 Subir el codigo
```bash
cd osint-data-scanner
git init
git add -A
git commit -m "OSINT Data Scanner - Initial commit"
git branch -M main
git remote add origin https://github.com/TU-USUARIO/osint-data-scanner.git
git push -u origin main
```

---

## PASO 2: Crear proyecto en Railway

### 2.1 Conectar Railway con GitHub
1. Ve a https://railway.app y haz login (puedes usar tu cuenta GitHub)
2. Clic en **"New Project"**
3. Selecciona **"Deploy from GitHub repo"**
4. Autoriza a Railway a acceder a tu GitHub
5. Selecciona el repositorio `osint-data-scanner`
6. Clic en **"Deploy Now"**

### 2.2 Configurar variables de entorno
En Railway, ve a tu proyecto → **Variables** → agrega:

| Variable | Valor |
|----------|-------|
| `APP_ROOT` | `/app` |
| `DATABASE_URL` | `file:/app/db/custom.db` |

### 2.3 Agregar volumen persistente (IMPORTANTE)
Para que la base de datos SQLite sobreviva entre reinicios:
1. Ve a tu proyecto → **Settings** → **Volumes**
2. Clic en **"New Volume"**
3. Mount path: `/app/db`
4. Clic en **"Add"**

### 2.4 Agregar la plantilla como volumen
Para que los informes usen tu plantilla DOCX:
1. En **Volumes**, agrega otro volumen
2. Mount path: `/app/upload`
3. Luego sube la plantilla `Plantilla_de_Informes.docx` a ese volumen

**Alternativa mas facil:** La plantilla ya viene incluida en el repo en la raiz.
El script `start.sh` la copia automaticamente a `/app/upload/` al arrancar.

---

## PASO 3: Esperar el despliegue

Railway construira automaticamente el proyecto:
1. Instala Python + dependencias (python-docx, openpyxl)
2. Instala Node.js + dependencias (bun/npm)
3. Genera el cliente Prisma
4. Compila Next.js
5. Ejecuta `start.sh` que inicializa la base de datos

Esto tarda ~3-5 minutos la primera vez.

---

## PASO 4: Acceder al portal

Una vez desplegado, Railway te dara una URL como:
```
https://osint-data-scanner-production.up.railway.app
```

O puedes configurar un dominio personalizado en **Settings → Domains**.

---

## Como usar el portal

### Escaneo Individual
1. Abre la URL del portal
2. En la pestana **"Escaneo"** ingresa:
   - Nombre completo (requerido)
   - Cedula (opcional)
   - Correo electronico (opcional)
   - Telefono (opcional)
3. Clic en **"Escanear y Generar Informe"**
4. Espera ~30-60 segundos
5. Descarga el informe DOCX con el boton **"Descargar Informe"**

### Carga por Lotes
1. Prepara un archivo Excel (.xlsx) o CSV con estas columnas:
   - `nombre` (requerido) - Nombre completo de la persona
   - `cedula` (opcional) - Numero de documento
   - `correo` o `email` (opcional) - Correo electronico
   - `telefono` o `phone` (opcional) - Numero de telefono

2. En la pestana **"Carga por Lotes"** arrastra o selecciona el archivo
3. Clic en **"Procesar Lote y Generar Informes"**
4. El sistema procesa cada persona y genera un informe DOCX individual
5. Descarga cada informe desde la vista de resultados

### Ejemplo de archivo CSV:
```csv
nombre,cedula,correo,telefono
Juan Perez Garcia,1234567890,juan@ejemplo.com,+573001234567
Maria Lopez,9876543210,maria@ejemplo.com,+573007654321
Carlos Rodriguez,1122334455,carlos@ejemplo.com,
```

---

## Estructura del proyecto

```
osint-data-scanner/
├── src/
│   ├── app/
│   │   ├── page.tsx              # Interfaz principal (4 pestanas)
│   │   ├── layout.tsx            # Layout con metadata
│   │   └── api/
│   │       ├── scan/route.ts     # API de escaneo individual
│   │       ├── upload/route.ts   # API de carga por lotes
│   │       └── report/route.ts   # API de generacion/descarga de informes
│   ├── lib/
│   │   ├── osint-scanner.ts      # Motor de busqueda OSINT (7 motores)
│   │   └── db.ts                 # Conexion Prisma SQLite
│   └── components/ui/            # Componentes shadcn/ui
├── scripts/
│   └── generate-report.py        # Generador de informes DOCX
├── prisma/
│   └── schema.prisma             # Modelo de base de datos
├── Plantilla_de_Informes.docx    # Tu plantilla de inteligencia
├── start.sh                      # Script de inicio para Railway
├── railway.toml                  # Config Railway
├── nixpacks.toml                 # Config de build Nixpacks
└── package.json                  # Dependencias Node.js
```

---

## Motores de busqueda integrados

1. **Have I Been Pwned** - Filtraciones de credenciales
2. **Google Dorking** - Busqueda avanzada con operadores
3. **Pwned Passwords** - Contrasenas comprometidas
4. **Social Media Scan** - Perfiles en redes sociales
5. **Data Broker Scan** - Directorios y brokers de datos
6. **Dark Web / Leak Scan** - Menciones en filtraciones
7. **Document Exposure** - Documentos PDF/DOC expuestos

---

## Secciones del informe DOCX (basado en tu plantilla)

1. Resumen Ejecutivo
2. Identidad del Sujeto (nombre, cedula, correo, telefono, etc.)
3. Huella Digital - Presencia en Redes y Plataformas
4. Red de Relaciones y Vinculos
5. Fuentes Abiertas Especializadas y Registros Publicos
6. Analisis, Conclusiones y Recomendaciones
7. Cadena de Evidencia y Trazabilidad de Fuentes
8. Firma y Aprobacion

---

## Solucion de problemas

### El build falla en Railway
- Verifica que las variables de entorno esten configuradas
- Revisa los logs en Railway → **Deployments** → clic en el deploy → **Build Logs**

### La base de datos se reinicia
- Asegurate de tener un volumen persistente montado en `/app/db`

### Los informes no se generan
- Verifica que la plantilla este accesible en `/app/upload/Plantilla_de_Informes.docx`
- Revisa los logs del deploy para errores de Python

### La busqueda no devuelve resultados
- El sistema usa web search via z-ai-web-dev-sdk
- En Railway necesitas que la variable de entorno del SDK este configurada
- Contacta al administrador si las busquedas fallan consistentemente
