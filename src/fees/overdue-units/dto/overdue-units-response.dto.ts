import { ApiProperty } from '@nestjs/swagger';

export class OverdueUnitsSummaryDto {
  @ApiProperty({
    example: 3,
    description:
      'Unidades con al menos una cuota Moroso, tengan o no residentes activos. Con towerId, solo las de esa torre.',
  })
  overdueUnits!: number;

  @ApiProperty({
    example: 3,
    description:
      'Unidades morosas con al menos un residente activo: el numerador del porcentaje.',
  })
  overdueActiveUnits!: number;

  @ApiProperty({
    example: 225,
    description: 'Suma de las cuotas Moroso de las unidades morosas.',
  })
  overdueAmount!: number;

  @ApiProperty({
    example: 5,
    description: 'Unidades con al menos un residente activo.',
  })
  activeUnits!: number;

  @ApiProperty({
    example: 60,
    description:
      'overdueActiveUnits / activeUnits x 100, con un decimal; 0 si no hay unidades activas. Nunca pasa de 100.',
  })
  overduePercent!: number;
}

export class OverdueUnitDto {
  @ApiProperty({ format: 'uuid' })
  unitId!: string;

  @ApiProperty({ example: 'B-203' })
  unitCode!: string;

  @ApiProperty({ example: 'Torre B' })
  towerName!: string;

  @ApiProperty({
    type: [String],
    example: ['Sofía Castillo'],
    description: 'Residentes activos en orden alfabético; vacío si no tiene.',
  })
  residents!: string[];

  @ApiProperty({ example: 2, description: 'Cuotas Moroso de la unidad.' })
  overdueFees!: number;

  @ApiProperty({ example: 90, description: 'Suma de sus cuotas Moroso.' })
  overdueAmount!: number;

  @ApiProperty({
    example: '2026-10-11',
    description:
      'AAAA-MM-DD en El Salvador: el menor overdueAt de sus cuotas Moroso.',
  })
  overdueSince!: string;

  @ApiProperty({
    example: 38,
    description: 'Días completos desde overdueSince hasta hoy.',
  })
  daysOverdue!: number;
}

export class OverdueUnitsReportDto {
  @ApiProperty({
    type: OverdueUnitsSummaryDto,
    description: 'Aplica towerId, pero no search.',
  })
  summary!: OverdueUnitsSummaryDto;

  @ApiProperty({
    type: [OverdueUnitDto],
    description:
      'Por overdueSince ascendente y, en empate, por unitCode ascendente.',
  })
  data!: OverdueUnitDto[];

  @ApiProperty({
    example: 3,
    description: 'Unidades morosas que cumplen towerId y search.',
  })
  total!: number;

  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 20 })
  pageSize!: number;
}
