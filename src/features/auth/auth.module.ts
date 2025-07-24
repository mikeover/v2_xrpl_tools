import { Module, forwardRef } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtAuthService } from './services/jwt.service';
import { PasswordService } from './services/password.service';
import { AuthController } from './controllers/auth.controller';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { LoggerModule } from '../../core/logger/logger.module';
import { AppConfiguration } from '../../shared/config/configuration';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [
    ConfigModule,
    LoggerModule,
    forwardRef(() => UsersModule),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService<AppConfiguration>) => ({
        secret: configService.get('jwt.secret', { infer: true })!,
        signOptions: {
          expiresIn: configService.get('jwt.expiresIn', { infer: true }) || '7d',
        },
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [AuthController],
  providers: [
    JwtAuthService,
    PasswordService,
    JwtAuthGuard,
    RolesGuard,
  ],
  exports: [
    JwtAuthService,
    PasswordService,
    JwtAuthGuard,
    RolesGuard,
  ],
})
export class AuthModule {}