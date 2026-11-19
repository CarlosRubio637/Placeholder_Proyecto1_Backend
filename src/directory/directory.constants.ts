export const DIRECTORY_MESSAGES = {
  phone: 'Ingresa el teléfono con el formato 0000-0000.',
  directory: 'Indica tus preferencias del directorio.',
  nameRequired: 'Para aparecer en el directorio debes mostrar tu nombre.',
  profileNotFound: 'No encontramos tu perfil.',
} as const;

export const DIRECTORY_PAGE_SIZE = 20;
export const DIRECTORY_MAX_PAGE = 100_000;
export const DIRECTORY_NAME_MIN = 3;
export const DIRECTORY_NAME_MAX = 80;

export const DIRECTORY_SEARCH_MESSAGES = {
  nameShort: 'Escribe al menos 3 caracteres del nombre.',
  nameLong: 'Escribe como máximo 80 caracteres del nombre.',
  unitNumber: 'Ingresa el número de unidad de 3 dígitos.',
  towerId: 'Elige una torre válida.',
  criterion: 'Busca por nombre o por torre y número de unidad.',
  page: 'La página debe ser un número entero mayor o igual a 1.',
  pageTooHigh: 'La página no puede ser mayor que 100,000.',
  pageSize: `El tamaño de página debe estar entre 1 y ${DIRECTORY_PAGE_SIZE}.`,
} as const;
