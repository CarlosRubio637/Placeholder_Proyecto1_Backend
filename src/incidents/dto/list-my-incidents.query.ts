import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { IncidentStatus } from '@PrismaClient';

export const DEFAULT_PAGE_SIZE = 10;
export const MAX_PAGE_SIZE = 50;

/** Consulta de GET /incidencias/mias (H11). */
export class ListMyIncidentsQuery {
  @ApiPropertyOptional({
    enum: IncidentStatus,
    description: 'Sin valor = todos los estados.',
  })
  @IsOptional()
  @IsEnum(IncidentStatus, { message: 'El estado no es válido.' })
  status?: IncidentStatus;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'La página debe ser un número entero.' })
  @Min(1, { message: 'La página debe ser 1 o mayor.' })
  page: number = 1;

  @ApiPropertyOptional({
    default: DEFAULT_PAGE_SIZE,
    minimum: 1,
    maximum: MAX_PAGE_SIZE,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'El tamaño de página debe ser un número entero.' })
  @Min(1, {
    message: `El tamaño de página debe estar entre 1 y ${MAX_PAGE_SIZE}.`,
  })
  @Max(MAX_PAGE_SIZE, {
    message: `El tamaño de página debe estar entre 1 y ${MAX_PAGE_SIZE}.`,
  })
  pageSize: number = DEFAULT_PAGE_SIZE;
}
