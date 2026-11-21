import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { IncidentsService, type UploadedPhoto } from './incidents.service.js';
import type { IncidentRepository } from '../repositories/index.js';
import type { IncidentPhotoStorage } from '../storage/index.js';
import type { NotificationsService } from '../../notifications/services/index.js';
import type { CreateIncidentDto } from '../dto/index.js';
import type { User } from '../../generated/prisma/client.js';

const PNG = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3,
]);
const JPG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
const png = (size = PNG.length): UploadedPhoto => ({ buffer: PNG, size });
const jpg = (): UploadedPhoto => ({ buffer: JPG, size: JPG.length });

const resident = { id: 'user-1', role: 'RESIDENTE', unitId: 'unit-1' } as User;
const dto: CreateIncidentDto = {
  title: 'Fuga de agua',
  description: 'Gotea agua del techo del pasillo.',
  location: 'TORRE_A',
  locationDetail: 'Piso 3, pasillo norte',
};

function setup() {
  const repository = {
    create: vi.fn().mockImplementation(async (data) => ({
      id: data.id,
      number: 'INC-2026-00007',
      title: data.title,
      location: data.location,
      status: 'PENDIENTE',
      priority: 'MEDIA',
      createdAt: new Date('2026-11-06T12:00:00Z'),
      unit: { code: 'A-101' },
      photos: data.photos.map((_: unknown, i: number) => ({
        id: `photo-${i}`,
      })),
      searchKey: data.searchKeyFor('INC-2026-00007'),
    })),
    findActiveAdminIds: vi.fn().mockResolvedValue(['admin-1', 'admin-2']),
    findPhoto: vi.fn(),
    listByUnit: vi.fn(),
    findDetail: vi.fn(),
  };
  const storage = {
    saveAll: vi.fn().mockImplementation(async (_id, photos) =>
      photos.map((p: { mimeType: string; buffer: Buffer }, i: number) => ({
        path: `incidencias/x/${i}`,
        mimeType: p.mimeType,
        sizeBytes: p.buffer.length,
      })),
    ),
    removeIncident: vi.fn().mockResolvedValue(undefined),
    open: vi.fn(),
  };
  const notifications = { send: vi.fn().mockResolvedValue({ created: 2 }) };
  const service = new IncidentsService(
    repository as unknown as IncidentRepository,
    storage as unknown as IncidentPhotoStorage,
    notifications as unknown as NotificationsService,
  );
  return { service, repository, storage, notifications };
}

/** Respuesta 400 con { field, message[] }. */
async function badRequestOf(promise: Promise<unknown>) {
  const error = await promise.catch((e: unknown) => e);
  expect(error).toBeInstanceOf(BadRequestException);
  return (error as BadRequestException).getResponse() as {
    field: string;
    message: string[];
  };
}

