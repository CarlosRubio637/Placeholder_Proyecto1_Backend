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
import { CurrentUser, Roles } from '@Auth/decorators';
import type { User } from '@PrismaClient';
import { DirectoryPageDto, DirectorySearchQueryDto } from '../dto/index.js';
import { DirectoryService } from '../services/index.js';

@ApiTags('directorio')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Token ausente, inválido o expirado.' })
@ApiForbiddenResponse({ description: 'Solo el Residente usa el directorio.' })
@Roles('RESIDENTE')
@Controller('directorio')
export class DirectoryController {
  constructor(private readonly directory: DirectoryService) {}

  @Get()
  @ApiOperation({
    summary: 'Busca vecinos visibles por nombre o por unidad (H29)',
  })
  @ApiOkResponse({ type: DirectoryPageDto })
  @ApiBadRequestResponse({
    description:
      'Nombre de menos de 3 caracteres, unidad inválida, sin criterio o con los dos, o más de 20 por página.',
  })
  search(
    @CurrentUser() user: User,
    @Query() query: DirectorySearchQueryDto,
  ): Promise<DirectoryPageDto> {
    return this.directory.search(user, query);
  }
}
