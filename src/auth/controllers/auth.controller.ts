import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { AuthService } from '@Auth/services';
import { CurrentUser, Public } from '@Auth/decorators';
import { AuthResponseDto, LoginDto, MeResponseDto, RefreshTokenDto } from '@Auth/dto';
import { UsersService } from '@Users/services';
import type { User } from '@PrismaClient';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly usersService: UsersService,
  ) {}

  /**
   * Login. Responde 200 y no 201: no se crea un recurso direccionable, se
   * devuelve una representación de la sesión. Nest usa 201 por defecto en
   * POST, de ahí el @HttpCode explícito.
   */
  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Inicia sesión con usuario y contraseña' })
  @ApiOkResponse({ type: AuthResponseDto })
  @ApiUnauthorizedResponse({ description: 'Credenciales inválidas.' })
  async login(@Body() dto: LoginDto): Promise<AuthResponseDto> {
    const { user, tokens } = await this.authService.login(dto);
    return AuthResponseDto.from(user, tokens);
  }

  /** Canjea el refresh token por un par nuevo. El token viejo queda revocado. */
  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Renueva el access token rotando el refresh token' })
  @ApiOkResponse({ type: AuthResponseDto })
  @ApiUnauthorizedResponse({ description: 'Refresh token inválido, expirado o ya utilizado.' })
  async refresh(@Body() dto: RefreshTokenDto): Promise<AuthResponseDto> {
    const { user, tokens } = await this.authService.refresh(dto.refreshToken);
    return AuthResponseDto.from(user, tokens);
  }

  /** Logout. 204 porque no hay cuerpo que devolver. */
  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Cierra la sesión revocando el refresh token' })
  @ApiNoContentResponse({ description: 'Sesión cerrada.' })
  async logout(@Body() dto: RefreshTokenDto): Promise<void> {
    await this.authService.logout(dto.refreshToken);
  }

  /**
   * Usuario autenticado con su rol, nombre y unidad (H38). Lo usa el frontend
   * para decidir qué pantallas y qué menú mostrar. Abierto a cualquier rol.
   */
  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Devuelve el usuario autenticado' })
  @ApiOkResponse({ type: MeResponseDto })
  @ApiUnauthorizedResponse({ description: 'Token ausente, inválido o expirado.' })
  async me(@CurrentUser() user: User): Promise<MeResponseDto> {
    const withProfile = await this.usersService.findByIdWithProfile(user.id);
    if (!withProfile) {
      throw new UnauthorizedException('La cuenta no existe o está inactiva.');
    }
    return MeResponseDto.fromEntity(withProfile);
  }
}
