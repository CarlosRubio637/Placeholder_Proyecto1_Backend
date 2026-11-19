import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { FORBIDDEN_BODY } from '@Auth/guards';
import { badRequest } from '@Common/validation';
import { fromDbDate, todayIso } from '@Common/time';
import {
  NotificationsService,
  RecipientType,
  SourceModule,
} from '@Notifications';
import { Role, type Fee, type Payment, type User } from '@PrismaClient';
import type {
  FeeDetailDto,
  FeePaymentListDto,
  PayFeeDto,
  PaymentReceiptDto,
  PaymentResultDto,
} from '../dto/index.js';
import {
  FeeAlreadyPaidError,
  FeeNotFoundError,
  IdempotencyKeyReusedError,
  PaymentNotFoundError,
} from '../errors/index.js';
import { MockPaymentGateway } from '../gateway/index.js';
import { PAYMENT_MESSAGES } from '../payments.constants.js';
import {
  isUniqueViolation,
  PaymentsRepository,
  type PaymentWithFee,
} from '../repositories/index.js';

/**
 * Pago de cuotas con la pasarela simulada (H1) y detalle de pagos (H2).
 *
 * Nunca guarda ni escribe en los logs el número completo de la tarjeta ni el
 * código de seguridad: solo pasan a la pasarela y se descartan.
 */
@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly repository: PaymentsRepository,
    private readonly gateway: MockPaymentGateway,
    private readonly notifications: NotificationsService,
  ) {}

  /** GET /cuotas/:cuotaId: cuota de la unidad del residente (H1). */
  async getFee(resident: User, feeId: string): Promise<FeeDetailDto> {
    const fee = await this.repository.findFeeForUnit(
      feeId,
      requireUnit(resident),
    );
    if (!fee) {
      throw new NotFoundException(PAYMENT_MESSAGES.feeNotFound);
    }
    return toFeeDetail(fee);
  }

  /**
   * POST /cuotas/:cuotaId/pagos (H1). Devuelve `replayed: true` cuando la
   * llave de idempotencia ya tenía un pago: se responde el mismo sin cobrar.
   */
  async pay(
    resident: User,
    feeId: string,
    dto: PayFeeDto,
    now = new Date(),
  ): Promise<{ payment: PaymentResultDto; replayed: boolean }> {
    const unitId = requireUnit(resident);
    assertNotExpired(dto.expMonth, dto.expYear, now);

    const fee = await this.repository.findFeeForUnit(feeId, unitId);
    if (!fee) {
      throw new NotFoundException(PAYMENT_MESSAGES.feeNotFound);
    }

    const previous = await this.replay(dto.idempotencyKey, fee.id);
    if (previous) {
      return { payment: previous, replayed: true };
    }
    if (fee.status === 'PAGADO') {
      throw new ConflictException(PAYMENT_MESSAGES.alreadyPaid);
    }

    const result = await this.gateway.charge(
      {
        number: dto.cardNumber,
        expMonth: dto.expMonth,
        expYear: dto.expYear,
        cvv: dto.cvv,
        holderName: dto.holderName,
      },
      fee.amount.toNumber(),
    );

    let payment: PaymentWithFee;
    try {
      payment = await this.repository.record({
        fee,
        payerId: resident.id,
        idempotencyKey: dto.idempotencyKey,
        cardLast4: dto.cardNumber.slice(-4),
        holderName: dto.holderName,
        day: todayIso(now).replaceAll('-', ''),
        now,
        approved: result.approved,
        failureReason: result.approved ? null : result.reason,
      });
    } catch (error) {
      // Doble envío con la misma llave: la otra solicitud ya lo registró.
      if (isUniqueViolation(error)) {
        const replayed = await this.replay(dto.idempotencyKey, fee.id);
        if (replayed) {
          return { payment: replayed, replayed: true };
        }
      }
      throw toHttpError(error);
    }

    await this.notify(payment);
    return { payment: toPaymentResult(payment), replayed: false };
  }

  /** GET /pagos/:pagoId: recibo, del residente de la unidad o del Administrador (H1). */
  async receipt(user: User, paymentId: string): Promise<PaymentReceiptDto> {
    const row = await this.repository.findReceipt(paymentId, scopeUnit(user));
    if (!row) {
      throw new NotFoundException(PAYMENT_MESSAGES.paymentNotFound);
    }
    const base = toPaymentResult(row);
    return {
      id: base.id,
      transactionNumber: base.transactionNumber,
      status: base.status,
      failureReason: base.failureReason,
      amount: base.amount,
      cardLast4: base.cardLast4,
      createdAt: base.createdAt,
      holderName: row.holderName,
      unit: { code: row.unit.code },
      fee: {
        id: row.fee.id,
        period: row.fee.period,
        concept: row.fee.concept,
        dueDate: fromDbDate(row.fee.dueDate),
        status: row.fee.status,
      },
    };
  }

  /** GET /cuotas/:cuotaId/pagos: intentos de pago de una cuota (H2). */
  async feePayments(user: User, feeId: string): Promise<FeePaymentListDto> {
    const fee = await this.repository.findFeeForUnit(feeId, scopeUnit(user));
    if (!fee) {
      throw new NotFoundException(PAYMENT_MESSAGES.feeNotFound);
    }
    const payments = await this.repository.listFeePayments(fee.id);
    return {
      data: payments.map((p) => ({
        id: p.id,
        transactionNumber: p.transactionNumber,
        createdAt: p.createdAt,
        amount: p.amount.toNumber(),
        cardLast4: p.cardLast4,
        status: p.status,
        failureReason: p.failureReason,
      })),
    };
  }

  private async replay(
    key: string,
    feeId: string,
  ): Promise<PaymentResultDto | null> {
    const existing = await this.repository.findByIdempotencyKey(key);
    if (!existing) {
      return null;
    }
    if (existing.feeId !== feeId) {
      throw toHttpError(new IdempotencyKeyReusedError());
    }
    return toPaymentResult(existing);
  }

  /** Aviso al residente que pagó (H1 + H30). Si falla, el pago ya quedó. */
  private async notify(payment: PaymentWithFee): Promise<void> {
    const approved = payment.status === 'APROBADO';
    try {
      await this.notifications.send({
        recipient: { type: RecipientType.USUARIO, ids: [payment.payerId] },
        title: approved ? 'Pago aprobado' : 'Pago rechazado',
        message: approved
          ? `Tu pago de $${payment.amount.toFixed(2)} de la cuota ${payment.fee.period} fue aprobado. Transacción ${payment.transactionNumber}.`
          : `Tu pago de la cuota ${payment.fee.period} fue rechazado: ${payment.failureReason}.`,
        sourceModule: SourceModule.CUOTAS,
        reference: { type: 'payment', id: payment.id },
      });
    } catch (error) {
      this.logger.error(
        `No se pudo avisar el pago ${payment.transactionNumber}`,
        error,
      );
    }
  }
}

