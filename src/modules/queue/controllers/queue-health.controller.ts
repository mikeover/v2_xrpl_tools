import { Controller, Get } from '@nestjs/common';
import { RabbitMQConnectionService } from '../services/rabbitmq-connection.service';

@Controller('queue')
export class QueueHealthController {
  constructor(private readonly connectionService: RabbitMQConnectionService) {}

  @Get('health')
  getHealth() {
    return {
      connected: this.connectionService.isConnected(),
      status: this.connectionService.isConnected() ? 'healthy' : 'disconnected',
    };
  }
}