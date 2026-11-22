import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { PrismaService } from '@Prisma/services';
import { AdminIncidentRepository } from './admin-incident.repository.js';
import { AdminIncidentsService } from '../services/admin-incidents.service.js';
import type { NotificationsService } from '../../notifications/services/index.js';

function setup() {
  const maintenanceStaff = {
    findMany: vi.fn().mockResolvedValue([
      {
        id: 's1',
        name: 'Pedro Alvarado',
        specialty: 'Fontanería',
        phone: '7200-0001',
      },
    ]),
    findFirst: vi.fn().mockResolvedValue(null),
  };
  const repository = new AdminIncidentRepository({
    maintenanceStaff,
  } as unknown as PrismaService);
  return { repository, maintenanceStaff };
}

const schema = () =>
  readFileSync(join(process.cwd(), 'prisma/schema.prisma'), 'utf8');
const model = (name: string) =>
  new RegExp(`model ${name} \\{([\\s\\S]*?)\\n\\}`).exec(schema())![1];

describe('H12. Bandeja de incidencias del administrador: priorizar y asignar', () => {
  it('AC5: el responsable es un catálogo con nombre, especialidad y teléfono, sin cuenta en el sistema', () => {
    const staff = model('MaintenanceStaff');

    expect(staff).toMatch(/\bname\s+String/);
    expect(staff).toMatch(/\bspecialty\s+String/);
    expect(staff).toMatch(/\bphone\s+String/);
    expect(staff).toMatch(/\bisActive\s+Boolean\s+@default\(true\)/);
    // Sin acceso: no tiene usuario, correo ni contraseña.
    expect(staff).not.toMatch(/\buser(Id)?\b|\bemail\b|passwordHash|\brole\b/);
  });

  it('AC5: el script de datos iniciales carga los responsables de mantenimiento', () => {
    const prismaDir = join(process.cwd(), 'prisma');
    const seedFiles = readdirSync(prismaDir)
      .filter((f) => f.endsWith('.ts') && !f.endsWith('.spec.ts'))
      .map((f) => readFileSync(join(prismaDir, f), 'utf8'))
      .join('\n');

    expect(seedFiles).toMatch(/maintenanceStaff\.create\(/);
  });

  it('AC5: la lista de responsables trae solo los activos, con nombre, especialidad y teléfono', async () => {
    const { repository, maintenanceStaff } = setup();
    const service = new AdminIncidentsService(
      repository,
      {} as NotificationsService,
    );

    await expect(service.staff()).resolves.toEqual({
      data: [
        {
          id: 's1',
          name: 'Pedro Alvarado',
          specialty: 'Fontanería',
          phone: '7200-0001',
        },
      ],
    });
    expect(maintenanceStaff.findMany).toHaveBeenCalledWith({
      where: { isActive: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, specialty: true, phone: true },
    });
  });

  it('AC7: un responsable inactivo no se encuentra para asignar', async () => {
    const { repository, maintenanceStaff } = setup();

    await expect(repository.findActiveStaff('s9')).resolves.toBeNull();
    expect(maintenanceStaff.findFirst).toHaveBeenCalledWith({
      where: { id: 's9', isActive: true },
      select: { id: true, name: true },
    });
  });
});
