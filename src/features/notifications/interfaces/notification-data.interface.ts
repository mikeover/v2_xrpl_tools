/**
 * Notification Data Type Definitions
 * 
 * Provides strongly-typed interfaces for notification payloads,
 * channels, and metadata to replace 'any' types in the notification system.
 */

/**
 * Base notification data structure
 */
export interface BaseNotificationData {
  id: string;
  type: NotificationType;
  timestamp: string; // ISO timestamp
  userId: string;
  title: string;
  message: string;
  priority: NotificationPriority;
  read: boolean;
  channels: NotificationChannelType[];
}

/**
 * Notification types
 */
export enum NotificationType {
  NFT_MINT = 'nft_mint',
  NFT_SALE = 'nft_sale',
  NFT_OFFER = 'nft_offer',
  PRICE_ALERT = 'price_alert',
  TRAIT_ALERT = 'trait_alert',
  COLLECTION_ACTIVITY = 'collection_activity',
  SYSTEM_ALERT = 'system_alert',
  USER_MENTION = 'user_mention',
  MARKET_UPDATE = 'market_update',
}

/**
 * Notification priority levels
 */
export enum NotificationPriority {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

/**
 * Notification channel types
 */
export enum NotificationChannelType {
  EMAIL = 'email',
  DISCORD = 'discord',
  WEBHOOK = 'webhook',
  IN_APP = 'in_app',
  SMS = 'sms',
  PUSH = 'push',
}

/**
 * NFT Activity Notification Data
 */
export interface NFTActivityNotificationData extends BaseNotificationData {
  type: NotificationType.NFT_MINT | NotificationType.NFT_SALE | NotificationType.NFT_OFFER;
  nftData: {
    nftTokenId: string;
    name?: string;
    description?: string;
    imageUrl?: string;
    collectionName?: string;
    collectionId?: string;
    traits?: Record<string, string | number>;
  };
  activityData: {
    transactionHash: string;
    ledgerIndex: number;
    activityType: 'mint' | 'sale' | 'offer' | 'transfer' | 'burn';
    fromAddress?: string;
    toAddress?: string;
    price?: {
      amount: string;
      currency: string;
      usdValue?: number;
    };
  };
  alertConfig: {
    alertId: string;
    alertName: string;
    matchedCriteria: string[];
  };
}

/**
 * Price Alert Notification Data
 */
export interface PriceAlertNotificationData extends BaseNotificationData {
  type: NotificationType.PRICE_ALERT;
  priceData: {
    currentPrice: string;
    previousPrice?: string;
    priceChange?: {
      absolute: string;
      percentage: number;
    };
    currency: string;
    usdValue?: number;
  };
  thresholdData: {
    alertType: 'above' | 'below' | 'change';
    thresholdValue: string;
    timeframe?: string;
  };
  assetData: {
    type: 'nft' | 'collection' | 'token';
    id: string;
    name?: string;
    imageUrl?: string;
  };
}

/**
 * Collection Activity Notification Data
 */
export interface CollectionActivityNotificationData extends BaseNotificationData {
  type: NotificationType.COLLECTION_ACTIVITY;
  collectionData: {
    id: string;
    name: string;
    imageUrl?: string;
    floorPrice?: string;
    volume24h?: string;
  };
  activitySummary: {
    totalActivities: number;
    sales: number;
    mints: number;
    offers: number;
    timeframe: string; // e.g., "last_24h", "last_1h"
  };
  highlights: CollectionActivityHighlight[];
}

/**
 * Collection activity highlight
 */
export interface CollectionActivityHighlight {
  type: 'high_sale' | 'rare_mint' | 'price_spike' | 'volume_surge';
  description: string;
  value?: string;
  percentage?: number;
  nftTokenId?: string;
  transactionHash?: string;
}

/**
 * System Alert Notification Data
 */
export interface SystemAlertNotificationData extends BaseNotificationData {
  type: NotificationType.SYSTEM_ALERT;
  alertData: {
    severity: 'info' | 'warning' | 'error' | 'critical';
    category: 'maintenance' | 'security' | 'performance' | 'feature' | 'outage';
    affectedServices?: string[];
    estimatedResolution?: string; // ISO timestamp
    actionRequired?: boolean;
    actionUrl?: string;
  };
  systemData: {
    component: string;
    status: 'operational' | 'degraded' | 'down' | 'maintenance';
    metrics?: Record<string, number>;
  };
}

/**
 * Market Update Notification Data
 */
export interface MarketUpdateNotificationData extends BaseNotificationData {
  type: NotificationType.MARKET_UPDATE;
  marketData: {
    timeframe: '1h' | '24h' | '7d' | '30d';
    totalVolume: string;
    volumeChange: {
      absolute: string;
      percentage: number;
    };
    averagePrice: string;
    totalSales: number;
    activeCollections: number;
  };
  trends: MarketTrend[];
  topCollections: TopCollectionSummary[];
}

/**
 * Market trend data
 */
export interface MarketTrend {
  metric: 'volume' | 'price' | 'sales' | 'listings';
  direction: 'up' | 'down' | 'stable';
  percentage: number;
  description: string;
}

/**
 * Top collection summary
 */
export interface TopCollectionSummary {
  id: string;
  name: string;
  volume: string;
  volumeChange: number;
  floorPrice: string;
  sales: number;
}

/**
 * Notification Channel Configuration
 */
export interface NotificationChannelConfig {
  type: NotificationChannelType;
  enabled: boolean;
  settings: EmailChannelSettings | DiscordChannelSettings | WebhookChannelSettings | InAppChannelSettings;
}

/**
 * Email channel settings
 */
export interface EmailChannelSettings {
  address: string;
  frequency?: 'immediate' | 'hourly' | 'daily';
  htmlFormat?: boolean;
  unsubscribeUrl?: string;
}

/**
 * Discord channel settings
 */
export interface DiscordChannelSettings {
  webhookUrl: string;
  username?: string;
  avatarUrl?: string;
  mentionRole?: string;
  embedColor?: string;
}

/**
 * Webhook channel settings
 */
export interface WebhookChannelSettings {
  url: string;
  method?: 'POST' | 'PUT';
  headers?: Record<string, string>;
  authentication?: {
    type: 'bearer' | 'basic' | 'api_key';
    token?: string;
    username?: string;
    password?: string;
    apiKey?: string;
    apiKeyHeader?: string;
  };
  retryConfig?: {
    maxRetries: number;
    backoffMs: number;
  };
}

/**
 * In-app channel settings
 */
export interface InAppChannelSettings {
  showToast?: boolean;
  playSound?: boolean;
  persistInInbox?: boolean;
  autoRead?: boolean;
  autoReadDelayMs?: number;
}

/**
 * Notification delivery status
 */
export interface NotificationDeliveryStatus {
  channel: NotificationChannelType;
  status: 'pending' | 'sent' | 'delivered' | 'failed' | 'bounced';
  timestamp: string; // ISO timestamp
  attempts: number;
  lastError?: string;
  deliveryId?: string; // External service delivery ID
}

/**
 * Notification batch for bulk operations
 */
export interface NotificationBatch {
  id: string;
  notifications: BaseNotificationData[];
  batchType: 'user_digest' | 'system_broadcast' | 'alert_batch';
  scheduledFor?: string; // ISO timestamp
  priority: NotificationPriority;
  estimatedDeliveryTime: string; // ISO timestamp
}

/**
 * Notification template data
 */
export interface NotificationTemplate {
  id: string;
  name: string;
  type: NotificationType;
  channels: NotificationChannelType[];
  template: {
    subject?: string; // For email
    title: string;
    body: string;
    htmlBody?: string; // For email
    embedTemplate?: DiscordEmbedTemplate; // For Discord
  };
  variables: string[]; // Available template variables
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * Discord embed template
 */
export interface DiscordEmbedTemplate {
  title?: string;
  description?: string;
  color?: number;
  author?: {
    name: string;
    iconUrl?: string;
    url?: string;
  };
  thumbnail?: {
    url: string;
  };
  image?: {
    url: string;
  };
  fields?: Array<{
    name: string;
    value: string;
    inline?: boolean;
  }>;
  footer?: {
    text: string;
    iconUrl?: string;
  };
  timestamp?: boolean;
}

/**
 * Notification preferences for a user
 */
export interface UserNotificationPreferences {
  userId: string;
  globalEnabled: boolean;
  channels: NotificationChannelConfig[];
  typePreferences: Record<NotificationType, {
    enabled: boolean;
    channels: NotificationChannelType[];
    frequency?: 'immediate' | 'batched' | 'digest';
  }>;
  quietHours?: {
    enabled: boolean;
    start: string; // HH:mm format
    end: string; // HH:mm format
    timezone: string;
  };
  digestSettings?: {
    frequency: 'daily' | 'weekly';
    dayOfWeek?: number; // 0-6, Sunday=0
    hour: number; // 0-23
    timezone: string;
  };
}

/**
 * Union type for all notification data types
 */
export type NotificationData = 
  | NFTActivityNotificationData
  | PriceAlertNotificationData
  | CollectionActivityNotificationData
  | SystemAlertNotificationData
  | MarketUpdateNotificationData;