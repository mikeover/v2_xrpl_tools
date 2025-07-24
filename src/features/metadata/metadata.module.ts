import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NFTMetadataFetcherService } from './services/nft-metadata-fetcher.service';
import { MetadataEnrichmentService } from './services/metadata-enrichment.service';
import { LoggerModule } from '../../core/logger/logger.module';
import { NftEntity } from '../../database/entities/nft.entity';

@Module({
  imports: [
    ConfigModule,
    LoggerModule,
    TypeOrmModule.forFeature([NftEntity]),
  ],
  providers: [
    NFTMetadataFetcherService,
    MetadataEnrichmentService,
  ],
  exports: [
    NFTMetadataFetcherService,
    MetadataEnrichmentService,
  ],
})
export class MetadataModule {}