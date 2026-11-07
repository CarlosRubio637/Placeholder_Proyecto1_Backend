import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  StreamableFile,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser, Roles } from '@Auth/decorators';
import { IncidentLocation, type User } from '@PrismaClient';
import {
  CreateIncidentDto,
  IncidentCreatedDto,
  IncidentDetailDto,
  IncidentListDto,
  ListMyIncidentsQuery,
} from '../dto/index.js';
import { IncidentPhotosInterceptor } from '../interceptors/index.js';
import { IncidentsService, type UploadedPhoto } from '../services/index.js';

@ApiTags('incidencias')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Token ausente, inválido o expirado.' })
@Controller('incidencias')
export class IncidentsController {
  constructor(private readonly incidentsService: IncidentsService) {}

  /** H10: el residente reporta una incidencia con 1 a 3 fotografías. */
  @Post()
  @Roles('RESIDENTE')
  @UseInterceptors(IncidentPhotosInterceptor)
  @ApiOperation({ summary: 'Registra una incidencia con evidencia (H10)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['title', 'description', 'location', 'photos'],
      properties: {
        title: { type: 'string', minLength: 5, maxLength: 80 },
        description: { type: 'string', minLength: 10, maxLength: 1000 },
        location: { type: 'string', enum: Object.values(IncidentLocation) },
        locationDetail: { type: 'string', maxLength: 100 },
        photos: {
          type: 'array',
          minItems: 1,
          maxItems: 3,
          items: { type: 'string', format: 'binary' },
          description: 'JPG o PNG, máximo 5 MB cada una.',
        },
      },
    },
  })
  @ApiCreatedResponse({ type: IncidentCreatedDto })
  @ApiBadRequestResponse({
    description:
      'Datos o archivos inválidos. `field` indica el campo que falló.',
  })
  @ApiForbiddenResponse({
    description: 'Solo un residente puede registrar incidencias.',
  })
  create(
    @CurrentUser() user: User,
    @Body() dto: CreateIncidentDto,
    @UploadedFiles() files: UploadedPhoto[] | undefined,
  ): Promise<IncidentCreatedDto> {
    return this.incidentsService.create(user, dto, files ?? []);
  }

  /**
   * H11: incidencias de la unidad del residente, de la más reciente a la más
   * antigua. Va antes de GET :id para que "mias" no se tome como un id.
   */
  @Get('mias')
  @Roles('RESIDENTE')
  @ApiOperation({ summary: 'Incidencias de la unidad del residente (H11)' })
  @ApiOkResponse({ type: IncidentListDto })
  @ApiBadRequestResponse({ description: 'Filtro o paginación inválidos.' })
  @ApiForbiddenResponse({
    description: 'Solo un residente tiene "mis incidencias".',
  })
  listMine(
    @CurrentUser() user: User,
    @Query() query: ListMyIncidentsQuery,
  ): Promise<IncidentListDto> {
    return this.incidentsService.listMine(user, query);
  }

  /** Archivo de una fotografía (lo usan H10 y el detalle de H11). */
  @Get('fotos/:fotoId')
  @Roles('RESIDENTE', 'ADMINISTRADOR')
  @ApiOperation({ summary: 'Devuelve una fotografía de incidencia' })
  @ApiOkResponse({
    description: 'La imagen (image/jpeg o image/png).',
    content: { 'image/jpeg': {}, 'image/png': {} },
  })
  @ApiForbiddenResponse({
    description: 'La foto es de una incidencia de otra unidad.',
  })
  @ApiNotFoundResponse({ description: 'La fotografía no existe.' })
  async photo(
    @CurrentUser() user: User,
    @Param('fotoId', new ParseUUIDPipe()) photoId: string,
  ): Promise<StreamableFile> {
    const { stream, size, mimeType } = await this.incidentsService.getPhoto(
      user,
      photoId,
    );
    return new StreamableFile(stream, { type: mimeType, length: size });
  }

  /** H11: detalle con fotos, responsable e historial (el administrador lo usa desde H12). */
  @Get(':id')
  @Roles('RESIDENTE', 'ADMINISTRADOR')
  @ApiOperation({ summary: 'Detalle de una incidencia con su historial (H11)' })
  @ApiOkResponse({ type: IncidentDetailDto })
  @ApiNotFoundResponse({ description: 'No existe o es de otra unidad.' })
  @ApiForbiddenResponse({ description: 'Personal de seguridad.' })
  detail(
    @CurrentUser() user: User,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<IncidentDetailDto> {
    return this.incidentsService.getDetail(user, id);
  }
}
