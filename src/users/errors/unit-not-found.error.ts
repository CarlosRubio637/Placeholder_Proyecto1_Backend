/**
 * Error de dominio: no hay ninguna unidad con ese código de registro (H38).
 * El servicio lo traduce a 404.
 */
export class UnitNotFoundError extends Error {
  constructor(public readonly registrationCode: string) {
    super(`No existe una unidad con el código de registro "${registrationCode}".`);
    this.name = 'UnitNotFoundError';
  }
}
