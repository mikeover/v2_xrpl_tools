import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { CoreModule } from './core/core.module';
import { SharedModule } from './shared/shared.module';
import { XrplConnectionModule } from './features/xrpl-connection/xrpl-connection.module';
import { TransactionProcessingModule } from './features/transaction-processing/transaction-processing.module';
import { UserManagementModule } from './features/user-management/user-management.module';
import { AlertsModule } from './features/alerts/alerts.module';
import { NotificationsModule } from './features/notifications/notifications.module';

@Module({
  imports: [CoreModule, SharedModule, XrplConnectionModule, TransactionProcessingModule, UserManagementModule, AlertsModule, NotificationsModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
