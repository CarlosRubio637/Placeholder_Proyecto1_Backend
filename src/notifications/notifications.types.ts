/**
 * Contrato del servicio de avisos (H30).
 *
 * Los demás módulos importan desde `@Notifications`:
 *
 * @example
 *   // incidents.module.ts
 *   @Module({ imports: [NotificationsModule], ... })
 *
 *   // incidents.service.ts (después de confirmar el cambio en la base)
 *   await this.notifications.send({
 *     recipient: { type: RecipientType.USUARIO, ids: [incident.reporterId] },
 *     title: 'Tu incidencia cambió de estado',
 *     message: `La incidencia ${incident.code} pasó a "En proceso".`,
 *     sourceModule: SourceModule.INCIDENCIAS,
 *     reference: { type: 'incident', id: incident.id },
 *   });
 */
import { SourceModule } from '@PrismaClient';

// SourceModule es un enum de la base (modelo Notification); se reexporta para
// que quien llama no tenga que importar el cliente de Prisma.
export { SourceModule };

/** A quién va dirigido el aviso. */
export const RecipientType = {
  /** Los usuarios indicados en `ids` (ids de User). */
  USUARIO: 'USUARIO',
  /** Los residentes activos de las unidades indicadas (ids de Unit). */
  UNIDAD: 'UNIDAD',
  /** Los residentes activos de las unidades de las torres indicadas (ids de Tower). */
  TORRES: 'TORRES',
  /** Todos los residentes activos. `ids` va vacío. */
  TODOS: 'TODOS',
} as const;

export type RecipientType = (typeof RecipientType)[keyof typeof RecipientType];

export interface NotificationRecipient {
  type: RecipientType;
  /** 1 a 500 uuids de User, Unit o Tower según `type`; vacío en TODOS. */
  ids: string[];
}

export interface NotificationReference {
  /** 1 a 30 caracteres: "fee", "reservation", "incident", "visit", "package", "assembly", "announcement"… */
  type: string;
  /** Id (uuid) del registro de origen. */
  id: string;
}

/** Entrada de `NotificationsService.send`. */
export interface SendNotificationInput {
  recipient: NotificationRecipient;
  /** 1 a 100 caracteres. */
  title: string;
  /** 1 a 500 caracteres. */
  message: string;
  sourceModule: SourceModule;
  reference?: NotificationReference;
}

/** Respuesta de `NotificationsService.send`. */
export interface SendNotificationResult {
  /** Cantidad de notificaciones creadas (una por usuario destinatario). */
  created: number;
}

/** Límites del contrato, por si quien llama quiere validar antes. */
export const NOTIFICATION_LIMITS = {
  maxRecipientIds: 500,
  maxTitleLength: 100,
  maxMessageLength: 500,
  maxReferenceTypeLength: 30,
} as const;
