import { ApiProperty } from '@nestjs/swagger';
import { Role } from '@PrismaClient';
import type { UserWithProfile } from '@Users/repositories';

export class MeUnitDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'A-101' })
  code!: string;
}

/** Respuesta de GET /auth/me (H38). */
export class MeResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'ana.lopez@correo.com', format: 'email' })
  email!: string;

  @ApiProperty({ enum: Role, example: Role.RESIDENTE })
  role!: Role;

  @ApiProperty({
    type: String,
    nullable: true,
    example: 'Ana María López',
    description: 'Nombre del perfil. null si la cuenta todavía no tiene perfil.',
  })
  fullName!: string | null;

  @ApiProperty({
    type: MeUnitDto,
    nullable: true,
    description: 'Unidad del residente. null para administración y seguridad.',
  })
  unit!: MeUnitDto | null;

  static fromEntity(user: UserWithProfile): MeResponseDto {
    return {
      id: user.id,
      email: user.email,
      role: user.role,
      fullName: user.profile?.fullName ?? null,
      // La unidad se agrega cuando User tenga la relación con Unit (H39).
      unit: null,
    };
  }
}
