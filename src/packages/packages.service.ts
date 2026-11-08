import {
  ConflictException,
  ForbiddenException,
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
import { PackageStatus, Role, type User } from '@PrismaClient';
import {
  CreatePackageDto,
  DEFAULT_PAGE_SIZE,
  ListPackagesQueryDto,
  MY_PACKAGES_PAGE_SIZE,
  MyPackageDto,
  MyPackagesListDto,
  MyPackagesQueryDto,
  PackageListDto,
  PackageResponseDto,
  type MyPackageRow,
  type PackageRow,
} from './dto/index.js';
import { daysWaiting, docLast4 } from './days-waiting.js';
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

const MY_PACKAGE_SELECT = {
  id: true,
  code: true,
  courier: true,
  trackingNumber: true,
  notes: true,
  status: true,
  receivedAt: true,
  deliveredAt: true,
  pickedUpByName: true,
  pickedUpByDocNumber: true,
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

  /** Lista paquetes para seguridad (H19): más reciente primero, filtros opcionales. */
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

  /**
   * Mis paquetes (H20). El residente ve los paquetes de SU unidad; la unidad
   * se toma del token, nunca de la consulta. Devuelve además pendingCount
   * (pendientes de la unidad, sin importar la pestaña) y oculta el documento
   * completo de quien recogió el paquete.
   */
  async listMine(
    resident: User,
    query: MyPackagesQueryDto,
  ): Promise<MyPackagesListDto> {
    // Un residente debería tener unidad (CHECK de H38); se comprueba igual.
    if (!resident.unitId) {
      throw new ForbiddenException();
    }

    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? MY_PACKAGES_PAGE_SIZE;
    const { status } = query;
    const unitId = resident.unitId;

    const now = new Date();

    const [pendingCount, total, rows] = await Promise.all([
      this.prisma.package.count({
        where: { unitId, status: PackageStatus.PENDIENTE_ENTREGA },
      }),
      this.prisma.package.count({ where: { unitId, status } }),
      this.prisma.package.findMany({
        where: { unitId, status },
        orderBy: [{ receivedAt: 'desc' }, { code: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: MY_PACKAGE_SELECT,
      }),
    ]);

    return {
      pendingCount,
      data: rows.map((row) => this.toMyPackageDto(row, now)),
      total,
      page,
      pageSize,
    };
  }

  private toMyPackageDto(row: MyPackageRow, now: Date): MyPackageDto {
    return {
      id: row.id,
      code: row.code,
      courier: row.courier,
      trackingNumber: row.trackingNumber,
      notes: row.notes,
      receivedAt: row.receivedAt,
      // Solo tiene sentido mientras está pendiente; para los entregados se
      // calcula contra la recepción para no mostrar valores engañosos.
      daysWaiting: daysWaiting(row.receivedAt, now),
      deliveredAt: row.deliveredAt,
      pickedUpByName: row.pickedUpByName,
      pickedUpByDocLast4: docLast4(row.pickedUpByDocNumber),
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
