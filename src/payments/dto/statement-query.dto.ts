import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import { FeeStatus } from '@PrismaClient';
import {
  MAX_PAGE_SIZE,
  STATEMENT_MESSAGES,
  STATEMENT_PAGE_SIZE,
} from '../payments.constants.js';

/** Consulta del estado de cuenta (H2). */
export class StatementQueryDto {
  @ApiPropertyOptional({ example: 2026, minimum: 2020, maximum: 2100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: STATEMENT_MESSAGES.year })
  @Min(2020, { message: STATEMENT_MESSAGES.year })
  @Max(2100, { message: STATEMENT_MESSAGES.year })
  year?: number;

  @ApiPropertyOptional({ enum: FeeStatus })
  @IsOptional()
  @IsIn(Object.values(FeeStatus), { message: STATEMENT_MESSAGES.status })
  status?: FeeStatus;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @Type(() => Number)
  @IsInt({ message: STATEMENT_MESSAGES.page })
  @Min(1, { message: STATEMENT_MESSAGES.page })
  page: number = 1;

  @ApiPropertyOptional({
    default: STATEMENT_PAGE_SIZE,
    minimum: 1,
    maximum: MAX_PAGE_SIZE,
  })
  @Type(() => Number)
  @IsInt({ message: STATEMENT_MESSAGES.pageSize })
  @Min(1, { message: STATEMENT_MESSAGES.pageSize })
  @Max(MAX_PAGE_SIZE, { message: STATEMENT_MESSAGES.pageSize })
  pageSize: number = STATEMENT_PAGE_SIZE;
}
