import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

const MSG_PAGE = 'page debe ser un número entero mayor o igual a 1.';

/** Consulta de GET /asambleas/temas/:temaId/participacion (H24): 50 por página. */
export class ParticipationQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: MSG_PAGE })
  @Min(1, { message: MSG_PAGE })
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'pageSize debe ser un entero entre 1 y 100.' })
  @Min(1, { message: 'pageSize debe ser un entero entre 1 y 100.' })
  @Max(100, { message: 'pageSize debe ser un entero entre 1 y 100.' })
  pageSize: number = 50;
}

/** Consulta de GET /asambleas/cerradas (H24): 10 por página. */
export class ClosedAssembliesQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: MSG_PAGE })
  @Min(1, { message: MSG_PAGE })
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'pageSize debe ser un entero entre 1 y 50.' })
  @Min(1, { message: 'pageSize debe ser un entero entre 1 y 50.' })
  @Max(50, { message: 'pageSize debe ser un entero entre 1 y 50.' })
  pageSize: number = 10;
}
