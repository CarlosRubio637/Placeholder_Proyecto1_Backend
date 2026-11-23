// Los handlers del controlador se pasan sin llamarlos: RolesGuard lee su
// metadata. Los DTO de prueba son objetos planos, no instancias.
/* oxlint-disable typescript/unbound-method, typescript/no-misused-spread */
import 'reflect-metadata';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
  ValidationPipe,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { ConfigService } from '@nestjs/config';
import { validationExceptionFactory } from '@Common/validation';
import type { PrismaService } from '@Prisma/services';
import { Prisma, Role, type User } from '@PrismaClient';
import { UserRepository, type UserWithProfile } from '@Users/repositories';
import { UsersService } from '@Users/services';
import { UsersModule } from '@Users';
import type { RefreshTokenRepository } from '@Auth/repositories';
import { AuthController } from './controllers/index.js';
import { IS_PUBLIC_KEY } from './decorators/public.decorator.js';
import {
  MeResponseDto,
  RegistroDto,
  RegistroResponseDto,
} from './dto/index.js';
import { FORBIDDEN_BODY, JwtAuthGuard, RolesGuard } from './guards/index.js';
import { TokenService } from './services/index.js';

const SECRET = 'secreto-de-prueba';

const valid: RegistroDto = {
  fullName: 'Ana María López',
  email: 'ana@condominio.test',
  phone: '7000-0000',
  unitCode: 'ABCD2345',
  password: 'Clave1234',
};

// El mismo ValidationPipe global de app.setup.ts.
const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  exceptionFactory: validationExceptionFactory,
});
const parse = (body: object) =>
  pipe.transform(body, { type: 'body', metatype: RegistroDto });

const created = {
  id: 'user-9',
  email: 'ana@condominio.test',
  role: 'RESIDENTE',
  unitId: 'unit-1',
  profile: { fullName: 'Ana María López' },
  unit: { id: 'unit-1', code: 'A-101' },
} as unknown as UserWithProfile;

/** UsersService con el repositorio real sobre un Prisma simulado. */
function setup(residents = 0) {
  const tx = {
    unit: { findUnique: vi.fn().mockResolvedValue({ id: 'unit-1' }) },
    $queryRaw: vi.fn().mockResolvedValue([]),
    user: {
      count: vi.fn().mockResolvedValue(residents),
      create: vi.fn().mockResolvedValue(created),
    },
  };
  const prisma = {
    $transaction: vi.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
  };
  const config = { get: () => 4 } as unknown as ConfigService;
  const service = new UsersService(
    new UserRepository(prisma as unknown as PrismaService),
    config as never,
  );
  return { tx, prisma, service };
}

async function failure(promise: Promise<unknown>) {
  return promise.catch((e: unknown) => e);
}

