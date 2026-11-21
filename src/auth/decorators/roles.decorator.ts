import { SetMetadata } from '@nestjs/common';
import type { Role } from '@PrismaClient';

export const ROLES_KEY = 'roles';

/**
 * Restringe una ruta (o un controlador entero) a los roles indicados.
 *
 * Lo aplica RolesGuard, registrado globalmente después de JwtAuthGuard. Una
 * ruta sin @Roles queda abierta a cualquier usuario con sesión.
 *
 * @example
 *   @Roles('ADMINISTRADOR')
 *   @Post('areas')
 *   create(...) {}
 */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
