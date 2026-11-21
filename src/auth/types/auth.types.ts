import type { Role } from '@PrismaClient';

/** Payload que viaja dentro del JWT de acceso. */
export interface AccessTokenPayload {
  /** ID del usuario (claim estándar `sub`). */
  sub: string;
  email: string;
  /**
   * Rol del usuario (H38). Es informativo para los clientes: los permisos se
   * validan con el rol leído de la base en cada request (RolesGuard).
   */
  role: Role;
}

/** Par de tokens devuelto por login y refresh. */
export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  /** Vigencia del access token, en segundos. */
  expiresIn: number;
}
