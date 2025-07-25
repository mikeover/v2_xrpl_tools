import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { CoreModule } from './core/core.module';
import { SharedModule } from './shared/shared.module';
import { QueueModule } from './modules/queue/queue.module';
import { XRPLConnectionModule } from './modules/xrpl-connection/xrpl-connection.module';
import { TransactionProcessingModule } from './features/transaction-processing/transaction-processing.module';
import { UserManagementModule } from './features/user-management/user-management.module';
import { AlertsModule } from './features/alerts/alerts.module';
import { NotificationsModule } from './features/notifications/notifications.module';
import { AppConfiguration } from './shared/config';

@Module({
  imports: [
    CoreModule,
    SharedModule,
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService<AppConfiguration>) => {
        const security = configService.get<AppConfiguration['security']>('security');
        return [
          {
            name: 'default',
            ttl: security?.throttler?.ttl || 60000,
            limit: security?.throttler?.limit || 100,
          },
        ];
      },
    }),
    QueueModule,
    XRPLConnectionModule,
    TransactionProcessingModule,
    UserManagementModule,
    AlertsModule,
    NotificationsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
