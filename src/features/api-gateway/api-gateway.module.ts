import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { ApiGatewayController } from './controllers/api-gateway.controller';
import { ApiDocsController } from './controllers/api-docs.controller';
import { ResponseTransformInterceptor } from './interceptors/response-transform.interceptor';
import { ApiVersionMiddleware } from './middleware/api-version.middleware';
import { RequestIdMiddleware } from './middleware/request-id.middleware';
import { AuthModule } from '../auth/auth.module';
import { AlertsModule } from '../alerts/alerts.module';
import { HealthModule } from '../health/health.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    AuthModule,
    AlertsModule,
    HealthModule,
    NotificationsModule,
  ],
  controllers: [ApiGatewayController, ApiDocsController],
  providers: [
    {
      provide: APP_INTERCEPTOR,
      useClass: ResponseTransformInterceptor,
    },
    ApiVersionMiddleware,
    RequestIdMiddleware,
  ],
  exports: [ApiVersionMiddleware, RequestIdMiddleware],
})
export class ApiGatewayModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(RequestIdMiddleware, ApiVersionMiddleware)
      .forRoutes('*');
  }
}