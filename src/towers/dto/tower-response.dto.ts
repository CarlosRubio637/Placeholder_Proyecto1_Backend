import { ApiProperty } from '@nestjs/swagger';

export class TowerResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'Torre A' })
  name!: string;

  @ApiProperty({ example: 'A' })
  letter!: string;
}