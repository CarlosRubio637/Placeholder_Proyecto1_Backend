import { ApiProperty } from '@nestjs/swagger';
import { PackageStatus } from '@PrismaClient';

/** Respuesta 200 de POST /seguridad/paquetes/:id/entrega (H21). */
export class DeliveredPackageDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'PQ-20261031-0014' })
  code!: string;

  @ApiProperty({ enum: PackageStatus, example: PackageStatus.ENTREGADO })
  status!: PackageStatus;

  @ApiProperty({ description: 'Fecha y hora de entrega (ISO).' })
  deliveredAt!: Date;

  @ApiProperty({ example: 'Ana María López' })
  pickedUpByName!: string;
}
