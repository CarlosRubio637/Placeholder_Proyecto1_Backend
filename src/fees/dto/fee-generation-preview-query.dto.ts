import { ApiProperty } from '@nestjs/swagger';
import { Matches } from 'class-validator';
import { FEE_MESSAGES } from '../fees.constants.js';
import { PERIOD_PATTERN } from './generate-fees.dto.js';

export class FeeGenerationPreviewQueryDto {
  @ApiProperty({ example: '2026-12', description: 'AAAA-MM.' })
  @Matches(PERIOD_PATTERN, { message: FEE_MESSAGES.periodFormat })
  period!: string;
}
