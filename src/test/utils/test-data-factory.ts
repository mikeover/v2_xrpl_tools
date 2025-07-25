/**
 * Test Data Factory for XRPL NFT Monitoring System
 * 
 * Provides realistic mock data for testing all components of the system.
 * Based on actual XRPL transaction structures and NFT patterns.
 */

// Removed unused uuid import
import { XRPLTransactionStreamMessage } from '../../shared/types/xrpl-stream.types';
import { NFTTransactionData, NFTActivityType } from '../../features/transaction-processing/interfaces/transaction.interface';
// DTOs would need to be defined when auth module is implemented
interface CreateUserDto {
  email: string;
  password: string;
  firstName?: string;
  lastName?: string;
}

interface CreateAlertConfigDto {
  name: string;
  activityTypes: string[];
  minPriceDrops?: string;
  maxPriceDrops?: string;
  traitFilters?: Record<string, string>;
  notificationChannels: any;
}

export class TestDataFactory {
  /**
   * Generate realistic XRPL NFT mint transaction
   */
  static createNFTMintTransaction(overrides: Partial<any> = {}): XRPLTransactionStreamMessage {
    const nftokenId = this.generateNFTokenID();
    const account = this.generateXRPLAddress();
    const transactionHash = this.generateTransactionHash();
    const ledgerIndex = Math.floor(Math.random() * 1000000) + 70000000;

    return {
      transaction: {
        Account: account,
        Fee: '12',
        Flags: 8,
        LastLedgerSequence: ledgerIndex + 4,
        NFTokenTaxon: Math.floor(Math.random() * 4294967295),
        Sequence: Math.floor(Math.random() * 1000) + 1,
        SigningPubKey: '03' + this.generateHex(64),
        TransactionType: 'NFTokenMint',
        TransferFee: Math.floor(Math.random() * 50000), // 0-50% transfer fee
        URI: this.generateURIHex(),
        TxnSignature: this.generateHex(128),
        hash: transactionHash,
        ...(overrides['transaction'] || {}),
      },
      meta: {
        AffectedNodes: [
          {
            CreatedNode: {
              LedgerEntryType: 'NFTokenPage',
              LedgerIndex: this.generateHex(64),
              NewFields: {
                NFTokens: [
                  {
                    NFToken: {
                      NFTokenID: nftokenId,
                      URI: this.generateURIHex(),
                    },
                  },
                ],
              },
            },
          },
          {
            ModifiedNode: {
              LedgerEntryType: 'AccountRoot',
              LedgerIndex: this.generateHex(64),
              PreviousFields: {
                OwnerCount: 5,
                Sequence: Math.floor(Math.random() * 1000),
              },
              FinalFields: {
                Account: account,
                Balance: (BigInt(Math.floor(Math.random() * 1000000000)) + 1000000n).toString(),
                OwnerCount: 6,
                Sequence: Math.floor(Math.random() * 1000) + 1,
              },
            },
          },
        ],
        TransactionIndex: Math.floor(Math.random() * 100),
        TransactionResult: 'tesSUCCESS',
        ...(overrides['meta'] || {}),
      },
      engine_result: 'tesSUCCESS',
      engine_result_code: 0,
      engine_result_message: 'The transaction was applied. Only final in a validated ledger.',
      ledger_hash: this.generateLedgerHash(),
      ledger_index: ledgerIndex,
      validated: true,
      ...overrides,
    } as XRPLTransactionStreamMessage;
  }

