export const XRPL_CONSTANTS = {
  DEFAULT_RECONNECT_INTERVAL: 5000, // 5 seconds
  DEFAULT_MAX_RECONNECT_ATTEMPTS: 10,
  DEFAULT_HEALTH_CHECK_INTERVAL: 30000, // 30 seconds
  DEFAULT_CONNECTION_TIMEOUT: 10000, // 10 seconds
  DEFAULT_MAX_CONSECUTIVE_FAILURES: 3,

  // Circuit breaker settings
  CIRCUIT_BREAKER_TIMEOUT: 30000, // 30 seconds
  CIRCUIT_BREAKER_THRESHOLD: 5,
  CIRCUIT_BREAKER_RESET_TIMEOUT: 60000, // 1 minute

  // Retry settings
  RETRY_MIN_TIMEOUT: 1000,
  RETRY_MAX_TIMEOUT: 30000,
  RETRY_FACTOR: 2,
  RETRY_ATTEMPTS: 5,

  // Subscription topics
  SUBSCRIPTION_TOPICS: {
    LEDGER: 'ledger',
    TRANSACTIONS: 'transactions',
  },

  // Public XRPL nodes (as fallbacks)
  PUBLIC_NODES: ['wss://xrplcluster.com', 'wss://s1.ripple.com', 'wss://s2.ripple.com'],
} as const;

export const XRPL_ERRORS = {
  NO_HEALTHY_NODES: 'No healthy XRPL nodes available',
  CONNECTION_TIMEOUT: 'Connection timeout exceeded',
  INVALID_NODE_URL: 'Invalid XRPL node URL',
  SUBSCRIPTION_FAILED: 'Failed to create subscription',
  BACKFILL_FAILED: 'Failed to backfill ledger range',
  CIRCUIT_BREAKER_OPEN: 'Circuit breaker is open',
} as const;
