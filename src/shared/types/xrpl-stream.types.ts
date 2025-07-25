/**
 * Extended XRPL types for transaction and ledger stream messages
 * These extend the base XRPL library types with additional fields
 * present in stream messages and validation responses
 */

import {
  Transaction,
  TransactionMetadata,
  BaseTransaction,
  TransactionAndMetadata,
} from 'xrpl';

/**
 * Engine result codes for XRPL transactions
 */
export type EngineResult = 
  | 'tesSUCCESS'
  | 'tecCLAIM'
  | 'tecDIR_FULL'
  | 'tecFAILED_PROCESSING'
  | 'tecINSUF_RESERVE_LINE'
  | 'tecINSUF_RESERVE_OFFER'
  | 'tecINSUFFICIENT_FUNDS'
  | 'tecINSUFFICIENT_PAYMENT'
  | 'tecINSUFFICIENT_RESERVE'
  | 'tecNEED_MASTER_KEY'
  | 'tecNO_AUTH'
  | 'tecNO_DST'
  | 'tecNO_DST_INSUF_XRP'
  | 'tecNO_LINE_INSUF_RESERVE'
  | 'tecNO_LINE_REDUNDANT'
  | 'tecPATH_DRY'
  | 'tecPATH_PARTIAL'
  | 'tecUNFUNDED'
  | 'tecUNFUNDED_ADD'
  | 'tecUNFUNDED_OFFER'
  | 'tecUNFUNDED_PAYMENT'
  | string; // Allow other codes for future compatibility

/**
 * Extended transaction message from XRPL stream with validation metadata
 */
export interface XRPLTransactionStreamMessage<T extends BaseTransaction = Transaction> {
  readonly transaction: T;
  readonly meta: TransactionMetadata<T>;
  readonly engine_result: EngineResult;
  readonly engine_result_code: number;
  readonly engine_result_message: string;
  readonly ledger_hash: string;
  readonly ledger_index: number;
  readonly validated: boolean;
  readonly type?: 'transaction';
}

/**
 * Ledger close message from XRPL stream
 */
export interface XRPLLedgerStreamMessage {
  readonly ledgerHash: string;
  readonly ledgerIndex: number;
  readonly ledgerTime: number;
  readonly txnCount: number;
  readonly validatedLedgerIndex: number;
  readonly type?: 'ledgerClosed';
}

/**
 * Transaction and metadata wrapper compatible with XRPL library
 */
export interface XRPLTransactionAndMetadata<T extends BaseTransaction = Transaction> 
  extends TransactionAndMetadata<T> {
  readonly engine_result?: EngineResult;
  readonly engine_result_code?: number;
  readonly engine_result_message?: string;
  readonly ledger_hash?: string;
  readonly ledger_index?: number;
  readonly validated?: boolean;
}

/**
 * Type guards for XRPL stream messages
 */
export function isTransactionStreamMessage(
  message: unknown
): message is XRPLTransactionStreamMessage {
  const msg = message as any;
  return (
    typeof msg === 'object' &&
    msg !== null &&
    typeof msg.transaction === 'object' &&
    typeof msg.meta === 'object' &&
    typeof msg.engine_result === 'string' &&
    typeof msg.ledger_index === 'number' &&
    typeof msg.validated === 'boolean'
  );
}

export function isLedgerStreamMessage(
  message: unknown
): message is XRPLLedgerStreamMessage {
  const msg = message as any;
  return (
    typeof msg === 'object' &&
    msg !== null &&
    typeof msg.ledgerHash === 'string' &&
    typeof msg.ledgerIndex === 'number' &&
    typeof msg.ledgerTime === 'number' &&
    typeof msg.txnCount === 'number'
  );
}

/**
 * NFT-specific transaction types (re-export from XRPL for convenience)
 */
export {
  NFTokenMint,
  NFTokenBurn,
  NFTokenCreateOffer,
  NFTokenAcceptOffer,
  NFTokenCancelOffer,
  Payment,
  Transaction,
  TransactionMetadata,
  BaseTransaction,
} from 'xrpl';

/**
 * Utility type for extracting transaction type from stream message
 */
export type TransactionType<T extends XRPLTransactionStreamMessage> = T['transaction'];

/**
 * Utility type for extracting metadata type from stream message
 */
export type MetadataType<T extends XRPLTransactionStreamMessage> = T['meta'];