  /**
   * Generate NFT sale transaction (NFTokenAcceptOffer)
   */
  static createNFTSaleTransaction(overrides: Partial<any> = {}): XRPLTransactionStreamMessage {
    const nftokenId = this.generateNFTokenID();
    const buyer = this.generateXRPLAddress();
    const seller = this.generateXRPLAddress();
    const priceXRP = Math.floor(Math.random() * 1000000) + 1000; // 0.001 to 1 XRP
    const transactionHash = this.generateTransactionHash();
    const ledgerIndex = Math.floor(Math.random() * 1000000) + 70000000;

    return {
      transaction: {
        Account: buyer,
        Fee: '12',
        Flags: 0,
        LastLedgerSequence: ledgerIndex + 4,
        NFTokenSellOffer: this.generateOfferID(),
        Sequence: Math.floor(Math.random() * 1000) + 1,
        SigningPubKey: '03' + this.generateHex(64),
        TransactionType: 'NFTokenAcceptOffer',
        TxnSignature: this.generateHex(128),
        hash: transactionHash,
        ...(overrides['transaction'] || {}),
      },
      meta: {
        AffectedNodes: [
          {
            DeletedNode: {
              LedgerEntryType: 'NFTokenOffer',
              LedgerIndex: this.generateHex(64),
              FinalFields: {
                Account: seller,
                Amount: (BigInt(priceXRP) * 1000000n).toString(), // Convert to drops
                Flags: 1, // Sell offer
                NFTokenID: nftokenId,
                OfferSequence: Math.floor(Math.random() * 1000),
              },
            },
          },
          {
            ModifiedNode: {
              LedgerEntryType: 'NFTokenPage',
              LedgerIndex: this.generateHex(64),
              PreviousFields: {
                NFTokens: [
                  {
                    NFToken: {
                      NFTokenID: nftokenId,
                    },
                  },
                ],
              },
              FinalFields: {
                NFTokens: [
                  {
                    NFToken: {
                      NFTokenID: nftokenId,
                    },
                  },
                ],
              },
            },
          },
        ],
        TransactionIndex: Math.floor(Math.random() * 100),
        TransactionResult: 'tesSUCCESS',
        ...(overrides['meta'] || {}),
      },
      engine_result: 'tesSUCCESS',
      engine_result_code: 0,
      engine_result_message: 'The transaction was applied. Only final in a validated ledger.',
      ledger_hash: this.generateLedgerHash(),
      ledger_index: ledgerIndex,
      validated: true,
      ...overrides,
    } as XRPLTransactionStreamMessage;
  }

  /**
   * Generate NFT offer creation transaction
   */
  static createNFTOfferTransaction(overrides: Partial<any> = {}): XRPLTransactionStreamMessage {
    const nftokenId = this.generateNFTokenID();
    const account = this.generateXRPLAddress();
    const offerAmount = Math.floor(Math.random() * 1000000) + 1000;
    const transactionHash = this.generateTransactionHash();
    const ledgerIndex = Math.floor(Math.random() * 1000000) + 70000000;

    return {
      transaction: {
        Account: account,
        Amount: (BigInt(offerAmount) * 1000000n).toString(),
        Fee: '12',
        Flags: 0,
        LastLedgerSequence: ledgerIndex + 4,
        NFTokenID: nftokenId,
        Sequence: Math.floor(Math.random() * 1000) + 1,
        SigningPubKey: '03' + this.generateHex(64),
        TransactionType: 'NFTokenCreateOffer',
        TxnSignature: this.generateHex(128),
        hash: transactionHash,
        ...(overrides['transaction'] || {}),
      },
      meta: {
        AffectedNodes: [
          {
            CreatedNode: {
              LedgerEntryType: 'NFTokenOffer',
              LedgerIndex: this.generateHex(64),
              NewFields: {
                Account: account,
                Amount: (BigInt(offerAmount) * 1000000n).toString(),
                Flags: 0, // Buy offer
                NFTokenID: nftokenId,
                OfferSequence: Math.floor(Math.random() * 1000),
              },
            },
          },
        ],
        TransactionIndex: Math.floor(Math.random() * 100),
        TransactionResult: 'tesSUCCESS',
        ...(overrides['meta'] || {}),
      },
      engine_result: 'tesSUCCESS',
      engine_result_code: 0,
      engine_result_message: 'The transaction was applied. Only final in a validated ledger.',
      ledger_hash: this.generateLedgerHash(),
      ledger_index: ledgerIndex,
      validated: true,
      ...overrides,
    } as XRPLTransactionStreamMessage;
  }

  /**
   * Generate parsed NFT transaction data
   */
  static createNFTTransactionData(overrides: Partial<NFTTransactionData> = {}): NFTTransactionData {
    return {
      transactionHash: this.generateTransactionHash(),
      ledgerIndex: Math.floor(Math.random() * 1000000) + 70000000,
      timestamp: new Date(Date.now() - Math.floor(Math.random() * 86400000)), // Last 24 hours
      activityType: NFTActivityType.MINT,
      fromAddress: this.generateXRPLAddress(),
      toAddress: this.generateXRPLAddress(),
      nftTokenID: this.generateNFTokenID(),
      priceDrops: (BigInt(Math.floor(Math.random() * 1000000) + 1000) * 1000000n).toString(),
      currency: 'XRP',
      metadata: {
        transactionType: 'NFTokenMint',
        fee: '12',
        flags: 8,
        engineResult: 'tesSUCCESS',
        taxon: Math.floor(Math.random() * 4294967295),
        transferFee: Math.floor(Math.random() * 50000),
      },
      ...overrides,
    };
  }

