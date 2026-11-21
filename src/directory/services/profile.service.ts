import { Injectable, NotFoundException } from '@nestjs/common';
import { badRequest } from '@Common/validation';
import type { User } from '@PrismaClient';
import { DIRECTORY_MESSAGES } from '../directory.constants.js';
import { ProfileDto, type UpdateProfileDto } from '../dto/index.js';
import { ProfileNotFoundError } from '../errors/index.js';
import { ProfileRepository } from '../repositories/index.js';

function toHttpError(error: unknown): unknown {
  if (error instanceof ProfileNotFoundError) {
    return new NotFoundException(DIRECTORY_MESSAGES.profileNotFound);
  }
  return error;
}

@Injectable()
export class ProfileService {
  constructor(private readonly repository: ProfileRepository) {}

  async get(user: User): Promise<ProfileDto> {
    const profile = await this.repository
      .findByUser(user.id)
      .catch((error: unknown) => {
        throw toHttpError(error);
      });
    return ProfileDto.fromResident(profile);
  }

  async update(user: User, dto: UpdateProfileDto): Promise<ProfileDto> {
    if (dto.directory.visible && !dto.directory.showName) {
      throw badRequest('directory.showName', DIRECTORY_MESSAGES.nameRequired);
    }
    const profile = await this.repository
      .save(user.id, dto.phone, dto.directory)
      .catch((error: unknown) => {
        throw toHttpError(error);
      });
    return ProfileDto.fromResident(profile);
  }
}
