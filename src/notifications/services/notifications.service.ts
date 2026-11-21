import { Injectable } from '@nestjs/common';
import { isUUID } from 'class-validator';
import { NotificationRepository } from '@Notifications/repositories';
import { NotificationValidationError } from '@Notifications/errors';
import {
  NOTIFICATION_LIMITS,
  RecipientType,
  SourceModule,
  type SendNotificationInput,
  type SendNotificationResult,
} from '../notifications.types.js';

const RECIPIENT_TYPES = Object.values(RecipientType) as string[];
const SOURCE_MODULES = Object.values(SourceModule) as string[];

/**
 * Servicio interno de envío de avisos (H30).
 *
 * Es la única forma de crear notificaciones. No tiene endpoint HTTP a
 * propósito: solo el código del servidor puede enviar avisos. Los módulos lo
 * llaman después de confirmar su propio cambio en la base.
 */
@Injectable()
export class NotificationsService {
  constructor(private readonly repository: NotificationRepository) {}

  /**
   * Crea una notificación No leída por cada usuario destinatario.
   *
   * @throws NotificationValidationError si el input no cumple el contrato o
   *   algún id no existe. En ese caso no se crea ninguna notificación.
   */
  async send(input: SendNotificationInput): Promise<SendNotificationResult> {
    const data = this.validate(input);
    const created = await this.repository.createForRecipient(data);
    return { created };
  }

  /**
   * Valida y normaliza el input. Se valida en tiempo de ejecución aunque
   * TypeScript ya revise el tipo, porque los datos pueden venir de un DTO o de
   * la base y no de un literal.
   */
  private validate(input: SendNotificationInput) {
    const { recipient, sourceModule, reference } =
      input ?? ({} as SendNotificationInput);

    if (!recipient || typeof recipient !== 'object') {
      throw new NotificationValidationError(
        'recipient',
        'Falta el destinatario.',
      );
    }
    if (!RECIPIENT_TYPES.includes(recipient.type)) {
      throw new NotificationValidationError(
        'recipient.type',
        `El tipo de destinatario debe ser uno de: ${RECIPIENT_TYPES.join(', ')}.`,
      );
    }
    const ids = this.validateIds(recipient.type, recipient.ids);

    const title = this.validateText(
      'title',
      input.title,
      NOTIFICATION_LIMITS.maxTitleLength,
      'El título',
    );
    const message = this.validateText(
      'message',
      input.message,
      NOTIFICATION_LIMITS.maxMessageLength,
      'El mensaje',
    );

    if (!SOURCE_MODULES.includes(sourceModule)) {
      throw new NotificationValidationError(
        'sourceModule',
        `El módulo de origen debe ser uno de: ${SOURCE_MODULES.join(', ')}.`,
      );
    }

    let referenceType: string | null = null;
    let referenceId: string | null = null;
    if (reference !== undefined && reference !== null) {
      if (typeof reference !== 'object') {
        throw new NotificationValidationError(
          'reference',
          'La referencia debe ser { type, id }.',
        );
      }
      referenceType = this.validateText(
        'reference.type',
        reference.type,
        NOTIFICATION_LIMITS.maxReferenceTypeLength,
        'El tipo de referencia',
      );
      if (typeof reference.id !== 'string' || !isUUID(reference.id)) {
        throw new NotificationValidationError(
          'reference.id',
          'El id de la referencia debe ser un uuid.',
        );
      }
      referenceId = reference.id;
    }

    return {
      recipient: { type: recipient.type, ids },
      title,
      message,
      sourceModule,
      referenceType,
      referenceId,
    };
  }

  /** Devuelve los ids sin repetidos. */
  private validateIds(type: RecipientType, ids: unknown): string[] {
    if (type === RecipientType.TODOS) {
      if (ids !== undefined && (!Array.isArray(ids) || ids.length > 0)) {
        throw new NotificationValidationError(
          'recipient.ids',
          'En TODOS la lista de ids va vacía.',
        );
      }
      return [];
    }

    if (!Array.isArray(ids) || ids.length === 0) {
      throw new NotificationValidationError(
        'recipient.ids',
        'Indica al menos un destinatario.',
      );
    }
    if (ids.length > NOTIFICATION_LIMITS.maxRecipientIds) {
      throw new NotificationValidationError(
        'recipient.ids',
        `Se permiten como máximo ${NOTIFICATION_LIMITS.maxRecipientIds} ids por envío.`,
      );
    }
    const invalid = ids.filter((id) => typeof id !== 'string' || !isUUID(id));
    if (invalid.length > 0) {
      throw new NotificationValidationError(
        'recipient.ids',
        `Estos ids no son uuid válidos: ${invalid.map(String).join(', ')}.`,
      );
    }
    // Un mismo usuario recibe una sola notificación por envío.
    return [...new Set(ids as string[])];
  }

  /** Recorta espacios y exige de 1 a `max` caracteres. */
  private validateText(
    field: 'title' | 'message' | 'reference.type',
    value: unknown,
    max: number,
    label: string,
  ): string {
    const text = typeof value === 'string' ? value.trim() : '';
    if (text.length === 0) {
      throw new NotificationValidationError(field, `${label} es obligatorio.`);
    }
    if (text.length > max) {
      throw new NotificationValidationError(
        field,
        `${label} no puede superar los ${max} caracteres.`,
      );
    }
    return text;
  }
}
