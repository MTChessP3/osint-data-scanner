# Task: OSINT Upload API Rewrite

## Agent: Main Developer
## Date: 2026-03-05

## Summary
Rewrote the upload API route and added cross-reference OSINT analysis to the relationship-analyzer module.

## Files Modified

### 1. `src/app/api/upload/route.ts` — COMPLETE REWRITE
**Old behavior**: Direct comparison between Excel sheets (comparing field values), creating dummy "OSINT results" that just listed raw data.

**New behavior**: Full OSINT investigation flow:
1. Parse Excel → extract person data from each sheet
2. For each person, extract identifiers (cedula, name, email, phone, address)
3. Run abbreviated OSINT scan for each person (using `performWebSearch` + `analyzeWithDeepSeek`)
4. Cross-reference OSINT investigation results between sheets
5. Generate comprehensive reports with individual findings + cross-references

**Key additions**:
- `PersonIdentifier` interface — structured person data extraction
- `PersonWithOSINT` interface — person with their OSINT results
- `findFieldValue()` — matches row fields to identifier types using pattern matching
- `extractPersonFromRow()` — extracts identifiers from a single row
- `extractPersonsFromSheet()` — extracts and deduplicates persons from a sheet (max 5)
- `runLightweightOSINTScan()` — runs 2-3 web searches per person + AI analysis
- `investigateSheet()` — orchestrates OSINT investigation for an entire sheet
- `mergeNetworkMaps()` — merges network maps from raw and OSINT cross-reference analyses

**Constraints respected**:
- `MAX_PERSONS_PER_SHEET = 5` to avoid Vercel timeout
- `MAX_QUERIES_PER_PERSON = 3` for lightweight scanning
- `SEARCH_TIMEOUT_MS = 5000` per search query
- `Promise.allSettled` for concurrent scans with graceful failure handling
- DeepSeek API key read from `process.env.DEEPSEEK_API_KEY`
- `initZAIConfig()` called with timeout protection
- Backward compatibility with single-sheet uploads and CSV handling

### 2. `src/lib/relationship-analyzer.ts` — Added crossReferenceOSINTResults
**New exports**:
- `PersonWithOSINT` interface — re-exported for use by upload route
- `crossReferenceOSINTResults()` — cross-references OSINT results between two sheets

**Cross-reference strategies**:
1. **Direct identifier comparison**: Compares cedulas, emails, phones, addresses, and names between persons across sheets
2. **OSINT entity extraction**: Extracts entities (companies, addresses, phones, emails, domains) from OSINT results and finds shared mentions between persons from different sheets

**Helper functions added**:
- `addLinkIfNew()` — deduplicates links
- `normalizePhone()` — normalizes Colombian phone numbers for comparison
- `extractEntitiesFromOSINT()` — extracts structured entities from OSINT results using regex patterns (emails, domains, phones, company names, addresses, NITs)

## Response Format
The multi-sheet upload API now returns:
```json
{
  "type": "xlsx_multi_sheet",
  "sheetNames": [...],
  "results": [
    {
      "sheetName": "Hoja1",
      "rowCount": 5,
      "scanId": "...",
      "fullName": "Hoja: Hoja1",
      "totalResults": 12,
      "reportGenerated": false,
      "reportFileName": null,
      "summary": { "critical": 2, "high": 3, "medium": 4, "low": 2, "info": 1 },
      "personsInvestigated": [
        { "name": "Juan Pérez", "identifiers": {...}, "findingsCount": 5 }
      ]
    }
  ],
  "relationshipAnalysis": { ..., "osintCrossReferenceLinks": 3 },
  "jointAnalysisId": "...",
  "jointReportFileName": "..."
}
```

## Verification
- TypeScript compilation: ✅ No new errors in modified files
- ESLint: ✅ Passed clean
