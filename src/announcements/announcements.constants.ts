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
