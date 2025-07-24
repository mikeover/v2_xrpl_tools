import { Module, Global } from '@nestjs/common';
import { RabbitMQConnectionService } from './services/rabbitmq-connection.service';
import { EventPublisherService } from './services/event-publisher.service';
import { EventConsumerService } from './services/event-consumer.service';
import { QueueHealthController } from './controllers/queue-health.controller';
import { CoreModule } from '../../core/core.module';

@Global()
@Module({
  imports: [CoreModule],
  controllers: [QueueHealthController],
  providers: [RabbitMQConnectionService, EventPublisherService, EventConsumerService],
  exports: [EventPublisherService, EventConsumerService],
})
export class QueueModule {}
