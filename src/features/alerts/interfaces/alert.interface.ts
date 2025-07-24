export interface NotificationChannel {
  type: 'discord' | 'email' | 'webhook';
  enabled: boolean;
  config?: {
    discordWebhookUrl?: string;
    email?: string;
    webhookUrl?: string;
    webhookHeaders?: Record<string, string>;
  };
}

export interface TraitFilter {
  traitType: string;
  value: string | number;
  operator: 'equals' | 'not_equals' | 'greater_than' | 'less_than' | 'contains';
}

export interface AlertConfigResponse {
  id: string;
  userId: string;
  name: string;
  collectionId?: string;
  activityTypes: string[];
  minPriceDrops?: string;
  maxPriceDrops?: string;
  traitFilters?: TraitFilter[];
  notificationChannels: NotificationChannel[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  // Optional collection info when populated
  collection?: {
    id: string;
    name?: string;
    issuerAddress: string;
    taxon: number;
  };
}

export interface AlertConfigSummary {
  id: string;
  name: string;
  collectionName?: string;
  activityTypes: string[];
  isActive: boolean;
  createdAt: Date;
  notificationCount: number;
}

export interface AlertMatchResult {
  alertConfigId: string;
  matched: boolean;
  reasons?: string[];
}

export interface AlertStats {
  totalAlerts: number;
  activeAlerts: number;
  inactiveAlerts: number;
  totalNotificationsSent: number;
  alertsByActivityType: Record<string, number>;
}