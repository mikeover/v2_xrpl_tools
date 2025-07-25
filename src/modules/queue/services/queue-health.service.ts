import { Injectable } from '@nestjs/common';
import { RabbitMQConnectionService } from './rabbitmq-connection.service';

@Injectable()
export class QueueHealthService {
  constructor(
    private readonly rabbitMQConnectionService: RabbitMQConnectionService,
  ) {}

  async getHealth(): Promise<{ status: string; message: string }> {
    try {
      const channel = await this.rabbitMQConnectionService.getChannel();
      if (channel) {
        return {
          status: 'healthy',
          message: 'RabbitMQ connection is active',
        };
      } else {
        return {
          status: 'degraded',
          message: 'RabbitMQ channel not available',
        };
      }
    } catch (error) {
      return {
        status: 'unhealthy',
        message: `RabbitMQ connection failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }
}