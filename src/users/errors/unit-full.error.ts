/**
 * Error de dominio: la unidad ya tiene el máximo de residentes (H38).
 * El servicio lo traduce a 409.
 */
export class UnitFullError extends Error {
  constructor(
    public readonly unitId: string,
    public readonly maxResidents: number,
  ) {
    super(`La unidad ${unitId} ya tiene ${maxResidents} residentes.`);
    this.name = 'UnitFullError';
  }
}
