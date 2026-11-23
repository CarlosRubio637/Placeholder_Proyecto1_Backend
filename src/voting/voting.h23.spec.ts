import {
  ConflictException,
  ForbiddenException,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from '@Auth/guards';
import type { PrismaService } from '@Prisma/services';
import type { Role, User } from '@PrismaClient';
import { VotingController } from './voting.controller.js';
import { VOTING_MESSAGES, VotingService } from './voting.service.js';

const RESIDENT_1 = { id: 'user-1', unitId: 'unit-1' } as User;
const RESIDENT_2 = { id: 'user-2', unitId: 'unit-1' } as User;
const VOTED_AT = new Date('2026-11-21T15:00:00Z');

const openTopic = (change: object = {}) => ({
  id: 'topic-1',
  options: [{ id: 'opt-1' }, { id: 'opt-2' }],
  assembly: {
    id: 'as-1',
    status: 'ABIERTA',
    eligibleUnits: [{ unitId: 'unit-1' }],
  },
  ...change,
});

function setup() {
  const tx = {
    voteParticipation: {
      create: vi
        .fn()
        .mockResolvedValue({ topicId: 'topic-1', votedAt: VOTED_AT }),
    },
    ballot: { create: vi.fn().mockResolvedValue({ id: 'ballot-1' }) },
    $queryRaw: vi.fn().mockResolvedValue([{ id: 'as-1' }]),
  };
  const prisma = {
    assemblyTopic: { findUnique: vi.fn().mockResolvedValue(openTopic()) },
    $transaction: vi.fn((fn: (client: typeof tx) => unknown) => fn(tx)),
  };
  const service = new VotingService(prisma as unknown as PrismaService);
  return { service, prisma, tx };
}

const uniqueViolation = () =>
  Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });

function requestAs(role: Role): ExecutionContext {
  return {
    getHandler: () => VotingController.prototype.vote,
    getClass: () => VotingController,
    switchToHttp: () => ({ getRequest: () => ({ user: { role } }) }),
  } as unknown as ExecutionContext;
}

