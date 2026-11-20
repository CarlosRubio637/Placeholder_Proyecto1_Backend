/**
 * Errores de dominio del módulo de reservas. Los lanza el repositorio y el
 * servicio los traduce a HTTP, igual que en el módulo de usuarios.
 */

export class AreaNotFoundError extends Error {
  constructor(public readonly areaId: string) {
    super(`No existe el área ${areaId}.`);
    this.name = 'AreaNotFoundError';
  }
}

export class BlockNotFoundError extends Error {
  constructor(public readonly blockId: string) {
    super(`No existe el bloqueo ${blockId}.`);
    this.name = 'BlockNotFoundError';
  }
}

export class AreaNameTakenError extends Error {
  constructor(public readonly name: string) {
    super(`Ya existe un área llamada "${name}".`);
    this.name = 'AreaNameTakenError';
  }
}

/** El cambio cancelaría reservas y no llegó confirmCancellations (H9). */
export class AffectedReservationsError extends Error {
  constructor(public readonly affectedCount: number) {
    super(`El cambio cancelaría ${affectedCount} reservas confirmadas.`);
    this.name = 'AffectedReservationsError';
  }
}

/** El área está deshabilitada (H7). */
export class AreaDisabledError extends Error {
  constructor(public readonly areaId: string) {
    super(`El área ${areaId} está deshabilitada.`);
    this.name = 'AreaDisabledError';
  }
}

/** La fecha cae dentro de un bloqueo del área (H7). */
export class AreaBlockedError extends Error {
  constructor(
    public readonly areaId: string,
    public readonly date: string,
  ) {
    super(`El área ${areaId} está bloqueada el ${date}.`);
    this.name = 'AreaBlockedError';
  }
}

/** Ya hay una reserva confirmada en la franja (H7). */
export class SlotTakenError extends Error {
  constructor(public readonly slotKey: string) {
    super(`La franja ${slotKey} ya está reservada.`);
    this.name = 'SlotTakenError';
  }
}

/** La unidad ya llegó al máximo de reservas confirmadas futuras (H7). */
export class UnitReservationLimitError extends Error {
  constructor(public readonly unitId: string) {
    super(`La unidad ${unitId} ya tiene el máximo de reservas activas.`);
    this.name = 'UnitReservationLimitError';
  }
}

/** La reserva no existe o es de otra unidad (H8). */
export class ReservationNotFoundError extends Error {
  constructor(public readonly reservationId: string) {
    super(`No existe la reserva ${reservationId} en la unidad.`);
    this.name = 'ReservationNotFoundError';
  }
}

/** La reserva ya no está Confirmada (H8). */
export class ReservationNotActiveError extends Error {
  constructor(public readonly reservationId: string) {
    super(`La reserva ${reservationId} ya no está confirmada.`);
    this.name = 'ReservationNotActiveError';
  }
}

/** Faltan menos de 24 horas para el inicio (H8). */
export class CancellationTooLateError extends Error {
  constructor(public readonly reservationId: string) {
    super(`La reserva ${reservationId} empieza en menos de 24 horas.`);
    this.name = 'CancellationTooLateError';
  }
}
