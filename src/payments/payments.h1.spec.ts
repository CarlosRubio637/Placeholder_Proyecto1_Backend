// Los handlers del controlador se pasan sin llamarlos: RolesGuard lee su
// metadata @Roles. Los DTO de prueba son objetos planos, no instancias.
/* oxlint-disable typescript/unbound-method, typescript/no-misused-spread */
import {
  ConflictException,
  ForbiddenException,
  Logger,
  NotFoundException,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from '@Auth/guards';
import type { NotificationsService } from '@Notifications';
import type { PrismaService } from '@Prisma/services';
import { Prisma, type Fee, type Role, type User } from '@PrismaClient';
import { PaymentsController } from './controllers/index.js';
import type { PayFeeDto } from './dto/index.js';
import { FeeAlreadyPaidError } from './errors/index.js';
import { MockPaymentGateway, TEST_CARDS } from './gateway/index.js';
import { PAYMENT_MESSAGES } from './payments.constants.js';
import {
  PaymentsRepository,
  type PaymentWithFee,
} from './repositories/index.js';
import { PaymentsService } from './services/index.js';

const NOW = new Date('2026-11-22T18:00:00Z'); // 12:00 en El Salvador
const RESIDENT = {
  id: 'user-1',
  role: 'RESIDENTE',
  unitId: 'unit-1',
} as User;

const FEE = {
  id: 'fee-1',
  unitId: 'unit-1',
  period: '2026-11',
  concept: 'Cuota de mantenimiento',
  amount: new Prisma.Decimal(45),
  dueDate: new Date('2026-11-30'),
  status: 'PENDIENTE',
  paidAt: null,
} as unknown as Fee;

const dto = (cardNumber: string = TEST_CARDS.approved): PayFeeDto => ({
  idempotencyKey: '7f1c2a8e-3b1d-4c55-9a43-2f6d1e0b9c11',
  cardNumber,
  expMonth: 12,
  expYear: 2030,
  cvv: '123',
  holderName: 'Ana Lopez',
});

function payment(approved: boolean, reason: string | null = null) {
  return {
    id: 'pay-1',
    feeId: FEE.id,
    unitId: FEE.unitId,
    payerId: RESIDENT.id,
    amount: FEE.amount,
    status: approved ? 'APROBADO' : 'RECHAZADO',
    failureReason: reason,
    transactionNumber: 'TX-20261122-000001',
    cardLast4: '4242',
    holderName: 'Ana Lopez',
    idempotencyKey: dto().idempotencyKey,
    createdAt: NOW,
    fee: { ...FEE, status: approved ? 'PAGADO' : FEE.status },
  } as unknown as PaymentWithFee;
}

/** Servicio con el repositorio y las notificaciones simulados y la pasarela real sin espera. */
function setup(fee: Fee | null = FEE) {
  process.env.PAYMENT_GATEWAY_DELAY_MS = '0';
  const repository = {
    findFeeForUnit: vi.fn().mockResolvedValue(fee),
    findByIdempotencyKey: vi.fn().mockResolvedValue(null),
    record: vi.fn(({ approved, failureReason }) =>
      Promise.resolve(payment(approved, failureReason)),
    ),
  };
  const notifications = { send: vi.fn().mockResolvedValue(undefined) };
  const gateway = new MockPaymentGateway();
  const service = new PaymentsService(
    repository as unknown as PaymentsRepository,
    gateway,
    notifications as unknown as NotificationsService,
  );
  return { service, repository, notifications, gateway };
}

/** Repositorio real sobre un Prisma simulado con una transacción. */
function repositorySetup(feeUpdated = 1) {
  const tx = {
    fee: { updateMany: vi.fn().mockResolvedValue({ count: feeUpdated }) },
    payment: {
      count: vi.fn().mockResolvedValue(0),
      create: vi.fn(({ data }) => Promise.resolve({ ...data, fee: FEE })),
    },
  };
  const prisma = {
    $transaction: vi.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
  };
  const repository = new PaymentsRepository(prisma as unknown as PrismaService);
  const record = (approved: boolean) =>
    repository.record({
      fee: FEE,
      payerId: RESIDENT.id,
      idempotencyKey: dto().idempotencyKey,
      cardLast4: '4242',
      holderName: 'Ana Lopez',
      day: '20261122',
      now: NOW,
      approved,
      failureReason: approved ? null : 'Fondos insuficientes',
    });
  return { tx, prisma, record };
}

function requestAs(role: Role): ExecutionContext {
  return {
    getHandler: () => PaymentsController.prototype.pay,
    getClass: () => PaymentsController,
    switchToHttp: () => ({ getRequest: () => ({ user: { role } }) }),
  } as unknown as ExecutionContext;
}

describe('H1. Pago de cuota de mantenimiento con pasarela simulada', () => {
  const previousDelay = process.env.PAYMENT_GATEWAY_DELAY_MS;
  afterAll(() => {
    process.env.PAYMENT_GATEWAY_DELAY_MS = previousDelay;
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each<[string, string, string | null]>([
    ['4242 aprueba', TEST_CARDS.approved, null],
    [
      '0002 rechaza por fondos',
      TEST_CARDS.insufficientFunds,
      'Fondos insuficientes',
    ],
    [
      'otra tarjeta no se reconoce',
      '5555555555554444',
      'Tarjeta no reconocida por la pasarela de prueba',
    ],
  ])(
    'AC6: la pasarela simulada decide el cobro (%s)',
    async (_, card, reason) => {
      const { service, repository } = setup();

      const { payment: result } = await service.pay(
        RESIDENT,
        FEE.id,
        dto(card),
        NOW,
      );

      expect(repository.record).toHaveBeenCalledWith(
        expect.objectContaining({
          approved: reason === null,
          failureReason: reason,
        }),
      );
      expect(result.status).toBe(reason === null ? 'APROBADO' : 'RECHAZADO');
    },
  );

  it('AC6: la pasarela espera 2 segundos por defecto antes de responder', async () => {
    vi.useFakeTimers();
    delete process.env.PAYMENT_GATEWAY_DELAY_MS;
    const gateway = new MockPaymentGateway();
    let done = false;
    const charge = gateway
      .charge({ ...dto(), number: TEST_CARDS.approved }, 45)
      .then(() => (done = true));

    await vi.advanceTimersByTimeAsync(1999);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await charge;
    expect(done).toBe(true);
    vi.useRealTimers();
  });

  it('AC7: un pago aprobado pasa la cuota a Pagado y crea el pago en la misma transacción', async () => {
    const { tx, prisma, record } = repositorySetup();

    const created = await record(true);

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.fee.updateMany).toHaveBeenCalledWith({
      where: { id: FEE.id, status: { in: ['PENDIENTE', 'MOROSO'] } },
      data: { status: 'PAGADO', paidAt: NOW },
    });
    expect(created).toMatchObject({ status: 'APROBADO', failureReason: null });
  });

  it('AC7: el número de transacción tiene el formato TX-AAAAMMDD-NNNNNN y sigue el consecutivo del día', async () => {
    const { tx, record } = repositorySetup();
    tx.payment.count.mockResolvedValue(41);

    const created = await record(true);

    expect(created.transactionNumber).toBe('TX-20261122-000042');
    expect(created.transactionNumber).toMatch(/^TX-\d{8}-\d{6}$/);
  });

  it('AC8: un pago rechazado se registra con su motivo y no toca la cuota', async () => {
    const { tx, record } = repositorySetup();

    const created = await record(false);

    expect(tx.fee.updateMany).not.toHaveBeenCalled();
    expect(created).toMatchObject({
      status: 'RECHAZADO',
      failureReason: 'Fondos insuficientes',
    });
  });

  it('AC8: con una tarjeta rechazada la cuota conserva su estado', async () => {
    const { service } = setup();

    const { payment: result } = await service.pay(
      RESIDENT,
      FEE.id,
      dto(TEST_CARDS.insufficientFunds),
      NOW,
    );

    expect(result.fee.status).toBe('PENDIENTE');
    expect(result.failureReason).toBe('Fondos insuficientes');
  });

  it('AC9: guarda solo los últimos 4 dígitos y el titular, nunca el número completo ni el código de seguridad', async () => {
    const { service, repository } = setup();

    await service.pay(RESIDENT, FEE.id, dto(), NOW);

    const [saved] = repository.record.mock.calls[0] as [object];
    expect(saved).toMatchObject({ cardLast4: '4242', holderName: 'Ana Lopez' });
    const text = JSON.stringify(saved);
    expect(text).not.toContain(TEST_CARDS.approved);
    expect(text).not.toContain('"123"');
    expect(saved).not.toHaveProperty('cvv');
    expect(saved).not.toHaveProperty('cardNumber');
  });

  it('AC9: los registros del servidor no incluyen el número de tarjeta ni el código de seguridad', async () => {
    const logs: string[] = [];
    for (const level of ['log', 'error', 'warn', 'debug', 'verbose'] as const) {
      vi.spyOn(Logger.prototype, level).mockImplementation((...args) => {
        logs.push(JSON.stringify(args));
      });
    }
    const { service, notifications } = setup();
    notifications.send.mockRejectedValue(new Error('falla del aviso'));

    await service.pay(RESIDENT, FEE.id, dto(), NOW);

    expect(logs.length).toBeGreaterThan(0);
    for (const line of logs) {
      expect(line).not.toContain(TEST_CARDS.approved);
      expect(line).not.toContain('123');
    }
  });

  it('AC10: 409 "Esta cuota ya está pagada." si la cuota ya está Pagada, sin llamar a la pasarela', async () => {
    const { service, gateway } = setup({ ...FEE, status: 'PAGADO' } as Fee);
    const charge = vi.spyOn(gateway, 'charge');

    const error = await service
      .pay(RESIDENT, FEE.id, dto(), NOW)
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ConflictException);
    expect((error as Error).message).toBe(PAYMENT_MESSAGES.alreadyPaid);
    expect(charge).not.toHaveBeenCalled();
  });

  it('AC10: si otra solicitud ya pagó la cuota, la transacción se revierte con FeeAlreadyPaidError', async () => {
    const { tx, record } = repositorySetup(0);

    await expect(record(true)).rejects.toBeInstanceOf(FeeAlreadyPaidError);
    expect(tx.payment.create).not.toHaveBeenCalled();
  });

  it('AC10: dos solicitudes simultáneas sobre la misma cuota dejan un solo pago aprobado', async () => {
    const { service, repository } = setup();
    repository.record
      .mockResolvedValueOnce(payment(true))
      .mockRejectedValueOnce(new FeeAlreadyPaidError(FEE.id));
    const second = {
      ...dto(),
      idempotencyKey: '0b7e3c1a-5d2f-4e6a-8b9c-1d2e3f4a5b6c',
    };

    const [first, other] = await Promise.allSettled([
      service.pay(RESIDENT, FEE.id, dto(), NOW),
      service.pay(RESIDENT, FEE.id, second, NOW),
    ]);

    expect(first.status).toBe('fulfilled');
    expect(other.status).toBe('rejected');
    expect((other as PromiseRejectedResult).reason).toBeInstanceOf(
      ConflictException,
    );
  });

  it('AC10: un doble clic con la misma llave responde el mismo pago sin cobrar de nuevo', async () => {
    const { service, repository, gateway } = setup();
    repository.findByIdempotencyKey.mockResolvedValue(payment(true));
    const charge = vi.spyOn(gateway, 'charge');

    const result = await service.pay(RESIDENT, FEE.id, dto(), NOW);

    expect(result.replayed).toBe(true);
    expect(result.payment.transactionNumber).toBe('TX-20261122-000001');
    expect(charge).not.toHaveBeenCalled();
    expect(repository.record).not.toHaveBeenCalled();
  });

  it('AC11: 404 si la cuota es de otra unidad; la busca solo dentro de la unidad del residente', async () => {
    const { service, repository } = setup(null);

    const error = await service
      .pay(RESIDENT, 'fee-otra-unidad', dto(), NOW)
      .catch((e: unknown) => e);

    expect(repository.findFeeForUnit).toHaveBeenCalledWith(
      'fee-otra-unidad',
      'unit-1',
    );
    expect(error).toBeInstanceOf(NotFoundException);
    expect((error as Error).message).toBe(PAYMENT_MESSAGES.feeNotFound);
  });

  describe('AC11: permisos del endpoint de pago', () => {
    const guard = new RolesGuard(new Reflector());

    it.each<Role>(['ADMINISTRADOR', 'SEGURIDAD'])(
      'AC11: %s recibe 403 al pagar',
      (role) => {
        expect(() => guard.canActivate(requestAs(role))).toThrow(
          ForbiddenException,
        );
      },
    );

    it('AC11: el Residente sí puede pagar', () => {
      expect(guard.canActivate(requestAs('RESIDENTE'))).toBe(true);
    });
  });

  it('AC12: con pago aprobado avisa al residente con "Pago aprobado", el monto y la transacción', async () => {
    const { service, notifications } = setup();

    await service.pay(RESIDENT, FEE.id, dto(), NOW);

    expect(notifications.send).toHaveBeenCalledWith({
      recipient: { type: 'USUARIO', ids: ['user-1'] },
      title: 'Pago aprobado',
      message:
        'Tu pago de $45.00 de la cuota 2026-11 fue aprobado. Transacción TX-20261122-000001.',
      sourceModule: 'CUOTAS',
      reference: { type: 'payment', id: 'pay-1' },
    });
  });

  it('AC12: con pago rechazado avisa con "Pago rechazado" y el motivo', async () => {
    const { service, notifications } = setup();

    await service.pay(RESIDENT, FEE.id, dto(TEST_CARDS.insufficientFunds), NOW);

    expect(notifications.send).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Pago rechazado',
        message:
          'Tu pago de la cuota 2026-11 fue rechazado: Fondos insuficientes.',
        sourceModule: 'CUOTAS',
      }),
    );
  });

  it('AC12: si el aviso falla, el pago queda registrado igual', async () => {
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const { service, notifications } = setup();
    notifications.send.mockRejectedValue(new Error('sin conexión'));

    const { payment: result } = await service.pay(RESIDENT, FEE.id, dto(), NOW);

    expect(result.status).toBe('APROBADO');
  });
});
