import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  Max,
  Min,
} from 'class-validator';
import { SourceModule } from '@PrismaClient';

/** Tamaño de página por defecto de la bandeja (H31). */
export const DEFAULT_PAGE_SIZE = 20;
/** Límite para que nadie pida la tabla entera de una vez. */
export const MAX_PAGE_SIZE = 100;

/** Los query params llegan como texto: solo se aceptan "true" y "false". */
const toBoolean = ({ value }: { value: unknown }) => {
  if (value === 'true' || value === true) return true;
  if (value === 'false' || value === false) return false;
  return value;
};

/** Query de GET /notificaciones (H31). Todos los filtros son opcionales. */
export class ListNotificationsQueryDto {
  @ApiPropertyOptional({
    enum: SourceModule,
    description: 'Sin valor = todos los módulos.',
  })
  @IsOptional()
  @IsEnum(SourceModule, {
    message: `El módulo de origen debe ser uno de: ${Object.values(SourceModule).join(', ')}.`,
  })
  sourceModule?: SourceModule;

  @ApiPropertyOptional({
    type: Boolean,
    description: 'true = solo No leídas. Sin valor o false = todas.',
  })
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean({ message: 'El filtro unread debe ser true o false.' })
  unread?: boolean;

  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'La página debe ser un número entero mayor o igual a 1.' })
  @Min(1, { message: 'La página debe ser un número entero mayor o igual a 1.' })
  page: number = 1;

  @ApiPropertyOptional({
    minimum: 1,
    maximum: MAX_PAGE_SIZE,
    default: DEFAULT_PAGE_SIZE,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({
    message: `El tamaño de página debe estar entre 1 y ${MAX_PAGE_SIZE}.`,
  })
  @Min(1, {
    message: `El tamaño de página debe estar entre 1 y ${MAX_PAGE_SIZE}.`,
  })
  @Max(MAX_PAGE_SIZE, {
    message: `El tamaño de página debe estar entre 1 y ${MAX_PAGE_SIZE}.`,
  })
  pageSize: number = DEFAULT_PAGE_SIZE;
}
