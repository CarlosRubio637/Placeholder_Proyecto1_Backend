import { currentTime, formatDateEs, todayIso } from '@Common/time';
import type { ExportableReport } from './export.constants.js';

export type Cell = string | number | null;

/**
 * Un reporte listo para exportar (H36): lo arma ReportExportService a partir
 * del mismo servicio de cálculo que usa el endpoint de pantalla, y lo dibujan
 * tanto el CSV como el PDF.
 */
export interface ReportTable {
  report: ExportableReport;
  title: string;
  /** Periodo resuelto (con los valores por defecto), para el nombre del archivo. */
  period: { from: string; to: string };
  /** Filtros aplicados, como pares etiqueta → valor. */
  filters: [string, string][];
  /** Cifras resumen, como pares etiqueta → valor. */
  summary: [string, string][];
  /** Título de la tabla en el PDF. */
  tableTitle: string;
  columns: string[];
  rows: Cell[][];
}

/** Datos de la generación que solo van en el PDF. */
export interface ExportMeta {
  generatedAt: Date;
  generatedBy: string;
}

/** "AAAA-MM-DD" → "DD/MM/AAAA". */
export const dateEs = formatDateEs;

/** Instante → "DD/MM/AAAA HH:mm" en la hora del condominio. */
export function dateTimeEs(instant: Date): string {
  return `${formatDateEs(todayIso(instant))} ${currentTime(instant)}`;
}

/** 1275.5 → "1275.50": dos decimales fijos para montos. */
export function money(value: number): string {
  return value.toFixed(2);
}

/** `<reporte>_<desde>_<hasta>.<ext>` (H36). */
export function exportFilename(
  table: Pick<ReportTable, 'report' | 'period'>,
  extension: string,
): string {
  return `${table.report}_${table.period.from}_${table.period.to}.${extension}`;
}
