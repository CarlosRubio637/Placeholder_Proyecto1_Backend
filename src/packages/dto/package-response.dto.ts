import { ApiProperty } from '@nestjs/swagger';
import { PackageStatus } from '@PrismaClient';

/** Lo que el servicio lee de la base para armar la respuesta. */
export interface PackageRow {
  id: string;
  code: string;
  courier: string;
  trackingNumber: string | null;
  notes: string | null;
  status: PackageStatus;
  receivedAt: Date;
  unit: { id: string; code: string };
}

export class PackageUnitDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'A-101' })
  code!: string;
}

/** Respuesta 201 de POST y fila de GET /seguridad/paquetes (H19). */
export class PackageResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'PQ-20261031-0014' })
  code!: string;

  @ApiProperty({ type: PackageUnitDto })
  unit!: PackageUnitDto;

  @ApiProperty({ example: 'DHL' })
  courier!: string;

  @ApiProperty({ type: String, nullable: true, example: '4581-2203' })
  trackingNumber!: string | null;

  @ApiProperty({ type: String, nullable: true, example: 'Caja mediana' })
  notes!: string | null;

  @ApiProperty({ enum: PackageStatus, example: PackageStatus.PENDIENTE_ENTREGA })
  status!: PackageStatus;

  @ApiProperty({ description: 'Fecha y hora de recepción (ISO).' })
  receivedAt!: Date;

  static fromEntity(row: PackageRow): PackageResponseDto {
    return {
      id: row.id,
      code: row.code,
      unit: { id: row.unit.id, code: row.unit.code },
      courier: row.courier,
      trackingNumber: row.trackingNumber,
      notes: row.notes,
      status: row.status,
      receivedAt: row.receivedAt,
    };
  }
}

export class PackageListDto {
  @ApiProperty({ type: [PackageResponseDto] })
  data!: PackageResponseDto[];

  @ApiProperty()
  total!: number;

  @ApiProperty()
  page!: number;

  @ApiProperty()
  pageSize!: number;
}
