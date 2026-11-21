import { ValidateBy, isUUID } from 'class-validator';
import { ANNOUNCEMENT_MESSAGES } from '../announcements.constants.js';

function towerSelectionError(value: unknown, max: number): string | null {
  if (!Array.isArray(value) || value.length === 0) {
    return ANNOUNCEMENT_MESSAGES.towerIds;
  }
  if (value.length > max) return ANNOUNCEMENT_MESSAGES.maxTowers;
  if (!value.every((towerId) => isUUID(towerId, 'all'))) {
    return ANNOUNCEMENT_MESSAGES.towerIdFormat;
  }
  if (new Set(value).size !== value.length) {
    return ANNOUNCEMENT_MESSAGES.towerIds;
  }
  return null;
}

export function TowerSelection(max: number): PropertyDecorator {
  return ValidateBy({
    name: 'towerSelection',
    constraints: [max],
    validator: {
      validate: (value: unknown) => towerSelectionError(value, max) === null,
      defaultMessage: (args) => towerSelectionError(args?.value, max) ?? '',
    },
  });
}
