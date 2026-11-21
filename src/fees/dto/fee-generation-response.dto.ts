import { ApiProperty } from '@nestjs/swagger';
import { fromDbDate } from '@Common/time';
import type { FeeGenerationWithAuthor } from '../repositories/index.js';

export class FeeGenerationAuthorDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({
    example: 'Ana Paz',
    description: 'Nombre del perfil, o el correo si la cuenta no tiene perfil.',
  })
  name!: string;
}

export class FeeGenerationDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: '2026-12' })
  period!: string;

  @ApiProperty({ example: 35.5 })
  amount!: number;

  @ApiProperty({ example: '2026-12-10' })
  dueDate!: string;

  @ApiProperty({ example: 'Cuota de mantenimiento diciembre 2026' })
  concept!: string;

  @ApiProperty({ example: 5 })
  createdCount!: number;

  @ApiProperty({ example: 1 })
  skippedCount!: number;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty({ type: FeeGenerationAuthorDto })
  createdBy!: FeeGenerationAuthorDto;

  static fromEntity(generation: FeeGenerationWithAuthor): FeeGenerationDto {
    const author = generation.createdBy;
    return {
      id: generation.id,
      period: generation.period,
      amount: generation.amount.toNumber(),
      dueDate: fromDbDate(generation.dueDate),
      concept: generation.concept,
      createdCount: generation.createdCount,
      skippedCount: generation.skippedCount,
      createdAt: generation.createdAt,
      createdBy: {
        id: author.id,
        name: author.profile?.fullName ?? author.email,
      },
    };
  }
}

export class FeeGenerationPreviewDto {
  @ApiProperty({ example: 6 })
  activeUnits!: number;

  @ApiProperty({ example: 1 })
  alreadyGenerated!: number;

  @ApiProperty({ example: 5 })
  toCreate!: number;
}

export class FeeGenerationsPageDto {
  @ApiProperty({ type: [FeeGenerationDto] })
  data!: FeeGenerationDto[];

  @ApiProperty({ example: 11 })
  total!: number;

  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 10 })
  pageSize!: number;
}
