/** Asambleas por página del reporte de participación (H35). */
export const PARTICIPATION_PAGE_SIZE = 10;
export const PARTICIPATION_MAX_PAGE_SIZE = 50;
/** Diferencia máxima entre `from` y `to`, en días (igual que H32, H33 y H34). */
export const PARTICIPATION_MAX_RANGE_DAYS = 366;
/** Sin fechas, el periodo empieza 12 meses antes de hoy. */
export const PARTICIPATION_DEFAULT_MONTHS = 12;

export const PARTICIPATION_MESSAGES = {
  assemblyId: 'La asamblea no es válida.',
  dateFormat: 'La fecha debe tener el formato AAAA-MM-DD.',
  endBeforeStart: 'La fecha final no puede ser anterior a la inicial.',
  rangeTooLong: `El rango máximo es de ${PARTICIPATION_MAX_RANGE_DAYS} días.`,
  page: 'La página debe ser un número entero mayor o igual a 1.',
  pageSize: `El tamaño de página debe estar entre 1 y ${PARTICIPATION_MAX_PAGE_SIZE}.`,
} as const;
