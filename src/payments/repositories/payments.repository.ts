import { randomInt } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '@Prisma/services';
import {
  Prisma,
  FeeStatus,
  PaymentStatus,
  Role,
  type Fee,
  type Payment,
} from '@PrismaClient';
import { FeeAlreadyPaidError, UnitNotFoundError } from '../errors/index.js';
import {
  REGISTRATION_CODE_ALPHABET,
  REGISTRATION_CODE_LENGTH,
} from '../payments.constants.js';

const UNIQUE_CONSTRAINT_VIOLATION = 'P2002';
/** Reintentos si dos pagos del mismo día toman el mismo consecutivo. */
const NUMBER_ATTEMPTS = 5;
const PAYABLE: FeeStatus[] = [FeeStatus.PENDIENTE, FeeStatus.MOROSO];

export interface NewPayment {
  fee: Fee;
  payerId: string;
  idempotencyKey: string;
  cardLast4: string;
  holderName: string;
  /** "AAAAMMDD" del día del pago en el condominio. */
  day: string;
  now: Date;
  approved: boolean;
  failureReason: string | null;
}

export type PaymentWithFee = Payment & { fee: Fee };
export type ReceiptRow = Payment & { fee: Fee; unit: { code: string } };

/**
 * Acceso a datos de cuotas, pagos y códigos de registro (H1 y H2).
 *
 * Un pago aprobado actualiza la cuota con la condición "estado en Pendiente o
 * Moroso" y crea el pago en la misma transacción. Si la cuota ya no estaba por
 * pagar, revierte y lanza FeeAlreadyPaidError. Además, un índice único parcial
 * en la base (payments_one_approved_per_fee) impide dos pagos aprobados por
 * cuota aunque dos solicitudes lleguen a la vez.
 */
