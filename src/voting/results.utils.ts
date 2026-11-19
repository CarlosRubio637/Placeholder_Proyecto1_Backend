// Cálculo del resultado de un tema (H24). Lo usan la tarea programada al
// cerrar la asamblea y la pantalla de resultado. Sin dependencias de Nest ni
// de Prisma para poder probarlo solo.

export interface OptionCount {
  optionId: string;
  votes: number;
}

export interface ComputedTopicResult {
  eligibleUnits: number;
  votedUnits: number;
  totalVotes: number;
  optionCounts: OptionCount[];
  /** null si hubo empate en el máximo o no hubo votos. */
  winnerOptionId: string | null;
}

/** Redondea a un decimal: 63.636… → 63.6. */
export function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/** Porcentaje con un decimal; 0 si el total es 0. */
export function pct(part: number, total: number): number {
  return total > 0 ? round1((part / total) * 100) : 0;
}

/**
 * Arma el resultado de un tema. `optionIds` va en el orden del tema y define
 * qué opciones aparecen (con 0 votos si nadie las eligió).
 */
export function computeTopicResult(params: {
  optionIds: string[];
  votesByOption: Map<string, number>;
  votedUnits: number;
  eligibleUnits: number;
}): ComputedTopicResult {
  const optionCounts = params.optionIds.map((optionId) => ({
    optionId,
    votes: params.votesByOption.get(optionId) ?? 0,
  }));
  const totalVotes = optionCounts.reduce((sum, item) => sum + item.votes, 0);
  const max = Math.max(0, ...optionCounts.map((item) => item.votes));
  const leaders = optionCounts.filter((item) => item.votes === max);
  const winnerOptionId =
    max > 0 && leaders.length === 1 ? leaders[0].optionId : null;

  return {
    eligibleUnits: params.eligibleUnits,
    votedUnits: params.votedUnits,
    totalVotes,
    optionCounts,
    winnerOptionId,
  };
}
