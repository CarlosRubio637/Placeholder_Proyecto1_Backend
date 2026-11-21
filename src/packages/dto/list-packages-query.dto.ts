import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { PackageStatus } from '@PrismaClient';

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

const emptyToUndefined = ({ value }: { value: unknown }) => {
  const text = typeof value === 'string' ? value.trim() : value;
  return text === '' ? undefined : text;
};

/** Consulta de GET /seguridad/paquetes (H19). Todos los filtros son opcionales. */
export class ListPackagesQueryDto {
  @ApiPropertyOptional({ enum: PackageStatus })
  @Transform(emptyToUndefined)
  @IsOptional()
  @IsEnum(PackageStatus, {
    message: 'El estado debe ser PENDIENTE_ENTREGA o ENTREGADO.',
  })
  status?: PackageStatus;

  @ApiPropertyOptional({ format: 'uuid', description: 'Torre de la unidad.' })
  @Transform(emptyToUndefined)
  @IsOptional()
  @IsUUID('all', { message: 'towerId debe ser un uuid.' })
  towerId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @Transform(emptyToUndefined)
  @IsOptional()
  @IsUUID('all', { message: 'unitId debe ser un uuid.' })
  unitId?: string;

  @ApiPropertyOptional({ description: 'Busca en código, guía o código de unidad.' })
  @Transform(emptyToUndefined)
  @IsOptional()
  @IsString({ message: 'La búsqueda debe ser un texto.' })
  @MaxLength(40, { message: 'La búsqueda no puede superar los 40 caracteres.' })
  search?: string;

  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @Type(() => Number)
  @IsOptional()
  @IsInt({ message: 'page debe ser un número entero mayor o igual a 1.' })
  @Min(1, { message: 'page debe ser un número entero mayor o igual a 1.' })
  page?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: MAX_PAGE_SIZE, default: DEFAULT_PAGE_SIZE })
  @Type(() => Number)
  @IsOptional()
  @IsInt({ message: `pageSize debe ser un entero entre 1 y ${MAX_PAGE_SIZE}.` })
  @Min(1, { message: `pageSize debe ser un entero entre 1 y ${MAX_PAGE_SIZE}.` })
  @Max(MAX_PAGE_SIZE, {
    message: `pageSize debe ser un entero entre 1 y ${MAX_PAGE_SIZE}.`,
  })
  pageSize?: number;
}
