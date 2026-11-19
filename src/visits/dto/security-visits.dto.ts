import { ApiProperty, ApiPropertyOptional, PickType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, IsUUID, Matches } from 'class-validator';
import { DocumentType, VisitOrigin, VisitStatus } from '@PrismaClient';
import { ENTRY_MESSAGES } from '../visits.constants.js';
import { CreateVisitDto } from './create-visit.dto.js';

/** Consulta de GET /seguridad/visitas/buscar (H16). */
export class SearchVisitsQueryDto {
  @ApiProperty({
    example: 'K7M2QX',
    description: 'Código de 6 caracteres o número de documento.',
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsString({ message: ENTRY_MESSAGES.search })
  @Matches(/^[A-Z0-9-]{6,12}$/, { message: ENTRY_MESSAGES.search })
  q!: string;
}

/**
 * Cuerpo de POST /seguridad/visitas/solicitudes (H16). Nombre, documento y
 * motivo con las mismas validaciones de H14; la fecha es hoy.
 */
export class CreateVisitRequestDto extends PickType(CreateVisitDto, [
  'visitorName',
  'documentType',
  'documentNumber',
  'reason',
] as const) {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('all', { message: ENTRY_MESSAGES.unitId })
  unitId!: string;
}

/** Visita tal como la ve seguridad al buscar (H16). */
export class SecurityVisitDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiPropertyOptional({ type: String, nullable: true, example: 'K7M2QX' })
  code!: string | null;

  @ApiProperty({ enum: VisitOrigin })
  origin!: VisitOrigin;

  @ApiProperty({ example: 'Ana María López' })
  visitorName!: string;

  @ApiProperty({ enum: DocumentType })
  documentType!: DocumentType;

  @ApiProperty({ example: '01234567-8' })
  documentNumber!: string;

  @ApiProperty({ example: 'A-101' })
  unitCode!: string;

  @ApiProperty({ example: 'Visita familiar' })
  reason!: string;

  @ApiProperty({ example: '2026-11-17' })
  visitDate!: string;

  @ApiProperty({ enum: VisitStatus })
  status!: VisitStatus;

  @ApiProperty()
  validFrom!: Date;

  @ApiProperty()
  validUntil!: Date;
}

export class SecurityVisitListDto {
  @ApiProperty({ type: [SecurityVisitDto] })
  data!: SecurityVisitDto[];
}

/** Solicitud sin autorización previa en la lista "Esperando respuesta". */
export class VisitRequestDto extends SecurityVisitDto {
  @ApiPropertyOptional({ type: String, nullable: true })
  rejectReason!: string | null;

  @ApiProperty({ description: 'Momento en que se envió la solicitud.' })
  createdAt!: Date;

  @ApiPropertyOptional({
    type: Date,
    nullable: true,
    description:
      'createdAt + 15 minutos mientras está Pendiente de autorización; null en los demás estados.',
  })
  expiresAt!: Date | null;
}

export class VisitRequestListDto {
  @ApiProperty({ type: [VisitRequestDto] })
  data!: VisitRequestDto[];
}

/** Respuesta 201 de POST /seguridad/visitas/solicitudes. */
export class VisitRequestCreatedDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ enum: [VisitStatus.PENDIENTE_AUTORIZACION] })
  status!: VisitStatus;

  @ApiProperty({ example: 'A-101' })
  unitCode!: string;

  @ApiProperty()
  expiresAt!: Date;
}

/** Respuesta 200 de POST /seguridad/visitas/:id/entrada. */
export class VisitEntryDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ enum: [VisitStatus.DENTRO] })
  status!: VisitStatus;

  @ApiProperty()
  entryAt!: Date;
}
