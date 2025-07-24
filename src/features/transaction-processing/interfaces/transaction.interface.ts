export interface NFTTransactionData {
  transactionHash: string;
  ledgerIndex: number;
  timestamp: Date;
  activityType: NFTActivityType;
  nftTokenID?: string;
  fromAddress?: string;
  toAddress?: string;
  priceDrops?: string;
  currency?: string;
  issuer?: string;
  metadata?: Record<string, any>;
}

export interface ProcessedTransaction {
  id: string;
  processed: boolean;
  processedAt?: Date;
  errors?: string[];
}

export interface TransactionBatch {
  transactions: NFTTransactionData[];
  batchSize: number;
  createdAt: Date;
}

export interface DeduplicationKey {
  transactionHash: string;
  ledgerIndex: number;
}

export enum NFTActivityType {
  MINT = 'mint',
  BURN = 'burn',
  SALE = 'sale',
  OFFER_CREATED = 'offer_created',
  OFFER_ACCEPTED = 'offer_accepted',
  OFFER_CANCELLED = 'offer_cancelled',
  TRANSFER = 'transfer',
}

export const NFT_TRANSACTION_TYPES = [
  'NFTokenMint',
  'NFTokenBurn',
  'NFTokenCreateOffer',
  'NFTokenAcceptOffer',
  'NFTokenCancelOffer',
  'Payment', // Can include NFT transfers
  'OfferCreate', // Can be NFT-related
  'OfferCancel', // Can be NFT-related
] as const;

export type NFTTransactionType = (typeof NFT_TRANSACTION_TYPES)[number];