import { towerNotFoundMessage } from '../announcements.constants.js';
import { AnnouncementNotFoundError, TowerNotFoundError } from './index.js';

describe('error de torre inexistente', () => {
  it('usa el mismo mensaje que la respuesta 400', () => {
    const towerId = '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d';
    expect(new TowerNotFoundError(towerId).message).toBe(
      towerNotFoundMessage(towerId),
    );
  });
});

describe('error de comunicado inexistente', () => {
  it('AnnouncementNotFoundError lleva el id y el mensaje', () => {
    const announcementId = '3c2b1a09-8f7e-4d6c-9b5a-4e3d2c1b0a9f';
    const error = new AnnouncementNotFoundError(announcementId);
    expect(error.announcementId).toBe(announcementId);
    expect(error.message).toBe('El comunicado no existe.');
  });
});
