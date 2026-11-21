import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsOptional,
  IsString,
  Length,
  MaxLength,
} from 'class-validator';
import { IncidentLocation } from '@PrismaClient';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

const TITLE_MESSAGE = 'El título debe tener entre 5 y 80 caracteres.';
const DESCRIPTION_MESSAGE =
  'La descripción debe tener entre 10 y 1,000 caracteres.';

/**
 * Campos de texto del multipart de POST /incidencias (H10). Las fotografías
 * llegan aparte, en `photos`, y las valida el servicio.
 */
export class CreateIncidentDto {
  @ApiProperty({
    example: 'Fuga de agua en el pasillo',
    minLength: 5,
    maxLength: 80,
  })
  @Transform(trim)
  @IsString({ message: TITLE_MESSAGE })
  @Length(5, 80, { message: TITLE_MESSAGE })
  title!: string;

  @ApiProperty({
    example: 'Desde ayer gotea agua del techo frente al elevador del piso 3.',
    minLength: 10,
    maxLength: 1000,
  })
  @Transform(trim)
  @IsString({ message: DESCRIPTION_MESSAGE })
  @Length(10, 1000, { message: DESCRIPTION_MESSAGE })
  description!: string;

  @ApiProperty({ enum: IncidentLocation, example: IncidentLocation.TORRE_A })
  @IsEnum(IncidentLocation, { message: 'Selecciona una ubicación.' })
  location!: IncidentLocation;

  @ApiPropertyOptional({ example: 'Piso 3, pasillo norte', maxLength: 100 })
  // Un campo vacío del formulario cuenta como "sin referencia".
  @Transform(({ value }: { value: unknown }) => {
    const text = typeof value === 'string' ? value.trim() : value;
    return text === '' ? undefined : text;
  })
  @IsOptional()
  @IsString({
    message:
      'La referencia de la ubicación no puede superar los 100 caracteres.',
  })
  @MaxLength(100, {
    message:
      'La referencia de la ubicación no puede superar los 100 caracteres.',
  })
  locationDetail?: string;
}
