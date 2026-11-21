/** Diferencia máxima entre `from` y `to`, en días (igual que H32 y H34). */
export const AREAS_USAGE_MAX_RANGE_DAYS = 366;

export const AREAS_USAGE_MESSAGES = {
  dateFormat: 'La fecha debe tener el formato AAAA-MM-DD.',
  endBeforeStart: 'La fecha final no puede ser anterior a la inicial.',
  rangeTooLong: `El rango máximo es de ${AREAS_USAGE_MAX_RANGE_DAYS} días.`,
} as const;
