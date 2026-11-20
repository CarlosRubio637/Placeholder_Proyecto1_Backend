import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Roles } from '@Auth/decorators';
import {
  InsideVisitListDto,
  InsideVisitsQueryDto,
} from './dto/inside-visits.dto.js';
import { InsideVisitsService } from './inside-visits.service.js';

/** Portería: quién está dentro del condominio (H18). Solo el Personal de seguridad. */
@ApiTags('visitas')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Token ausente, inválido o expirado.' })
@ApiForbiddenResponse({ description: 'Solo el Personal de seguridad.' })
@Roles('SEGURIDAD')
@Controller('seguridad/visitas')
export class InsideVisitsController {
  constructor(private readonly inside: InsideVisitsService) {}

  @Get('dentro')
  @ApiOperation({
    summary:
      'Visitantes dentro del condominio, la entrada más antigua primero (H18)',
  })
  @ApiOkResponse({ type: InsideVisitListDto })
  @ApiBadRequestResponse({
    description: 'Torre, búsqueda o paginación inválidas. `field` indica cuál.',
  })
  list(@Query() query: InsideVisitsQueryDto): Promise<InsideVisitListDto> {
    return this.inside.list(query);
  }
}