function requireUnit(user: User): string {
  if (!user.unitId) {
    throw new ForbiddenException(FORBIDDEN_BODY);
  }
  return user.unitId;
}

/** El Administrador ve cualquier unidad; el Residente, solo la suya. */
function scopeUnit(user: User): string | null {
  return user.role === Role.ADMINISTRADOR ? null : requireUnit(user);
}

/** La tarjeta no puede vencer antes del mes actual del condominio. */
function assertNotExpired(expMonth: number, expYear: number, now: Date): void {
  const [year, month] = todayIso(now).split('-').map(Number);
  if (expYear * 12 + expMonth < year * 12 + month) {
    throw badRequest('expMonth', PAYMENT_MESSAGES.expiry);
  }
}

function toFeeDetail(fee: Fee): FeeDetailDto {
  return {
    id: fee.id,
    period: fee.period,
    concept: fee.concept,
    amount: fee.amount.toNumber(),
    dueDate: fromDbDate(fee.dueDate),
    status: fee.status,
  };
}

function toPaymentResult(payment: Payment & { fee: Fee }): PaymentResultDto {
  return {
    id: payment.id,
    transactionNumber: payment.transactionNumber,
    status: payment.status,
    failureReason: payment.failureReason,
    amount: payment.amount.toNumber(),
    cardLast4: payment.cardLast4,
    createdAt: payment.createdAt,
    fee: {
      id: payment.fee.id,
      period: payment.fee.period,
      status: payment.fee.status,
    },
  };
}

function toHttpError(error: unknown): unknown {
  if (error instanceof FeeNotFoundError) {
    return new NotFoundException(PAYMENT_MESSAGES.feeNotFound);
  }
  if (error instanceof PaymentNotFoundError) {
    return new NotFoundException(PAYMENT_MESSAGES.paymentNotFound);
  }
  if (error instanceof FeeAlreadyPaidError) {
    return new ConflictException(PAYMENT_MESSAGES.alreadyPaid);
  }
  if (error instanceof IdempotencyKeyReusedError) {
    return new ConflictException(PAYMENT_MESSAGES.keyReused);
  }
  if (error instanceof BadRequestException) {
    return error;
  }
  return error;
}
