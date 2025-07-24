import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtAuthService } from './services/jwt.service';
import { PasswordService } from './services/password.service';
import { LoggerModule } from '../../core/logger/logger.module';
import { AppConfiguration } from '../../shared/config/configuration';

@Module({
  imports: [
    ConfigModule,
    LoggerModule,
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
  providers: [
    JwtAuthService,
    PasswordService,
  ],
  exports: [
    JwtAuthService,
    PasswordService,
  ],
})
export class AuthModule {}