describe('H38. Roles, registro de residentes y protección de rutas', () => {
  it('AC5: el rol es un enum con RESIDENTE, ADMINISTRADOR y SEGURIDAD', () => {
    expect(Object.values(Role).sort()).toEqual([
      'ADMINISTRADOR',
      'RESIDENTE',
      'SEGURIDAD',
    ]);
  });

  it('AC5: la base exige unidad solo para RESIDENTE (CHECK en la migración)', () => {
    const dir = join(process.cwd(), 'prisma', 'migrations');
    const sql = readdirSync(dir)
      .filter((name) => name.includes('h38'))
      .map((name) => readFileSync(join(dir, name, 'migration.sql'), 'utf8'))
      .join('\n');

    expect(sql).toContain(
      `CHECK ("role" <> 'RESIDENTE' OR "unit_id" IS NOT NULL)`,
    );
  });

  it('AC6: el registro es público y siempre crea un RESIDENTE con su perfil y su unidad en una transacción', async () => {
    const { tx, prisma, service } = setup();

    const user = await service.registerResident(valid);

    expect(
      Reflect.getMetadata(IS_PUBLIC_KEY, AuthController.prototype.registro),
    ).toBe(true);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.unit.findUnique).toHaveBeenCalledWith({
      where: { registrationCode: 'ABCD2345' },
      select: { id: true },
    });
    expect(tx.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          email: 'ana@condominio.test',
          role: 'RESIDENTE',
          unitId: 'unit-1',
          profile: {
            create: {
              fullName: 'Ana María López',
              searchName: 'ana maria lopez',
              phone: '7000-0000',
            },
          },
        }),
      }),
    );
    expect(RegistroResponseDto.fromEntity(user)).toMatchObject({
      id: 'user-9',
      role: 'RESIDENTE',
      unit: { id: 'unit-1', code: 'A-101' },
    });
  });

  it('AC6: la contraseña se guarda con hash, nunca en claro', async () => {
    const { tx, service } = setup();

    await service.registerResident(valid);

    const [args] = tx.user.create.mock.calls[0] as [
      { data: { passwordHash: string } },
    ];
    expect(args.data.passwordHash).not.toBe(valid.password);
    expect(args.data.passwordHash).toMatch(/^\$2[aby]\$/);
    expect(args.data).not.toHaveProperty('password');
  });

  it('AC7: rechaza el campo role en el cuerpo con 400', async () => {
    const error = await failure(parse({ ...valid, role: 'ADMINISTRADOR' }));

    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as BadRequestException).getResponse()).toMatchObject({
      field: 'role',
    });
  });

  it('AC7: 404 "El código de unidad no existe." con un código inexistente', async () => {
    const { tx, service } = setup();
    tx.unit.findUnique.mockResolvedValue(null);

    const error = await failure(
      service.registerResident({ ...valid, unitCode: 'ZZZZZZZZ' }),
    );

    expect(error).toBeInstanceOf(NotFoundException);
    expect((error as Error).message).toBe('El código de unidad no existe.');
    expect(tx.user.create).not.toHaveBeenCalled();
  });

  it('AC7: 409 "Ya existe una cuenta con ese correo." con un correo repetido', async () => {
    const { tx, service } = setup();
    tx.user.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('email duplicado', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );

    const error = await failure(service.registerResident(valid));

    expect(error).toBeInstanceOf(ConflictException);
    expect((error as Error).message).toBe(
      'Ya existe una cuenta con ese correo.',
    );
  });

  it('AC7: 409 "La unidad ya tiene 4 residentes registrados." con 4 residentes; con 3 sí registra', async () => {
    const full = setup(4);
    const error = await failure(full.service.registerResident(valid));
    expect(error).toBeInstanceOf(ConflictException);
    expect((error as Error).message).toBe(
      'La unidad ya tiene 4 residentes registrados.',
    );
    expect(full.tx.user.create).not.toHaveBeenCalled();

    const room = setup(3);
    await expect(room.service.registerResident(valid)).resolves.toBeDefined();
  });

  it('AC8: el módulo de usuarios no expone controlador (no hay POST /api/v1/users)', () => {
    const controllers = (Reflect.getMetadata('controllers', UsersModule) ??
      []) as unknown[];

    expect(controllers).toHaveLength(0);
  });

  it('AC9: el RolesGuard responde 403 con { code: "FORBIDDEN", message: "No tienes permiso para esta acción." }', () => {
    const guard = new RolesGuard(new Reflector());
    class Demo {
      handler() {}
    }
    Reflect.defineMetadata('roles', ['ADMINISTRADOR'], Demo.prototype.handler);
    const context = {
      getHandler: () => Demo.prototype.handler,
      getClass: () => Demo,
      switchToHttp: () => ({
        getRequest: () => ({ user: { role: 'RESIDENTE' } }),
      }),
    } as unknown as ExecutionContext;

    const error = (() => {
      try {
        guard.canActivate(context);
      } catch (e) {
        return e;
      }
    })();

    expect(error).toBeInstanceOf(ForbiddenException);
    expect((error as ForbiddenException).getResponse()).toEqual(FORBIDDEN_BODY);
    expect(FORBIDDEN_BODY).toEqual({
      code: 'FORBIDDEN',
      message: 'No tienes permiso para esta acción.',
    });
  });

  it('AC9: sin sesión, el JwtAuthGuard responde 401', async () => {
    const context = {
      getHandler: () => undefined,
      getClass: () => undefined,
      switchToHttp: () => ({ getRequest: () => ({ headers: {} }) }),
    } as unknown as ExecutionContext;
    const guard = new JwtAuthGuard(
      { getAllAndOverride: () => false } as unknown as Reflector,
      new JwtService({ secret: SECRET }),
      { findById: vi.fn() } as never,
    );

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('AC10: el token incluye el rol y dura 8 horas con JWT_EXPIRES_IN=8h', async () => {
    const jwt = new JwtService({
      secret: SECRET,
      signOptions: { expiresIn: '8h' },
    });
    const tokens = new TokenService(
      { create: vi.fn() } as unknown as RefreshTokenRepository,
      jwt,
      { get: () => 7 } as unknown as ConfigService as never,
    );

    const { accessToken } = await tokens.issueTokenPair({
      id: 'user-9',
      email: 'ana@condominio.test',
      role: 'RESIDENTE',
    } as User);
    const payload = jwt.decode<{ role: string; iat: number; exp: number }>(
      accessToken,
    );

    expect(payload.role).toBe('RESIDENTE');
    expect(payload.exp - payload.iat).toBe(8 * 60 * 60);
  });

  it('AC10: el .env de ejemplo define JWT_EXPIRES_IN=8h', () => {
    const env = readFileSync(join(process.cwd(), '.env.example'), 'utf8');

    expect(env).toMatch(/^JWT_EXPIRES_IN=8h$/m);
  });

  it('AC10: GET /auth/me devuelve role, fullName y unit { id, code }', () => {
    expect(MeResponseDto.fromEntity(created)).toEqual({
      id: 'user-9',
      email: 'ana@condominio.test',
      role: 'RESIDENTE',
      fullName: 'Ana María López',
      unit: { id: 'unit-1', code: 'A-101' },
    });
  });

  it('AC10: para administración y seguridad, unit es null', () => {
    const admin = {
      ...created,
      role: 'ADMINISTRADOR',
      unitId: null,
      unit: null,
    } as unknown as UserWithProfile;

    expect(MeResponseDto.fromEntity(admin)).toMatchObject({
      role: 'ADMINISTRADOR',
      unit: null,
    });
  });
});
