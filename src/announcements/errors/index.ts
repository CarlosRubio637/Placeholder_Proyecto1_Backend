import { towerNotFoundMessage } from '../announcements.constants.js';

export class TowerNotFoundError extends Error {
  constructor(public readonly towerId: string) {
    super(towerNotFoundMessage(towerId));
    this.name = 'TowerNotFoundError';
  }
}
