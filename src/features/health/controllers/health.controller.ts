import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  UseInterceptors,
  ClassSerializerInterceptor,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
} from '@nestjs/swagger';
import { Public } from '../../auth/decorators/public.decorator';
import { HealthCheckService } from '../services/health-check.service';
import { SystemHealth, EndToEndHealthCheck, HealthMetrics } from '../interfaces/health.interface';

@ApiTags('Health')
@Controller('health')
@UseInterceptors(ClassSerializerInterceptor)
export class HealthController {
  constructor(private readonly healthCheckService: HealthCheckService) {}

  /**
   * Basic health check endpoint (for load balancers)
   */
  @Public()
  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Basic health check',
    description: 'Simple endpoint that returns 200 OK if the service is running',
  })
  @ApiResponse({
    status: 200,
    description: 'Service is healthy',
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string', example: 'ok' },
        timestamp: { type: 'string', format: 'date-time' },
      },
    },
  })
  async health() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Comprehensive system health check
   */
  @Public()
  @Get('system')
  @ApiOperation({
    summary: 'Comprehensive system health check',
    description: 'Detailed health status of all system components',
  })
  @ApiResponse({
    status: 200,
    description: 'System health information',
    schema: {
      type: 'object',
      properties: {
        status: { 
          type: 'string', 
          enum: ['healthy', 'degraded', 'unhealthy'],
          description: 'Overall system health status',
        },
        version: { type: 'string', example: '1.0.0' },
        uptime: { type: 'number', description: 'Uptime in milliseconds' },
        timestamp: { type: 'string', format: 'date-time' },
        components: {
          type: 'object',
          properties: {
            database: { $ref: '#/components/schemas/ComponentHealth' },
            xrplConnection: { $ref: '#/components/schemas/ComponentHealth' },
            messageQueue: { $ref: '#/components/schemas/ComponentHealth' },
            metadataEnrichment: { $ref: '#/components/schemas/ComponentHealth' },
            alertProcessing: { $ref: '#/components/schemas/ComponentHealth' },
            notifications: { $ref: '#/components/schemas/ComponentHealth' },
          },
        },
      },
    },
  })
  async systemHealth(): Promise<SystemHealth> {
    return this.healthCheckService.getSystemHealth();
  }

  /**
   * End-to-end health check
   */
  @Public()
  @Get('e2e')
  @ApiOperation({
    summary: 'End-to-end health check',
    description: 'Verifies the entire processing pipeline is working correctly',
  })
  @ApiResponse({
    status: 200,
    description: 'End-to-end health check results',
    schema: {
      type: 'object',
      properties: {
        status: { 
          type: 'string', 
          enum: ['healthy', 'degraded', 'unhealthy'],
        },
        lastTestAt: { type: 'string', format: 'date-time' },
        lastSuccessAt: { type: 'string', format: 'date-time' },
        failureCount: { type: 'number' },
        details: {
          type: 'object',
          properties: {
            transactionProcessed: { type: 'boolean' },
            alertMatched: { type: 'boolean' },
            notificationSent: { type: 'boolean' },
            totalTimeMs: { type: 'number' },
            error: { type: 'string' },
          },
        },
      },
    },
  })
  async endToEndHealth(): Promise<EndToEndHealthCheck> {
    return this.healthCheckService.performEndToEndHealthCheck();
  }

  /**
   * System metrics
   */
  @Public()
  @Get('metrics')
  @ApiOperation({
    summary: 'System metrics',
    description: 'Get current system performance and usage metrics',
  })
  @ApiResponse({
    status: 200,
    description: 'System metrics',
    schema: {
      type: 'object',
      properties: {
        transactions: {
          type: 'object',
          properties: {
            processed: { type: 'number' },
            failed: { type: 'number' },
            rate: { type: 'number', description: 'Transactions per minute' },
          },
        },
        alerts: {
          type: 'object',
          properties: {
            total: { type: 'number' },
            active: { type: 'number' },
            matched: { type: 'number' },
          },
        },
        notifications: {
          type: 'object',
          properties: {
            sent: { type: 'number' },
            failed: { type: 'number' },
            pending: { type: 'number' },
          },
        },
        metadata: {
          type: 'object',
          properties: {
            enriched: { type: 'number' },
            failed: { type: 'number' },
            queued: { type: 'number' },
          },
        },
      },
    },
  })
  async metrics(): Promise<HealthMetrics> {
    return this.healthCheckService.getHealthMetrics();
  }

  /**
   * Liveness probe for Kubernetes
   */
  @Public()
  @Get('live')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Liveness probe',
    description: 'Kubernetes liveness probe endpoint',
  })
  @ApiResponse({
    status: 200,
    description: 'Service is alive',
  })
  async liveness() {
    // Simple check - if the service can respond, it's alive
    return { status: 'alive' };
  }

  /**
   * Readiness probe for Kubernetes
   */
  @Public()
  @Get('ready')
  @ApiOperation({
    summary: 'Readiness probe',
    description: 'Kubernetes readiness probe endpoint',
  })
  @ApiResponse({
    status: 200,
    description: 'Service is ready to accept traffic',
  })
  @ApiResponse({
    status: 503,
    description: 'Service is not ready',
  })
  async readiness() {
    const health = await this.healthCheckService.getSystemHealth();
    
    if (health.status === 'unhealthy') {
      throw new Error('System is unhealthy');
    }

    return {
      status: 'ready',
      health: health.status,
    };
  }
}