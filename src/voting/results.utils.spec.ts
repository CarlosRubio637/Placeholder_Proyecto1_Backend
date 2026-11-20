import { computeTopicResult, pct, round1 } from './results.utils.js';

const votes = (entries: [string, number][]) => new Map(entries);

describe('results.utils (H24)', () => {
  it('redondea los porcentajes a un decimal', () => {
    expect(round1(63.636)).toBe(63.6);
    expect(pct(7, 11)).toBe(63.6);
    expect(pct(3, 11)).toBe(27.3);
    expect(pct(1, 11)).toBe(9.1);
  });

  it('el porcentaje es 0 si el total es 0 (sin dividir entre cero)', () => {
    expect(pct(0, 0)).toBe(0);
  });

  it('incluye todas las opciones en el orden del tema y elige la ganadora', () => {
    const result = computeTopicResult({
      optionIds: ['a', 'b', 'c'],
      votesByOption: votes([
        ['b', 3],
        ['a', 7],
      ]),
      votedUnits: 10,
      eligibleUnits: 12,
    });

    expect(result).toEqual({
      eligibleUnits: 12,
      votedUnits: 10,
      totalVotes: 10,
      optionCounts: [
        { optionId: 'a', votes: 7 },
        { optionId: 'b', votes: 3 },
        { optionId: 'c', votes: 0 },
      ],
      winnerOptionId: 'a',
    });
  });

  it('empate en el máximo: sin opción ganadora', () => {
    const result = computeTopicResult({
      optionIds: ['a', 'b'],
      votesByOption: votes([
        ['a', 2],
        ['b', 2],
      ]),
      votedUnits: 4,
      eligibleUnits: 4,
    });
    expect(result.winnerOptionId).toBeNull();
    expect(result.totalVotes).toBe(4);
  });

  it('sin votos: total 0 y sin opción ganadora', () => {
    const result = computeTopicResult({
      optionIds: ['a', 'b'],
      votesByOption: votes([]),
      votedUnits: 0,
      eligibleUnits: 5,
    });
    expect(result.totalVotes).toBe(0);
    expect(result.winnerOptionId).toBeNull();
  });
});
