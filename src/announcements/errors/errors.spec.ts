import { towerNotFoundMessage } from '../announcements.constants.js';
import { TowerNotFoundError } from './index.js';

describe('error de torre inexistente', () => {
  it('usa el mismo mensaje que la respuesta 400', () => {
    const towerId = '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d';
    expect(new TowerNotFoundError(towerId).message).toBe(
      towerNotFoundMessage(towerId),
    );
  });
});
