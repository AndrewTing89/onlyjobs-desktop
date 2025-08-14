/**
 * Performance Monitor for LLM Processing with Mixed Record Sources
 * Tracks processing performance, cache efficiency, and system health
 */

const EventEmitter = require('events');

class PerformanceMonitor extends EventEmitter {
  constructor(db) {
    super();
    this.db = db;
    this.metrics = {
      emailProcessing: {
        totalProcessed: 0,
        averageProcessingTime: 0,
        successRate: 0,
        errorCount: 0,
        lastHourProcessed: 0
      },
      manualRecords: {
        totalCreated: 0,
        conflictDetectionRate: 0,
        duplicatePreventionRate: 0,
        dailyCreationRate: 0
      },
      cachePerformance: {
        hitRate: 0,
        missRate: 0,
        invalidationCount: 0,
        cacheSize: 0
      },
      conflictResolution: {
        totalConflicts: 0,
        resolvedConflicts: 0,
        autoResolutionRate: 0,
        manualReviewRequired: 0
      },
      systemHealth: {
        memoryUsage: 0,
        processingQueueSize: 0,
        errorRate: 0,
        uptime: 0
      }
    };

    this.processingTimes = [];
    this.errorLog = [];
    this.startTime = Date.now();
    
    // Performance thresholds for alerts
    this.thresholds = {
      maxProcessingTime: 10000,     // 10 seconds
      maxErrorRate: 0.05,           // 5%
      minCacheHitRate: 0.7,         // 70%
      maxConflictRate: 0.1          // 10%
    };

    this.initializeMonitoring();
  }

