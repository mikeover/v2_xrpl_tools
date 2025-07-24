export const TRANSACTION_CONSTANTS = {
  // Batch processing
  DEFAULT_BATCH_SIZE: 50,
  MAX_BATCH_SIZE: 100,
  BATCH_FLUSH_INTERVAL: 5000, // 5 seconds

  // Retry configuration
  MAX_RETRY_ATTEMPTS: 3,
  RETRY_DELAY_BASE: 1000, // 1 second
  RETRY_DELAY_MULTIPLIER: 2,

  // Deduplication cache
  DEDUPLICATION_CACHE_TTL: 3600, // 1 hour in seconds
  DEDUPLICATION_CACHE_MAX_SIZE: 10000,

  // Performance monitoring
  PROCESSING_TIME_THRESHOLD: 1000, // 1 second warning threshold
  MEMORY_USAGE_CHECK_INTERVAL: 30000, // 30 seconds

  // Database operations
  MAX_CONCURRENT_WRITES: 5,
  TRANSACTION_TIMEOUT: 30000, // 30 seconds
} as const;

export const TRANSACTION_ERRORS = {
  INVALID_TRANSACTION_FORMAT: 'Invalid transaction format',
  DUPLICATE_TRANSACTION: 'Duplicate transaction detected',
  BATCH_PROCESSING_FAILED: 'Batch processing failed',
  DATABASE_WRITE_FAILED: 'Database write operation failed',
  NFT_PARSING_FAILED: 'Failed to parse NFT transaction data',
  DEDUPLICATION_CHECK_FAILED: 'Deduplication check failed',
  TRANSACTION_VALIDATION_FAILED: 'Transaction validation failed',
} as const;