import { ApiProperty } from '@nestjs/swagger';

export class UnitResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'A-101' })
  code!: string;

  @ApiProperty({ example: '101' })
  number!: string;

  @ApiProperty({
    example: 2,
    description:
      'Residentes activos de la unidad (H16). Seguridad no puede enviar solicitudes a una unidad con 0.',
  })
  residentCount!: number;
}
