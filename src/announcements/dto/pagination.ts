import { applyDecorators } from '@nestjs/common';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';
import {
  MAX_PAGE,
  MAX_PAGE_SIZE,
  PAGE_MESSAGES,
} from '../announcements.constants.js';

export function PageNumber(): PropertyDecorator {
  return applyDecorators(
    ApiPropertyOptional({ default: 1, minimum: 1, maximum: MAX_PAGE }),
    Type(() => Number),
    IsInt({ message: PAGE_MESSAGES.page }),
    Min(1, { message: PAGE_MESSAGES.page }),
    Max(MAX_PAGE, { message: PAGE_MESSAGES.pageTooHigh }),
  );
}

export function PageSize(defaultSize: number): PropertyDecorator {
  return applyDecorators(
    ApiPropertyOptional({
      default: defaultSize,
      minimum: 1,
      maximum: MAX_PAGE_SIZE,
    }),
    Type(() => Number),
    IsInt({ message: PAGE_MESSAGES.pageSize }),
    Min(1, { message: PAGE_MESSAGES.pageSize }),
    Max(MAX_PAGE_SIZE, { message: PAGE_MESSAGES.pageSize }),
  );
}
