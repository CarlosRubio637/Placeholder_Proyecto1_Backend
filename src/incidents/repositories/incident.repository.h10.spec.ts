import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { PrismaService } from '@Prisma/services';
import {
  IncidentRepository,
  type CreateIncidentData,
} from './incident.repository.js';

const INCIDENT = '7d1f2a3b-4c5d-4e6f-8a9b-0c1d2e3f4a5b';

const data: CreateIncidentData = {
  id: INCIDENT,
  year: 2026,
  unitId: 'unit-a101',
  reporterId: 'residente-1',
  title: 'Fuga de agua',
  description: 'Gotea agua del techo del pasillo.',
  location: 'TORRE_A',
  locationDetail: 'Piso 3, pasillo norte',
  photos: [
    {
      path: `incidencias/${INCIDENT}/a.png`,
      mimeType: 'image/png',
      sizeBytes: 9,
    },
  ],
  searchKeyFor: (number) => `${number.toLowerCase()} fuga de agua`,
};

function setup(last = 7) {
  const tx = {
    $queryRaw: vi.fn().mockResolvedValue([{ last }]),
    incident: { create: vi.fn().mockResolvedValue({ id: INCIDENT }) },
  };
  const $transaction = vi.fn((fn: (client: typeof tx) => unknown) => fn(tx));
  const repository = new IncidentRepository({
    $transaction,
  } as unknown as PrismaService);
  return { repository, tx, $transaction };
}

describe('H10. Registro de incidencia con evidencia', () => {
  it('AC4: toma el consecutivo anual y arma el número INC-AAAA-NNNNN', async () => {
    const { repository, tx } = setup(7);

    await repository.create(data);

    const [sql, ...params] = tx.$queryRaw.mock.calls[0] as [
      TemplateStringsArray,
      ...unknown[],
    ];
    expect(sql.join('?')).toContain('incident_counters');
    expect(sql.join('?')).toContain('ON CONFLICT (year)');
    expect(params).toEqual([2026]);
    expect(tx.incident.create.mock.calls[0][0].data).toMatchObject({
      number: 'INC-2026-00007',
      searchKey: 'inc-2026-00007 fuga de agua',
    });
  });

  it('AC4: guarda la unidad, el autor, las fotos y el primer evento "Incidencia registrada"', async () => {
    const { repository, tx } = setup();

    await repository.create(data);

    const created = tx.incident.create.mock.calls[0][0].data;
    expect(created).toMatchObject({
      id: INCIDENT,
      unitId: 'unit-a101',
      reporterId: 'residente-1',
      title: 'Fuga de agua',
      location: 'TORRE_A',
      locationDetail: 'Piso 3, pasillo norte',
      photos: { create: data.photos },
      events: {
        create: {
          type: 'CREACION',
          toStatus: 'PENDIENTE',
          note: 'Incidencia registrada',
          authorId: 'residente-1',
        },
      },
    });
    // Estado Pendiente, prioridad Media y fecha de creación los pone la base.
    expect(created).not.toHaveProperty('status');
    expect(created).not.toHaveProperty('priority');
    expect(created).not.toHaveProperty('createdAt');
  });

  it('AC4: el número, la incidencia, sus fotos y el evento van en una sola transacción', async () => {
    const { repository, tx, $transaction } = setup();

    await repository.create(data);

    expect($transaction).toHaveBeenCalledTimes(1);
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(tx.incident.create).toHaveBeenCalledTimes(1);
  });

  it('AC4: en la base, una incidencia nueva queda Pendiente, con prioridad Media y su fecha de creación', () => {
    const schema = readFileSync(
      join(process.cwd(), 'prisma/schema.prisma'),
      'utf8',
    );
    const model = /model Incident \{([\s\S]*?)\n\}/.exec(schema)![1];

    expect(model).toMatch(/status\s+IncidentStatus\s+@default\(PENDIENTE\)/);
    expect(model).toMatch(/priority\s+IncidentPriority\s+@default\(MEDIA\)/);
    expect(model).toMatch(/createdAt\s+DateTime\s+@default\(now\(\)\)/);
    expect(model).toMatch(/number\s+String\s+@unique/);
  });
});
