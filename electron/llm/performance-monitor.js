/**
 * Performance monitoring for LLM operations
 * Tracks timing, success rates, and provides optimization recommendations
 */

class PerformanceMonitor {
  constructor() {
    this.stats = {
      stage1: {
        calls: 0,
        successes: 0,
        failures: 0,
        timeouts: 0,
        jsonParseErrors: 0,
        totalTime: 0,
        minTime: Infinity,
        maxTime: 0,
        recentTimes: [], // Last 10 calls for trend analysis
        sessionReuses: 0,
        sessionCreations: 0
      },
      stage2: {
        calls: 0,
        successes: 0,
        failures: 0,
        timeouts: 0,
        jsonParseErrors: 0,
        totalTime: 0,
        minTime: Infinity,
        maxTime: 0,
        recentTimes: [], // Last 10 calls for trend analysis
        sessionReuses: 0,
        sessionCreations: 0
      },
      session: {
        disposalErrors: 0,
        creationErrors: 0,
        healthRecoveries: 0
      }
    };
    
    // Start time for overall tracking
    this.startTime = Date.now();
    this.lastReportTime = this.startTime;
    
    console.log('🎯 LLM Performance Monitor initialized');
  }

  // Record Stage 1 classification performance
  recordStage1(duration, success, error = null) {
    const stage1 = this.stats.stage1;
    stage1.calls++;
    stage1.totalTime += duration;
    
    // Update min/max
    stage1.minTime = Math.min(stage1.minTime, duration);
    stage1.maxTime = Math.max(stage1.maxTime, duration);
    
    // Track recent times (last 10)
    stage1.recentTimes.push(duration);
    if (stage1.recentTimes.length > 10) {
      stage1.recentTimes.shift();
    }
    
    if (success) {
      stage1.successes++;
    } else {
      stage1.failures++;
      
      // Categorize error types
      if (error) {
        if (error.message.includes('TIMEOUT') || error.message.includes('timeout')) {
          stage1.timeouts++;
        } else if (error.message.includes('JSON') || error.message.includes('parsing')) {
          stage1.jsonParseErrors++;
        }
      }
    }
    
    // Log performance warnings
    if (duration > 2000) {
      console.warn(`⚠️ Stage 1 slow inference: ${duration}ms (target: <2000ms)`);
    }
  }

  // Record Stage 2 parsing performance
  recordStage2(duration, success, error = null) {
    const stage2 = this.stats.stage2;
    stage2.calls++;
    stage2.totalTime += duration;
    
    // Update min/max
    stage2.minTime = Math.min(stage2.minTime, duration);
    stage2.maxTime = Math.max(stage2.maxTime, duration);
    
    // Track recent times (last 10)
    stage2.recentTimes.push(duration);
    if (stage2.recentTimes.length > 10) {
      stage2.recentTimes.shift();
    }
    
    if (success) {
      stage2.successes++;
    } else {
      stage2.failures++;
      
      // Categorize error types
      if (error) {
        if (error.message.includes('TIMEOUT') || error.message.includes('timeout')) {
          stage2.timeouts++;
        } else if (error.message.includes('JSON') || error.message.includes('parsing')) {
          stage2.jsonParseErrors++;
        }
      }
    }
    
    // Log performance warnings
    if (duration > 4000) {
      console.warn(`⚠️ Stage 2 slow inference: ${duration}ms (target: <4000ms)`);
    }
  }

  // Record session events
  recordSessionEvent(type, stage = null) {
    switch (type) {
      case 'reuse':
        if (stage === 1) this.stats.stage1.sessionReuses++;
        if (stage === 2) this.stats.stage2.sessionReuses++;
        break;
      case 'creation':
        if (stage === 1) this.stats.stage1.sessionCreations++;
        if (stage === 2) this.stats.stage2.sessionCreations++;
        break;
      case 'disposal_error':
        this.stats.session.disposalErrors++;
        break;
      case 'creation_error':
        this.stats.session.creationErrors++;
        break;
      case 'health_recovery':
        this.stats.session.healthRecoveries++;
        break;
    }
  }

