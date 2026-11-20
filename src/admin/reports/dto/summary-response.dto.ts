import { ApiProperty } from '@nestjs/swagger';
import { AreaRefDto } from './areas-usage-response.dto.js';

/** Tarjeta Morosidad: últimos 12 meses, con la fórmula de H32. */
export class SummaryDebtDto {
  @ApiProperty({
    example: 1275.5,
    description:
      'Cuotas Pendiente y Moroso con vencimiento en los últimos 12 meses.',
  })
  owedAmount!: number;

  @ApiProperty({
    example: 12.5,
    description: 'Porcentaje de unidades morosas (activas), un decimal.',
  })
  overduePct!: number;
}

/** Tarjeta Áreas comunes: mes actual, con la fórmula de H33. */
export class SummaryAreasDto {
  @ApiProperty({
    type: Number,
    nullable: true,
    example: 23.4,
    description:
      'Promedio simple de la ocupación de las áreas habilitadas, un decimal. null si no hay áreas habilitadas.',
  })
  avgOccupancyPct!: number | null;

  @ApiProperty({
    type: AreaRefDto,
    nullable: true,
    description: 'null si no hay reservas Confirmadas en el mes ("Sin datos").',
  })
  mostUsed!: AreaRefDto | null;
}

/** Tarjeta Incidencias: las abiertas hoy, con las reglas de H34. */
export class SummaryIncidentsDto {
  @ApiProperty({
    example: 9,
    description:
      'Incidencias Pendiente o En proceso hoy, sin importar cuándo se crearon.',
  })
  openTotal!: number;

  @ApiProperty({
    example: 3,
    description: 'De esas, las que llevan más de 7 días (la lista de H34).',
  })
  staleCount!: number;
}

/** Tarjeta Votaciones: la última asamblea Cerrada, con la fórmula de H35. */
export class SummaryVotingDto {
  @ApiProperty({ example: 'Asamblea ordinaria de noviembre' })
  assemblyTitle!: string;

  @ApiProperty({
    example: 72.5,
    description:
      'Promedio simple de la participación de sus temas, un decimal.',
  })
  avgParticipationPct!: number;
}

/** Respuesta 200 de GET /admin/reportes/resumen (H37). */
export class AdminSummaryDto {
  @ApiProperty({ type: SummaryDebtDto })
  debt!: SummaryDebtDto;

  @ApiProperty({ type: SummaryAreasDto })
  areas!: SummaryAreasDto;

  @ApiProperty({ type: SummaryIncidentsDto })
  incidents!: SummaryIncidentsDto;

  @ApiProperty({
    type: SummaryVotingDto,
    nullable: true,
    description: 'null si todavía no hay asambleas Cerradas ("Sin datos").',
  })
  voting!: SummaryVotingDto | null;

  @ApiProperty({ example: '2026-11-20T16:00:00.000Z' })
  generatedAt!: Date;
}
