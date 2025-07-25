export interface AppConfiguration {
  app: {
    env: string;
    port: number;
    isDevelopment: boolean;
    isProduction: boolean;
  };
  database: {
    host: string;
    port: number;
    username: string;
    password: string;
    name: string;
  };
  redis: {
    host: string;
    port: number;
    password?: string | undefined;
    db?: number | undefined;
    keyPrefix?: string | undefined;
    ttl?: number | undefined;
    maxRetriesPerRequest?: number | undefined;
    cluster?: {
      enabled: boolean;
      nodes: Array<{
        host: string;
        port: number;
      }>;
    } | undefined;
  };
  xrpl: {
    nodes: Array<{
      url: string;
      priority?: number | undefined;
    }>;
    network: string;
    reconnectInterval?: number | undefined;
    maxReconnectAttempts?: number | undefined;
    healthCheckInterval?: number | undefined;
    connectionTimeout?: number | undefined;
    maxConsecutiveFailures?: number | undefined;
  };
  aws: {
    region: string;
    accessKeyId?: string | undefined;
    secretAccessKey?: string | undefined;
    s3BucketName?: string | undefined;
  };
  jwt: {
    secret: string;
    expiration: string;
    expiresIn?: string;
    refreshTokenSecret?: string;
    refreshTokenExpiresIn?: string;
  };
  security: {
    bcryptSaltRounds?: number;
    throttler?: {
      ttl: number;
      limit: number;
      authTtl?: number;
      authLimit?: number;
    };
  };
  discord: {
    webhookUrl?: string | undefined;
  };
  email: {
    from?: string | undefined;
    sendgridApiKey?: string | undefined;
  };
  logging: {
    level: string;
  };
  queue: {
    url: string;
    prefetchCount?: number | undefined;
  };
}

export const configuration = (): AppConfiguration => {
  const nodeEnv = process.env['NODE_ENV'] || 'development';

  return {
    app: {
      env: nodeEnv,
      port: parseInt(process.env['PORT'] || '3110', 10),
      isDevelopment: nodeEnv === 'development',
      isProduction: nodeEnv === 'production',
    },
    database: {
      host: process.env['DATABASE_HOST'] || 'localhost',
      port: parseInt(process.env['DATABASE_PORT'] || '5432', 10),
      username: process.env['DATABASE_USERNAME'] || 'postgres',
      password: process.env['DATABASE_PASSWORD'] || 'postgres',
      name: process.env['DATABASE_NAME'] || 'xrpl_nft_monitor',
    },
    redis: {
      host: process.env['REDIS_HOST'] || 'localhost',
      port: parseInt(process.env['REDIS_PORT'] || '6379', 10),
      password: process.env['REDIS_PASSWORD'],
      db: process.env['REDIS_DB'] ? parseInt(process.env['REDIS_DB'], 10) : undefined,
      keyPrefix: process.env['REDIS_KEY_PREFIX'] || 'xrpl:',
      ttl: process.env['REDIS_TTL'] ? parseInt(process.env['REDIS_TTL'], 10) : undefined,
      maxRetriesPerRequest: process.env['REDIS_MAX_RETRIES'] 
        ? parseInt(process.env['REDIS_MAX_RETRIES'], 10) 
        : undefined,
      cluster: process.env['REDIS_CLUSTER_ENABLED'] === 'true'
        ? {
            enabled: true,
            nodes: process.env['REDIS_CLUSTER_NODES']
              ? process.env['REDIS_CLUSTER_NODES']
                  .split(',')
                  .map(node => {
                    const [host, port] = node.split(':');
                    return {
                      host: host ? host.trim() : 'localhost',
                      port: parseInt(port || '6379', 10),
                    };
                  })
              : [],
          }
        : undefined,
    },
    xrpl: {
      nodes: process.env['XRPL_WSS_URLS']
        ? process.env['XRPL_WSS_URLS']
            .split(',')
            .filter(Boolean)
            .map((url, index) => ({
              url: url.trim(),
              priority: index + 1,
            }))
        : [],
      network: process.env['XRPL_NETWORK'] || 'mainnet',
      reconnectInterval: process.env['XRPL_RECONNECT_INTERVAL']
        ? parseInt(process.env['XRPL_RECONNECT_INTERVAL'], 10)
        : undefined,
      maxReconnectAttempts: process.env['XRPL_MAX_RECONNECT_ATTEMPTS']
        ? parseInt(process.env['XRPL_MAX_RECONNECT_ATTEMPTS'], 10)
        : undefined,
      healthCheckInterval: process.env['XRPL_HEALTH_CHECK_INTERVAL']
        ? parseInt(process.env['XRPL_HEALTH_CHECK_INTERVAL'], 10)
        : undefined,
      connectionTimeout: process.env['XRPL_CONNECTION_TIMEOUT']
        ? parseInt(process.env['XRPL_CONNECTION_TIMEOUT'], 10)
        : undefined,
      maxConsecutiveFailures: process.env['XRPL_MAX_CONSECUTIVE_FAILURES']
        ? parseInt(process.env['XRPL_MAX_CONSECUTIVE_FAILURES'], 10)
        : undefined,
    },
    aws: {
      region: process.env['AWS_REGION'] || 'us-east-1',
      accessKeyId: process.env['AWS_ACCESS_KEY_ID'],
      secretAccessKey: process.env['AWS_SECRET_ACCESS_KEY'],
      s3BucketName: process.env['S3_BUCKET_NAME'],
    },
    jwt: {
      secret: process.env['JWT_SECRET'] || 'default-secret',
      expiration: process.env['JWT_EXPIRATION'] || '7d',
      expiresIn: process.env['JWT_EXPIRATION'] || '7d',
      ...(process.env['JWT_REFRESH_TOKEN_SECRET'] && { refreshTokenSecret: process.env['JWT_REFRESH_TOKEN_SECRET'] }),
      ...(process.env['JWT_REFRESH_TOKEN_EXPIRATION'] && { refreshTokenExpiresIn: process.env['JWT_REFRESH_TOKEN_EXPIRATION'] }),
    },
    security: {
      ...(process.env['BCRYPT_SALT_ROUNDS'] && { 
        bcryptSaltRounds: parseInt(process.env['BCRYPT_SALT_ROUNDS'], 10)
      }),
      throttler: {
        ttl: parseInt(process.env['THROTTLE_TTL'] || '60000', 10), // 1 minute
        limit: parseInt(process.env['THROTTLE_LIMIT'] || '100', 10), // 100 requests per minute
        authTtl: parseInt(process.env['AUTH_THROTTLE_TTL'] || '60000', 10), // 1 minute
        authLimit: parseInt(process.env['AUTH_THROTTLE_LIMIT'] || '5', 10), // 5 auth requests per minute
      },
    },
    discord: {
      webhookUrl: process.env['DISCORD_WEBHOOK_URL'],
    },
    email: {
      from: process.env['EMAIL_FROM'],
      sendgridApiKey: process.env['SENDGRID_API_KEY'],
    },
    logging: {
      level: process.env['LOG_LEVEL'] || 'info',
    },
    queue: {
      url: process.env['RABBITMQ_URL'] || 'amqp://rabbitmq:rabbitmq@localhost:5672',
      prefetchCount: process.env['RABBITMQ_PREFETCH_COUNT']
        ? parseInt(process.env['RABBITMQ_PREFETCH_COUNT'], 10)
        : undefined,
    },
  };
};