describe('H23. Emisión del voto por unidad', () => {
  const dto = { optionId: 'opt-2' };

  it('AC5: cualquier residente de una unidad habilitada puede votar; el voto queda a nombre de la unidad', async () => {
    const { service, tx } = setup();

    await service.vote(RESIDENT_2, 'topic-1', dto);

    expect(tx.voteParticipation.create.mock.calls[0][0].data).toEqual({
      topicId: 'topic-1',
      unitId: 'unit-1',
      userId: 'user-2',
    });
  });

  it('AC5: solo consulta la habilitación de la unidad del residente', async () => {
    const { service, prisma } = setup();

    await service.vote(RESIDENT_1, 'topic-1', dto);

    const args = prisma.assemblyTopic.findUnique.mock.calls[0][0];
    expect(args.include.assembly.select.eligibleUnits.where).toEqual({
      unitId: 'unit-1',
    });
  });

  it('AC5: un solo voto por tema y por unidad; cuenta el primero', async () => {
    const { service, tx } = setup();
    tx.voteParticipation.create
      .mockResolvedValueOnce({ topicId: 'topic-1', votedAt: VOTED_AT })
      .mockRejectedValueOnce(uniqueViolation());

    await service.vote(RESIDENT_1, 'topic-1', { optionId: 'opt-1' });
    const error = await service
      .vote(RESIDENT_2, 'topic-1', { optionId: 'opt-2' })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ConflictException);
    expect(tx.ballot.create).toHaveBeenCalledTimes(1);
    expect(tx.ballot.create).toHaveBeenCalledWith({
      data: { topicId: 'topic-1', optionId: 'opt-1' },
    });
  });

  it('AC6: guarda participación y voto en una sola transacción, la participación primero', async () => {
    const { service, prisma, tx } = setup();

    await service.vote(RESIDENT_1, 'topic-1', dto);

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(
      tx.voteParticipation.create.mock.invocationCallOrder[0],
    ).toBeLessThan(tx.ballot.create.mock.invocationCallOrder[0]);
  });

  it('AC6: voto secreto: el voto solo guarda tema y opción, sin unidad ni usuario', async () => {
    const { service, tx } = setup();

    await service.vote(RESIDENT_1, 'topic-1', dto);

    expect(tx.ballot.create).toHaveBeenCalledWith({
      data: { topicId: 'topic-1', optionId: 'opt-2' },
    });
    const participation = tx.voteParticipation.create.mock.calls[0][0].data;
    expect(participation).not.toHaveProperty('optionId');
  });

  it('AC6: la respuesta no revela la opción elegida', async () => {
    const { service } = setup();

    const result = await service.vote(RESIDENT_1, 'topic-1', dto);

    expect(result).toEqual({ topicId: 'topic-1', votedAt: VOTED_AT });
    expect(JSON.stringify(result)).not.toContain('opt-2');
  });

  it('AC7: 409 "Tu unidad ya votó este tema." sin guardar un segundo voto', async () => {
    const { service, tx } = setup();
    tx.voteParticipation.create.mockRejectedValue(uniqueViolation());

    const error = await service
      .vote(RESIDENT_1, 'topic-1', dto)
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ConflictException);
    expect((error as Error).message).toBe(VOTING_MESSAGES.alreadyVoted);
    expect(tx.ballot.create).not.toHaveBeenCalled();
  });

  it('AC7: si dos residentes de la unidad votan a la vez, solo uno queda', async () => {
    const { service, tx } = setup();
    tx.voteParticipation.create
      .mockResolvedValueOnce({ topicId: 'topic-1', votedAt: VOTED_AT })
      .mockRejectedValueOnce(uniqueViolation());

    const [first, second] = await Promise.allSettled([
      service.vote(RESIDENT_1, 'topic-1', { optionId: 'opt-1' }),
      service.vote(RESIDENT_2, 'topic-1', { optionId: 'opt-2' }),
    ]);

    expect(first.status).toBe('fulfilled');
    expect(second.status).toBe('rejected');
    expect((second as PromiseRejectedResult).reason).toBeInstanceOf(
      ConflictException,
    );
    expect(tx.ballot.create).toHaveBeenCalledTimes(1);
  });

  it.each(['PROGRAMADA', 'CERRADA'])(
    'AC8: 409 "La votación no está abierta." si la asamblea está %s',
    async (status) => {
      const { service, prisma, tx } = setup();
      prisma.assemblyTopic.findUnique.mockResolvedValue(
        openTopic({ assembly: { ...openTopic().assembly, status } }),
      );

      const error = await service
        .vote(RESIDENT_1, 'topic-1', dto)
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ConflictException);
      expect((error as Error).message).toBe(VOTING_MESSAGES.notOpen);
      expect(tx.voteParticipation.create).not.toHaveBeenCalled();
    },
  );

  it('AC8: 409 si ya pasó la hora de cierre aunque la tarea no la haya cerrado', async () => {
    const { service, tx } = setup();
    tx.$queryRaw.mockResolvedValue([]);

    const error = await service
      .vote(RESIDENT_1, 'topic-1', dto)
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ConflictException);
    expect((error as Error).message).toBe(VOTING_MESSAGES.notOpen);
    expect(tx.ballot.create).not.toHaveBeenCalled();
  });

  it('AC8: 400 con el campo si la opción es de otro tema', async () => {
    const { service, tx } = setup();

    const body = await service
      .vote(RESIDENT_1, 'topic-1', { optionId: 'de-otro-tema' })
      .catch((e: { getResponse: () => unknown }) => e.getResponse());

    expect(body).toMatchObject({
      statusCode: 400,
      field: 'optionId',
      message: [VOTING_MESSAGES.optionNotInTopic],
    });
    expect(tx.voteParticipation.create).not.toHaveBeenCalled();
  });

  it('AC8: 403 "Tu unidad no está habilitada para esta asamblea." desde una unidad no habilitada', async () => {
    const { service, prisma, tx } = setup();
    prisma.assemblyTopic.findUnique.mockResolvedValue(
      openTopic({ assembly: { ...openTopic().assembly, eligibleUnits: [] } }),
    );

    const error = await service
      .vote(RESIDENT_1, 'topic-1', dto)
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ForbiddenException);
    expect((error as Error).message).toBe(VOTING_MESSAGES.notEligible);
    expect(tx.voteParticipation.create).not.toHaveBeenCalled();
  });

  describe('AC9: permisos', () => {
    const guard = new RolesGuard(new Reflector());

    it.each<Role>(['ADMINISTRADOR', 'SEGURIDAD'])(
      'AC9: %s recibe 403 al votar',
      (role) => {
        expect(() => guard.canActivate(requestAs(role))).toThrow(
          ForbiddenException,
        );
      },
    );

    it('AC9: el Residente sí vota', () => {
      expect(guard.canActivate(requestAs('RESIDENTE'))).toBe(true);
    });
  });
});
