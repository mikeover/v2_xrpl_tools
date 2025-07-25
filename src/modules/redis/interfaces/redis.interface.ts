export interface RedisConfig {
  host: string;
  port: number;
  password?: string;
  db?: number;
  keyPrefix?: string;
  ttl?: number; // Default TTL in seconds
  maxRetriesPerRequest?: number;
  enableReadyCheck?: boolean;
  showFriendlyErrorStack?: boolean;
}

export interface RedisClusterConfig {
  nodes: Array<{
    host: string;
    port: number;
  }>;
  options?: {
    redisOptions?: {
      password?: string;
    };
    clusterRetryStrategy?: (times: number) => number | null;
    enableReadyCheck?: boolean;
    scaleReads?: 'master' | 'slave' | 'all';
  };
}

export interface CacheOptions {
  ttl?: number; // TTL in seconds
  refresh?: boolean; // Whether to refresh TTL on get
}

export interface CacheStats {
  hits: number;
  misses: number;
  sets: number;
  deletes: number;
  errors: number;
  hitRate: number;
}

export enum CacheKeys {
  // NFT Metadata
  NFT_METADATA = 'nft:metadata',
  NFT_IMAGE = 'nft:image',
  NFT_COLLECTION = 'nft:collection',
  
  // User-related
  USER_PROFILE = 'user:profile',
  USER_ALERTS = 'user:alerts',
  USER_SETTINGS = 'user:settings',
  
  // Transaction data
  TRANSACTION = 'tx',
  TRANSACTION_BATCH = 'tx:batch',
  
  // Alert matching
  ALERT_MATCH_RESULT = 'alert:match',
  ALERT_CACHE = 'alert:cache',
  
  // System
  XRPL_LEDGER_INFO = 'xrpl:ledger',
  SYSTEM_CONFIG = 'system:config',
  RATE_LIMIT = 'rate:limit',
}