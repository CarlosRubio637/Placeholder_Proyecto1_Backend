import { ApiProperty } from '@nestjs/swagger';
import { VisitStatus } from '@PrismaClient';

/** Respuesta 201 de POST /visitas (H14). */
export class VisitCreatedDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'K7P2QX', description: '6 caracteres sin ambiguos.' })
  code!: string;

  @ApiProperty({
    enum: [VisitStatus.AUTORIZADA],
    example: VisitStatus.AUTORIZADA,
  })
  status!: VisitStatus;

  @ApiProperty({ example: 'Ana María López' })
  visitorName!: string;

  @ApiProperty({ example: '2026-11-10', description: 'AAAA-MM-DD.' })
  visitDate!: string;

  @ApiProperty({ example: '15:30' })
  expectedTime!: string;

  @ApiProperty({
    example: '2026-11-10T12:00:00.000Z',
    description: '06:00 del día de la visita, hora del condominio.',
  })
  validFrom!: string;

  @ApiProperty({
    example: '2026-11-11T04:00:00.000Z',
    description: '22:00 del día de la visita, hora del condominio.',
  })
  validUntil!: string;
}
