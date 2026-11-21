import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import type { AssemblyStatus } from '@PrismaClient';

const ASSEMBLY_STATUSES = ['PROGRAMADA', 'ABIERTA', 'CERRADA'] as const;

const MSG_STATUS = 'El estado debe ser PROGRAMADA, ABIERTA o CERRADA.';
const MSG_PAGE = 'page debe ser un número entero mayor o igual a 1.';
const MSG_PAGE_SIZE = 'pageSize debe ser un entero entre 1 y 50.';

/** Consulta de GET /admin/asambleas: status?, page, pageSize (10 por defecto). */
export class ListAssembliesQueryDto {
  @IsOptional()
  @IsIn(ASSEMBLY_STATUSES, { message: MSG_STATUS })
  status?: AssemblyStatus;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: MSG_PAGE })
  @Min(1, { message: MSG_PAGE })
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: MSG_PAGE_SIZE })
  @Min(1, { message: MSG_PAGE_SIZE })
  @Max(50, { message: MSG_PAGE_SIZE })
  pageSize: number = 10;
}
