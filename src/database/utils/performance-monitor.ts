/**
 * Database Performance Monitoring Utilities
 * 
 * These utilities help monitor database performance, index usage,
 * and identify optimization opportunities for the XRPL NFT monitoring system.
 */

import { DataSource } from 'typeorm';

export interface IndexUsageStats {
  schemaName: string;
  tableName: string;
  indexName: string;
  timesUsed: number;
  tupleReads: number;
  tupleFetches: number;
  indexSize: string;
  usage: 'HIGH' | 'MEDIUM' | 'LOW' | 'UNUSED';
}

export interface TableStats {
  tableName: string;
  rowCount: number;
  tableSize: string;
  indexSize: string;
  totalSize: string;
  vacuumCount: number;
  analyzeCount: number;
  lastVacuum: Date | null;
  lastAnalyze: Date | null;
}

export interface SlowQueryInfo {
  query: string;
  calls: number;
  totalTime: number;
  meanTime: number;
  minTime: number;
  maxTime: number;
  stddevTime: number;
}

export class DatabasePerformanceMonitor {
  constructor(private dataSource: DataSource) {}

  /**
   * Get comprehensive index usage statistics
   */
  async getIndexUsageStats(): Promise<IndexUsageStats[]> {
    const query = `
      SELECT 
        schemaname,
        tablename,
        indexname,
        idx_scan as times_used,
        idx_tup_read as tuple_reads,
        idx_tup_fetch as tuple_fetches,
        pg_size_pretty(pg_relation_size(indexrelid)) as index_size,
        CASE 
          WHEN idx_scan = 0 THEN 'UNUSED'
          WHEN idx_scan < 100 THEN 'LOW'
          WHEN idx_scan < 1000 THEN 'MEDIUM'
          ELSE 'HIGH'
        END as usage
      FROM pg_stat_user_indexes
      WHERE schemaname = 'public'
      ORDER BY idx_scan DESC, pg_relation_size(indexrelid) DESC;
    `;

    const result = await this.dataSource.query(query);
    return result.map((row: any) => ({
      schemaName: row.schemaname,
      tableName: row.tablename,
      indexName: row.indexname,
      timesUsed: parseInt(row.times_used) || 0,
      tupleReads: parseInt(row.tuple_reads) || 0,
      tupleFetches: parseInt(row.tuple_fetches) || 0,
      indexSize: row.index_size,
      usage: row.usage,
    }));
  }

  /**
   * Get table statistics including size and maintenance info
   */
  async getTableStats(): Promise<TableStats[]> {
    const query = `
      SELECT 
        t.tablename,
        t.n_tup_ins + t.n_tup_upd + t.n_tup_del as row_count,
        pg_size_pretty(pg_total_relation_size(c.oid)) as total_size,
        pg_size_pretty(pg_relation_size(c.oid)) as table_size,
        pg_size_pretty(pg_total_relation_size(c.oid) - pg_relation_size(c.oid)) as index_size,
        t.vacuum_count,
        t.autovacuum_count + t.vacuum_count as total_vacuum_count,
        t.analyze_count,
        t.autoanalyze_count + t.analyze_count as total_analyze_count,
        t.last_vacuum,
        t.last_autovacuum,
        t.last_analyze,
        t.last_autoanalyze
      FROM pg_stat_user_tables t
      JOIN pg_class c ON c.relname = t.tablename
      WHERE t.schemaname = 'public'
      ORDER BY pg_total_relation_size(c.oid) DESC;
    `;

    const result = await this.dataSource.query(query);
    return result.map((row: any) => ({
      tableName: row.tablename,
      rowCount: parseInt(row.row_count) || 0,
      tableSize: row.table_size,
      indexSize: row.index_size,
      totalSize: row.total_size,
      vacuumCount: parseInt(row.total_vacuum_count) || 0,
      analyzeCount: parseInt(row.total_analyze_count) || 0,
      lastVacuum: this.getLatestDate(row.last_vacuum, row.last_autovacuum),
      lastAnalyze: this.getLatestDate(row.last_analyze, row.last_autoanalyze),
    }));
  }

  /**
   * Get slow query statistics (requires pg_stat_statements extension)
   */
  async getSlowQueryStats(limit: number = 10): Promise<SlowQueryInfo[]> {
    try {
      const query = `
        SELECT 
          query,
          calls,
          total_exec_time as total_time,
          mean_exec_time as mean_time,
          min_exec_time as min_time,
          max_exec_time as max_time,
          stddev_exec_time as stddev_time
        FROM pg_stat_statements
        WHERE query NOT LIKE '%pg_stat_statements%'
          AND query NOT LIKE '%COMMIT%'
          AND query NOT LIKE '%BEGIN%'
        ORDER BY total_exec_time DESC
        LIMIT $1;
      `;

      const result = await this.dataSource.query(query, [limit]);
      return result.map((row: any) => ({
        query: row.query.substring(0, 200) + (row.query.length > 200 ? '...' : ''),
        calls: parseInt(row.calls) || 0,
        totalTime: parseFloat(row.total_time) || 0,
        meanTime: parseFloat(row.mean_time) || 0,
        minTime: parseFloat(row.min_time) || 0,
        maxTime: parseFloat(row.max_time) || 0,
        stddevTime: parseFloat(row.stddev_time) || 0,
      }));
    } catch (error) {
      console.warn('pg_stat_statements extension not available. Install it for query performance monitoring.');
      return [];
    }
  }

