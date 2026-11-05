import { Injectable } from '@nestjs/common';
import { PrismaService } from '@Prisma/services';
import {
  EmailAlreadyTakenError,
  UnitFullError,
  UnitNotFoundError,
} from '@Users/errors';
import { Prisma, type Role, type User } from '@PrismaClient';

/** Código de Prisma para violación de restricción única. */
const UNIQUE_CONSTRAINT_VIOLATION = 'P2002';

/** Máximo de cuentas de residentes por unidad (H38). */
export const MAX_RESIDENTS_PER_UNIT = 4;

export interface CreateUserData {
  email: string;
  passwordHash: string;
  role: Role;
}

export interface CreateResidentData {
  email: string;
  passwordHash: string;
  /** Código de registro de 8 caracteres de la unidad (Unit.registrationCode). */
  registrationCode: string;
  fullName: string;
  searchName: string;
  phone: string;
}

const WITH_PROFILE_AND_UNIT = {
  profile: true,
  unit: { select: { id: true, code: true } },
} satisfies Prisma.UserInclude;

/** Usuario con su perfil y su unidad (H38), para registro y GET /auth/me. */
export type UserWithProfile = Prisma.UserGetPayload<{
  include: typeof WITH_PROFILE_AND_UNIT;
}>;

/**
 * Único punto del módulo que habla con la tabla `users`.
 *
 * Los servicios no conocen Prisma: reciben y devuelven entidades, y los
 * detalles del ORM (códigos de error, formas de `where`, `select`) quedan
 * encapsulados acá. Eso permite cambiar el acceso a datos sin tocar la lógica
 * de negocio, y testear los servicios con un doble de este repositorio.
 */
@Injectable()
export class UserRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * @throws {EmailAlreadyTakenError} si el email ya está registrado.
   *
   * Se deja que la base decida la unicidad en vez de consultar antes: un
   * `findUnique` previo tiene una condición de carrera entre la lectura y el
   * insert. El código P2002 de Prisma se traduce a un error de dominio para
   * que la capa de servicio no tenga que conocer los códigos del ORM.
   */
  async create({ email, passwordHash, role }: CreateUserData): Promise<User> {
    try {
      return await this.prisma.user.create({
        data: { email: this.normalizeEmail(email), passwordHash, role },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === UNIQUE_CONSTRAINT_VIOLATION
      ) {
        throw new EmailAlreadyTakenError(email);
      }
      throw error;
    }
  }

  /**
   * Crea un residente con su perfil, vinculado a la unidad del código de
   * registro, todo en una sola transacción (H38).
   *
   * La fila de la unidad se bloquea (`FOR UPDATE`) antes de contar sus
   * residentes: así dos registros simultáneos en la misma unidad no pueden
   * pasar juntos el límite de 4.
   *
   * @throws {UnitNotFoundError} si ninguna unidad tiene ese código.
   * @throws {UnitFullError} si la unidad ya tiene 4 residentes.
   * @throws {EmailAlreadyTakenError} si el email ya está registrado.
   */
  async createResident(data: CreateResidentData): Promise<UserWithProfile> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const unit = await tx.unit.findUnique({
          where: { registrationCode: data.registrationCode },
          select: { id: true },
        });
        if (!unit) {
          throw new UnitNotFoundError(data.registrationCode);
        }

        await tx.$queryRaw`SELECT id FROM units WHERE id = ${unit.id}::uuid FOR UPDATE`;

        const residents = await tx.user.count({
          where: { unitId: unit.id, role: 'RESIDENTE' },
        });
        if (residents >= MAX_RESIDENTS_PER_UNIT) {
          throw new UnitFullError(unit.id, MAX_RESIDENTS_PER_UNIT);
        }

        return tx.user.create({
          data: {
            email: this.normalizeEmail(data.email),
            passwordHash: data.passwordHash,
            role: 'RESIDENTE',
            unitId: unit.id,
            profile: {
              create: {
                fullName: data.fullName,
                searchName: data.searchName,
                phone: data.phone,
              },
            },
          },
          include: WITH_PROFILE_AND_UNIT,
        });
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === UNIQUE_CONSTRAINT_VIOLATION
      ) {
        throw new EmailAlreadyTakenError(data.email);
      }
      throw error;
    }
  }

  findById(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id } });
  }

  findByIdWithProfile(id: string): Promise<UserWithProfile | null> {
    return this.prisma.user.findUnique({
      where: { id },
      include: WITH_PROFILE_AND_UNIT,
    });
  }

  findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({
      where: { email: this.normalizeEmail(email) },
    });
  }

  existsByEmail(email: string): Promise<boolean> {
    return this.prisma.user
      .count({ where: { email: this.normalizeEmail(email) } })
      .then((count) => count > 0);
  }

  updatePasswordHash(id: string, passwordHash: string): Promise<User> {
    return this.prisma.user.update({ where: { id }, data: { passwordHash } });
  }

  setActive(id: string, isActive: boolean): Promise<User> {
    return this.prisma.user.update({ where: { id }, data: { isActive } });
  }

  deleteById(id: string): Promise<User> {
    return this.prisma.user.delete({ where: { id } });
  }

  /**
   * Los emails se persisten y se consultan en minúsculas.
   *
   * El índice único de Postgres es sensible a mayúsculas, así que sin esto
   * "Demo@mail.com" y "demo@mail.com" serían dos cuentas distintas y el login
   * fallaría según cómo el usuario escribiera su email. Va en el repositorio a
   * propósito: es el único punto por el que pasan todas las lecturas y
   * escrituras, así que ningún llamador puede saltearse la normalización.
   */
  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }
}
