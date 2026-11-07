import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  NotificationsService,
  RecipientType,
  SourceModule,
} from '@Notifications';
import { PrismaService } from '@Prisma/services';
import { Role, type User } from '@PrismaClient';
import {
  CreatePackageDto,
  DEFAULT_PAGE_SIZE,
  ListPackagesQueryDto,
  PackageListDto,
  PackageResponseDto,
  type PackageRow,
} from './dto/index.js';
import {
  dayKey,
  formatDate,
  formatTime,
  packageCode,
} from './packages.utils.js';

const PACKAGE_SELECT = {
  id: true,
  code: true,
  courier: true,
  trackingNumber: true,
  notes: true,
  status: true,
  receivedAt: true,
  unit: { select: { id: true, code: true } },
} as const;

@Injectable()
export class PackagesService {
  private readonly logger = new Logger(PackagesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * Registra la llegada de un paquete (H19). Valida la unidad y que tenga
   * residentes, genera el código PQ-AAAAMMDD-NNNN y guarda el paquete en una
   * transacción. Después avisa a los residentes de la unidad (H30): si el
   * aviso falla, el paquete ya quedó registrado y solo se deja constancia en
   * el registro del servidor.
   */
  async create(
    receiver: User,
    dto: CreatePackageDto,
  ): Promise<PackageResponseDto> {
    const unit = await this.prisma.unit.findUnique({
      where: { id: dto.unitId },
      select: { id: true },
    });
    if (!unit) {
      throw new NotFoundException('La unidad no existe.');
    }

    const residents = await this.prisma.user.findMany({
      where: { unitId: unit.id, role: Role.RESIDENTE, isActive: true },
      select: { id: true },
    });
    if (residents.length === 0) {
      throw new ConflictException('La unidad no tiene residentes registrados.');
    }

    const now = new Date();
    const day = dayKey(now);

    const created = await this.prisma.$transaction(async (tx) => {
      // INSERT ... ON CONFLICT en una sola sentencia: dos registros
      // simultáneos nunca reciben el mismo consecutivo.
      const counter = await tx.packageCounter.upsert({
        where: { day },
        create: { day, last: 1 },
        update: { last: { increment: 1 } },
      });

      return tx.package.create({
        data: {
          code: packageCode(day, counter.last),
          unitId: unit.id,
          courier: dto.courier,
          trackingNumber: dto.trackingNumber ?? null,
          notes: dto.notes ?? null,
          receivedAt: now,
          receivedById: receiver.id,
        },
        select: PACKAGE_SELECT,
      });
    });

    await this.notifyResidents(
      created,
      residents.map((resident) => resident.id),
    );
    return PackageResponseDto.fromEntity(created);
  }

  /** Lista paquetes (H19): más reciente primero, con filtros opcionales. */
  async list(query: ListPackagesQueryDto): Promise<PackageListDto> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;
    const { status, unitId, towerId, search } = query;

    const where = {
      ...(status ? { status } : {}),
      ...(unitId ? { unitId } : {}),
      ...(towerId ? { unit: { towerId } } : {}),
      ...(search
        ? {
            OR: [
              { code: { contains: search, mode: 'insensitive' as const } },
              {
                trackingNumber: {
                  contains: search,
                  mode: 'insensitive' as const,
                },
              },
              {
                unit: {
                  code: { contains: search, mode: 'insensitive' as const },
                },
              },
            ],
          }
        : {}),
    };

    const [total, rows] = await Promise.all([
      this.prisma.package.count({ where }),
      this.prisma.package.findMany({
        where,
        orderBy: [{ receivedAt: 'desc' }, { code: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: PACKAGE_SELECT,
      }),
    ]);

    return {
      data: rows.map((row) => PackageResponseDto.fromEntity(row)),
      total,
      page,
      pageSize,
    };
  }

  /** Aviso "Tienes un paquete en portería" a los residentes de la unidad. */
  private async notifyResidents(
    pkg: PackageRow,
    residentIds: string[],
  ): Promise<void> {
    try {
      const tracking = pkg.trackingNumber ? `, guía ${pkg.trackingNumber}` : '';
      await this.notifications.send({
        recipient: { type: RecipientType.USUARIO, ids: residentIds },
        title: 'Tienes un paquete en portería',
        message: `Llegó un paquete de ${pkg.courier}${tracking} el ${formatDate(pkg.receivedAt)} a las ${formatTime(pkg.receivedAt)}. Código: ${pkg.code}.`,
        sourceModule: SourceModule.PAQUETERIA,
        reference: { type: 'package', id: pkg.id },
      });
    } catch (error) {
      this.logger.error(
        `No se pudo avisar del paquete ${pkg.code} a la unidad ${pkg.unit.code}`,
        error,
      );
    }
  }
}