describe('IncidentsService.create', () => {
  it('guarda fotos, crea la incidencia y responde con número, estado y URLs', async () => {
    const { service, repository, storage } = setup();

    const result = await service.create(resident, dto, [png(), jpg()]);

    const savedPhotos = storage.saveAll.mock.calls[0][1];
    expect(savedPhotos.map((p: { mimeType: string }) => p.mimeType)).toEqual([
      'image/png',
      'image/jpeg',
    ]);
    const data = repository.create.mock.calls[0][0];
    expect(data).toMatchObject({
      id: storage.saveAll.mock.calls[0][0],
      unitId: 'unit-1',
      reporterId: 'user-1',
      locationDetail: 'Piso 3, pasillo norte',
    });
    expect(data.searchKeyFor('INC-2026-00007')).toBe(
      'inc-2026-00007 fuga de agua',
    );
    expect(result).toMatchObject({
      number: 'INC-2026-00007',
      status: 'PENDIENTE',
      priority: 'MEDIA',
      photos: [
        { id: 'photo-0', url: 'incidencias/fotos/photo-0' },
        { id: 'photo-1', url: 'incidencias/fotos/photo-1' },
      ],
    });
  });

  it('avisa a los administradores activos con el texto de H10', async () => {
    const { service, notifications } = setup();
    const result = await service.create(resident, dto, [png()]);
    expect(notifications.send).toHaveBeenCalledWith({
      recipient: { type: 'USUARIO', ids: ['admin-1', 'admin-2'] },
      title: 'Nueva incidencia INC-2026-00007',
      message: 'La unidad A-101 reportó “Fuga de agua” en Torre A.',
      sourceModule: 'INCIDENCIAS',
      reference: { type: 'incident', id: result.id },
    });
  });

  it('no avisa si no hay administradores activos', async () => {
    const { service, repository, notifications } = setup();
    repository.findActiveAdminIds.mockResolvedValue([]);
    await service.create(resident, dto, [png()]);
    expect(notifications.send).not.toHaveBeenCalled();
  });

  it('si el aviso falla, la incidencia queda registrada igual', async () => {
    const { service, notifications } = setup();
    notifications.send.mockRejectedValue(new Error('caído'));
    await expect(service.create(resident, dto, [png()])).resolves.toMatchObject(
      {
        number: 'INC-2026-00007',
      },
    );
  });

  it.each<[string, UploadedPhoto[], string]>([
    ['sin fotos', [], 'Agrega al menos una fotografía.'],
    [
      '4 fotos',
      [png(), png(), png(), png()],
      'Puedes adjuntar como máximo 3 fotografías.',
    ],
    [
      'un archivo que no es imagen',
      [png(), { buffer: Buffer.from('%PDF-1.7'), size: 8 }],
      'Solo se permiten imágenes JPG o PNG de hasta 5 MB.',
    ],
    [
      'una foto de más de 5 MB',
      [png(5 * 1024 * 1024 + 1)],
      'Solo se permiten imágenes JPG o PNG de hasta 5 MB.',
    ],
  ])(
    'rechaza %s con 400 en photos y no guarda nada',
    async (_caso, files, message) => {
      const { service, storage, repository } = setup();
      const body = await badRequestOf(service.create(resident, dto, files));
      expect(body).toMatchObject({ field: 'photos', message: [message] });
      expect(storage.saveAll).not.toHaveBeenCalled();
      expect(repository.create).not.toHaveBeenCalled();
    },
  );

  it('si falla la transacción, borra las fotos ya guardadas (todo o nada)', async () => {
    const { service, repository, storage, notifications } = setup();
    repository.create.mockRejectedValue(new Error('db caída'));

    await expect(service.create(resident, dto, [png()])).rejects.toThrow(
      'db caída',
    );

    expect(storage.removeIncident).toHaveBeenCalledWith(
      storage.saveAll.mock.calls[0][0],
    );
    expect(notifications.send).not.toHaveBeenCalled();
  });

  it('si falla el guardado de archivos, no crea la incidencia', async () => {
    const { service, repository, storage } = setup();
    storage.saveAll.mockRejectedValue(new Error('disco lleno'));
    await expect(service.create(resident, dto, [png()])).rejects.toThrow(
      'No se pudieron guardar las fotografías.',
    );
    expect(repository.create).not.toHaveBeenCalled();
  });
});

