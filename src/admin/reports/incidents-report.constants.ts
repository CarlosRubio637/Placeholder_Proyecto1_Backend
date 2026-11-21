/** Tamaño de página por defecto de la lista de abiertas con más de 7 días (H34). */
export const INCIDENTS_REPORT_PAGE_SIZE = 20;
export const INCIDENTS_REPORT_MAX_PAGE_SIZE = 50;
/** Diferencia máxima entre `from` y `to`, en días (igual que H33). */
export const INCIDENTS_REPORT_MAX_RANGE_DAYS = 366;
/** Una incidencia abierta aparece en la lista cuando lleva más de estos días. */
export const STALE_AFTER_DAYS = 7;

export const INCIDENTS_REPORT_MESSAGES = {
  dateFormat: 'La fecha debe tener el formato AAAA-MM-DD.',
  endBeforeStart: 'La fecha final no puede ser anterior a la inicial.',
  rangeTooLong: `El rango máximo es de ${INCIDENTS_REPORT_MAX_RANGE_DAYS} días.`,
  page: 'La página debe ser un número entero mayor o igual a 1.',
  pageSize: `El tamaño de página debe estar entre 1 y ${INCIDENTS_REPORT_MAX_PAGE_SIZE}.`,
} as const;
