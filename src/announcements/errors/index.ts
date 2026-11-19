import {
  ANNOUNCEMENT_MESSAGES,
  towerNotFoundMessage,
} from '../announcements.constants.js';

export class TowerNotFoundError extends Error {
  constructor(public readonly towerId: string) {
    super(towerNotFoundMessage(towerId));
    this.name = 'TowerNotFoundError';
  }
}

export class AnnouncementNotFoundError extends Error {
  constructor(public readonly announcementId: string) {
    super(ANNOUNCEMENT_MESSAGES.notFound);
    this.name = 'AnnouncementNotFoundError';
  }
}