describe('IncidentsService.getPhoto', () => {
  const photo = {
    id: 'p1',
    path: 'incidencias/i1/a.png',
    mimeType: 'image/png',
    incident: { unitId: 'unit-1' },
  };

  it('el residente de la unidad y el administrador pueden verla', async () => {
    const { service, repository, storage } = setup();
    repository.findPhoto.mockResolvedValue(photo);
    storage.open.mockResolvedValue({ stream: 'stream', size: 10 });

    await expect(service.getPhoto(resident, 'p1')).resolves.toMatchObject({
      mimeType: 'image/png',
      size: 10,
    });
    const admin = { id: 'a', role: 'ADMINISTRADOR', unitId: null } as User;
    await expect(service.getPhoto(admin, 'p1')).resolves.toBeTruthy();
  });

  it('un residente de otra unidad recibe 404, como si no existiera (H11)', async () => {
    const { service, repository } = setup();
    repository.findPhoto.mockResolvedValue(photo);
    const other = { ...resident, unitId: 'unit-2' } as User;
    await expect(service.getPhoto(other, 'p1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('404 si la foto no existe o falta el archivo', async () => {
    const { service, repository, storage } = setup();
    repository.findPhoto.mockResolvedValue(null);
    await expect(service.getPhoto(resident, 'p1')).rejects.toBeInstanceOf(
      NotFoundException,
    );

    repository.findPhoto.mockResolvedValue(photo);
    storage.open.mockResolvedValue(null);
    await expect(service.getPhoto(resident, 'p1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

describe('IncidentsService.listMine (H11)', () => {
  it('filtra por la unidad de la sesión y devuelve la página pedida', async () => {
    const { service, repository } = setup();
    repository.listByUnit.mockResolvedValue({
      data: [{ id: 'i1' }],
      total: 11,
    });

    const result = await service.listMine(resident, {
      status: 'PENDIENTE',
      page: 2,
      pageSize: 10,
    });

    expect(repository.listByUnit).toHaveBeenCalledWith({
      unitId: 'unit-1',
      status: 'PENDIENTE',
      page: 2,
      pageSize: 10,
    });
    expect(result).toEqual({
      data: [{ id: 'i1' }],
      total: 11,
      page: 2,
      pageSize: 10,
    });
  });

  it('un usuario sin unidad recibe 403', async () => {
    const { service } = setup();
    const sinUnidad = { ...resident, unitId: null } as User;
    await expect(
      service.listMine(sinUnidad, { page: 1, pageSize: 10 }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('IncidentsService.getDetail (H11)', () => {
  const detail = {
    id: 'i1',
    number: 'INC-2026-00001',
    title: 'Fuga de agua',
    description: 'Gotea agua del techo.',
    location: 'TORRE_A',
    locationDetail: null,
    status: 'EN_PROCESO',
    priority: 'ALTA',
    resolvedAt: null,
    createdAt: new Date('2026-11-06T10:00:00Z'),
    updatedAt: new Date('2026-11-06T11:00:00Z'),
    unitId: 'unit-1',
    unit: { code: 'A-101' },
    assignee: { name: 'Juan Pérez', specialty: 'Fontanería' },
    photos: [{ id: 'p1' }],
    events: [
      {
        id: 'e1',
        type: 'CREACION',
        fromStatus: null,
        toStatus: 'PENDIENTE',
        fromValue: null,
        toValue: null,
        note: 'Incidencia registrada',
        createdAt: new Date('2026-11-06T10:00:00Z'),
        author: { role: 'RESIDENTE', profile: { fullName: 'Ana López' } },
      },
      {
        id: 'e2',
        type: 'ESTADO',
        fromStatus: 'PENDIENTE',
        toStatus: 'EN_PROCESO',
        fromValue: null,
        toValue: null,
        note: 'Se revisa la tubería.',
        createdAt: new Date('2026-11-06T11:00:00Z'),
        author: {
          role: 'ADMINISTRADOR',
          profile: { fullName: 'Carlos Admin' },
        },
      },
    ],
  };

  it('arma el detalle con fotos, responsable e historial', async () => {
    const { service, repository } = setup();
    repository.findDetail.mockResolvedValue(detail);

    const result = await service.getDetail(resident, 'i1');

    expect(result).toMatchObject({
      number: 'INC-2026-00001',
      unit: { code: 'A-101' },
      assignee: { name: 'Juan Pérez', specialty: 'Fontanería' },
      photos: [{ id: 'p1', url: 'incidencias/fotos/p1' }],
    });
    expect(result.events.map((e) => [e.type, e.authorLabel])).toEqual([
      ['CREACION', 'Ana López'],
      // Los eventos de un administrador no exponen su cuenta.
      ['ESTADO', 'Administración'],
    ]);
    expect(result).not.toHaveProperty('unitId');
  });

  it('el administrador ve cualquier incidencia', async () => {
    const { service, repository } = setup();
    repository.findDetail.mockResolvedValue(detail);
    const admin = { id: 'a', role: 'ADMINISTRADOR', unitId: null } as User;
    await expect(service.getDetail(admin, 'i1')).resolves.toMatchObject({
      id: 'i1',
    });
  });

  it('404 si no existe o es de otra unidad', async () => {
    const { service, repository } = setup();
    repository.findDetail.mockResolvedValue(null);
    await expect(service.getDetail(resident, 'i1')).rejects.toBeInstanceOf(
      NotFoundException,
    );

    repository.findDetail.mockResolvedValue(detail);
    const other = { ...resident, unitId: 'unit-2' } as User;
    await expect(service.getDetail(other, 'i1')).rejects.toThrow(
      'La incidencia no existe.',
    );
  });
});
