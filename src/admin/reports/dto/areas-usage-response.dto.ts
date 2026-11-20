import { ApiProperty } from '@nestjs/swagger';

/** Uso de un área común en el periodo (H33). */
export class AreaUsageDto {
  @ApiProperty({ format: 'uuid' })
  areaId!: string;

  @ApiProperty({ example: 'Piscina' })
  name!: string;

  @ApiProperty({
    example: 12,
    description: 'Reservas Confirmadas cuya fecha está en el periodo.',
  })
  confirmed!: number;

  @ApiProperty({
    example: 2,
    description:
      'Reservas canceladas (por el residente o por la administración) en el periodo. Solo informativo.',
  })
  cancelled!: number;

  @ApiProperty({
    example: 14,
    description: 'Suma de la duración de las reservas Confirmadas, en horas.',
  })
  reservedHours!: number;

  @ApiProperty({
    example: 360,
    description:
      'Horas entre apertura y cierre por cada día del periodo, sin los días con bloqueo.',
  })
  enabledHours!: number;

  @ApiProperty({
    example: 3.9,
    description:
      'reservedHours / enabledHours × 100, con un decimal. 0 si no hay horas habilitadas.',
  })
  occupancyPct!: number;
}

/** Área destacada: la más usada o la menos usada. */
export class AreaRefDto {
  @ApiProperty({ format: 'uuid' })
  areaId!: string;

  @ApiProperty({ example: 'Piscina' })
  name!: string;
}

/** Respuesta de GET /admin/reportes/areas (H33). */
export class AreasUsageReportDto {
  @ApiProperty({
    type: [AreaUsageDto],
    description:
      'Áreas habilitadas, de mayor a menor ocupación (desempate: más reservas y luego nombre).',
  })
  data!: AreaUsageDto[];

  @ApiProperty({
    type: AreaRefDto,
    nullable: true,
    description: 'null si no hay reservas Confirmadas en el periodo.',
  })
  mostUsed!: AreaRefDto | null;

  @ApiProperty({
    type: AreaRefDto,
    nullable: true,
    description: 'null si no hay reservas Confirmadas en el periodo.',
  })
  leastUsed!: AreaRefDto | null;
}
