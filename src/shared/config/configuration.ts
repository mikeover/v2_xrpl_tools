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
  };
  xrpl: {
    wssUrls: string[];
    network: string;
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
    },
    xrpl: {
      wssUrls: (process.env['XRPL_WSS_URLS'] || '').split(',').filter(Boolean),
      network: process.env['XRPL_NETWORK'] || 'mainnet',
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
  };
};