  /**
   * Generate test user data
   */
  static createUserData(overrides: Partial<CreateUserDto> = {}): CreateUserDto {
    const username = `testuser_${Math.random().toString(36).substring(7)}`;
    return {
      email: `${username}@example.com`,
      password: 'TestPassword123!',
      firstName: 'Test',
      lastName: 'User',
      ...overrides,
    };
  }

  /**
   * Generate test alert configuration
   */
  static createAlertConfigData(overrides: Partial<CreateAlertConfigDto> = {}): CreateAlertConfigDto {
    return {
      name: `Test Alert ${Math.random().toString(36).substring(7)}`,
      activityTypes: ['mint', 'sale'],
      minPriceDrops: '1000000', // 1 XRP
      maxPriceDrops: '1000000000', // 1000 XRP
      traitFilters: {
        'rarity': 'legendary',
        'type': 'art',
      },
      notificationChannels: {
        discord: {
          enabled: true,
          webhookUrl: 'https://discord.com/api/webhooks/test',
        },
        email: {
          enabled: true,
        },
      },
      ...overrides,
    };
  }

  /**
   * Generate collection metadata
   */
  static createCollectionMetadata(overrides: Partial<any> = {}) {
    return {
      name: `Test Collection ${Math.random().toString(36).substring(7)}`,
      description: 'A test NFT collection for automated testing',
      image: `https://example.com/collection-${Math.random().toString(36).substring(7)}.png`,
      external_url: 'https://example.com',
      attributes: [
        {
          trait_type: 'Category',
          value: 'Art',
        },
        {
          trait_type: 'Rarity',
          value: 'Common',
        },
      ],
      ...overrides,
    };
  }

  /**
   * Generate NFT metadata
   */
  static createNFTMetadata(overrides: Partial<any> = {}) {
    const id = Math.floor(Math.random() * 10000);
    return {
      name: `Test NFT #${id}`,
      description: 'A test NFT for automated testing',
      image: `https://example.com/nft-${id}.png`,
      attributes: [
        {
          trait_type: 'Background',
          value: 'Blue',
        },
        {
          trait_type: 'Rarity',
          value: 'Common',
        },
        {
          trait_type: 'Level',
          value: Math.floor(Math.random() * 100) + 1,
        },
      ],
      external_url: `https://example.com/nft/${id}`,
      ...overrides,
    };
  }

  // Helper methods for generating realistic XRPL data
  private static generateXRPLAddress(): string {
    const chars = 'rpshnaf39wBUDNEGHJKLM4PQRST7VWXYZ2bcdeCg65jkm8oFqi1tuvAxyz';
    let result = 'r';
    for (let i = 0; i < 25; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  private static generateNFTokenID(): string {
    return '0008' + this.generateHex(60); // NFT ID format: flags + data
  }

  private static generateTransactionHash(): string {
    return this.generateHex(64).toUpperCase();
  }

  private static generateLedgerHash(): string {
    return this.generateHex(64).toUpperCase();
  }

  private static generateOfferID(): string {
    return this.generateHex(64).toUpperCase();
  }

  private static generateHex(length: number): string {
    const chars = '0123456789ABCDEF';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  private static generateURIHex(): string {
    // Generate a realistic IPFS URI in hex format
    const ipfsHash = 'QmTzQ2JRkWVH8W6wUhJvdl1M2N3P4R5S6T7U8V9W0X1Y2Z3';
    const uri = `https://ipfs.io/ipfs/${ipfsHash}`;
    return Buffer.from(uri, 'utf8').toString('hex').toUpperCase();
  }

  /**
   * Create a batch of related test data for comprehensive testing
   */
  static createTestSuite() {
    const collection = this.createCollectionMetadata();
    const users = Array(3).fill(null).map(() => this.createUserData());
    const nftMints = Array(5).fill(null).map(() => this.createNFTMintTransaction());
    const nftSales = Array(3).fill(null).map(() => this.createNFTSaleTransaction());
    const alertConfigs = Array(2).fill(null).map(() => this.createAlertConfigData());

    return {
      collection,
      users,
      nftMints,
      nftSales,
      alertConfigs,
    };
  }
}