/**
 * Raw Metadata Type Definitions
 * 
 * Provides strongly-typed interfaces for raw metadata from various sources
 * (IPFS, HTTP, on-chain) to replace 'any' types in metadata services.
 */

/**
 * Raw metadata structure as received from external sources
 * This represents the unvalidated, raw format that needs normalization
 */
export interface RawNFTMetadata {
  // Core metadata fields (ERC-721/ERC-1155 standard)
  name?: string;
  description?: string;
  image?: string;
  external_url?: string;
  animation_url?: string;
  youtube_url?: string;
  background_color?: string;
  
  // Attributes can be in various formats
  attributes?: RawAttribute[] | Record<string, unknown>;
  traits?: RawAttribute[] | Record<string, unknown>;
  properties?: Record<string, unknown>;
  
  // XRPL-specific fields
  schema?: string;
  nftSerial?: number;
  
  // Common variations and extensions
  image_url?: string; // Alternative naming
  imageUrl?: string;  // Alternative naming
  external_link?: string; // Alternative naming
  home_url?: string; // Alternative naming
  
  // Collection-level metadata
  collection?: {
    name?: string;
    description?: string;
    image?: string;
    external_url?: string;
    banner_image?: string;
    featured_image?: string;
    large_image?: string;
  };
  
  // OpenSea extensions
  opensea?: {
    external_url?: string;
    image_url?: string;
    description?: string;
    name?: string;
    attributes?: RawAttribute[];
  };
  
  // Other marketplace extensions
  rarible?: {
    external_url?: string;
    image?: string;
    animation_url?: string;
  };
  
  // Any additional unknown fields
  [key: string]: unknown;
}

/**
 * Raw attribute structure with various possible formats
 */
export interface RawAttribute {
  // Standard format
  trait_type?: string;
  value?: string | number | boolean;
  display_type?: string;
  max_value?: number;
  
  // Alternative formats
  name?: string;        // Some use 'name' instead of 'trait_type'
  type?: string;        // Some use 'type' instead of 'trait_type'
  property?: string;    // Some use 'property' instead of 'trait_type'
  key?: string;         // Some use 'key' instead of 'trait_type'
  
  // Value alternatives
  val?: string | number | boolean;  // Some use 'val' instead of 'value'
  data?: string | number | boolean; // Some use 'data' instead of 'value'
  
  // Additional fields
  rarity?: number;
  frequency?: number;
  percentage?: number;
  
  // Any additional unknown fields
  [key: string]: unknown;
}

/**
 * Normalized metadata after validation and processing
 */
export interface NormalizedNFTMetadata {
  name?: string;
  description?: string;
  image?: string;
  external_url?: string;
  animation_url?: string;
  youtube_url?: string;
  background_color?: string;
  attributes: NormalizedAttribute[];
  properties: Record<string, unknown>;
  collection?: {
    name?: string;
    description?: string;
    image?: string;
    external_url?: string;
  };
  // Validation metadata
  normalized_at: string; // ISO timestamp
  source_format: 'standard' | 'opensea' | 'rarible' | 'custom';
  validation_errors?: string[];
  validation_warnings?: string[];
}

/**
 * Normalized attribute structure
 */
export interface NormalizedAttribute {
  trait_type: string;
  value: string | number | boolean;
  display_type?: 'boost_number' | 'boost_percentage' | 'number' | 'date' | 'string';
  max_value?: number;
  rarity?: number;
  frequency?: number;
}

/**
 * Metadata validation result
 */
export interface MetadataValidationResult {
  isValid: boolean;
  normalized: NormalizedNFTMetadata | null;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  sourceFormat: 'standard' | 'opensea' | 'rarible' | 'custom' | 'unknown';
  processingTime: number; // milliseconds
}

/**
 * Validation error details
 */
export interface ValidationError {
  field: string;
  message: string;
  severity: 'error' | 'warning';
  code: string;
}

/**
 * Validation warning details
 */
export interface ValidationWarning {
  field: string;
  message: string;
  suggestion?: string;
  code: string;
}

/**
 * Metadata fetching configuration
 */
export interface MetadataFetchConfig {
  timeout: number; // milliseconds
  maxSize: number; // bytes
  allowedMimeTypes: string[];
  followRedirects: boolean;
  maxRedirects: number;
  retryAttempts: number;
  retryDelay: number; // milliseconds
  validateSchema: boolean;
  cacheResult: boolean;
  cacheTtl: number; // seconds
}

/**
 * Metadata source information
 */
export interface MetadataSource {
  uri: string;
  protocol: 'ipfs' | 'https' | 'http' | 'data' | 'ar'; // Arweave support
  lastFetched?: string; // ISO timestamp
  fetchCount: number;
  lastError?: string;
  isReachable: boolean;
  responseTime?: number; // milliseconds
  contentType?: string;
  contentLength?: number; // bytes
  etag?: string;
  lastModified?: string;
}

/**
 * IPFS-specific metadata information
 */
export interface IPFSMetadataInfo extends MetadataSource {
  protocol: 'ipfs';
  ipfsHash: string;
  gateway: string;
  pinned: boolean;
  pinnedAt?: string; // ISO timestamp
  fileSize: number; // bytes
  ipfsNodeId?: string;
}

/**
 * HTTP-specific metadata information
 */
export interface HTTPMetadataInfo extends MetadataSource {
  protocol: 'https' | 'http';
  statusCode: number;
  headers: Record<string, string>;
  redirectChain?: string[];
  sslValid?: boolean;
  serverType?: string;
}

/**
 * Metadata caching information
 */
export interface MetadataCacheInfo {
  cached: boolean;
  cacheKey: string;
  cachedAt?: string; // ISO timestamp
  expiresAt?: string; // ISO timestamp
  cacheHit: boolean;
  cacheSize?: number; // bytes
  compressionRatio?: number;
}

/**
 * Comprehensive metadata fetch result
 */
export interface MetadataFetchResult {
  success: boolean;
  metadata: NormalizedNFTMetadata | null;
  raw: RawNFTMetadata | null;
  source: MetadataSource;
  cache: MetadataCacheInfo;
  validation: MetadataValidationResult;
  fetchTime: number; // milliseconds
  totalTime: number; // milliseconds (including cache/validation)
}

/**
 * Metadata batch processing result
 */
export interface MetadataBatchResult {
  processed: number;
  successful: number;
  failed: number;
  errors: Array<{
    nftId: string;
    uri: string;
    error: string;
  }>;
  processingTime: number; // milliseconds
  results: Map<string, MetadataFetchResult>; // nftId -> result
}

/**
 * Metadata enrichment context
 */
export interface MetadataEnrichmentContext {
  nftTokenId: string;
  collectionId?: string;
  ownerAddress?: string;
  mintTransaction?: {
    hash: string;
    ledgerIndex: number;
    timestamp: string;
  };
  collectionMetadata?: {
    name?: string;
    description?: string;
    website?: string;
    social?: Record<string, string>;
  };
}

/**
 * Metadata processing options
 */
export interface MetadataProcessingOptions {
  validateRequired: boolean;
  normalizeAttributes: boolean;
  enrichWithCollection: boolean;
  generateThumbnails: boolean;
  uploadToS3: boolean;
  updateDatabase: boolean;
  notifyOnCompletion: boolean;
  priority: 'low' | 'normal' | 'high' | 'critical';
}