import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { UsersModule } from '@Users';
import { AuthController } from '@Auth/controllers';
import { AuthService, TokenService } from '@Auth/services';
import { RefreshTokenRepository } from '@Auth/repositories';
import { JwtAuthGuard, RolesGuard } from '@Auth/guards';
import type { EnvConfig } from '@Config';

@Module({
  imports: [
    UsersModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService<EnvConfig, true>) => ({
        secret: configService.get('JWT_SECRET', { infer: true }),
        signOptions: {
          expiresIn: configService.get('JWT_EXPIRES_IN', { infer: true }),
          algorithm: 'HS256',
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    TokenService,
    RefreshTokenRepository,
    JwtAuthGuard,
    RolesGuard,
  ],
  // Los guards se exportan para que app.module.ts pueda registrarlos como
  // APP_GUARD con sus dependencias (JwtService, UsersService) ya resueltas.
  exports: [
    AuthService,
    TokenService,
    RefreshTokenRepository,
    JwtAuthGuard,
    RolesGuard,
  ],
})
export class AuthModule {}
