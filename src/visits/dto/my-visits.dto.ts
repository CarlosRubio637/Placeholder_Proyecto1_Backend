import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { DocumentType, VisitOrigin, VisitStatus } from '@PrismaClient';
import {
  MY_VISITS_MAX_PAGE_SIZE,
  MY_VISITS_MESSAGES as M,
  MY_VISITS_PAGE_SIZE,
  REJECT_REASON_MAX,
} from '../visits.constants.js';

export const MY_VISITS_TABS = ['activas', 'historial'] as const;
export type MyVisitsTab = (typeof MY_VISITS_TABS)[number];

/** Consulta de GET /visitas/mias (H15). */
export class MyVisitsQueryDto {
  @ApiPropertyOptional({ enum: MY_VISITS_TABS, default: 'activas' })
  @IsOptional()
  @IsIn(MY_VISITS_TABS, { message: M.tab })
  tab: MyVisitsTab = 'activas';

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: M.page })
  @Min(1, { message: M.page })
  page: number = 1;

  @ApiPropertyOptional({
    default: MY_VISITS_PAGE_SIZE,
    minimum: 1,
    maximum: MY_VISITS_MAX_PAGE_SIZE,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: M.pageSize })
  @Min(1, { message: M.pageSize })
  @Max(MY_VISITS_MAX_PAGE_SIZE, { message: M.pageSize })
  pageSize: number = MY_VISITS_PAGE_SIZE;
}

export const DECISIONS = ['APROBAR', 'RECHAZAR'] as const;
export type Decision = (typeof DECISIONS)[number];

/** Cuerpo de POST /visitas/:id/respuesta (H15). */
export class VisitResponseDto {
  @ApiProperty({ enum: DECISIONS })
  @IsIn(DECISIONS, { message: M.decision })
  decision!: Decision;

  @ApiPropertyOptional({ maxLength: REJECT_REASON_MAX })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() || undefined : value,
  )
  @IsOptional()
  @IsString({ message: M.reason })
  @MaxLength(REJECT_REASON_MAX, { message: M.reason })
  reason?: string;
}

/** Fila de "Mis visitas" (H15). */
export class MyVisitDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() visitorName!: string;
  @ApiProperty({ enum: DocumentType }) documentType!: DocumentType;
  @ApiProperty() documentNumber!: string;
  @ApiProperty({ example: '2026-11-20' }) visitDate!: string;
  @ApiPropertyOptional({ type: String, nullable: true, example: '15:30' })
  expectedTime!: string | null;
  @ApiPropertyOptional({ type: Date, nullable: true }) entryAt!: Date | null;
  @ApiProperty() reason!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) code!: string | null;
  @ApiProperty({ enum: VisitStatus }) status!: VisitStatus;
  @ApiProperty({ enum: VisitOrigin }) origin!: VisitOrigin;
  @ApiProperty({
    example: 'Ana López',
    description:
      'Residente que la autorizó, o "Seguridad" si la pidió portería.',
  })
  createdBy!: string;
  @ApiPropertyOptional({ type: String, nullable: true })
  rejectReason!: string | null;
  @ApiPropertyOptional({
    type: Date,
    nullable: true,
    description: 'createdAt + 15 minutos en las solicitudes pendientes.',
  })
  expiresAt!: Date | null;
}

export class MyVisitListDto {
  @ApiProperty({ type: [MyVisitDto] }) data!: MyVisitDto[];
  @ApiProperty() total!: number;
  @ApiProperty() page!: number;
  @ApiProperty() pageSize!: number;
}

export class VisitCancelledDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ enum: [VisitStatus.CANCELADA] }) status!: VisitStatus;
  @ApiProperty() cancelledAt!: Date;
}

export class VisitAnsweredDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ enum: [VisitStatus.AUTORIZADA, VisitStatus.RECHAZADA] })
  status!: VisitStatus;
  @ApiProperty() respondedAt!: Date;
}
