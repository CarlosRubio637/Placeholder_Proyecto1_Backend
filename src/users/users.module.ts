import { Module } from '@nestjs/common';
import { UsersService } from '@Users/services';
import { UserRepository } from '@Users/repositories';

// Sin controlador: el POST /users público del boilerplate se eliminó en H38
// para que nadie cree cuentas sin rol ni unidad. Las cuentas de residentes se
// van a crear con POST /auth/registro (segunda parte de H38, después de H39).
@Module({
  providers: [UsersService, UserRepository],
  // Se exporta también el repositorio para que otros módulos puedan reutilizar
  // el acceso a datos de usuarios sin pasar por la lógica de UsersService.
  exports: [UsersService, UserRepository],
})
export class UsersModule {}
