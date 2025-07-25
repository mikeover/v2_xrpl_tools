/**
 * Cache-related type definitions for Redis operations
 * 
 * Provides strongly-typed interfaces for all cached data structures
 * to replace 'any' types throughout the Redis cache service.
 */

// Type imports for reference (not used in interfaces)

/**
 * NFT Metadata structure as stored in cache
 */
export interface CachedNFTMetadata {
  name?: string;
  description?: string;
  image?: string;
  imageUrl?: string;
  external_url?: string;
  attributes?: NFTAttribute[];
  properties?: Record<string, unknown>;
  background_color?: string;
  animation_url?: string;
  youtube_url?: string;
  cached_at: string; // ISO timestamp
  fetched_from?: string; // URI source
}

/**
 * NFT Attribute structure
 */
export interface NFTAttribute {
  trait_type: string;
  value: string | number | boolean;
  display_type?: 'boost_number' | 'boost_percentage' | 'number' | 'date';
  max_value?: number;
}

/**
 * Cached User Alerts structure
 */
export interface CachedUserAlerts {
  userId: string;
  alerts: CachedAlertConfig[];
  cached_at: string; // ISO timestamp
  total_count: number;
}

/**
 * Simplified Alert Config for caching
 */
export interface CachedAlertConfig {
  id: string;
  name: string;
  collectionId?: string;
  activityTypes: string[];
  minPriceDrops?: string;
  maxPriceDrops?: string;
  traitFilters?: CachedTraitFilter[];
  notificationChannels: CachedNotificationChannels;
  isActive: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * Cached Trait Filter structure
 */
export interface CachedTraitFilter {
  traitType: string;
  operator: 'equals' | 'not_equals' | 'greater_than' | 'less_than' | 'contains';
  value: string | number;
}

/**
 * Cached Notification Channels
 */
export interface CachedNotificationChannels {
  email?: {
    enabled: boolean;
  };
  discord?: {
    enabled: boolean;
    webhookUrl?: string;
  };
  webhook?: {
    enabled: boolean;
    url?: string;
    headers?: Record<string, string>;
  };
}

/**
 * Cached Transaction Data structure
 */
export interface CachedTransactionData {
  transactionHash: string;
  ledgerIndex: number;
  timestamp: string; // ISO timestamp
  activityType: string;
  fromAddress?: string;
  toAddress?: string;
  nftTokenID?: string;
  priceDrops?: string;
  currency?: string;
  issuer?: string;
  metadata: CachedTransactionMetadata;
  cached_at: string; // ISO timestamp
}

/**
 * Cached Transaction Metadata
 */
export interface CachedTransactionMetadata {
  transactionType: string;
  fee: string;
  flags: number;
  engineResult: string;
  taxon?: number;
  transferFee?: number;
  uri?: string;
  offerSequence?: number;
}

/**
 * Collection Statistics cache structure
 */
export interface CachedCollectionStats {
  collectionId: string;
  totalSupply: number;
  floorPrice?: string;
  volume24h?: string;
  volume7d?: string;
  volume30d?: string;
  averagePrice?: string;
  uniqueOwners: number;
  totalSales: number;
  cached_at: string; // ISO timestamp
}

/**
 * Market Activity cache structure
 */
export interface CachedMarketActivity {
  activityId: string;
  type: 'mint' | 'sale' | 'offer' | 'transfer' | 'burn';
  nftTokenId: string;
  collectionId?: string;
  price?: string;
  currency?: string;
  fromAddress?: string;
  toAddress?: string;
  timestamp: string; // ISO timestamp
  transactionHash: string;
  cached_at: string; // ISO timestamp
}

/**
 * Cache key generators with proper typing
 */
export interface CacheKeyGenerators {
  nftMetadata: (nftId: string) => string;
  userAlerts: (userId: string) => string;
  transaction: (txHash: string) => string;
  collectionStats: (collectionId: string) => string;
  marketActivity: (activityId: string) => string;
  trendingCollections: () => string;
  userFavorites: (userId: string) => string;
}

/**
 * Cache operation options
 */
export interface CacheOptions {
  ttl?: number; // Time to live in seconds
  refresh?: boolean; // Force refresh from source
  compress?: boolean; // Enable compression for large data
}

/**
 * Cache warming configuration
 */
export interface CacheWarmingConfig {
  enabled: boolean;
  intervals: {
    collections: number; // seconds
    userAlerts: number; // seconds
    marketActivity: number; // seconds
  };
  batchSizes: {
    collections: number;
    userAlerts: number;
    marketActivity: number;
  };
}

/**
 * Cache statistics
 */
export interface CacheStats {
  hitRate: number;
  missRate: number;
  totalOperations: number;
  totalHits: number;
  totalMisses: number;
  averageResponseTime: number; // milliseconds
  memoryUsage?: number; // bytes
  keyCount: number;
}

/**
 * Cache health check result
 */
export interface CacheHealthCheck {
  status: 'healthy' | 'degraded' | 'unhealthy';
  latency: number; // milliseconds
  memoryUsage?: number; // bytes
  connectedClients?: number;
  operationsPerSecond?: number;
  lastCheck: string; // ISO timestamp
  errors?: string[];
}