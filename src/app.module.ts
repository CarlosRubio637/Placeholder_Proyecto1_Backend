import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { AuthModule } from '@Auth';
import { JwtAuthGuard, RolesGuard } from '@Auth/guards';
import { HealthModule } from '@Health';
import { PrismaModule } from '@Prisma';
import { UsersModule } from '@Users';
import { NotificationsModule } from '@Notifications';
import { IncidentsModule } from '@Incidents';
import { ReservationsModule } from '@Reservations';
import { validateEnv } from '@Config';
import { UnitsModule } from './units/units.module.js';
import { TowersModule } from './towers/towers.module.js';
import { PackagesModule } from './packages/packages.module.js';
import { AssembliesModule } from './admin/assemblies/assemblies.module.js';
import { ScheduleModule } from '@nestjs/schedule';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      // Si falta DATABASE_URL o JWT_SECRET, la app no arranca.
      validate: validateEnv,
    }),
    PrismaModule,
    HealthModule,
    UsersModule,
    NotificationsModule,
    IncidentsModule,
    ReservationsModule,
    AuthModule,
    UnitsModule,
    TowersModule,
    PackagesModule,
    AssembliesModule,
    ScheduleModule.forRoot(),
  ],
  providers: [
    {
      // Todo cerrado por defecto: las rutas públicas se abren con @Public().
      provide: APP_GUARD,
      useExisting: JwtAuthGuard,
    },
    {
      // Va después de JwtAuthGuard (los guards globales corren en el orden en
      // que se registran): necesita el usuario que ese guard carga en el
      // request. Restringe por rol las rutas marcadas con @Roles(...).
      provide: APP_GUARD,
      useExisting: RolesGuard,
    },
  ],
})
export class AppModule {}
