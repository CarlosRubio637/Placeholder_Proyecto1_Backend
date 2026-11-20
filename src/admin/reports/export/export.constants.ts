/** Encabezado de todos los PDF (H36). El condominio no tiene un nombre propio. */
export const REPORT_HEADER = 'Gestión de Condominios';

/** Máximo de filas de la tabla que se puede exportar (H36). */
export const EXPORT_MAX_ROWS = 5000;

export const EXPORT_FORMATS = ['pdf', 'csv'] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];

/** Reportes que se exportan; la clave es el segmento de la ruta y del archivo. */
export const EXPORTABLE_REPORTS = [
  'morosidad',
  'areas',
  'incidencias',
  'participacion',
] as const;
export type ExportableReport = (typeof EXPORTABLE_REPORTS)[number];

export const EXPORT_CONTENT_TYPES: Record<ExportFormat, string> = {
  pdf: 'application/pdf',
  csv: 'text/csv; charset=utf-8',
};

export const EXPORT_MESSAGES = {
  format: 'El formato debe ser pdf o csv.',
  tooManyRows: 'El reporte supera 5,000 filas. Reduce el rango.',
} as const;

/** Nombres para el usuario de los valores de los enums que salen en los archivos. */
export const STATUS_LABELS: Record<string, string> = {
  PENDIENTE: 'Pendiente',
  EN_PROCESO: 'En proceso',
  RESUELTO: 'Resuelto',
  ABIERTA: 'Abierta',
  CERRADA: 'Cerrada',
};

export const PRIORITY_LABELS: Record<string, string> = {
  ALTA: 'Alta',
  MEDIA: 'Media',
  BAJA: 'Baja',
};
