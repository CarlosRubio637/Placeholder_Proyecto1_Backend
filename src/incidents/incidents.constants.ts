import { resolve } from 'node:path';
import { IncidentLocation } from '@PrismaClient';

/** Fotografías por incidencia (H10). */
export const MIN_PHOTOS = 1;
export const MAX_PHOTOS = 3;
/** 5 MB por fotografía. */
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

/** Carpeta raíz de los archivos subidos. Las fotos van en incidencias/<id>/. */
export const UPLOADS_ROOT = resolve(process.cwd(), 'uploads');
export const INCIDENT_UPLOADS_DIR = 'incidencias';

/** Zona horaria del condominio: define el año del número INC-AAAA-NNNNN. */
export const CONDOMINIUM_TIME_ZONE = 'America/El_Salvador';

/** Nombre visible de cada ubicación (formulario y avisos). */
export const LOCATION_LABELS: Record<IncidentLocation, string> = {
  TORRE_A: 'Torre A',
  TORRE_B: 'Torre B',
  TORRE_C: 'Torre C',
  ESTACIONAMIENTO: 'Estacionamiento',
  PISCINA: 'Piscina',
  GIMNASIO: 'Gimnasio',
  SALON: 'Salón de eventos',
  ASADOR: 'Asador',
  LOBBY: 'Lobby',
  AREAS_VERDES: 'Áreas verdes',
  OTRA: 'Otra',
};

/** Mensajes de H10 que se comparten entre el interceptor y el servicio. */
export const PHOTO_MESSAGES = {
  required: 'Agrega al menos una fotografía.',
  invalid: 'Solo se permiten imágenes JPG o PNG de hasta 5 MB.',
  tooMany: `Puedes adjuntar como máximo ${MAX_PHOTOS} fotografías.`,
} as const;