  // Get current performance statistics
  getStats() {
    const now = Date.now();
    const uptime = now - this.startTime;
    
    return {
      uptime: uptime,
      stage1: {
        ...this.stats.stage1,
        avgTime: this.stats.stage1.calls > 0 ? Math.round(this.stats.stage1.totalTime / this.stats.stage1.calls) : 0,
        successRate: this.stats.stage1.calls > 0 ? Math.round((this.stats.stage1.successes / this.stats.stage1.calls) * 100) : 0,
        recentAvgTime: this.stats.stage1.recentTimes.length > 0 ? 
          Math.round(this.stats.stage1.recentTimes.reduce((a, b) => a + b, 0) / this.stats.stage1.recentTimes.length) : 0,
        sessionReuseRate: (this.stats.stage1.sessionReuses + this.stats.stage1.sessionCreations) > 0 ?
          Math.round((this.stats.stage1.sessionReuses / (this.stats.stage1.sessionReuses + this.stats.stage1.sessionCreations)) * 100) : 0
      },
      stage2: {
        ...this.stats.stage2,
        avgTime: this.stats.stage2.calls > 0 ? Math.round(this.stats.stage2.totalTime / this.stats.stage2.calls) : 0,
        successRate: this.stats.stage2.calls > 0 ? Math.round((this.stats.stage2.successes / this.stats.stage2.calls) * 100) : 0,
        recentAvgTime: this.stats.stage2.recentTimes.length > 0 ? 
          Math.round(this.stats.stage2.recentTimes.reduce((a, b) => a + b, 0) / this.stats.stage2.recentTimes.length) : 0,
        sessionReuseRate: (this.stats.stage2.sessionReuses + this.stats.stage2.sessionCreations) > 0 ?
          Math.round((this.stats.stage2.sessionReuses / (this.stats.stage2.sessionReuses + this.stats.stage2.sessionCreations)) * 100) : 0
      },
      session: this.stats.session
    };
  }

  // Generate optimization recommendations
  getRecommendations() {
    const stats = this.getStats();
    const recommendations = [];

    // Stage 1 recommendations
    if (stats.stage1.avgTime > 2000) {
      recommendations.push({
        priority: 'HIGH',
        component: 'Stage 1 Classification',
        issue: `Average inference time is ${stats.stage1.avgTime}ms (target: <2000ms)`,
        suggestions: [
          'Reduce STAGE1_MAX_TOKENS (currently 48, try 32)',
          'Decrease context size if possible',
          'Check GPU utilization',
          'Consider model quantization optimization'
        ]
      });
    }

    // Stage 2 recommendations
    if (stats.stage2.avgTime > 4000) {
      recommendations.push({
        priority: 'HIGH',
        component: 'Stage 2 Parsing',
        issue: `Average inference time is ${stats.stage2.avgTime}ms (target: <4000ms)`,
        suggestions: [
          'Reduce LLM_MAX_TOKENS (currently 96, try 64)',
          'Optimize email content preprocessing',
          'Check for memory pressure',
          'Consider caching more aggressively'
        ]
      });
    }

    // JSON parsing error recommendations
    if (stats.stage1.jsonParseErrors > stats.stage1.successes * 0.1) {
      recommendations.push({
        priority: 'CRITICAL',
        component: 'Stage 1 JSON Parsing',
        issue: `High JSON parse error rate: ${stats.stage1.jsonParseErrors} errors in ${stats.stage1.calls} calls`,
        suggestions: [
          'Prompt may need further optimization',
          'Model may need fine-tuning for JSON output',
          'Check fallback extraction patterns',
          'Consider stricter response format enforcement'
        ]
      });
    }

    if (stats.stage2.jsonParseErrors > stats.stage2.successes * 0.1) {
      recommendations.push({
        priority: 'CRITICAL',
        component: 'Stage 2 JSON Parsing',
        issue: `High JSON parse error rate: ${stats.stage2.jsonParseErrors} errors in ${stats.stage2.calls} calls`,
        suggestions: [
          'Prompt may need further optimization',
          'Model may need fine-tuning for JSON output',
          'Check fallback extraction patterns',
          'Consider stricter response format enforcement'
        ]
      });
    }

    // Session management recommendations
    if (stats.session.disposalErrors > 5) {
      recommendations.push({
        priority: 'MEDIUM',
        component: 'Session Management',
        issue: `${stats.session.disposalErrors} session disposal errors detected`,
        suggestions: [
          'Review session cleanup logic',
          'Check for memory leaks',
          'Consider reducing MAX_SESSION_USES',
          'Implement more robust session health checks'
        ]
      });
    }

    // Success rate recommendations
    const overallStage1SuccessRate = stats.stage1.successRate;
    const overallStage2SuccessRate = stats.stage2.successRate;

    if (overallStage1SuccessRate < 95) {
      recommendations.push({
        priority: 'HIGH',
        component: 'Stage 1 Reliability',
        issue: `Success rate is ${overallStage1SuccessRate}% (target: >95%)`,
        suggestions: [
          'Investigate timeout causes',
          'Check model stability',
          'Review error patterns',
          'Consider fallback improvements'
        ]
      });
    }

    if (overallStage2SuccessRate < 90) {
      recommendations.push({
        priority: 'HIGH',
        component: 'Stage 2 Reliability',
        issue: `Success rate is ${overallStage2SuccessRate}% (target: >90%)`,
        suggestions: [
          'Investigate timeout causes',
          'Check model stability',
          'Review error patterns',
          'Consider fallback improvements'
        ]
      });
    }

    return recommendations;
  }

