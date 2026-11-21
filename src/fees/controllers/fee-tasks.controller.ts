import { Controller, HttpCode, Post } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Roles } from '@Auth/decorators';
import { FeeTasksResultDto } from '../dto/index.js';
import { FeeTasksService } from '../services/index.js';

@ApiTags('cuotas')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Token ausente, inválido o expirado.' })
@ApiForbiddenResponse({
  description: 'Solo el Administrador ejecuta las tareas de cuotas.',
})
@Roles('ADMINISTRADOR')
@Controller('cuotas/tareas')
export class FeeTasksController {
  constructor(private readonly tasks: FeeTasksService) {}

  @Post('ejecutar')
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Corre ahora las tareas de mora y de recordatorios, con las mismas reglas que el horario (H5)',
  })
  @ApiOkResponse({ type: FeeTasksResultDto })
  run(): Promise<FeeTasksResultDto> {
    return this.tasks.runAll();
  }
}
