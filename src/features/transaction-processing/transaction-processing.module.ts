import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TransactionIngestionService } from './services/transaction-ingestion.service';
import { TransactionConsumerService } from './services/transaction-consumer.service';
import { NFTTransactionParserService } from './services/nft-transaction-parser.service';
import { TransactionBatchProcessorService } from './services/transaction-batch-processor.service';
import { TransactionDeduplicationService } from './services/transaction-deduplication.service';
import { TransactionIngestionController } from './controllers/transaction-ingestion.controller';
import { EventClassifierController } from './controllers/event-classifier.controller';
import { EventClassifierService } from './services/event-classifier.service';
import { NftActivityEntity } from '../../database/entities/nft-activity.entity';
import { NftEntity } from '../../database/entities/nft.entity';
import { CollectionEntity } from '../../database/entities/collection.entity';
import { LedgerSyncStatusEntity } from '../../database/entities/ledger-sync-status.entity';
import { CoreModule } from '../../core/core.module';
import { XRPLConnectionModule } from '../../modules/xrpl-connection/xrpl-connection.module';
import { QueueModule } from '../../modules/queue/queue.module';
import { MetadataModule } from '../metadata/metadata.module';
import { AlertsModule } from '../alerts/alerts.module';

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
    QueueModule,
    MetadataModule,
    AlertsModule,
  ],
  controllers: [TransactionIngestionController, EventClassifierController],
  providers: [
    TransactionIngestionService,
    TransactionConsumerService,
    NFTTransactionParserService,
    TransactionBatchProcessorService,
    TransactionDeduplicationService,
    EventClassifierService,
  ],
  exports: [
    TransactionIngestionService,
    NFTTransactionParserService,
    TransactionBatchProcessorService,
    TransactionDeduplicationService,
    EventClassifierService,
  ],
})
export class TransactionProcessingModule {}
