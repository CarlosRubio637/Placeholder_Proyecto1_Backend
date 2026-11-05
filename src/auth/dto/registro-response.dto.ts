import { ApiProperty } from '@nestjs/swagger';
import { Role } from '@PrismaClient';
import { MeUnitDto } from './me-response.dto.js';
import type { UserWithProfile } from '@Users/repositories';

/** Respuesta 201 de POST /auth/registro (H38). */
export class RegistroResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'ana.lopez@correo.com', format: 'email' })
  email!: string;

  @ApiProperty({ enum: [Role.RESIDENTE], example: Role.RESIDENTE })
  role!: Role;

  @ApiProperty({ type: MeUnitDto })
  unit!: MeUnitDto;

  static fromEntity(user: UserWithProfile): RegistroResponseDto {
    if (!user.unit) {
      // No debería pasar: el registro siempre vincula una unidad y la base lo
      // exige con un CHECK.
      throw new Error('El residente registrado no tiene unidad.');
    }
    return {
      id: user.id,
      email: user.email,
      role: user.role,
      unit: { id: user.unit.id, code: user.unit.code },
    };
  }
}
