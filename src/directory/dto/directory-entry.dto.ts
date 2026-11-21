import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { DirectoryRow } from '../repositories/index.js';

export class DirectoryEntryDto {
  @ApiProperty({ example: 'Ana Gómez' })
  fullName!: string;

  @ApiPropertyOptional({
    example: 'A-101',
    description: 'Solo si el vecino comparte su unidad.',
  })
  unitCode?: string;

  @ApiPropertyOptional({
    example: '7100-0001',
    description: 'Solo si el vecino comparte su teléfono.',
  })
  phone?: string;

  @ApiPropertyOptional({
    example: 'ana@correo.com',
    description: 'Solo si el vecino comparte su correo.',
  })
  email?: string;

  static fromRow(row: DirectoryRow): DirectoryEntryDto {
    return {
      fullName: row.fullName,
      ...(row.showUnit && row.unitCode !== null && { unitCode: row.unitCode }),
      ...(row.showPhone && { phone: row.phone }),
      ...(row.showEmail && { email: row.email }),
    };
  }
}

export class DirectoryPageDto {
  @ApiProperty({ type: [DirectoryEntryDto] })
  data!: DirectoryEntryDto[];

  @ApiProperty({ example: 2 })
  total!: number;

  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 20 })
  pageSize!: number;
}
