import { Body, Controller, Get, Put } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser, Roles } from '@Auth/decorators';
import type { User } from '@PrismaClient';
import { ProfileDto, UpdateProfileDto } from '../dto/index.js';
import { ProfileService } from '../services/index.js';

@ApiTags('perfil')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Token ausente, inválido o expirado.' })
@ApiForbiddenResponse({ description: 'Solo el residente edita su perfil.' })
@ApiNotFoundResponse({ description: 'El usuario no tiene perfil.' })
@Roles('RESIDENTE')
@Controller('perfil')
export class ProfileController {
  constructor(private readonly profiles: ProfileService) {}

  @Get()
  @ApiOperation({
    summary: 'Datos de la cuenta y privacidad en el directorio (H28)',
  })
  @ApiOkResponse({ type: ProfileDto })
  get(@CurrentUser() user: User): Promise<ProfileDto> {
    return this.profiles.get(user);
  }

  @Put()
  @ApiOperation({
    summary: 'Guarda el teléfono y la privacidad en el directorio (H28)',
  })
  @ApiOkResponse({ type: ProfileDto })
  @ApiBadRequestResponse({
    description: 'Datos inválidos. `field` indica el campo que falló.',
  })
  update(
    @CurrentUser() user: User,
    @Body() dto: UpdateProfileDto,
  ): Promise<ProfileDto> {
    return this.profiles.update(user, dto);
  }
}
