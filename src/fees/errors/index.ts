export class NoActiveUnitsError extends Error {
  constructor() {
    super('No hay unidades activas para generar cuotas.');
    this.name = 'NoActiveUnitsError';
  }
}

export class PeriodAlreadyGeneratedError extends Error {
  constructor(public readonly period: string) {
    super(`Todas las unidades activas ya tienen cuota del periodo ${period}.`);
    this.name = 'PeriodAlreadyGeneratedError';
  }
}
