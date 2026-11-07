import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { Roles, CurrentUser } from '@Auth/decorators';
import type { User } from '@PrismaClient';
import { AssembliesService } from './assemblies.service.js';
import { CreateAssemblyDto } from './dto/create-assembly.dto.js';
import { ListAssembliesQueryDto } from './dto/list-assemblies-query.dto.js';

@Controller('admin/asambleas')
@Roles('ADMINISTRADOR')
export class AssembliesController {
  constructor(private readonly assembliesService: AssembliesService) {}

  @Post()
  @HttpCode(201)
  create(@Body() dto: CreateAssemblyDto, @CurrentUser() user: User) {
    return this.assembliesService.create(dto, user.id);
  }

  @Get()
  findAll(@Query() query: ListAssembliesQueryDto) {
    return this.assembliesService.findAll(query);
  }

  // ParseUUIDPipe: un id mal formado responde 400 en vez de un 500 de Prisma.
  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.assembliesService.findOne(id);
  }

  @Put(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateAssemblyDto,
  ) {
    return this.assembliesService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.assembliesService.remove(id);
  }
}