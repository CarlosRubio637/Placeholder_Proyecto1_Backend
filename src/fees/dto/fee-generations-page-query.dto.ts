import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';
import {
  DEFAULT_HISTORY_PAGE_SIZE,
  FEE_MESSAGES,
  MAX_PAGE_SIZE,
} from '../fees.constants.js';

export class FeeGenerationsPageQueryDto {
  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @Type(() => Number)
  @IsInt({ message: FEE_MESSAGES.page })
  @Min(1, { message: FEE_MESSAGES.page })
  page: number = 1;

  @ApiPropertyOptional({
    default: DEFAULT_HISTORY_PAGE_SIZE,
    minimum: 1,
    maximum: MAX_PAGE_SIZE,
  })
  @Type(() => Number)
  @IsInt({ message: FEE_MESSAGES.pageSize })
  @Min(1, { message: FEE_MESSAGES.pageSize })
  @Max(MAX_PAGE_SIZE, { message: FEE_MESSAGES.pageSize })
  pageSize: number = DEFAULT_HISTORY_PAGE_SIZE;
}