  /**
   * Initialize monitoring tables and periodic tasks
   */
  initializeMonitoring() {
    // Create performance metrics table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS performance_metrics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        metric_type TEXT NOT NULL,
        metric_name TEXT NOT NULL,
        metric_value REAL NOT NULL,
        metadata TEXT,
        recorded_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_performance_metrics_type_time 
      ON performance_metrics(metric_type, recorded_at);
    `);

    // Start periodic metric collection
    this.startPeriodicCollection();
  }

  /**
   * Record LLM processing performance
   */
  recordLLMProcessing(processingData) {
    const {
      jobId,
      emailId,
      processingType,
      duration,
      success,
      error,
      inputSize,
      outputSize,
      confidence,
      cacheHit = false
    } = processingData;

    // Update running metrics
    this.metrics.emailProcessing.totalProcessed++;
    this.processingTimes.push(duration);
    
    if (this.processingTimes.length > 1000) {
      this.processingTimes = this.processingTimes.slice(-500); // Keep last 500
    }

    this.metrics.emailProcessing.averageProcessingTime = 
      this.processingTimes.reduce((a, b) => a + b, 0) / this.processingTimes.length;

    if (!success) {
      this.metrics.emailProcessing.errorCount++;
      this.recordError('llm_processing', error, { jobId, emailId });
    }

    this.metrics.emailProcessing.successRate = 
      (this.metrics.emailProcessing.totalProcessed - this.metrics.emailProcessing.errorCount) / 
      this.metrics.emailProcessing.totalProcessed;

    // Store detailed metrics
    this.storeMetric('llm_processing', 'duration', duration, {
      job_id: jobId,
      email_id: emailId,
      processing_type: processingType,
      success,
      input_size: inputSize,
      output_size: outputSize,
      confidence,
      cache_hit: cacheHit
    });

    // Check for performance alerts
    this.checkPerformanceAlerts('llm_processing', duration, success);

    this.emit('llm_processing_recorded', {
      duration,
      success,
      totalProcessed: this.metrics.emailProcessing.totalProcessed
    });
  }

  /**
   * Record manual record creation performance
   */
  recordManualRecordCreation(recordData) {
    const {
      jobId,
      conflictsDetected,
      duplicatesPrevented,
      validationTime,
      success
    } = recordData;

    this.metrics.manualRecords.totalCreated++;
    
    if (conflictsDetected) {
      this.metrics.manualRecords.conflictDetectionRate = 
        (this.getConflictCount() / this.metrics.manualRecords.totalCreated);
    }

    if (duplicatesPrevented) {
      this.metrics.manualRecords.duplicatePreventionRate = 
        (this.getDuplicatePreventionCount() / this.metrics.manualRecords.totalCreated);
    }

    this.storeMetric('manual_record', 'creation', 1, {
      job_id: jobId,
      conflicts_detected: conflictsDetected,
      duplicates_prevented: duplicatesPrevented,
      validation_time: validationTime,
      success
    });

    this.emit('manual_record_created', {
      jobId,
      conflictsDetected,
      totalCreated: this.metrics.manualRecords.totalCreated
    });
  }

  /**
   * Record cache performance
   */
  recordCachePerformance(cacheData) {
    const {
      cacheType,
      operation, // 'hit', 'miss', 'set', 'invalidate'
      key,
      responseTime,
      cacheSize
    } = cacheData;

    // Update cache metrics
    if (operation === 'hit') {
      this.metrics.cachePerformance.hitRate = this.calculateCacheHitRate();
    } else if (operation === 'miss') {
      this.metrics.cachePerformance.missRate = this.calculateCacheMissRate();
    } else if (operation === 'invalidate') {
      this.metrics.cachePerformance.invalidationCount++;
    }

    if (cacheSize !== undefined) {
      this.metrics.cachePerformance.cacheSize = cacheSize;
    }

    this.storeMetric('cache_performance', operation, responseTime || 1, {
      cache_type: cacheType,
      key: key ? key.substring(0, 50) : null, // Truncate long keys
      cache_size: cacheSize
    });

    // Alert on low cache hit rate
    if (this.metrics.cachePerformance.hitRate < this.thresholds.minCacheHitRate) {
      this.emit('performance_alert', {
        type: 'low_cache_hit_rate',
        value: this.metrics.cachePerformance.hitRate,
        threshold: this.thresholds.minCacheHitRate
      });
    }
  }

  /**
   * Record conflict resolution performance
   */
  recordConflictResolution(conflictData) {
    const {
      jobId,
      conflictCount,
      resolvedCount,
      autoResolvedCount,
      manualReviewCount,
      resolutionTime
    } = conflictData;

    this.metrics.conflictResolution.totalConflicts += conflictCount;
    this.metrics.conflictResolution.resolvedConflicts += resolvedCount;
    this.metrics.conflictResolution.manualReviewRequired += manualReviewCount;

    this.metrics.conflictResolution.autoResolutionRate = 
      autoResolvedCount / conflictCount;

    this.storeMetric('conflict_resolution', 'resolution', resolutionTime, {
      job_id: jobId,
      conflict_count: conflictCount,
      resolved_count: resolvedCount,
      auto_resolved: autoResolvedCount,
      manual_review: manualReviewCount
    });

    this.emit('conflict_resolution_recorded', {
      jobId,
      conflictCount,
      autoResolutionRate: this.metrics.conflictResolution.autoResolutionRate
    });
  }

  /**
   * Record system health metrics
   */
  recordSystemHealth() {
    const memUsage = process.memoryUsage();
    const uptime = Date.now() - this.startTime;

    this.metrics.systemHealth.memoryUsage = memUsage.heapUsed / 1024 / 1024; // MB
    this.metrics.systemHealth.uptime = uptime;
    this.metrics.systemHealth.errorRate = this.calculateErrorRate();

    this.storeMetric('system_health', 'memory_usage', this.metrics.systemHealth.memoryUsage, {
      heap_total: memUsage.heapTotal / 1024 / 1024,
      heap_used: memUsage.heapUsed / 1024 / 1024,
      external: memUsage.external / 1024 / 1024,
      uptime: uptime
    });

    // Check for system health alerts
    if (this.metrics.systemHealth.memoryUsage > 500) { // 500MB threshold
      this.emit('performance_alert', {
        type: 'high_memory_usage',
        value: this.metrics.systemHealth.memoryUsage,
        threshold: 500
      });
    }
  }

  /**
   * Store a metric in the database
   */
  storeMetric(metricType, metricName, metricValue, metadata = {}) {
    const stmt = this.db.prepare(`
      INSERT INTO performance_metrics 
      (metric_type, metric_name, metric_value, metadata)
      VALUES (?, ?, ?, ?)
    `);

    stmt.run(metricType, metricName, metricValue, JSON.stringify(metadata));
  }

  /**
   * Record an error for tracking
   */
  recordError(errorType, error, context = {}) {
    const errorEntry = {
      type: errorType,
      message: error?.message || String(error),
      stack: error?.stack,
      context,
      timestamp: new Date().toISOString()
    };

    this.errorLog.push(errorEntry);
    
    // Keep only last 100 errors
    if (this.errorLog.length > 100) {
      this.errorLog = this.errorLog.slice(-50);
    }

    this.storeMetric('system_error', errorType, 1, errorEntry);

    this.emit('error_recorded', errorEntry);
  }

  /**
   * Check for performance alerts
   */
  checkPerformanceAlerts(metricType, value, success) {
    switch (metricType) {
      case 'llm_processing':
        if (value > this.thresholds.maxProcessingTime) {
          this.emit('performance_alert', {
            type: 'slow_processing',
            value,
            threshold: this.thresholds.maxProcessingTime
          });
        }
        break;

      case 'error_rate':
        if (value > this.thresholds.maxErrorRate) {
          this.emit('performance_alert', {
            type: 'high_error_rate',
            value,
            threshold: this.thresholds.maxErrorRate
          });
        }
        break;
    }
  }

  /**
   * Calculate cache hit rate
   */
  calculateCacheHitRate() {
    const recentCacheMetrics = this.db.prepare(`
      SELECT 
        SUM(CASE WHEN metric_name = 'hit' THEN metric_value ELSE 0 END) as hits,
        SUM(CASE WHEN metric_name = 'miss' THEN metric_value ELSE 0 END) as misses
      FROM performance_metrics 
      WHERE metric_type = 'cache_performance' 
      AND recorded_at > datetime('now', '-1 hour')
    `).get();

    const totalRequests = recentCacheMetrics.hits + recentCacheMetrics.misses;
    return totalRequests > 0 ? recentCacheMetrics.hits / totalRequests : 0;
  }

  /**
   * Calculate cache miss rate
   */
  calculateCacheMissRate() {
    return 1 - this.calculateCacheHitRate();
  }

  /**
   * Calculate error rate
   */
  calculateErrorRate() {
    const recentErrors = this.db.prepare(`
      SELECT COUNT(*) as error_count
      FROM performance_metrics 
      WHERE metric_type = 'system_error' 
      AND recorded_at > datetime('now', '-1 hour')
    `).get();

    const totalOperations = this.metrics.emailProcessing.totalProcessed + 
                           this.metrics.manualRecords.totalCreated;

    return totalOperations > 0 ? recentErrors.error_count / totalOperations : 0;
  }

  /**
   * Get current performance summary
   */
  getPerformanceSummary() {
    return {
      timestamp: new Date().toISOString(),
      llmProcessing: {
        ...this.metrics.emailProcessing,
        avgProcessingTime: Math.round(this.metrics.emailProcessing.averageProcessingTime),
        processingRate: this.calculateProcessingRate()
      },
      manualRecords: {
        ...this.metrics.manualRecords,
        dailyRate: this.calculateDailyManualRecordRate()
      },
      cache: {
        ...this.metrics.cachePerformance,
        hitRate: Math.round(this.metrics.cachePerformance.hitRate * 100) + '%'
      },
      conflicts: {
        ...this.metrics.conflictResolution,
        resolutionRate: Math.round(this.metrics.conflictResolution.autoResolutionRate * 100) + '%'
      },
      system: {
        ...this.metrics.systemHealth,
        memoryUsageMB: Math.round(this.metrics.systemHealth.memoryUsage),
        uptimeHours: Math.round(this.metrics.systemHealth.uptime / (1000 * 60 * 60))
      }
    };
  }

  /**
   * Get detailed performance metrics for a time period
   */
  getDetailedMetrics(hoursBack = 24) {
    return {
      llmProcessing: this.db.prepare(`
        SELECT 
          strftime('%H', recorded_at) as hour,
          AVG(metric_value) as avg_duration,
          COUNT(*) as count,
          SUM(CASE WHEN JSON_EXTRACT(metadata, '$.success') = 1 THEN 1 ELSE 0 END) as success_count
        FROM performance_metrics 
        WHERE metric_type = 'llm_processing' 
        AND metric_name = 'duration'
        AND recorded_at > datetime('now', '-${hoursBack} hours')
        GROUP BY strftime('%H', recorded_at)
        ORDER BY hour
      `).all(),

      cachePerformance: this.db.prepare(`
        SELECT 
          metric_name,
          COUNT(*) as count,
          AVG(metric_value) as avg_value
        FROM performance_metrics 
        WHERE metric_type = 'cache_performance'
        AND recorded_at > datetime('now', '-${hoursBack} hours')
        GROUP BY metric_name
      `).all(),

      errorStats: this.db.prepare(`
        SELECT 
          JSON_EXTRACT(metadata, '$.type') as error_type,
          COUNT(*) as count
        FROM performance_metrics 
        WHERE metric_type = 'system_error'
        AND recorded_at > datetime('now', '-${hoursBack} hours')
        GROUP BY error_type
        ORDER BY count DESC
      `).all()
    };
  }

  /**
   * Calculate processing rate (emails per hour)
   */
  calculateProcessingRate() {
    const lastHourCount = this.db.prepare(`
      SELECT COUNT(*) as count
      FROM performance_metrics 
      WHERE metric_type = 'llm_processing'
      AND recorded_at > datetime('now', '-1 hour')
    `).get();

    return lastHourCount.count || 0;
  }

  /**
   * Calculate daily manual record creation rate
   */
  calculateDailyManualRecordRate() {
    const todayCount = this.db.prepare(`
      SELECT COUNT(*) as count
      FROM performance_metrics 
      WHERE metric_type = 'manual_record'
      AND recorded_at > datetime('now', 'start of day')
    `).get();

    return todayCount.count || 0;
  }

  /**
   * Get conflict count for rate calculation
   */
  getConflictCount() {
    const conflictCount = this.db.prepare(`
      SELECT COUNT(*) as count
      FROM manual_record_conflicts 
      WHERE created_at > datetime('now', '-24 hours')
    `).get();

    return conflictCount.count || 0;
  }

  /**
   * Get duplicate prevention count
   */
  getDuplicatePreventionCount() {
    const preventionCount = this.db.prepare(`
      SELECT COUNT(*) as count
      FROM performance_metrics 
      WHERE metric_type = 'manual_record'
      AND JSON_EXTRACT(metadata, '$.duplicates_prevented') = 1
      AND recorded_at > datetime('now', '-24 hours')
    `).get();

    return preventionCount.count || 0;
  }

  /**
   * Start periodic metric collection
   */
  startPeriodicCollection() {
    // Collect system health metrics every 5 minutes
    setInterval(() => {
      this.recordSystemHealth();
    }, 5 * 60 * 1000);

    // Clean up old metrics every hour
    setInterval(() => {
      this.cleanupOldMetrics();
    }, 60 * 60 * 1000);

    // Calculate and emit summary every 10 minutes
    setInterval(() => {
      const summary = this.getPerformanceSummary();
      this.emit('performance_summary', summary);
    }, 10 * 60 * 1000);
  }

  /**
   * Cleanup old performance metrics to prevent database bloat
   */
  cleanupOldMetrics() {
    const deletedCount = this.db.prepare(`
      DELETE FROM performance_metrics 
      WHERE recorded_at < datetime('now', '-7 days')
    `).run().changes;

    if (deletedCount > 0) {
      console.log(`Cleaned up ${deletedCount} old performance metrics`);
    }
  }

  /**
   * Update performance thresholds
   */
  updateThresholds(newThresholds) {
    this.thresholds = { ...this.thresholds, ...newThresholds };
    this.emit('thresholds_updated', this.thresholds);
  }

  /**
   * Get performance alerts from the last 24 hours
   */
  getRecentAlerts() {
    return this.errorLog.filter(error => 
      new Date(error.timestamp) > new Date(Date.now() - 24 * 60 * 60 * 1000)
    );
  }

  /**
   * Export performance data for analysis
   */
  exportPerformanceData(hoursBack = 168) { // Default 7 days
    return {
      summary: this.getPerformanceSummary(),
      detailed: this.getDetailedMetrics(hoursBack),
      alerts: this.getRecentAlerts(),
      thresholds: this.thresholds,
      exportTimestamp: new Date().toISOString()
    };
  }
}

module.exports = PerformanceMonitor;