import { ApiProperty } from '@nestjs/swagger';
import type { ResidentProfile } from '../repositories/index.js';
import { DirectoryPrefsDto } from './update-profile.dto.js';

export class ProfileDto {
  @ApiProperty({ example: 'Ana María López' })
  fullName!: string;

  @ApiProperty({ example: 'ana.lopez@correo.com' })
  email!: string;

  @ApiProperty({ example: 'A-101', nullable: true, type: String })
  unitCode!: string | null;

  @ApiProperty({ example: '7845-1290' })
  phone!: string;

  @ApiProperty({
    type: DirectoryPrefsDto,
    description: 'Todo en false si el residente nunca guardó sus preferencias.',
  })
  directory!: DirectoryPrefsDto;

  static fromResident(profile: ResidentProfile): ProfileDto {
    return Object.assign(new ProfileDto(), {
      fullName: profile.fullName,
      email: profile.email,
      unitCode: profile.unitCode,
      phone: profile.phone,
      directory: { ...profile.directory },
    });
  }
}
