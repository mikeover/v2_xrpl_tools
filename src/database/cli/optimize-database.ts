#!/usr/bin/env node

/**
 * Database Optimization CLI Tool
 * 
 * This script provides commands for database optimization including:
 * - Running advanced index migrations
 * - Performance monitoring and analysis
 * - Maintenance recommendations
 */

import { DataSource } from 'typeorm';
import { AppDataSource } from '../data-source';
import { createPerformanceMonitor, runPerformanceCheck } from '../utils/performance-monitor';

interface OptimizationCommand {
  command: string;
  description: string;
  action: (dataSource: DataSource) => Promise<void>;
}

const commands: OptimizationCommand[] = [
  {
    command: 'analyze',
    description: 'Run comprehensive database performance analysis',
    action: async (dataSource: DataSource) => {
      await runPerformanceCheck(dataSource);
    }
  },
  {
    command: 'index-usage',
    description: 'Show detailed index usage statistics',
    action: async (dataSource: DataSource) => {
      const monitor = createPerformanceMonitor(dataSource);
      const indexStats = await monitor.getIndexUsageStats();
      
      console.log('📊 Index Usage Statistics\n');
      console.log('| Table | Index | Usage Level | Times Used | Size |');
      console.log('|-------|-------|-------------|------------|------|');
      
      for (const index of indexStats) {
        const usageIcon = {
          'HIGH': '🟢',
          'MEDIUM': '🟡', 
          'LOW': '🟠',
          'UNUSED': '🔴'
        }[index.usage];
        
        console.log(`| ${index.tableName} | ${index.indexName} | ${usageIcon} ${index.usage} | ${index.timesUsed.toLocaleString()} | ${index.indexSize} |`);
      }
    }
  },
  {
    command: 'unused-indexes',
    description: 'Find indexes that are not being used and can be dropped',
    action: async (dataSource: DataSource) => {
      const monitor = createPerformanceMonitor(dataSource);
      const unusedIndexes = await monitor.getUnusedIndexes();
      
      if (unusedIndexes.length === 0) {
        console.log('✅ No unused indexes found! All indexes are being utilized.');
        return;
      }
      
      console.log(`🗑️  Found ${unusedIndexes.length} unused indexes:\n`);
      
      for (const index of unusedIndexes) {
        console.log(`📍 ${index.tableName}.${index.indexName}`);
        console.log(`   Size: ${index.indexSize}`);
        console.log(`   Drop command: DROP INDEX IF EXISTS "${index.indexName}";`);
        console.log('');
      }
      
      console.log('⚠️  Review these indexes before dropping them in production!');
    }
  },
  {
    command: 'table-stats',
    description: 'Show table size and maintenance statistics',
    action: async (dataSource: DataSource) => {
      const monitor = createPerformanceMonitor(dataSource);
      const tableStats = await monitor.getTableStats();
      
      console.log('📈 Table Statistics\n');
      console.log('| Table | Rows | Total Size | Last Vacuum | Last Analyze |');
      console.log('|-------|------|------------|-------------|-------------|');
      
      for (const table of tableStats) {
        const lastVacuum = table.lastVacuum 
          ? table.lastVacuum.toLocaleDateString()
          : 'Never';
        const lastAnalyze = table.lastAnalyze 
          ? table.lastAnalyze.toLocaleDateString()  
          : 'Never';
          
        console.log(`| ${table.tableName} | ${table.rowCount.toLocaleString()} | ${table.totalSize} | ${lastVacuum} | ${lastAnalyze} |`);
      }
    }
  },
  {
    command: 'maintenance',
    description: 'Run database maintenance (VACUUM and ANALYZE)',
    action: async (dataSource: DataSource) => {
      console.log('🧹 Running database maintenance...\n');
      
      const tables = ['nft_activities', 'nfts', 'collections', 'alert_configs', 'notifications'];
      
      for (const table of tables) {
        console.log(`📊 Analyzing ${table}...`);
        await dataSource.query(`ANALYZE "${table}"`);
        
        console.log(`🧽 Vacuuming ${table}...`);
        await dataSource.query(`VACUUM "${table}"`);
        
        console.log(`✅ ${table} maintenance complete\n`);
      }
      
      console.log('🎉 Database maintenance completed successfully!');
    }
  },
  {
    command: 'help',
    description: 'Show this help message',
    action: async () => {
      showHelp();
    }
  }
];

function showHelp(): void {
  console.log('🛠️  Database Optimization CLI\n');
  console.log('Usage: npm run db:optimize <command>\n');
  console.log('Available commands:');
  
  for (const cmd of commands) {
    console.log(`  ${cmd.command.padEnd(15)} ${cmd.description}`);
  }
  
  console.log('\nExamples:');
  console.log('  npm run db:optimize analyze        # Full performance analysis');
  console.log('  npm run db:optimize index-usage    # Check index efficiency');
  console.log('  npm run db:optimize maintenance    # Run VACUUM and ANALYZE');
}

async function main(): Promise<void> {
  const command = process.argv[2];
  
  if (!command) {
    showHelp();
    process.exit(1);
  }
  
  const cmd = commands.find(c => c.command === command);
  
  if (!cmd) {
    console.error(`❌ Unknown command: ${command}`);
    console.log('Run "npm run db:optimize help" for available commands.');
    process.exit(1);
  }
  
  if (command === 'help') {
    showHelp();
    return;
  }
  
  try {
    // Initialize database connection
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
      console.log('📊 Connected to database\n');
    }
    
    // Run the command
    await cmd.action(AppDataSource);
    
    // Close connection
    await AppDataSource.destroy();
    
  } catch (error) {
    console.error('❌ Error running database optimization command:');
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main().catch(console.error);
}

export { main as runDatabaseOptimization };