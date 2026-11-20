/** Errores de dominio de pagos y estado de cuenta (H1, H2). */

export class FeeNotFoundError extends Error {
  constructor(public readonly feeId: string) {
    super(`No existe la cuota ${feeId} en la unidad.`);
    this.name = 'FeeNotFoundError';
  }
}

export class FeeAlreadyPaidError extends Error {
  constructor(public readonly feeId: string) {
    super(`La cuota ${feeId} ya está pagada.`);
    this.name = 'FeeAlreadyPaidError';
  }
}

export class IdempotencyKeyReusedError extends Error {
  constructor() {
    super('La llave de idempotencia ya se usó en otro pago.');
    this.name = 'IdempotencyKeyReusedError';
  }
}

export class PaymentNotFoundError extends Error {
  constructor(public readonly paymentId: string) {
    super(`No existe el pago ${paymentId}.`);
    this.name = 'PaymentNotFoundError';
  }
}

export class UnitNotFoundError extends Error {
  constructor(public readonly unitId: string) {
    super(`No existe la unidad ${unitId}.`);
    this.name = 'UnitNotFoundError';
  }
}
