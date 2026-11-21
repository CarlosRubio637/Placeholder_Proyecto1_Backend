import { Injectable } from '@nestjs/common';
import { badRequest } from '@Common/validation';
import type { User } from '@PrismaClient';
import { toSearchName } from '@Users/services';
import {
  DIRECTORY_NAME_MIN,
  DIRECTORY_SEARCH_MESSAGES,
} from '../directory.constants.js';
import {
  DirectoryEntryDto,
  type DirectoryPageDto,
  type DirectorySearchQueryDto,
} from '../dto/index.js';
import {
  DirectoryRepository,
  type DirectorySearchFilter,
} from '../repositories/index.js';

type Criterion = Pick<DirectorySearchFilter, 'searchName' | 'unit'>;

function criterionOf(query: DirectorySearchQueryDto): Criterion {
  const byName = query.name !== undefined;
  const byUnit = query.towerId !== undefined || query.unitNumber !== undefined;
  if (byName === byUnit) {
    throw badRequest('name', DIRECTORY_SEARCH_MESSAGES.criterion);
  }
  if (query.name !== undefined) {
    const searchName = toSearchName(query.name);
    if (searchName.length < DIRECTORY_NAME_MIN) {
      throw badRequest('name', DIRECTORY_SEARCH_MESSAGES.nameShort);
    }
    return { searchName, unit: undefined };
  }
  if (query.towerId === undefined || query.unitNumber === undefined) {
    const missing = query.towerId === undefined ? 'towerId' : 'unitNumber';
    throw badRequest(missing, DIRECTORY_SEARCH_MESSAGES.criterion);
  }
  return {
    searchName: undefined,
    unit: { towerId: query.towerId, number: query.unitNumber },
  };
}

@Injectable()
export class DirectoryService {
  constructor(private readonly repository: DirectoryRepository) {}

  async search(
    user: User,
    query: DirectorySearchQueryDto,
  ): Promise<DirectoryPageDto> {
    const { page, pageSize } = query;
    const { rows, total } = await this.repository.search({
      requesterId: user.id,
      ...criterionOf(query),
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
    return {
      data: rows.map((row) => DirectoryEntryDto.fromRow(row)),
      total,
      page,
      pageSize,
    };
  }
}
