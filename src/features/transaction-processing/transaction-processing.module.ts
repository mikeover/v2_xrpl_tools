import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TransactionIngestionService } from './services/transaction-ingestion.service';
import { NFTTransactionParserService } from './services/nft-transaction-parser.service';
import { TransactionBatchProcessorService } from './services/transaction-batch-processor.service';
import { TransactionDeduplicationService } from './services/transaction-deduplication.service';
import { TransactionIngestionController } from './controllers/transaction-ingestion.controller';
import { NftActivityEntity } from '../../database/entities/nft-activity.entity';
import { NftEntity } from '../../database/entities/nft.entity';
import { CollectionEntity } from '../../database/entities/collection.entity';
import { LedgerSyncStatusEntity } from '../../database/entities/ledger-sync-status.entity';
import { CoreModule } from '../../core/core.module';
import { XRPLConnectionModule } from '../../modules/xrpl-connection/xrpl-connection.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      NftActivityEntity,
      NftEntity,
      CollectionEntity,
      LedgerSyncStatusEntity,
    ]),
    CoreModule,
    XRPLConnectionModule,
  ],
  controllers: [TransactionIngestionController],
  providers: [
    TransactionIngestionService,
    NFTTransactionParserService,
    TransactionBatchProcessorService,
    TransactionDeduplicationService,
  ],
  exports: [
    TransactionIngestionService,
    NFTTransactionParserService,
    TransactionBatchProcessorService,
    TransactionDeduplicationService,
  ],
})
export class TransactionProcessingModule {}