@Injectable()
export class PaymentsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findFeeForUnit(feeId: string, unitId: string | null): Promise<Fee | null> {
    return this.prisma.fee.findFirst({
      where: { id: feeId, ...(unitId ? { unitId } : {}) },
    });
  }

  findByIdempotencyKey(key: string): Promise<PaymentWithFee | null> {
    return this.prisma.payment.findUnique({
      where: { idempotencyKey: key },
      include: { fee: true },
    });
  }

  /**
   * Registra el intento de pago. Si es aprobado, también pasa la cuota a
   * Pagado en la misma transacción.
   *
   * @throws {FeeAlreadyPaidError} si la cuota ya no estaba Pendiente o Morosa.
   * @throws Prisma P2002 si la llave de idempotencia ya existe.
   */
  async record(data: NewPayment): Promise<PaymentWithFee> {
    for (let attempt = 1; ; attempt++) {
      try {
        return await this.prisma.$transaction(async (tx) => {
          if (data.approved) {
            const { count } = await tx.fee.updateMany({
              where: { id: data.fee.id, status: { in: PAYABLE } },
              data: { status: FeeStatus.PAGADO, paidAt: data.now },
            });
            if (count === 0) {
              throw new FeeAlreadyPaidError(data.fee.id);
            }
          }
          const sameDay = await tx.payment.count({
            where: { transactionNumber: { startsWith: `TX-${data.day}-` } },
          });
          return tx.payment.create({
            data: {
              feeId: data.fee.id,
              unitId: data.fee.unitId,
              payerId: data.payerId,
              amount: data.fee.amount,
              status: data.approved
                ? PaymentStatus.APROBADO
                : PaymentStatus.RECHAZADO,
              failureReason: data.failureReason,
              transactionNumber: `TX-${data.day}-${String(sameDay + 1).padStart(6, '0')}`,
              cardLast4: data.cardLast4,
              holderName: data.holderName,
              idempotencyKey: data.idempotencyKey,
              createdAt: data.now,
            },
            include: { fee: true },
          });
        });
      } catch (error) {
        if (!isUniqueViolation(error) || attempt >= NUMBER_ATTEMPTS) {
          throw error;
        }
        // La llave repetida o el segundo pago aprobado de la cuota los
        // resuelve quien llama; solo se reintenta el choque de consecutivo.
        if (await this.findByIdempotencyKey(data.idempotencyKey)) {
          throw error;
        }
        const approvedExists = await this.prisma.payment.findFirst({
          where: { feeId: data.fee.id, status: PaymentStatus.APROBADO },
          select: { id: true },
        });
        if (data.approved && approvedExists) {
          throw new FeeAlreadyPaidError(data.fee.id);
        }
      }
    }
  }

  findReceipt(
    paymentId: string,
    unitId: string | null,
  ): Promise<ReceiptRow | null> {
    return this.prisma.payment.findFirst({
      where: { id: paymentId, ...(unitId ? { unitId } : {}) },
      include: { fee: true, unit: { select: { code: true } } },
    });
  }

  listFeePayments(feeId: string): Promise<Payment[]> {
    return this.prisma.payment.findMany({
      where: { feeId },
      orderBy: { createdAt: 'desc' },
    });
  }

  findUnit(unitId: string) {
    return this.prisma.unit.findUnique({
      where: { id: unitId },
      include: {
        tower: { select: { id: true, name: true } },
        residents: {
          where: { role: Role.RESIDENTE },
          orderBy: { createdAt: 'asc' },
          select: { email: true, profile: { select: { fullName: true } } },
        },
      },
    });
  }

  /** Estado de cuenta: resumen sin filtros, años y la página filtrada (H2). */
  async statement(params: {
    unitId: string;
    year?: number;
    status?: FeeStatus;
    skip: number;
    take: number;
  }) {
    const where: Prisma.FeeWhereInput = {
      unitId: params.unitId,
      ...(params.year ? { period: { startsWith: `${params.year}-` } } : {}),
      ...(params.status ? { status: params.status } : {}),
    };
    const [pending, overdueCount, nextDue, periods, rows, total] =
      await Promise.all([
        this.prisma.fee.aggregate({
          where: { unitId: params.unitId, status: { in: PAYABLE } },
          _sum: { amount: true },
        }),
        this.prisma.fee.count({
          where: { unitId: params.unitId, status: FeeStatus.MOROSO },
        }),
        this.prisma.fee.findFirst({
          where: { unitId: params.unitId, status: FeeStatus.PENDIENTE },
          orderBy: { dueDate: 'asc' },
          select: { dueDate: true },
        }),
        this.prisma.fee.findMany({
          where: { unitId: params.unitId },
          select: { period: true },
          distinct: ['period'],
        }),
        this.prisma.fee.findMany({
          where,
          orderBy: { period: 'desc' },
          skip: params.skip,
          take: params.take,
        }),
        this.prisma.fee.count({ where }),
      ]);
    return {
      pendingBalance: pending._sum.amount,
      overdueCount,
      nextDueDate: nextDue?.dueDate ?? null,
      periods: periods.map((p) => p.period),
      rows,
      total,
    };
  }

  /**
   * Regenera el código de registro de la unidad (H2) con el alfabeto sin
   * caracteres ambiguos. Si choca con el de otra unidad, prueba otro.
   *
   * @throws {UnitNotFoundError}
   */
  async regenerateRegistrationCode(unitId: string, actorId: string, now: Date) {
    for (let attempt = 1; ; attempt++) {
      try {
        return await this.prisma.unit.update({
          where: { id: unitId },
          data: {
            registrationCode: randomCode(),
            registrationCodeUpdatedAt: now,
            registrationCodeUpdatedById: actorId,
          },
          select: { registrationCode: true, registrationCodeUpdatedAt: true },
        });
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2025'
        ) {
          throw new UnitNotFoundError(unitId);
        }
        if (!isUniqueViolation(error) || attempt >= NUMBER_ATTEMPTS) {
          throw error;
        }
      }
    }
  }
}

export function randomCode(): string {
  let code = '';
  for (let i = 0; i < REGISTRATION_CODE_LENGTH; i++) {
    code +=
      REGISTRATION_CODE_ALPHABET[randomInt(REGISTRATION_CODE_ALPHABET.length)];
  }
  return code;
}

export function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === UNIQUE_CONSTRAINT_VIOLATION
  );
}
