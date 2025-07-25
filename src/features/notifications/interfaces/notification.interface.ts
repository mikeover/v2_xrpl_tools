export interface NotificationChannel {
  type: 'discord' | 'email' | 'webhook';
  enabled: boolean;
  config: DiscordWebhookConfig | EmailConfig | WebhookConfig;
}

export interface DiscordWebhookConfig {
  webhookUrl: string;
  username?: string;
  avatarUrl?: string;
  mentionUsers?: string[];
  mentionRoles?: string[];
}

export interface EmailConfig {
  recipients: string[];
  subject?: string;
  template?: string;
}

export interface WebhookConfig {
  url: string;
  method: 'POST' | 'PUT' | 'PATCH';
  headers?: Record<string, string>;
  auth?: {
    type: 'bearer' | 'basic' | 'api-key';
    token?: string;
    username?: string;
    password?: string;
    headerName?: string;
  };
}

export interface NotificationPayload {
  id: string;
  userId: string;
  alertConfigId: string;
  activityId: string;
  channel: NotificationChannel;
  data: NFTActivityNotificationData;
  scheduledAt: Date;
  retryCount: number;
  maxRetries: number;
}

export interface NFTActivityNotificationData {
  activityType: string;
  transactionHash: string;
  ledgerIndex: number;
  timestamp: Date;
  fromAddress?: string;
  toAddress?: string;
  priceDrops?: string;
  currency?: string;
  issuer?: string;
  nft?: {
    id: string;
    nftId: string;
    ownerAddress: string;
    metadata?: any;
    imageUrl?: string;
    collection?: {
      id: string;
      name?: string;
      issuerAddress: string;
      taxon: number;
    };
  };
}

export interface NotificationResult {
  success: boolean;
  messageId?: string;
  error?: string;
  retryAfter?: number;
}

export interface NotificationTemplate {
  title: string;
  description: string;
  color?: number;
  fields?: Array<{
    name: string;
    value: string;
    inline?: boolean;
  }>;
  thumbnail?: {
    url: string;
  };
  timestamp?: string;
  footer?: {
    text: string;
    icon_url?: string;
  };
}