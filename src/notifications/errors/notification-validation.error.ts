/** Campo del input de `send` que no pasó la validación. */
export type NotificationField =
  | 'recipient'
  | 'recipient.type'
  | 'recipient.ids'
  | 'title'
  | 'message'
  | 'sourceModule'
  | 'reference'
  | 'reference.type'
  | 'reference.id';

/**
 * Error de dominio de H30: el envío no es válido y no se creó ninguna
 * notificación.
 *
 * No es una excepción HTTP porque el servicio no tiene endpoint: lo llama
 * código del servidor. Si el módulo que llama lo deja escapar desde un
 * controlador, Nest responde 500, que es lo correcto (es un error de
 * programación, no del usuario).
 */
export class NotificationValidationError extends Error {
  readonly code = 'NOTIFICATION_INVALID' as const;

  constructor(
    public readonly field: NotificationField,
    message: string,
  ) {
    super(message);
    this.name = 'NotificationValidationError';
  }

  /** Forma `{ code, message, field }` que define el contrato de H30. */
  toJSON() {
    return { code: this.code, message: this.message, field: this.field };
  }
}
