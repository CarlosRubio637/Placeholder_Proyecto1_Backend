import { ApiProperty } from '@nestjs/swagger';
import type { PackageStatus } from '@PrismaClient';

/** Lo que el servicio lee de la base para armar la fila. */
export interface MyPackageRow {
  id: string;
  code: string;
  courier: string;
  trackingNumber: string | null;
  notes: string | null;
  receivedAt: Date;
  deliveredAt: Date | null;
  pickedUpByName: string | null;
  pickedUpByDocNumber: string | null;
  status: PackageStatus;
}

export class MyPackageDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'PQ-20261031-0014' })
  code!: string;

  @ApiProperty({ example: 'DHL' })
  courier!: string;

  @ApiProperty({ type: String, nullable: true, example: '4581-2203' })
  trackingNumber!: string | null;

  @ApiProperty({ type: String, nullable: true })
  notes!: string | null;

  @ApiProperty()
  receivedAt!: Date;

  @ApiProperty({ example: 0, description: 'Días completos que lleva en portería (0 si llegó hoy).' })
  daysWaiting!: number;

  @ApiProperty({ type: Date, nullable: true })
  deliveredAt!: Date | null;

  @ApiProperty({ type: String, nullable: true })
  pickedUpByName!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    example: '4321',
    description: 'Solo los últimos 4 caracteres del documento, por privacidad.',
  })
  pickedUpByDocLast4!: string | null;
}

export class MyPackagesListDto {
  @ApiProperty({ example: 2, description: 'Paquetes pendientes de entrega de la unidad.' })
  pendingCount!: number;

  @ApiProperty({ type: [MyPackageDto] })
  data!: MyPackageDto[];

  @ApiProperty()
  total!: number;

  @ApiProperty()
  page!: number;

  @ApiProperty()
  pageSize!: number;
}
