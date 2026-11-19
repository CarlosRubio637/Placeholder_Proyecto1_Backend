import { AnnouncementCategory } from '@PrismaClient';
import { formatDateEs } from '@Common/time';

export const ANNOUNCEMENT_LIMITS = {
  titleMin: 5,
  titleMax: 100,
  bodyMin: 10,
  bodyMax: 2000,
  maxTowers: 3,
  expiryMaxDays: 90,
  notificationTitleMax: 100,
} as const;

export const ANNOUNCEMENT_MESSAGES = {
  title: 'El título debe tener entre 5 y 100 caracteres.',
  body: 'El contenido debe tener entre 10 y 2,000 caracteres.',
  category: 'Elige una categoría válida.',
  audience: 'Elige la audiencia: TODOS o TORRES.',
  towerIds: 'Elige al menos una torre o "Todo el condominio".',
  towerIdsWithAll: 'Con "Todo el condominio" no se envían torres.',
  towerIdFormat: 'Cada torre debe ser un uuid válido.',
  maxTowers: 'Elige como máximo 3 torres.',
  expiresOnFormat: 'Ingresa una fecha de fin de vigencia válida (AAAA-MM-DD).',
  notFound: 'El comunicado no existe.',
} as const;

export function expiryWindowMessage(maxIso: string): string {
  return `La vigencia debe terminar entre mañana y ${formatDateEs(maxIso)}.`;
}

export function towerNotFoundMessage(towerId: string): string {
  return `No existe la torre ${towerId}.`;
}

export const CATEGORY_LABELS: Record<AnnouncementCategory, string> = {
  CORTE_SERVICIO: 'Corte de servicio',
  MANTENIMIENTO: 'Mantenimiento programado',
  AVISO_GENERAL: 'Aviso general',
};

export const RESIDENT_TABS = ['vigentes', 'archivados'] as const;
export type ResidentTab = (typeof RESIDENT_TABS)[number];

export const RESIDENT_PAGE_SIZE = 10;
export const ADMIN_PAGE_SIZE = 20;
export const READERS_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 50;
export const MAX_PAGE = 100_000;

export const PAGE_MESSAGES = {
  page: 'La página debe ser un número entero mayor o igual a 1.',
  pageTooHigh: 'La página no puede ser mayor que 100,000.',
  pageSize: `El tamaño de página debe estar entre 1 y ${MAX_PAGE_SIZE}.`,
} as const;

export const RESIDENT_ANNOUNCEMENT_MESSAGES = {
  tab: 'Elige la pestaña: vigentes o archivados.',
} as const;

export const ANNOUNCEMENT_STATUSES = ['VIGENTE', 'ARCHIVADO'] as const;
export type AnnouncementStatus = (typeof ANNOUNCEMENT_STATUSES)[number];

export const ADMIN_ANNOUNCEMENT_MESSAGES = {
  status: 'Elige el estado: VIGENTE o ARCHIVADO.',
  read: 'El filtro de lectura debe ser true o false.',
} as const;
