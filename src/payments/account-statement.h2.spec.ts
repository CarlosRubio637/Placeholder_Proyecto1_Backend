// Los handlers del controlador se pasan sin llamarlos: RolesGuard lee su
// metadata @Roles. Los DTO de prueba son objetos planos, no instancias.
/* oxlint-disable typescript/unbound-method, typescript/no-misused-spread */
import 'reflect-metadata';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  ValidationPipe,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from '@Auth/guards';
import { validationExceptionFactory } from '@Common/validation';
import type { NotificationsService } from '@Notifications';
import type { PrismaService } from '@Prisma/services';
import { Prisma, type Role, type User } from '@PrismaClient';
import { UnitNotFoundError as RegistrationCodeNotFoundError } from '@Users/errors';
import type { UserRepository } from '@Users/repositories';
import { UsersService } from '@Users/services';
import type { ConfigService } from '@nestjs/config';
import {
  AdminUnitsController,
  PaymentsController,
} from './controllers/index.js';
import { StatementQueryDto } from './dto/index.js';
import type { MockPaymentGateway } from './gateway/index.js';
import {
  REGISTRATION_CODE_ALPHABET,
  STATEMENT_MESSAGES,
} from './payments.constants.js';
import { PaymentsRepository } from './repositories/index.js';
import { AccountStatementService, PaymentsService } from './services/index.js';

const NOW = new Date('2026-11-22T18:00:00Z');
const RESIDENT = { id: 'user-1', role: 'RESIDENTE', unitId: 'unit-1' } as User;
const ADMIN = { id: 'admin-1', role: 'ADMINISTRADOR', unitId: null } as User;
const UNIT = {
  id: 'unit-1',
  code: 'A-101',
  tower: { id: 'tower-a', name: 'Torre A' },
  registrationCode: 'ABCD2345',
  registrationCodeUpdatedAt: null,
  residents: [],
};

// El mismo ValidationPipe global de app.setup.ts.
const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  exceptionFactory: validationExceptionFactory,
});
const parseQuery = (query: object) =>
  pipe.transform(query, { type: 'query', metatype: StatementQueryDto });

/** Repositorio real sobre un Prisma simulado. */
function prismaSetup() {
  const prisma = {
    fee: {
      aggregate: vi
        .fn()
        .mockResolvedValue({ _sum: { amount: new Prisma.Decimal(90) } }),
      count: vi.fn().mockResolvedValue(1),
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
    },
    unit: {
      findUnique: vi.fn().mockResolvedValue(UNIT),
      update: vi.fn(({ data }) =>
        Promise.resolve({
          registrationCode: data.registrationCode,
          registrationCodeUpdatedAt: data.registrationCodeUpdatedAt,
        }),
      ),
    },
    payment: { findMany: vi.fn().mockResolvedValue([]) },
  };
  const repository = new PaymentsRepository(prisma as unknown as PrismaService);
  const statements = new AccountStatementService(repository);
  const payments = new PaymentsService(
    repository,
    {} as MockPaymentGateway,
    { send: vi.fn() } as unknown as NotificationsService,
  );
  return { prisma, repository, statements, payments };
}

function requestAs(
  role: Role,
  controller: object,
  handler: (...args: never[]) => unknown,
): ExecutionContext {
  return {
    getHandler: () => handler,
    getClass: () => controller,
    switchToHttp: () => ({ getRequest: () => ({ user: { role } }) }),
  } as unknown as ExecutionContext;
}

