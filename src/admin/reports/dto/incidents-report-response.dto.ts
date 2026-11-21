import { ApiProperty } from '@nestjs/swagger';
import { IncidentPriority, IncidentStatus } from '@PrismaClient';

/** Una celda de la tabla cruzada estado × prioridad. */
export class IncidentMatrixCellDto {
  @ApiProperty({ enum: IncidentStatus, example: IncidentStatus.PENDIENTE })
  status!: IncidentStatus;

  @ApiProperty({ enum: IncidentPriority, example: IncidentPriority.ALTA })
  priority!: IncidentPriority;

  @ApiProperty({
    example: 3,
    description:
      'Incidencias creadas en el periodo con ese estado actual y esa prioridad.',
  })
  count!: number;
}

/** Una fila de la lista de abiertas con más de 7 días. */
export class StaleIncidentDto {
  @ApiProperty({ example: 'INC-2026-00012' })
  number!: string;

  @ApiProperty({ example: 'Fuga en el lavamanos del baño' })
  title!: string;

  @ApiProperty({ example: 'A-101' })
  unitCode!: string;

  @ApiProperty({ enum: [IncidentStatus.PENDIENTE, IncidentStatus.EN_PROCESO] })
  status!: IncidentStatus;

  @ApiProperty({ enum: IncidentPriority })
  priority!: IncidentPriority;

  @ApiProperty({
    type: String,
    nullable: true,
    example: 'Juan Pérez',
    description: 'Nombre del responsable de mantenimiento; null si no tiene.',
  })
  assignee!: string | null;

  @ApiProperty({
    example: 12,
    description:
      'Días de calendario del condominio desde su creación hasta hoy.',
  })
  daysOpen!: number;
}

export class StaleIncidentsPageDto {
  @ApiProperty({ type: [StaleIncidentDto] })
  data!: StaleIncidentDto[];

  @ApiProperty({
    description: 'Abiertas con más de 7 días (todas las páginas).',
  })
  total!: number;

  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 20 })
  pageSize!: number;
}

/** Respuesta 200 de GET /admin/reportes/incidencias. */
export class IncidentsReportDto {
  @ApiProperty({
    type: [IncidentMatrixCellDto],
    description:
      'Siempre las 9 combinaciones (3 estados × 3 prioridades), aunque valgan 0.',
  })
  matrix!: IncidentMatrixCellDto[];

  @ApiProperty({
    example: 7,
    description: 'Incidencias de la tabla cruzada en Pendiente o En proceso.',
  })
  openTotal!: number;

  @ApiProperty({
    type: Number,
    nullable: true,
    example: 3.4,
    description:
      'Promedio de (resolvedAt − createdAt) en días, un decimal, de las resueltas cuyo resolvedAt está en el periodo. null = "Sin datos".',
  })
  avgResolutionDays!: number | null;

  @ApiProperty({
    type: StaleIncidentsPageDto,
    description: 'Abiertas hoy con más de 7 días. No aplica el periodo.',
  })
  stale!: StaleIncidentsPageDto;
}
