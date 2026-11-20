import { ApiProperty } from '@nestjs/swagger';
import { AssemblyStatus } from '@PrismaClient';

/** Participación de un tema (H35). Sin la opción elegida: el voto es secreto. */
export class TopicParticipationDto {
  @ApiProperty({ example: '¿Aprueba el presupuesto 2027?' })
  question!: string;

  @ApiProperty({
    example: 18,
    description: 'Unidades que votaron el tema (VoteParticipation, H23).',
  })
  votedUnits!: number;

  @ApiProperty({
    example: 24,
    description: 'Unidades habilitadas, guardadas al abrir la asamblea (H22).',
  })
  eligibleUnits!: number;

  @ApiProperty({
    example: 75,
    description: 'votedUnits / eligibleUnits × 100, con un decimal.',
  })
  participationPct!: number;
}

/** Una asamblea del reporte, con sus temas en orden. */
export class AssemblyParticipationDto {
  @ApiProperty({ format: 'uuid' })
  assemblyId!: string;

  @ApiProperty({ example: 'Asamblea ordinaria de noviembre' })
  title!: string;

  @ApiProperty({ enum: [AssemblyStatus.ABIERTA, AssemblyStatus.CERRADA] })
  status!: AssemblyStatus;

  @ApiProperty({ description: 'Momento real de apertura.' })
  openedAt!: Date;

  @ApiProperty({
    example: 72.5,
    description:
      'Promedio simple de la participación de sus temas, con un decimal.',
  })
  avgParticipationPct!: number;

  @ApiProperty({ type: [TopicParticipationDto] })
  topics!: TopicParticipationDto[];
}

/** Respuesta de GET /admin/reportes/participacion (H35). */
export class ParticipationReportDto {
  @ApiProperty({
    type: [AssemblyParticipationDto],
    description: 'La apertura más reciente primero.',
  })
  data!: AssemblyParticipationDto[];

  @ApiProperty({ example: 3 })
  total!: number;

  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 10 })
  pageSize!: number;
}
