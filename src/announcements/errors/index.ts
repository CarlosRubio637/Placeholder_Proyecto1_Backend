import {
  RESIDENT_ANNOUNCEMENT_MESSAGES,
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
    super(RESIDENT_ANNOUNCEMENT_MESSAGES.notFound);
    this.name = 'AnnouncementNotFoundError';
  }
}
