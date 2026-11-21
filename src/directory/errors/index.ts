export class ProfileNotFoundError extends Error {
  constructor(public readonly userId: string) {
    super(`El usuario ${userId} no tiene perfil.`);
    this.name = 'ProfileNotFoundError';
  }
}
