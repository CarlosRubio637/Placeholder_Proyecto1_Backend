import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { DocumentType } from '@PrismaClient';

export const INSIDE_PAGE_SIZE = 50;
export const INSIDE_MAX_PAGE_SIZE = 100;
export const INSIDE_SEARCH_MAX = 80;

/** Mensajes de la consulta "quién está dentro" (H18). */
export const INSIDE_MESSAGES = {
  towerId: 'Selecciona una torre válida.',
  search: `La búsqueda no puede superar los ${INSIDE_SEARCH_MAX} caracteres.`,
  page: 'page debe ser un número entero mayor o igual a 1.',
  pageSize: `pageSize debe ser un entero entre 1 y ${INSIDE_MAX_PAGE_SIZE}.`,
} as const;

const emptyToUndefined = ({ value }: { value: unknown }) => {
  const text = typeof value === 'string' ? value.trim() : value;
  return text === '' ? undefined : text;
};

/** Consulta de GET /seguridad/visitas/dentro (H18). Todos los filtros son opcionales. */
export class InsideVisitsQueryDto {
  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Torre de la unidad destino.',
  })
  @Transform(emptyToUndefined)
  @IsOptional()
  @IsUUID('all', { message: INSIDE_MESSAGES.towerId })
  towerId?: string;

  @ApiPropertyOptional({
    maxLength: INSIDE_SEARCH_MAX,
    description:
      'Nombre o documento. Coincidencia por contenido, sin distinguir mayúsculas ni tildes.',
  })
  @Transform(emptyToUndefined)
  @IsOptional()
  @IsString({ message: INSIDE_MESSAGES.search })
  @MaxLength(INSIDE_SEARCH_MAX, { message: INSIDE_MESSAGES.search })
  search?: string;

  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @Type(() => Number)
  @IsOptional()
  @IsInt({ message: INSIDE_MESSAGES.page })
  @Min(1, { message: INSIDE_MESSAGES.page })
  page: number = 1;

  @ApiPropertyOptional({
    minimum: 1,
    maximum: INSIDE_MAX_PAGE_SIZE,
    default: INSIDE_PAGE_SIZE,
  })
  @Type(() => Number)
  @IsOptional()
  @IsInt({ message: INSIDE_MESSAGES.pageSize })
  @Min(1, { message: INSIDE_MESSAGES.pageSize })
  @Max(INSIDE_MAX_PAGE_SIZE, { message: INSIDE_MESSAGES.pageSize })
  pageSize: number = INSIDE_PAGE_SIZE;
}

/** Fila de la lista de visitantes dentro (H18). */
export class InsideVisitDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'Carlos Pineda' })
  visitorName!: string;

  @ApiProperty({ enum: DocumentType })
  documentType!: DocumentType;

  @ApiProperty({ example: '01234567-8' })
  documentNumber!: string;

  @ApiProperty({ example: 'C-201' })
  unitCode!: string;

  @ApiProperty({ example: 'Plomero' })
  reason!: string;

  @ApiProperty()
  entryAt!: Date;

  @ApiProperty({
    description: 'Minutos desde la entrada, calculados en el servidor.',
  })
  minutesInside!: number;
}

/** Respuesta de GET /seguridad/visitas/dentro (H18). */
export class InsideVisitListDto {
  @ApiProperty({ description: 'Total de visitas Dentro, sin filtros.' })
  totalInside!: number;

  @ApiProperty({ type: [InsideVisitDto] })
  data!: InsideVisitDto[];

  @ApiProperty({ description: 'Total que coincide con los filtros.' })
  total!: number;

  @ApiProperty()
  page!: number;

  @ApiProperty()
  pageSize!: number;
}