describe('H2. Estado de cuenta de la unidad', () => {
  const guard = new RolesGuard(new Reflector());

  // Evita el costo de bcrypt real en el registro.
  beforeAll(() => {
    vi.spyOn(UsersService.prototype, 'hashPassword').mockResolvedValue('hash');
  });
  afterAll(() => {
    vi.restoreAllMocks();
  });

  it('AC7: el saldo pendiente suma Pendiente y Moroso de la unidad sin aplicar los filtros', async () => {
    const { prisma, statements } = prismaSetup();
    const query = await parseQuery({ year: '2025', status: 'PAGADO' });

    const result = await statements.statement('unit-1', query);

    expect(prisma.fee.aggregate).toHaveBeenCalledWith({
      where: { unitId: 'unit-1', status: { in: ['PENDIENTE', 'MOROSO'] } },
      _sum: { amount: true },
    });
    expect(result.summary.pendingBalance).toBe(90);
  });

  it('AC7: la tabla sí aplica los filtros, con el periodo más reciente primero', async () => {
    const { prisma, statements } = prismaSetup();
    const query = await parseQuery({
      year: '2025',
      status: 'PAGADO',
      page: '2',
    });

    await statements.statement('unit-1', query);

    expect(prisma.fee.findMany).toHaveBeenCalledWith({
      where: {
        unitId: 'unit-1',
        period: { startsWith: '2025-' },
        status: 'PAGADO',
      },
      orderBy: { period: 'desc' },
      skip: 12,
      take: 12,
    });
  });

  it('AC7: sin cuotas por pagar el saldo es 0', async () => {
    const { prisma, statements } = prismaSetup();
    prisma.fee.aggregate.mockResolvedValue({ _sum: { amount: null } });

    const result = await statements.statement('unit-1', await parseQuery({}));

    expect(result.summary.pendingBalance).toBe(0);
  });

  it('AC8: cada consulta (abrir, volver de un pago o Actualizar) lee la base de nuevo, sin caché', async () => {
    const { prisma, statements, payments } = prismaSetup();
    const controller = new PaymentsController(payments, statements);
    const query = await parseQuery({});

    await controller.myStatement(RESIDENT, query);
    prisma.fee.aggregate.mockResolvedValue({
      _sum: { amount: new Prisma.Decimal(45) },
    });
    const after = await controller.myStatement(RESIDENT, query);

    expect(prisma.fee.aggregate).toHaveBeenCalledTimes(2);
    expect(after.summary.pendingBalance).toBe(45);
  });

  it('AC9: el residente solo ve el estado de cuenta de su unidad (la toma del token)', async () => {
    const { statements, payments } = prismaSetup();
    const spy = vi.spyOn(statements, 'statement');
    const controller = new PaymentsController(payments, statements);

    await controller.myStatement(RESIDENT, await parseQuery({}));

    expect(spy).toHaveBeenCalledWith('unit-1', expect.anything());
  });

  it('AC9: el estado de cuenta del residente no acepta un id de unidad en la consulta (400)', async () => {
    const error = await parseQuery({ unitId: 'unit-2' }).catch(
      (e: unknown) => e,
    );

    expect(error).toBeInstanceOf(BadRequestException);
  });

  it('AC9: 404 al pedir los pagos de una cuota de otra unidad', async () => {
    const { prisma, payments } = prismaSetup();

    const error = await payments
      .feePayments(RESIDENT, 'fee-ajena')
      .catch((e: unknown) => e);

    expect(prisma.fee.findFirst).toHaveBeenCalledWith({
      where: { id: 'fee-ajena', unitId: 'unit-1' },
    });
    expect(error).toBeInstanceOf(NotFoundException);
    expect(prisma.payment.findMany).not.toHaveBeenCalled();
  });

  it('AC10: Seguridad recibe 403 en el estado de cuenta y en los pagos de una cuota', () => {
    for (const handler of [
      PaymentsController.prototype.myStatement,
      PaymentsController.prototype.feePayments,
      AdminUnitsController.prototype.statement,
    ]) {
      const controller =
        handler === AdminUnitsController.prototype.statement
          ? AdminUnitsController
          : PaymentsController;
      expect(() =>
        guard.canActivate(requestAs('SEGURIDAD', controller, handler)),
      ).toThrow(ForbiddenException);
    }
  });

  it('AC10: el Administrador consulta el estado de cuenta de cualquier unidad', async () => {
    const { prisma, statements, payments } = prismaSetup();
    prisma.fee.findFirst.mockResolvedValue({ id: 'fee-9', unitId: 'unit-9' });

    expect(
      guard.canActivate(
        requestAs(
          'ADMINISTRADOR',
          AdminUnitsController,
          AdminUnitsController.prototype.statement,
        ),
      ),
    ).toBe(true);
    await new AdminUnitsController(statements).statement(
      'unit-9',
      await parseQuery({}),
    );
    await payments.feePayments(ADMIN, 'fee-9');

    expect(prisma.unit.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'unit-9' } }),
    );
    expect(prisma.fee.findFirst).toHaveBeenCalledWith({
      where: { id: 'fee-9' },
    });
  });

  it('AC10: 404 si el Administrador pide una unidad que no existe', async () => {
    const { prisma, statements } = prismaSetup();
    prisma.unit.findUnique.mockResolvedValue(null);

    const error = await statements
      .statement('unit-x', await parseQuery({}))
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(NotFoundException);
    expect((error as Error).message).toBe(STATEMENT_MESSAGES.unitNotFound);
  });

  it.each<[string, object, string, string]>([
    ['año 2019', { year: '2019' }, 'year', STATEMENT_MESSAGES.year],
    ['año 2101', { year: '2101' }, 'year', STATEMENT_MESSAGES.year],
    [
      'un estado que no existe',
      { status: 'ATRASADO' },
      'status',
      STATEMENT_MESSAGES.status,
    ],
    [
      'pageSize 51',
      { pageSize: '51' },
      'pageSize',
      STATEMENT_MESSAGES.pageSize,
    ],
  ])(
    'AC11: rechaza %s con 400 y el campo',
    async (_, query, field, message) => {
      const error = await parseQuery(query).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as BadRequestException).getResponse()).toMatchObject({
        field,
        message: [message],
      });
    },
  );

  it('AC11: acepta los límites 2020, 2100 y pageSize 50, con página 1 y 12 filas por defecto', async () => {
    await expect(
      parseQuery({ year: '2020', pageSize: '50' }),
    ).resolves.toMatchObject({
      year: 2020,
      pageSize: 50,
      page: 1,
    });
    await expect(parseQuery({ year: '2100' })).resolves.toMatchObject({
      year: 2100,
    });
    await expect(parseQuery({})).resolves.toMatchObject({
      page: 1,
      pageSize: 12,
    });
  });

  it('AC12: regenera un código de 8 caracteres del alfabeto sin ambiguos y guarda fecha y autor', async () => {
    const { prisma, statements } = prismaSetup();

    const result = await statements.regenerateCode(ADMIN, 'unit-1', NOW);

    expect(result.registrationCode).toMatch(
      new RegExp(`^[${REGISTRATION_CODE_ALPHABET}]{8}$`),
    );
    expect(result.registrationCode).not.toMatch(/[01IOL]/);
    expect(prisma.unit.update).toHaveBeenCalledWith({
      where: { id: 'unit-1' },
      data: {
        registrationCode: result.registrationCode,
        registrationCodeUpdatedAt: NOW,
        registrationCodeUpdatedById: 'admin-1',
      },
      select: { registrationCode: true, registrationCodeUpdatedAt: true },
    });
    expect(result.registrationCodeUpdatedAt).toBe(NOW);
  });

  it('AC12: si el código choca con el de otra unidad, genera otro (único)', async () => {
    const { prisma, statements } = prismaSetup();
    prisma.unit.update.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('duplicado', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );

    const result = await statements.regenerateCode(ADMIN, 'unit-1', NOW);

    expect(prisma.unit.update).toHaveBeenCalledTimes(2);
    expect(result.registrationCode).toHaveLength(8);
  });

  it('AC12: solo cambia la unidad; las cuentas ya registradas no se modifican', async () => {
    const { prisma, statements } = prismaSetup();

    await statements.regenerateCode(ADMIN, 'unit-1', NOW);

    const [args] = prisma.unit.update.mock.calls[0] as [{ data: object }];
    expect(Object.keys(args.data)).toEqual([
      'registrationCode',
      'registrationCodeUpdatedAt',
      'registrationCodeUpdatedById',
    ]);
    expect(prisma).not.toHaveProperty('user');
  });

  it('AC12: el código anterior deja de servir para registrarse (404 "El código de unidad no existe.")', async () => {
    const users = {
      createResident: vi
        .fn()
        .mockRejectedValue(new RegistrationCodeNotFoundError('ABCD2345')),
    };
    const config = { get: () => 4 } as unknown as ConfigService;
    const service = new UsersService(
      users as unknown as UserRepository,
      config as never,
    );

    const error = await service
      .registerResident({
        fullName: 'Ana Lopez',
        email: 'ana@condominio.test',
        phone: '7000-0000',
        unitCode: 'ABCD2345',
        password: 'Clave1234',
      })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(NotFoundException);
    expect((error as Error).message).toBe('El código de unidad no existe.');
  });

  it('AC12: 404 al regenerar el código de una unidad que no existe', async () => {
    const { prisma, statements } = prismaSetup();
    prisma.unit.update.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('no existe', {
        code: 'P2025',
        clientVersion: 'test',
      }),
    );

    await expect(
      statements.regenerateCode(ADMIN, 'unit-x', NOW),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  describe('AC13: permisos del código de registro', () => {
    const handlers = [
      AdminUnitsController.prototype.unit,
      AdminUnitsController.prototype.regenerate,
    ];

    it.each<Role>(['RESIDENTE', 'SEGURIDAD'])(
      'AC13: %s recibe 403 al ver o regenerar el código',
      (role) => {
        for (const handler of handlers) {
          expect(() =>
            guard.canActivate(requestAs(role, AdminUnitsController, handler)),
          ).toThrow(ForbiddenException);
        }
      },
    );

    it('AC13: el Administrador sí ve y regenera el código', () => {
      for (const handler of handlers) {
        expect(
          guard.canActivate(
            requestAs('ADMINISTRADOR', AdminUnitsController, handler),
          ),
        ).toBe(true);
      }
    });
  });
});
