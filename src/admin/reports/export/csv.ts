import type { Cell, ReportTable } from './report-table.js';

/** BOM de UTF-8: así Excel abre el archivo con las tildes bien. */
const BOM = '﻿';

/** Comillas si el valor tiene coma, comillas o salto de línea (RFC 4180). */
function csvCell(value: Cell): string {
  if (value === null) return '';
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * CSV del reporte (H36): UTF-8 con BOM, coma como separador, una fila de
 * encabezados y la tabla completa. Las líneas terminan en CRLF.
 */
export function renderCsv(
  table: Pick<ReportTable, 'columns' | 'rows'>,
): Buffer {
  const lines = [table.columns, ...table.rows].map((row) =>
    row.map(csvCell).join(','),
  );
  return Buffer.from(`${BOM}${lines.join('\r\n')}\r\n`, 'utf8');
}
