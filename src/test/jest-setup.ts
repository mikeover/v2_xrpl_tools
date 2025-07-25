/**
 * Jest Setup Configuration for XRPL NFT Monitoring Tests
 * 
 * This file sets up the testing environment with proper database configuration,
 * timeout settings, and global test utilities.
 */

import { TestDatabase, setupTestDatabase, teardownTestDatabase } from './utils/test-database';

// Extend Jest timeout for database operations
jest.setTimeout(30000);

// Global test database instance
let globalTestDb: TestDatabase;

// Setup before all tests
beforeAll(async () => {
  // Set test environment variables if not already set
  if (!process.env['NODE_ENV']) {
    process.env['NODE_ENV'] = 'test';
  }

  // Set test database environment variables
  process.env['TEST_DATABASE_HOST'] = process.env['TEST_DATABASE_HOST'] || 'localhost';
  process.env['TEST_DATABASE_PORT'] = process.env['TEST_DATABASE_PORT'] || '5432';
  process.env['TEST_DATABASE_USERNAME'] = process.env['TEST_DATABASE_USERNAME'] || 'postgres';
  process.env['TEST_DATABASE_PASSWORD'] = process.env['TEST_DATABASE_PASSWORD'] || 'postgres';

  // Disable logging during tests unless explicitly enabled
  if (!process.env['ENABLE_TEST_LOGGING']) {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  }

  // Initialize global test database for integration tests
  try {
    globalTestDb = TestDatabase.getInstance();
    await setupTestDatabase();
    console.log('✅ Global test database initialized');
  } catch (error) {
    console.error('❌ Failed to setup global test database:', error);
    throw error;
  }
});

// Cleanup after all tests
afterAll(async () => {
  try {
    await teardownTestDatabase();
    console.log('🗑️ Global test database cleaned up');
  } catch (error) {
    console.warn('⚠️ Warning: Failed to cleanup test database:', error);
  }

  // Restore console methods
  if (!process.env['ENABLE_TEST_LOGGING']) {
    jest.restoreAllMocks();
  }
});

// Global error handling for unhandled promise rejections in tests
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  // Don't exit the process during tests, just log the error
});

// Export global test utilities
export { globalTestDb };

// Custom Jest matchers for XRPL-specific testing
declare global {
  namespace jest {
    interface Matchers<R> {
      toBeValidXRPLAddress(): R;
      toBeValidNFTokenID(): R;
      toBeValidTransactionHash(): R;
      toHaveValidPriceDrops(): R;
    }
  }
}

// Extend Jest with custom matchers
expect.extend({
  toBeValidXRPLAddress(received: string) {
    const isValid = typeof received === 'string' && 
                   received.length >= 25 && 
                   received.length <= 34 && 
                   received.startsWith('r');
    
    return {
      message: () => `expected ${received} to be a valid XRPL address`,
      pass: isValid,
    };
  },

  toBeValidNFTokenID(received: string) {
    const isValid = typeof received === 'string' && 
                   received.length === 64 && 
                   /^[0-9A-F]+$/i.test(received);
    
    return {
      message: () => `expected ${received} to be a valid NFTokenID`,
      pass: isValid,
    };
  },

  toBeValidTransactionHash(received: string) {
    const isValid = typeof received === 'string' && 
                   received.length === 64 && 
                   /^[0-9A-F]+$/i.test(received);
    
    return {
      message: () => `expected ${received} to be a valid transaction hash`,
      pass: isValid,
    };
  },

  toHaveValidPriceDrops(received: string) {
    const isValid = typeof received === 'string' && 
                   /^\d+$/.test(received) && 
                   BigInt(received) > 0n;
    
    return {
      message: () => `expected ${received} to be valid price drops (positive integer string)`,
      pass: isValid,
    };
  },
});

/**
 * Test utility functions available globally
 */
export const testUtils = {
  /**
   * Wait for a specified amount of time
   */
  wait: (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms)),

  /**
   * Generate a unique test identifier
   */
  generateTestId: (): string => `test_${Date.now()}_${Math.random().toString(36).substring(7)}`,

  /**
   * Create a mock logger that captures all log calls
   */
  createMockLogger: () => ({
    log: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    info: jest.fn(),
    verbose: jest.fn(),
  }),

  /**
   * Verify that a promise rejects with a specific error message
   */
  expectToRejectWith: async (promise: Promise<any>, expectedMessage: string) => {
    try {
      await promise;
      throw new Error('Expected promise to reject, but it resolved');
    } catch (error) {
      expect((error as Error).message).toContain(expectedMessage);
    }
  },

  /**
   * Create a test date with consistent timing
   */
  createTestDate: (offsetMs = 0): Date => new Date(1640995200000 + offsetMs), // 2022-01-01 00:00:00 UTC

  /**
   * Validate XRPL data structures
   */
  validateXRPLStructure: {
    isValidAddress: (address: string): boolean => {
      return typeof address === 'string' && 
             address.length >= 25 && 
             address.length <= 34 && 
             address.startsWith('r');
    },
    
    isValidNFTokenID: (nftokenId: string): boolean => {
      return typeof nftokenId === 'string' && 
             nftokenId.length === 64 && 
             /^[0-9A-F]+$/i.test(nftokenId);
    },
    
    isValidTransactionHash: (hash: string): boolean => {
      return typeof hash === 'string' && 
             hash.length === 64 && 
             /^[0-9A-F]+$/i.test(hash);
    },
  },
};