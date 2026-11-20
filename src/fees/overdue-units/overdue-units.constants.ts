export const OVERDUE_UNITS_PAGE_SIZE = 20;
export const SEARCH_MAX_LENGTH = 20;

export const OVERDUE_UNITS_MESSAGES = {
  towerId: 'La torre debe ser un identificador válido.',
  search: `La búsqueda debe ser un texto de hasta ${SEARCH_MAX_LENGTH} caracteres.`,
} as const;
