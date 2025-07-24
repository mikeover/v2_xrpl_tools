export interface NFTMetadata {
  name?: string;
  description?: string;
  image?: string;
  external_url?: string;
  attributes?: NFTAttribute[];
  properties?: Record<string, any>;
  animation_url?: string;
  youtube_url?: string;
  // Standard fields
  [key: string]: any;
}

export interface NFTAttribute {
  trait_type: string;
  value: string | number;
  display_type?: string;
}

export interface MetadataFetchResult {
  metadata: NFTMetadata | null;
  cached: boolean;
  source: 'ipfs' | 'http' | 'cache' | 'error';
  error?: string;
  fetchedAt: Date;
}

export interface CachedMetadata {
  nftTokenId: string;
  metadata: NFTMetadata;
  originalUri: string;
  s3Key: string;
  cachedAt: Date;
  lastAccessed: Date;
}