  // Generate performance report
  generateReport() {
    const stats = this.getStats();
    const recommendations = this.getRecommendations();
    
    console.log('📊 LLM Performance Report');
    console.log('========================');
    console.log(`Uptime: ${Math.round(stats.uptime / 1000)}s`);
    console.log('');
    
    console.log('Stage 1 (Classification):');
    console.log(`  Calls: ${stats.stage1.calls}`);
    console.log(`  Success Rate: ${stats.stage1.successRate}%`);
    console.log(`  Avg Time: ${stats.stage1.avgTime}ms (recent: ${stats.stage1.recentAvgTime}ms)`);
    console.log(`  Range: ${stats.stage1.minTime}ms - ${stats.stage1.maxTime}ms`);
    console.log(`  Timeouts: ${stats.stage1.timeouts}`);
    console.log(`  JSON Errors: ${stats.stage1.jsonParseErrors}`);
    console.log(`  Session Reuse: ${stats.stage1.sessionReuseRate}%`);
    console.log('');
    
    console.log('Stage 2 (Parsing):');
    console.log(`  Calls: ${stats.stage2.calls}`);
    console.log(`  Success Rate: ${stats.stage2.successRate}%`);
    console.log(`  Avg Time: ${stats.stage2.avgTime}ms (recent: ${stats.stage2.recentAvgTime}ms)`);
    console.log(`  Range: ${stats.stage2.minTime}ms - ${stats.stage2.maxTime}ms`);
    console.log(`  Timeouts: ${stats.stage2.timeouts}`);
    console.log(`  JSON Errors: ${stats.stage2.jsonParseErrors}`);
    console.log(`  Session Reuse: ${stats.stage2.sessionReuseRate}%`);
    console.log('');
    
    if (recommendations.length > 0) {
      console.log('🚀 Optimization Recommendations:');
      console.log('================================');
      recommendations.forEach((rec, i) => {
        console.log(`${i + 1}. [${rec.priority}] ${rec.component}`);
        console.log(`   Issue: ${rec.issue}`);
        console.log(`   Suggestions:`);
        rec.suggestions.forEach(suggestion => {
          console.log(`   - ${suggestion}`);
        });
        console.log('');
      });
    } else {
      console.log('✅ System performance looks good!');
    }
    
    this.lastReportTime = Date.now();
    return { stats, recommendations };
  }

  // Auto-report every N minutes
  startAutoReporting(intervalMinutes = 5) {
    setInterval(() => {
      this.generateReport();
    }, intervalMinutes * 60 * 1000);
    
    console.log(`🔄 Auto-reporting enabled (every ${intervalMinutes} minutes)`);
  }

  // Reset statistics
  reset() {
    this.__init__();
    console.log('🔄 Performance monitor reset');
  }
}

// Global instance
const performanceMonitor = new PerformanceMonitor();

module.exports = {
  PerformanceMonitor,
  performanceMonitor
};