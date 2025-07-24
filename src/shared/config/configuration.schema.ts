import * as Joi from 'joi';

export const configurationSchema = Joi.object({
  // Task Master API Keys (optional for our app)
  ANTHROPIC_API_KEY: Joi.string().optional(),
  PERPLEXITY_API_KEY: Joi.string().optional(),
  OPENAI_API_KEY: Joi.string().optional(),
  GITHUB_API_KEY: Joi.string().optional(),

  // Application
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test', 'staging')
    .default('development'),
  PORT: Joi.number().default(3110),

  // Database
  DATABASE_HOST: Joi.string().required(),
  DATABASE_PORT: Joi.number().default(5432),
  DATABASE_USERNAME: Joi.string().required(),
  DATABASE_PASSWORD: Joi.string().required(),
  DATABASE_NAME: Joi.string().required(),

  // Redis
  REDIS_HOST: Joi.string().default('localhost'),
  REDIS_PORT: Joi.number().default(6379),
  REDIS_PASSWORD: Joi.string().allow('').default(''),

  // XRPL Configuration
  XRPL_WSS_URLS: Joi.string().required(),
  XRPL_NETWORK: Joi.string().valid('mainnet', 'testnet', 'devnet').default('mainnet'),
  XRPL_RECONNECT_INTERVAL: Joi.number().min(1000).optional(),
  XRPL_MAX_RECONNECT_ATTEMPTS: Joi.number().min(1).optional(),
  XRPL_HEALTH_CHECK_INTERVAL: Joi.number().min(5000).optional(),
  XRPL_CONNECTION_TIMEOUT: Joi.number().min(1000).optional(),
  XRPL_MAX_CONSECUTIVE_FAILURES: Joi.number().min(1).optional(),

  // AWS S3
  AWS_REGION: Joi.string().default('us-east-1'),
  AWS_ACCESS_KEY_ID: Joi.string().allow('').optional(),
  AWS_SECRET_ACCESS_KEY: Joi.string().allow('').optional(),
  S3_BUCKET_NAME: Joi.string().optional(),

  // JWT
  JWT_SECRET: Joi.string().required(),
  JWT_EXPIRATION: Joi.string().default('7d'),

  // Discord
  DISCORD_WEBHOOK_URL: Joi.string().uri().allow('').optional(),

  // Email
  EMAIL_FROM: Joi.string().email().optional(),
  SENDGRID_API_KEY: Joi.string().allow('').optional(),

  // Logging
  LOG_LEVEL: Joi.string().valid('error', 'warn', 'info', 'debug', 'verbose').default('info'),

  // RabbitMQ
  RABBITMQ_URL: Joi.string()
    .uri({ scheme: ['amqp', 'amqps'] })
    .default('amqp://localhost'),
  RABBITMQ_PREFETCH_COUNT: Joi.number().min(1).optional(),
});
