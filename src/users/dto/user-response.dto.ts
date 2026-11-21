import { ApiProperty } from '@nestjs/swagger';
import { Role, type User } from '@PrismaClient';

/**
 * Forma pública de un usuario.
 *
 * Los controladores devuelven esto y nunca la fila cruda de Prisma, para que
 * `passwordHash` no pueda filtrarse en una respuesta por descuido.
 */
export class UserResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'nestor@example.com', format: 'email' })
  email!: string;

  @ApiProperty({ enum: Role, example: Role.RESIDENTE })
  role!: Role;

  @ApiProperty()
  isActive!: boolean;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;

  static fromEntity(user: User): UserResponseDto {
    return {
      id: user.id,
      email: user.email,
      role: user.role,
      isActive: user.isActive,
      createdAt: user.createdAt,
    };
  }
}
