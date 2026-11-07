export class TowerNotFoundError extends Error {
  constructor(public readonly towerId: string) {
    super(`No existe la torre ${towerId}.`);
    this.name = 'TowerNotFoundError';
  }
}
