/**
 * Almacenamiento en memoria para Vercel (reemplaza Prisma/SQLite).
 * Los datos se pierden al reiniciar el servidor, pero funcionan para demo.
 * Para produccion, se puede migrar a Vercel KV, Neon, o Supabase.
 */

import { OSINTResult } from './osint-scanner';

export interface ScanRecord {
  id: string;
  fullName: string;
  cedula: string | null;
  email: string | null;
  phone: string | null;
  status: string;
  results: ScanResultRecord[];
  reports: ReportRecord[];
  createdAt: Date;
  updatedAt: Date;
}

export interface ScanResultRecord {
  id: string;
  scanId: string;
  source: string;
  category: string;
  severity: string;
  title: string;
  description: string | null;
  url: string | null;
  dataFound: string | null;
  createdAt: Date;
}

export interface ReportRecord {
  id: string;
  scanId: string;
  fileName: string;
  status: string;
  createdAt: Date;
}

// ── In-memory store ──
const scans = new Map<string, ScanRecord>();

let idCounter = 0;
function nextId(): string {
  idCounter++;
  return `scan_${Date.now()}_${idCounter}`;
}

function resultId(): string {
  idCounter++;
  return `res_${Date.now()}_${idCounter}`;
}

function reportId(): string {
  idCounter++;
  return `rpt_${Date.now()}_${idCounter}`;
}

// ── CRUD Operations ──

export function createScan(data: {
  fullName: string;
  cedula?: string | null;
  email?: string | null;
  phone?: string | null;
  status?: string;
}): ScanRecord {
  const id = nextId();
  const now = new Date();
  const record: ScanRecord = {
    id,
    fullName: data.fullName,
    cedula: data.cedula || null,
    email: data.email || null,
    phone: data.phone || null,
    status: data.status || 'pending',
    results: [],
    reports: [],
    createdAt: now,
    updatedAt: now,
  };
  scans.set(id, record);
  return record;
}

export function getScan(id: string): ScanRecord | null {
  return scans.get(id) || null;
}

export function getAllScans(): ScanRecord[] {
  return Array.from(scans.values()).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

export function updateScanStatus(id: string, status: string): ScanRecord | null {
  const record = scans.get(id);
  if (!record) return null;
  record.status = status;
  record.updatedAt = new Date();
  return record;
}

export function addScanResults(scanId: string, osintResults: OSINTResult[]): ScanResultRecord[] {
  const record = scans.get(scanId);
  if (!record) return [];

  const resultRecords: ScanResultRecord[] = osintResults.map(r => ({
    id: resultId(),
    scanId,
    source: r.source,
    category: r.category,
    severity: r.severity,
    title: r.title,
    description: r.description || null,
    url: r.url || null,
    dataFound: r.dataFound || null,
    createdAt: new Date(),
  }));

  record.results = resultRecords;
  record.updatedAt = new Date();
  return resultRecords;
}

export function addReport(scanId: string, fileName: string): ReportRecord | null {
  const record = scans.get(scanId);
  if (!record) return null;

  const report: ReportRecord = {
    id: reportId(),
    scanId,
    fileName,
    status: 'generated',
    createdAt: new Date(),
  };

  record.reports.push(report);
  record.updatedAt = new Date();
  return report;
}

export function deleteScan(id: string): boolean {
  return scans.delete(id);
}

export function getReportByScanId(scanId: string): ReportRecord | null {
  const record = scans.get(scanId);
  if (!record || record.reports.length === 0) return null;
  return record.reports[record.reports.length - 1]; // return latest report
}
