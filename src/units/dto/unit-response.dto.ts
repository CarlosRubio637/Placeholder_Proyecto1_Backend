import { ApiProperty } from '@nestjs/swagger';

export class UnitResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'A-101' })
  code!: string;

  @ApiProperty({ example: '101' })
  number!: string;
}