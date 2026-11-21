import { ApiProperty } from '@nestjs/swagger';

export class FeeTasksResultDto {
  @ApiProperty({
    example: 2,
    description: 'Cuotas Pendiente que pasaron a Moroso en esta corrida.',
  })
  markedOverdue!: number;

  @ApiProperty({
    example: 3,
    description: 'Recordatorios de cuota por vencer enviados en esta corrida.',
  })
  remindersSent!: number;
}
