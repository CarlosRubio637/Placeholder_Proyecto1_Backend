import { ApiProperty } from '@nestjs/swagger';
import { VisitStatus } from '@PrismaClient';

/** Respuesta 200 de POST /seguridad/visitas/:id/salida (H17). */
export class VisitExitDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ enum: [VisitStatus.FINALIZADA] })
  status!: VisitStatus;

  @ApiProperty({ nullable: true, type: Date })
  entryAt!: Date | null;

  @ApiProperty()
  exitAt!: Date;
}
