# Task: Rewrite OSINT Data Scanner Main Page

## Summary
Rewrote `/home/z/my-project/src/app/page.tsx` with 5 major changes to improve UX and professionalism.

## Changes Made

### 1. API Key Moved to Settings Modal
- Removed DeepSeek API key input from the main scan page
- Added a **gear/settings icon button** in the header that opens a `Dialog` modal
- Modal has:
  - Title: "Configuración"
  - Password-type input for DeepSeek API key with label "API Key de DeepSeek"
  - Save button that writes to `localStorage` as `deepseek_api_key`
  - Status indicator (green "Activa" badge or gray "Inactiva" badge) showing if key is configured
  - "Probar Conexión" button that calls `/api/chat` to verify the key works
  - Success/error feedback for test connection

### 2. Interactive Search Engine Selection
- Engine cards are now clickable to toggle selection (selected/deselected)
- Added `selectedEngines: Set<string>` state tracking which engines are selected
- All engines selected by default
- Visual feedback:
  - Selected engines: colored background, border-left accent matching category, checkmark icon
  - Deselected engines: dimmed (50% opacity), gray styling
  - Category headers have tri-state checkboxes (all/some/none selected)
- "Seleccionar Todos" / "Deseleccionar Todos" toggle button
- Count display: "{n}/16 motores seleccionados"
- `selectedEngines` is passed to the scan API as `selectedEngines: Array.from(selectedEngines)`
- Validation: scan requires at least 1 engine selected

### 3. Improved Scan Results Tab
- **Risk Score Gauge**: Circular SVG gauge at the top showing risk score 0-100 with color coding
- **Results grouped by source** in collapsible `Collapsible` sections
- Each group header shows: source icon (max severity), source name, severity badge, result count
- Each result card shows: severity badge, title, description (expandable), dataFound, category badge, source URL link
- Severity filter buttons maintained

### 4. Professional Header
- App name with shield icon
- Dynamic engine count badge: "{selectedEngines.size} Motores"
- Settings gear icon (with green dot indicator when API key is configured)
- Removed cluttered badges (PDF + DOCX, Analisis de Vinculos)

### 5. All Existing Functionality Preserved
- Scan form, batch upload, relationship analysis, history, chat widget (SOFIA)
- File upload with XLSX parsing (3 fallback methods)
- Relationship analysis with link filtering
- Chat with DeepSeek integration
- Report download (PDF + DOCX)
- All state management and API calls remain compatible

## New Imports Added
- `Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle` from shadcn/ui
- `Checkbox` from shadcn/ui
- `Collapsible, CollapsibleContent, CollapsibleTrigger` from shadcn/ui
- `Settings, Check, Wifi, WifiOff` from lucide-react
- `useMemo` from React

## New Components
- `RiskGauge` - SVG circular progress gauge component

## New State Variables
- `selectedEngines: Set<string>` - tracks selected engine names
- `expandedGroups: Set<string>` - tracks expanded result groups
- `settingsOpen: boolean` - controls settings dialog visibility
- `settingsKeyInput: string` - temp input for API key in settings
- `testKeyLoading: boolean` - loading state for test connection
- `testKeyStatus: 'idle' | 'success' | 'error'` - test connection result

## Lint Results
- All errors are only in pre-existing `zai-proxy/index.js` (not our file)
- `page.tsx` passes lint with zero errors
