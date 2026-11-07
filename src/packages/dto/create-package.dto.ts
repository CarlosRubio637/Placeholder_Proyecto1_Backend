import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  MaxLength,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

// Un campo opcional vacío del formulario cuenta como "no enviado".
const trimOrUndefined = ({ value }: { value: unknown }) => {
  const text = typeof value === 'string' ? value.trim() : value;
  return text === '' ? undefined : text;
};

const UNIT_MESSAGE = 'Selecciona la unidad destino.';
const COURIER_MESSAGE = 'Ingresa la empresa de mensajería (2 a 40 caracteres).';
const TRACKING_MESSAGE = 'La guía solo admite letras, números y guiones (4 a 40).';
const NOTES_MESSAGE =
  'Las observaciones no pueden superar los 200 caracteres.';

/** Cuerpo de POST /seguridad/paquetes (H19). */
export class CreatePackageDto {
  @ApiProperty({ format: 'uuid', description: 'Unidad destino (torre y número).' })
  @IsUUID('all', { message: UNIT_MESSAGE })
  unitId!: string;

  @ApiProperty({ example: 'DHL', minLength: 2, maxLength: 40 })
  @Transform(trim)
  @IsString({ message: COURIER_MESSAGE })
  @Length(2, 40, { message: COURIER_MESSAGE })
  courier!: string;

  @ApiPropertyOptional({ example: '4581-2203', minLength: 4, maxLength: 40 })
  @Transform(trimOrUndefined)
  @IsOptional()
  @IsString({ message: TRACKING_MESSAGE })
  @Length(4, 40, { message: TRACKING_MESSAGE })
  @Matches(/^[A-Za-z0-9-]+$/, { message: TRACKING_MESSAGE })
  trackingNumber?: string;

  @ApiPropertyOptional({ example: 'Caja grande, frágil', maxLength: 200 })
  @Transform(trimOrUndefined)
  @IsOptional()
  @IsString({ message: NOTES_MESSAGE })
  @MaxLength(200, { message: NOTES_MESSAGE })
  notes?: string;
}
