export const QUEUE_CONSTANTS = {
  // Exchange names
  EXCHANGES: {
    XRPL: 'xrpl.events',
    NOTIFICATIONS: 'notifications',
    DEAD_LETTER: 'dlx',
  },

  // Queue names
  QUEUES: {
    LEDGER_EVENTS: 'xrpl.ledger.events',
    TRANSACTION_EVENTS: 'xrpl.transaction.events',
    NFT_EVENTS: 'xrpl.nft.events',
    NOTIFICATIONS: 'notifications.send',
    DEAD_LETTER: 'dead.letter.queue',
  },

  // Routing keys
  ROUTING_KEYS: {
    LEDGER_CLOSED: 'ledger.closed',
    TRANSACTION_VALIDATED: 'transaction.validated',
    NFT_ACTIVITY: 'nft.*',
    NOTIFICATION: 'notification.send',
  },

  // Retry configuration
  DEFAULT_RETRY_ATTEMPTS: 3,
  DEFAULT_RETRY_DELAY: 5000, // 5 seconds
  MAX_RETRY_DELAY: 300000, // 5 minutes

  // Queue configuration
  DEFAULT_PREFETCH_COUNT: 10,
  DEFAULT_MESSAGE_TTL: 86400000, // 24 hours in milliseconds

  // Dead letter configuration
  DEAD_LETTER_TTL: 604800000, // 7 days in milliseconds
  DEAD_LETTER_MAX_LENGTH: 100000,
} as const;

export const QUEUE_ERRORS = {
  CONNECTION_FAILED: 'Failed to connect to RabbitMQ',
  CHANNEL_CREATION_FAILED: 'Failed to create RabbitMQ channel',
  PUBLISH_FAILED: 'Failed to publish message to queue',
  CONSUME_FAILED: 'Failed to consume from queue',
  EXCHANGE_ASSERTION_FAILED: 'Failed to assert exchange',
  QUEUE_ASSERTION_FAILED: 'Failed to assert queue',
  BINDING_FAILED: 'Failed to bind queue to exchange',
} as const;
