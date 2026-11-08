import { ApiProperty } from '@nestjs/swagger';

/** Cifras del panel (H32), calculadas sobre todas las unidades. */
export class DelinquencySummaryDto {
  @ApiProperty({
    example: 1275.5,
    description:
      'Suma de las cuotas Pendiente y Moroso con vencimiento en el rango.',
  })
  owedAmount!: number;

  @ApiProperty({
    example: 6,
    description: 'Unidades con al menos una cuota Moroso en el rango.',
  })
  overdueUnits!: number;

  @ApiProperty({
    example: 40,
    description: 'Unidades con al menos un residente activo.',
  })
  activeUnits!: number;

  @ApiProperty({
    example: 15,
    description:
      'overdueUnits / activeUnits × 100, con un decimal (0 si no hay unidades activas).',
  })
  overduePct!: number;
}

/** Una unidad morosa de la tabla. */
export class DelinquentUnitDto {
  @ApiProperty({ example: 'A-101' })
  unitCode!: string;

  @ApiProperty({
    example: 255,
    description:
      'Cuotas Pendiente y Moroso de la unidad con vencimiento en el rango.',
  })
  owedAmount!: number;

  @ApiProperty({
    example: 98,
    description:
      'Días completos desde el vencimiento de su cuota impaga más antigua del rango.',
  })
  ageDays!: number;
}

/** Respuesta 200 de GET /admin/reportes/morosidad. */
export class DelinquencyReportDto {
  @ApiProperty({ type: DelinquencySummaryDto })
  summary!: DelinquencySummaryDto;

  @ApiProperty({ type: [DelinquentUnitDto] })
  data!: DelinquentUnitDto[];

  @ApiProperty({
    description: 'Unidades morosas en total (todas las páginas).',
  })
  total!: number;

  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 20 })
  pageSize!: number;
}
