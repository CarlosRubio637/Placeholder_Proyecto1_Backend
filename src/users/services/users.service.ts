import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import bcrypt from 'bcrypt';
import {
  MAX_RESIDENTS_PER_UNIT,
  UserRepository,
  type UserWithProfile,
} from '@Users/repositories';
import {
  EmailAlreadyTakenError,
  UnitFullError,
  UnitNotFoundError,
} from '@Users/errors';
import type { EnvConfig } from '@Config';
import type { Role, User } from '@PrismaClient';

export interface CreateUserInput {
  email: string;
  password: string;
  role: Role;
}

export interface RegisterResidentInput {
  fullName: string;
  email: string;
  phone: string;
  /** Código de registro de 8 caracteres de la unidad. */
  unitCode: string;
  password: string;
}

/**
 * Nombre para búsquedas en el directorio: minúsculas, sin tildes ni diéresis
 * y con espacios simples. "José  Peña" → "jose pena".
 */
export function toSearchName(fullName: string): string {
  return fullName
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Lógica de negocio de usuarios.
 *
 * No conoce Prisma: todo el acceso a datos pasa por UserRepository.
 */
@Injectable()
export class UsersService {
  private readonly saltRounds: number;

  constructor(
    private readonly userRepository: UserRepository,
    configService: ConfigService<EnvConfig, true>,
  ) {
    this.saltRounds = configService.get('BCRYPT_SALT_ROUNDS', { infer: true });
  }

  async create({ email, password, role }: CreateUserInput): Promise<User> {
    const passwordHash = await this.hashPassword(password);

    try {
      return await this.userRepository.create({ email, passwordHash, role });
    } catch (error) {
      // Traduce el error de dominio del repositorio a una excepción HTTP.
      if (error instanceof EmailAlreadyTakenError) {
        throw new ConflictException('Ya existe una cuenta con ese correo.');
      }
      throw error;
    }
  }

  /**
   * Registro de residentes (H38): siempre con rol RESIDENTE, en la unidad del
   * código de registro. Crea User, Profile y el vínculo en una transacción.
   */
  async registerResident(input: RegisterResidentInput): Promise<UserWithProfile> {
    const passwordHash = await this.hashPassword(input.password);

    try {
      return await this.userRepository.createResident({
        email: input.email,
        passwordHash,
        registrationCode: input.unitCode,
        fullName: input.fullName,
        searchName: toSearchName(input.fullName),
        phone: input.phone,
      });
    } catch (error) {
      if (error instanceof UnitNotFoundError) {
        throw new NotFoundException('El código de unidad no existe.');
      }
      if (error instanceof UnitFullError) {
        throw new ConflictException(
          `La unidad ya tiene ${MAX_RESIDENTS_PER_UNIT} residentes registrados.`,
        );
      }
      if (error instanceof EmailAlreadyTakenError) {
        throw new ConflictException('Ya existe una cuenta con ese correo.');
      }
      throw error;
    }
  }

  findByEmail(email: string): Promise<User | null> {
    return this.userRepository.findByEmail(email);
  }

  findById(id: string): Promise<User | null> {
    return this.userRepository.findById(id);
  }

  findByIdWithProfile(id: string): Promise<UserWithProfile | null> {
    return this.userRepository.findByIdWithProfile(id);
  }

  hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, this.saltRounds);
  }

  verifyPassword(password: string, passwordHash: string): Promise<boolean> {
    return bcrypt.compare(password, passwordHash);
  }
}