  /**
   * Check for unused indexes that can be safely removed
   */
  async getUnusedIndexes(): Promise<IndexUsageStats[]> {
    const allIndexes = await this.getIndexUsageStats();
    return allIndexes.filter(index => 
      index.usage === 'UNUSED' && 
      !index.indexName.includes('_pkey') && // Don't flag primary keys
      !index.indexName.includes('_unique') && // Don't flag unique constraints
      !index.indexName.startsWith('UQ_') // Don't flag TypeORM unique indexes
    );
  }

  /**
   * Generate performance recommendations
   */
  async getPerformanceRecommendations(): Promise<string[]> {
    const recommendations: string[] = [];
    
    // Check for unused indexes
    const unusedIndexes = await this.getUnusedIndexes();
    if (unusedIndexes.length > 0) {
      recommendations.push(
        `Found ${unusedIndexes.length} unused indexes. Consider dropping: ${unusedIndexes.map(i => i.indexName).join(', ')}`
      );
    }

    // Check table maintenance
    const tableStats = await this.getTableStats();
    const needsAnalyze = tableStats.filter(table => 
      !table.lastAnalyze || 
      (Date.now() - table.lastAnalyze.getTime()) > 24 * 60 * 60 * 1000 // 24 hours
    );
    
    if (needsAnalyze.length > 0) {
      recommendations.push(
        `Tables need ANALYZE: ${needsAnalyze.map(t => t.tableName).join(', ')}`
      );
    }

    // Check for large tables without recent maintenance
    const largeTables = tableStats.filter(table => 
      table.rowCount > 100000 && 
      (!table.lastVacuum || (Date.now() - table.lastVacuum.getTime()) > 7 * 24 * 60 * 60 * 1000)
    );
    
    if (largeTables.length > 0) {
      recommendations.push(
        `Large tables need VACUUM: ${largeTables.map(t => t.tableName).join(', ')}`
      );
    }

    // Check slow queries
    const slowQueries = await this.getSlowQueryStats(5);
    if (slowQueries.length > 0) {
      const verySlowQueries = slowQueries.filter(q => q.meanTime > 1000); // > 1 second
      if (verySlowQueries.length > 0) {
        recommendations.push(
          `Found ${verySlowQueries.length} queries with mean execution time > 1s. Review and optimize.`
        );
      }
    }

    return recommendations;
  }

  /**
   * Generate a comprehensive performance report
   */
  async generatePerformanceReport(): Promise<string> {
    const indexStats = await this.getIndexUsageStats();
    const tableStats = await this.getTableStats();
    const slowQueries = await this.getSlowQueryStats(5);
    const recommendations = await this.getPerformanceRecommendations();

    let report = '# Database Performance Report\n\n';
    report += `Generated: ${new Date().toISOString()}\n\n`;

    // Table Summary
    report += '## Table Statistics\n\n';
    report += '| Table | Rows | Table Size | Index Size | Total Size | Last Analyze |\n';
    report += '|-------|------|------------|------------|------------|-------------||\n';
    
    for (const table of tableStats) {
      const lastAnalyze = table.lastAnalyze 
        ? table.lastAnalyze.toLocaleDateString()
        : 'Never';
      report += `| ${table.tableName} | ${table.rowCount.toLocaleString()} | ${table.tableSize} | ${table.indexSize} | ${table.totalSize} | ${lastAnalyze} |\n`;
    }

    // Index Usage Summary
    report += '\n## Index Usage Summary\n\n';
    const usageGroups = {
      HIGH: indexStats.filter(i => i.usage === 'HIGH').length,
      MEDIUM: indexStats.filter(i => i.usage === 'MEDIUM').length,
      LOW: indexStats.filter(i => i.usage === 'LOW').length,
      UNUSED: indexStats.filter(i => i.usage === 'UNUSED').length,
    };
    
    report += `- **High Usage**: ${usageGroups.HIGH} indexes\n`;
    report += `- **Medium Usage**: ${usageGroups.MEDIUM} indexes\n`;
    report += `- **Low Usage**: ${usageGroups.LOW} indexes\n`;
    report += `- **Unused**: ${usageGroups.UNUSED} indexes\n\n`;

    // Top Slow Queries
    if (slowQueries.length > 0) {
      report += '## Slowest Queries\n\n';
      for (const query of slowQueries.slice(0, 3)) {
        report += `**Mean Time**: ${query.meanTime.toFixed(2)}ms | **Calls**: ${query.calls}\n`;
        report += `\`\`\`sql\n${query.query}\n\`\`\`\n\n`;
      }
    }

    // Recommendations
    if (recommendations.length > 0) {
      report += '## Recommendations\n\n';
      for (const rec of recommendations) {
        report += `- ${rec}\n`;
      }
    }

    return report;
  }

  private getLatestDate(date1: string | null, date2: string | null): Date | null {
    const d1 = date1 ? new Date(date1) : null;
    const d2 = date2 ? new Date(date2) : null;
    
    if (!d1 && !d2) return null;
    if (!d1) return d2;
    if (!d2) return d1;
    
    return d1 > d2 ? d1 : d2;
  }
}

/**
 * Utility function to create performance monitor instance
 */
export function createPerformanceMonitor(dataSource: DataSource): DatabasePerformanceMonitor {
  return new DatabasePerformanceMonitor(dataSource);
}

/**
 * CLI command helper for performance monitoring
 */
export async function runPerformanceCheck(dataSource: DataSource): Promise<void> {
  const monitor = new DatabasePerformanceMonitor(dataSource);
  
  console.log('🔍 Analyzing database performance...\n');
  
  const report = await monitor.generatePerformanceReport();
  console.log(report);
  
  const recommendations = await monitor.getPerformanceRecommendations();
  if (recommendations.length === 0) {
    console.log('✅ No immediate performance issues detected!');
  }
}