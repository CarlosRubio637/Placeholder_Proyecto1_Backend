import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import type { AssemblyStatus } from '@PrismaClient';

const ASSEMBLY_STATUSES = ['PROGRAMADA', 'ABIERTA', 'CERRADA'] as const;

/** Consulta de GET /admin/asambleas: status?, page, pageSize (10 por defecto). */
export class ListAssembliesQueryDto {
  @IsOptional()
  @IsIn(ASSEMBLY_STATUSES)
  status?: AssemblyStatus;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  pageSize: number = 10;
}
