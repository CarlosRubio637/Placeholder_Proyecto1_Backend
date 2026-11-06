import { ApiProperty } from '@nestjs/swagger';
import { fromDbDate } from '@Common/time';
import type { AreaBlock, CommonArea } from '@PrismaClient';

export class AreaDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ example: 'Piscina' }) name!: string;
  @ApiProperty({ example: 30 }) capacity!: number;
  @ApiProperty({ type: String, nullable: true }) rules!: string | null;
  @ApiProperty({ example: '08:00' }) openTime!: string;
  @ApiProperty({ example: '20:00' }) closeTime!: string;
  @ApiProperty({ enum: [60, 120] }) slotMinutes!: number;
  @ApiProperty() isActive!: boolean;
  @ApiProperty({ type: String, format: 'date-time' }) updatedAt!: Date;

  static fromEntity(area: CommonArea): AreaDto {
    return {
      id: area.id,
      name: area.name,
      capacity: area.capacity,
      rules: area.rules,
      openTime: area.openTime,
      closeTime: area.closeTime,
      slotMinutes: area.slotMinutes,
      isActive: area.isActive,
      updatedAt: area.updatedAt,
    };
  }
}

export class BlockDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ example: '2026-11-10' }) startDate!: string;
  @ApiProperty({ example: '2026-11-12' }) endDate!: string;
  @ApiProperty({ example: 'Mantenimiento de la bomba' }) reason!: string;

  static fromEntity(block: AreaBlock): BlockDto {
    return {
      id: block.id,
      startDate: fromDbDate(block.startDate),
      endDate: fromDbDate(block.endDate),
      reason: block.reason,
    };
  }
}

/** Fila de GET /admin/areas. */
export class AreaListItemDto extends AreaDto {
  @ApiProperty({ description: 'Reservas confirmadas futuras.', example: 3 })
  futureReservations!: number;

  @ApiProperty({ type: [BlockDto], description: 'Bloqueos actuales y futuros.' })
  blocks!: BlockDto[];
}

export class AreaListDto {
  @ApiProperty({ type: [AreaListItemDto] }) data!: AreaListItemDto[];
}

/** Respuesta de PATCH /admin/areas/:id. */
export class AreaUpdatedDto {
  @ApiProperty({ type: AreaDto }) area!: AreaDto;
  @ApiProperty({ example: 2 }) cancelledReservations!: number;
}

/** Respuesta de POST /admin/areas/:id/bloqueos. */
export class BlockCreatedDto {
  @ApiProperty({ type: BlockDto }) block!: BlockDto;
  @ApiProperty({ example: 2 }) cancelledReservations!: number;
}
