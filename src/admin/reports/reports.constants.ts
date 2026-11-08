/** Tamaño de página por defecto del panel de morosidad (H32). */
export const DELINQUENCY_PAGE_SIZE = 20;
/** Igual que el reporte de morosidad de H4. */
export const DELINQUENCY_MAX_PAGE_SIZE = 50;
/** Diferencia máxima entre `from` y `to`, en días. */
export const DELINQUENCY_MAX_RANGE_DAYS = 366;

export const DELINQUENCY_MESSAGES = {
  dateFormat: 'La fecha debe tener el formato AAAA-MM-DD.',
  endBeforeStart: 'La fecha final no puede ser anterior a la inicial.',
  rangeTooLong: `El rango máximo es de ${DELINQUENCY_MAX_RANGE_DAYS} días.`,
  page: 'La página debe ser un número entero mayor o igual a 1.',
  pageSize: `El tamaño de página debe estar entre 1 y ${DELINQUENCY_MAX_PAGE_SIZE}.`,
} as const;
