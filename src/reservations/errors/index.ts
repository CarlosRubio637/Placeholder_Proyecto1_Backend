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
