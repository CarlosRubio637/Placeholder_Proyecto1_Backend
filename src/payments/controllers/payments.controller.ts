import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { CurrentUser, Roles } from '@Auth/decorators';
import { FORBIDDEN_BODY } from '@Auth/guards';
import type { User } from '@PrismaClient';
import {
  AccountStatementDto,
  AdminUnitDto,
  FeeDetailDto,
  FeePaymentListDto,
  PayFeeDto,
  PaymentReceiptDto,
  PaymentResultDto,
  RegistrationCodeDto,
  StatementQueryDto,
} from '../dto/index.js';
import { AccountStatementService, PaymentsService } from '../services/index.js';

/** H1 y H2: cuotas, pagos y estado de cuenta del Residente. */
@ApiTags('cuotas y pagos')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Token ausente, inválido o expirado.' })
@ApiForbiddenResponse({ description: 'Rol sin permiso.' })
@Controller()
export class PaymentsController {
  constructor(
    private readonly payments: PaymentsService,
    private readonly statements: AccountStatementService,
  ) {}

  @Get('estado-cuenta')
  @Roles('RESIDENTE')
  @ApiOperation({ summary: 'Estado de cuenta de la unidad del residente (H2)' })
  @ApiOkResponse({ type: AccountStatementDto })
  @ApiBadRequestResponse({
    description: 'Filtro inválido. `field` indica el campo.',
  })
  myStatement(
    @CurrentUser() user: User,
    @Query() query: StatementQueryDto,
  ): Promise<AccountStatementDto> {
    if (!user.unitId) {
      throw new ForbiddenException(FORBIDDEN_BODY);
    }
    // El servidor ignora cualquier id de unidad que mande el Residente.
    return this.statements.statement(user.unitId, query);
  }

  @Get('cuotas/:cuotaId')
  @Roles('RESIDENTE')
  @ApiOperation({
    summary: 'Cuota de la unidad del residente, para pagarla (H1)',
  })
  @ApiOkResponse({ type: FeeDetailDto })
  @ApiNotFoundResponse({
    description: 'La cuota no existe o es de otra unidad.',
  })
  getFee(
    @CurrentUser() user: User,
    @Param('cuotaId', new ParseUUIDPipe()) feeId: string,
  ): Promise<FeeDetailDto> {
    return this.payments.getFee(user, feeId);
  }

  @Get('cuotas/:cuotaId/pagos')
  @Roles('RESIDENTE', 'ADMINISTRADOR')
  @ApiOperation({
    summary: 'Pagos de una cuota, del más reciente al más antiguo (H2)',
  })
  @ApiOkResponse({ type: FeePaymentListDto })
  @ApiNotFoundResponse({
    description: 'La cuota no existe o es de otra unidad.',
  })
  feePayments(
    @CurrentUser() user: User,
    @Param('cuotaId', new ParseUUIDPipe()) feeId: string,
  ): Promise<FeePaymentListDto> {
    return this.payments.feePayments(user, feeId);
  }

  @Post('cuotas/:cuotaId/pagos')
  @Roles('RESIDENTE')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Paga una cuota con la pasarela simulada (H1)',
    description:
      'Un rechazo de la pasarela responde 201 con status RECHAZADO. Si llega la misma idempotencyKey, responde 200 con el mismo pago sin cobrar de nuevo.',
  })
  @ApiCreatedResponse({ type: PaymentResultDto })
  @ApiOkResponse({
    type: PaymentResultDto,
    description: 'Misma idempotencyKey: el pago ya registrado.',
  })
  @ApiBadRequestResponse({
    description: 'Datos de tarjeta inválidos. `field` indica el campo.',
  })
  @ApiNotFoundResponse({
    description: 'La cuota no existe o es de otra unidad.',
  })
  @ApiConflictResponse({ description: 'Esta cuota ya está pagada.' })
  async pay(
    @CurrentUser() user: User,
    @Param('cuotaId', new ParseUUIDPipe()) feeId: string,
    @Body() dto: PayFeeDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<PaymentResultDto> {
    const { payment, replayed } = await this.payments.pay(user, feeId, dto);
    if (replayed) {
      res.status(HttpStatus.OK);
    }
    return payment;
  }

  @Get('pagos/:pagoId')
  @Roles('RESIDENTE', 'ADMINISTRADOR')
  @ApiOperation({ summary: 'Recibo de un pago (H1)' })
  @ApiOkResponse({ type: PaymentReceiptDto })
  @ApiNotFoundResponse({
    description: 'El pago no existe o es de otra unidad.',
  })
  receipt(
    @CurrentUser() user: User,
    @Param('pagoId', new ParseUUIDPipe()) paymentId: string,
  ): Promise<PaymentReceiptDto> {
    return this.payments.receipt(user, paymentId);
  }
}

/** H2: estado de cuenta y código de registro de cualquier unidad. */
@ApiTags('admin · unidades')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Token ausente, inválido o expirado.' })
@ApiForbiddenResponse({ description: 'Solo el Administrador.' })
@Roles('ADMINISTRADOR')
@Controller()
export class AdminUnitsController {
  constructor(private readonly statements: AccountStatementService) {}

  @Get('unidades/:unitId/estado-cuenta')
  @ApiOperation({
    summary: 'Estado de cuenta de una unidad, en solo lectura (H2)',
  })
  @ApiOkResponse({ type: AccountStatementDto })
  @ApiNotFoundResponse({ description: 'La unidad no existe.' })
  statement(
    @Param('unitId', new ParseUUIDPipe()) unitId: string,
    @Query() query: StatementQueryDto,
  ): Promise<AccountStatementDto> {
    return this.statements.statement(unitId, query);
  }

  @Get('admin/unidades/:unitId')
  @ApiOperation({
    summary: 'Unidad con su código de registro y residentes (H2)',
  })
  @ApiOkResponse({ type: AdminUnitDto })
  @ApiNotFoundResponse({ description: 'La unidad no existe.' })
  unit(
    @Param('unitId', new ParseUUIDPipe()) unitId: string,
  ): Promise<AdminUnitDto> {
    return this.statements.adminUnit(unitId);
  }

  @Post('admin/unidades/:unitId/codigo-registro')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Regenera el código de registro de la unidad (H2)' })
  @ApiCreatedResponse({ type: RegistrationCodeDto })
  @ApiNotFoundResponse({ description: 'La unidad no existe.' })
  regenerate(
    @CurrentUser() user: User,
    @Param('unitId', new ParseUUIDPipe()) unitId: string,
  ): Promise<RegistrationCodeDto> {
    return this.statements.regenerateCode(user, unitId);
  }
}
