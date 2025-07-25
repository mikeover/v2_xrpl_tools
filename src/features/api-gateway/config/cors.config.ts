import { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';
import { ConfigService } from '@nestjs/config';
import { AppConfiguration } from '../../../shared/config';

export const getCorsConfig = (configService: ConfigService<AppConfiguration>): CorsOptions => {
  const appConfig = configService.get<AppConfiguration['app']>('app');
  const env = appConfig?.env ?? 'development';
  
  // Get allowed origins from config or use defaults
  const allowedOrigins: string[] = [];

  // Default allowed origins based on environment
  const defaultOrigins = env === 'production'
    ? [
        'https://app.xrplmonitor.com',
        'https://xrplmonitor.com',
        'https://www.xrplmonitor.com',
      ]
    : [
        'http://localhost:3000',
        'http://localhost:3001',
        'http://localhost:4200',
        'http://localhost:8080',
        'http://127.0.0.1:3000',
      ];

  const origins = allowedOrigins.length > 0 ? allowedOrigins : defaultOrigins;

  return {
    origin: (origin, callback) => {
      // Allow requests with no origin (e.g., mobile apps, Postman)
      if (!origin) {
        return callback(null, true);
      }

      // Check if origin is allowed
      if (origins.includes(origin) || origins.includes('*')) {
        return callback(null, true);
      }

      // In development, allow all origins
      if (env === 'development') {
        return callback(null, true);
      }

      // Origin not allowed
      callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-API-Key',
      'X-Webhook-Secret',
      'X-Requested-With',
      'Accept',
      'Origin',
    ],
    exposedHeaders: [
      'X-RateLimit-Limit',
      'X-RateLimit-Remaining',
      'X-RateLimit-Reset',
      'X-Request-ID',
    ],
    maxAge: 86400, // 24 hours
  };
};