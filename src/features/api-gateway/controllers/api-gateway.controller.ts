import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Public } from '../../auth/decorators/public.decorator';

interface ApiEndpointInfo {
  path: string;
  method: string;
  description: string;
  auth: boolean;
}

interface ApiInfo {
  version: string;
  title: string;
  description: string;
  documentation: string;
  endpoints: {
    authentication: ApiEndpointInfo[];
    alerts: ApiEndpointInfo[];
    notifications: ApiEndpointInfo[];
    health: ApiEndpointInfo[];
    system: ApiEndpointInfo[];
  };
}

@ApiTags('API Gateway')
@Controller('api')
export class ApiGatewayController {
  @Get()
  @Public()
  @ApiOperation({
    summary: 'Get API information',
    description: 'Returns general information about the API including available endpoints',
  })
  @ApiResponse({
    status: 200,
    description: 'API information',
    schema: {
      type: 'object',
      properties: {
        version: { type: 'string', example: '1.0.0' },
        title: { type: 'string', example: 'XRPL NFT Monitor API' },
        description: { type: 'string' },
        documentation: { type: 'string', example: '/api/docs' },
        endpoints: {
          type: 'object',
          properties: {
            authentication: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  path: { type: 'string' },
                  method: { type: 'string' },
                  description: { type: 'string' },
                  auth: { type: 'boolean' },
                },
              },
            },
            alerts: { type: 'array' },
            notifications: { type: 'array' },
            health: { type: 'array' },
            system: { type: 'array' },
          },
        },
      },
    },
  })
  getApiInfo(): ApiInfo {
    return {
      version: process.env['npm_package_version'] || '1.0.0',
      title: 'XRPL NFT Monitor API',
      description: 'Real-time NFT activity monitoring and alert system for the XRP Ledger',
      documentation: '/api/docs',
      endpoints: {
        authentication: [
          {
            path: '/api/v1/auth/register',
            method: 'POST',
            description: 'Register a new user account',
            auth: false,
          },
          {
            path: '/api/v1/auth/login',
            method: 'POST',
            description: 'Login with email and password',
            auth: false,
          },
          {
            path: '/api/v1/auth/profile',
            method: 'GET',
            description: 'Get current user profile',
            auth: true,
          },
          {
            path: '/api/v1/auth/profile',
            method: 'PUT',
            description: 'Update user profile',
            auth: true,
          },
          {
            path: '/api/v1/auth/change-password',
            method: 'POST',
            description: 'Change user password',
            auth: true,
          },
        ],
        alerts: [
          {
            path: '/api/v1/alerts',
            method: 'GET',
            description: 'List all alert configurations for the user',
            auth: true,
          },
          {
            path: '/api/v1/alerts',
            method: 'POST',
            description: 'Create a new alert configuration',
            auth: true,
          },
          {
            path: '/api/v1/alerts/:id',
            method: 'GET',
            description: 'Get a specific alert configuration',
            auth: true,
          },
          {
            path: '/api/v1/alerts/:id',
            method: 'PUT',
            description: 'Update an alert configuration',
            auth: true,
          },
          {
            path: '/api/v1/alerts/:id',
            method: 'DELETE',
            description: 'Delete an alert configuration',
            auth: true,
          },
          {
            path: '/api/v1/alerts/:id/test',
            method: 'POST',
            description: 'Test an alert configuration',
            auth: true,
          },
        ],
        notifications: [
          {
            path: '/api/v1/notifications',
            method: 'GET',
            description: 'List notification history',
            auth: true,
          },
          {
            path: '/api/v1/notifications/stats',
            method: 'GET',
            description: 'Get notification statistics',
            auth: true,
          },
          {
            path: '/api/v1/notifications/:id',
            method: 'GET',
            description: 'Get a specific notification',
            auth: true,
          },
          {
            path: '/api/v1/notifications/:id/retry',
            method: 'POST',
            description: 'Retry a failed notification',
            auth: true,
          },
        ],
        health: [
          {
            path: '/health',
            method: 'GET',
            description: 'Basic health check',
            auth: false,
          },
          {
            path: '/health/system',
            method: 'GET',
            description: 'Comprehensive system health status',
            auth: false,
          },
          {
            path: '/health/e2e',
            method: 'GET',
            description: 'End-to-end health verification',
            auth: false,
          },
          {
            path: '/health/metrics',
            method: 'GET',
            description: 'System metrics and statistics',
            auth: false,
          },
          {
            path: '/health/live',
            method: 'GET',
            description: 'Kubernetes liveness probe',
            auth: false,
          },
          {
            path: '/health/ready',
            method: 'GET',
            description: 'Kubernetes readiness probe',
            auth: false,
          },
        ],
        system: [
          {
            path: '/api',
            method: 'GET',
            description: 'API information and available endpoints',
            auth: false,
          },
          {
            path: '/api/docs',
            method: 'GET',
            description: 'Interactive API documentation (Swagger UI)',
            auth: false,
          },
          {
            path: '/api/v1/status',
            method: 'GET',
            description: 'System status and version information',
            auth: false,
          },
        ],
      },
    };
  }

  @Get('v1/status')
  @Public()
  @ApiOperation({
    summary: 'Get system status',
    description: 'Returns current system status and version information',
  })
  @ApiResponse({
    status: 200,
    description: 'System status',
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string', example: 'operational' },
        version: { type: 'string', example: '1.0.0' },
        environment: { type: 'string', example: 'production' },
        uptime: { type: 'number', example: 3600000 },
        timestamp: { type: 'string', example: '2024-01-01T00:00:00.000Z' },
      },
    },
  })
  getSystemStatus() {
    return {
      status: 'operational',
      version: process.env['npm_package_version'] || '1.0.0',
      environment: process.env['NODE_ENV'] || 'development',
      uptime: process.uptime() * 1000, // Convert to milliseconds
      timestamp: new Date().toISOString(),
    };
  }
}