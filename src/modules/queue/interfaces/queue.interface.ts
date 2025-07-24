export interface QueueOptions {
  durable?: boolean;
  arguments?: Record<string, any>;
}

export interface ExchangeOptions {
  durable?: boolean;
  autoDelete?: boolean;
  arguments?: Record<string, any>;
}

export interface PublishOptions {
  persistent?: boolean;
  priority?: number;
  expiration?: string;
  messageId?: string;
  timestamp?: number;
  correlationId?: string;
  replyTo?: string;
  headers?: Record<string, any>;
}

export interface ConsumeOptions {
  noAck?: boolean;
  exclusive?: boolean;
  priority?: number;
  arguments?: Record<string, any>;
}

export interface QueueConfig {
  url: string;
  exchanges: {
    xrpl: string;
    notifications: string;
    deadLetter: string;
  };
  queues: {
    ledgerEvents: string;
    transactionEvents: string;
    nftEvents: string;
    notifications: string;
    deadLetter: string;
  };
  routingKeys: {
    ledgerClosed: string;
    transactionValidated: string;
    nftActivity: string;
    notification: string;
  };
  retryAttempts: number;
  retryDelay: number;
  prefetchCount: number;
}

export enum EventType {
  LEDGER_CLOSED = 'ledger.closed',
  TRANSACTION_VALIDATED = 'transaction.validated',
  NFT_MINTED = 'nft.minted',
  NFT_BURNED = 'nft.burned',
  NFT_OFFER_CREATED = 'nft.offer.created',
  NFT_OFFER_CANCELLED = 'nft.offer.cancelled',
  NFT_OFFER_ACCEPTED = 'nft.offer.accepted',
  NOTIFICATION_SEND = 'notification.send',
}

export interface BaseEvent {
  eventId: string;
  eventType: EventType;
  timestamp: Date;
  correlationId?: string;
  metadata?: Record<string, any>;
}

export interface LedgerEvent extends BaseEvent {
  eventType: EventType.LEDGER_CLOSED;
  data: {
    ledgerIndex: number;
    ledgerHash: string;
    ledgerTime: number;
    txnCount: number;
    validatedLedgerIndex: number;
  };
}

export interface TransactionEvent extends BaseEvent {
  eventType: EventType.TRANSACTION_VALIDATED;
  data: {
    transaction: any;
    meta: any;
    ledgerIndex: number;
    ledgerHash: string;
    validated: boolean;
  };
}

export interface NFTEvent extends BaseEvent {
  eventType:
    | EventType.NFT_MINTED
    | EventType.NFT_BURNED
    | EventType.NFT_OFFER_CREATED
    | EventType.NFT_OFFER_CANCELLED
    | EventType.NFT_OFFER_ACCEPTED;
  data: {
    nftokenId: string;
    issuer?: string;
    owner?: string;
    buyer?: string;
    seller?: string;
    amount?: string;
    currency?: string;
    transactionHash: string;
    ledgerIndex: number;
    metadata?: any;
  };
}

export type QueueEvent = LedgerEvent | TransactionEvent | NFTEvent;
