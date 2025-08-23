"use strict";

/**
 * Production LLM Performance Monitor
 * Tracks accuracy, performance, and quality metrics for Gmail email classification
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class ProductionLLMMonitor {
    constructor() {
        this.metrics = {
            // Performance metrics
            totalRequests: 0,
            successfulRequests: 0,
            failedRequests: 0,
            timeouts: 0,
            
            // Timing metrics
            avgStage1Time: 0,
            avgStage2Time: 0,
            maxStage1Time: 0,
            maxStage2Time: 0,
            
            // Accuracy tracking
            accuracyChecks: 0,
            correctClassifications: 0,
            
            // Pattern-specific metrics
            patternStats: {
                'ats-emails': { total: 0, correct: 0 },
                'rejections': { total: 0, correct: 0 },
                'job-boards': { total: 0, correct: 0 },
                'interviews': { total: 0, correct: 0 },
                'offers': { total: 0, correct: 0 }
            },
            
            // Quality metrics
            cacheHitRate: 0,
            fallbackUsage: 0,
            
            // Error tracking
            commonErrors: {},
            
            // Real-time metrics (last 100 requests)
            recentResults: [],
            
            lastReset: Date.now()
        };
        
        this.confidenceTracker = new Map(); // Track confidence over time
        this.errorPatterns = new Map();     // Track error patterns
    }

    // Record a successful classification
    recordClassification(stage, result, timeTaken, emailContext) {
        this.metrics.totalRequests++;
        this.metrics.successfulRequests++;
        
        // Update timing metrics
        if (stage === 'stage1') {
            this.updateTimingMetric('avgStage1Time', 'maxStage1Time', timeTaken);
        } else if (stage === 'stage2') {
            this.updateTimingMetric('avgStage2Time', 'maxStage2Time', timeTaken);
        }
        
        // Pattern detection and tracking
        const pattern = this.detectEmailPattern(emailContext, result);
        if (pattern && this.metrics.patternStats[pattern]) {
            this.metrics.patternStats[pattern].total++;
        }
        
        // Add to recent results for trend analysis
        this.addToRecentResults({
            timestamp: Date.now(),
            success: true,
            stage,
            timeTaken,
            pattern,
            result
        });
        
        console.log(`📊 LLM Monitor: ${stage} classification - ${timeTaken}ms (pattern: ${pattern})`);
    }

    // Record a failed classification
    recordFailure(stage, error, timeTaken, emailContext) {
        this.metrics.totalRequests++;
        this.metrics.failedRequests++;
        
        if (error.message?.includes('timeout') || error.message?.includes('TIMEOUT')) {
            this.metrics.timeouts++;
        }
        
        // Track error patterns
        const errorKey = this.categorizeError(error);
        this.metrics.commonErrors[errorKey] = (this.metrics.commonErrors[errorKey] || 0) + 1;
        
        // Store error pattern for analysis
        const emailHash = this.hashEmail(emailContext);
        this.errorPatterns.set(emailHash, {
            error: errorKey,
            timestamp: Date.now(),
            stage,
            timeTaken
        });
        
        this.addToRecentResults({
            timestamp: Date.now(),
            success: false,
            stage,
            timeTaken,
            error: errorKey,
            emailHash
        });
        
        console.warn(`⚠️ LLM Monitor: ${stage} failed - ${error.message} (${timeTaken}ms)`);
    }

    // Record cache usage
    recordCacheHit(stage) {
        const totalCacheRequests = this.metrics.totalRequests;
        this.metrics.cacheHitRate = ((this.metrics.cacheHitRate * (totalCacheRequests - 1)) + 1) / totalCacheRequests;
        
        console.log(`💾 LLM Monitor: ${stage} cache hit`);
    }

    // Record fallback usage
    recordFallback(reason, emailContext) {
        this.metrics.fallbackUsage++;
        
        const pattern = this.detectEmailPattern(emailContext, null);
        console.warn(`🔄 LLM Monitor: Fallback used (${reason}) - pattern: ${pattern}`);
    }

    // Manual accuracy check (when user corrects a classification)
    recordAccuracyCheck(originalResult, correctedResult, emailContext) {
        this.metrics.accuracyChecks++;
        
        const isCorrect = this.compareResults(originalResult, correctedResult);
        if (isCorrect) {
            this.metrics.correctClassifications++;
        }
        
        // Update pattern-specific accuracy
        const pattern = this.detectEmailPattern(emailContext, correctedResult);
        if (pattern && this.metrics.patternStats[pattern]) {
            if (isCorrect) {
                this.metrics.patternStats[pattern].correct++;
            }
        }
        
        console.log(`🎯 LLM Monitor: Accuracy check - ${isCorrect ? 'CORRECT' : 'INCORRECT'} (pattern: ${pattern})`);
    }

    // Get current performance metrics
    getCurrentMetrics() {
        const successRate = this.metrics.totalRequests > 0 ? 
            (this.metrics.successfulRequests / this.metrics.totalRequests) * 100 : 0;
            
        const accuracyRate = this.metrics.accuracyChecks > 0 ?
            (this.metrics.correctClassifications / this.metrics.accuracyChecks) * 100 : null;
            
        const timeoutRate = this.metrics.totalRequests > 0 ?
            (this.metrics.timeouts / this.metrics.totalRequests) * 100 : 0;

        // Calculate pattern-specific accuracies
        const patternAccuracies = {};
        for (const [pattern, stats] of Object.entries(this.metrics.patternStats)) {
            patternAccuracies[pattern] = stats.total > 0 ? 
                (stats.correct / stats.total) * 100 : null;
        }

        return {
            performance: {
                totalRequests: this.metrics.totalRequests,
                successRate: Math.round(successRate * 100) / 100,
                timeoutRate: Math.round(timeoutRate * 100) / 100,
                avgStage1Time: Math.round(this.metrics.avgStage1Time),
                avgStage2Time: Math.round(this.metrics.avgStage2Time),
                maxStage1Time: this.metrics.maxStage1Time,
                maxStage2Time: this.metrics.maxStage2Time
            },
            accuracy: {
                overallAccuracy: accuracyRate ? Math.round(accuracyRate * 100) / 100 : 'No data',
                accuracyChecks: this.metrics.accuracyChecks,
                patternAccuracies
            },
            quality: {
                cacheHitRate: Math.round(this.metrics.cacheHitRate * 10000) / 100,
                fallbackUsage: this.metrics.fallbackUsage
            },
            errors: {
                commonErrors: this.metrics.commonErrors,
                recentTrends: this.getRecentTrends()
            },
            uptime: {
                sessionStart: new Date(this.metrics.lastReset).toISOString(),
                sessionDuration: Math.round((Date.now() - this.metrics.lastReset) / 1000)
            }
        };
    }

    // Print performance summary
    printPerformanceSummary() {
        const metrics = this.getCurrentMetrics();
        
        console.log('\n' + '='.repeat(60));
        console.log('📊 LLM PRODUCTION PERFORMANCE SUMMARY');
        console.log('='.repeat(60));
        
        console.log('\n🚀 Performance Metrics:');
        console.log(`   Total Requests: ${metrics.performance.totalRequests}`);
        console.log(`   Success Rate: ${metrics.performance.successRate}%`);
        console.log(`   Timeout Rate: ${metrics.performance.timeoutRate}%`);
        console.log(`   Avg Stage 1 Time: ${metrics.performance.avgStage1Time}ms`);
        console.log(`   Avg Stage 2 Time: ${metrics.performance.avgStage2Time}ms`);
        
        console.log('\n🎯 Accuracy Metrics:');
        console.log(`   Overall Accuracy: ${metrics.accuracy.overallAccuracy}%`);
        console.log(`   Accuracy Checks: ${metrics.accuracy.accuracyChecks}`);
        
        console.log('\n📈 Pattern-Specific Accuracy:');
        for (const [pattern, accuracy] of Object.entries(metrics.accuracy.patternAccuracies)) {
            const status = accuracy === null ? '📊 No data' : 
                          accuracy >= 90 ? `✅ ${accuracy}%` :
                          accuracy >= 70 ? `⚠️ ${accuracy}%` : `❌ ${accuracy}%`;
            console.log(`   ${pattern}: ${status}`);
        }
        
        console.log('\n💾 Quality Metrics:');
        console.log(`   Cache Hit Rate: ${metrics.quality.cacheHitRate}%`);
        console.log(`   Fallback Usage: ${metrics.quality.fallbackUsage} times`);
        
        if (Object.keys(metrics.errors.commonErrors).length > 0) {
            console.log('\n❌ Common Errors:');
            const sortedErrors = Object.entries(metrics.errors.commonErrors)
                .sort(([,a], [,b]) => b - a)
                .slice(0, 5);
            sortedErrors.forEach(([error, count]) => {
                console.log(`   ${error}: ${count} occurrences`);
            });
        }
        
        console.log(`\n⏰ Session Duration: ${metrics.uptime.sessionDuration} seconds`);
        console.log('='.repeat(60));
        
        // Alert on performance issues
        this.checkAlerts(metrics);
    }

    // Check for performance alerts
    checkAlerts(metrics) {
        const alerts = [];
        
        if (metrics.performance.successRate < 85) {
            alerts.push(`🚨 LOW SUCCESS RATE: ${metrics.performance.successRate}% (target: >85%)`);
        }
        
        if (metrics.performance.timeoutRate > 10) {
            alerts.push(`🚨 HIGH TIMEOUT RATE: ${metrics.performance.timeoutRate}% (target: <10%)`);
        }
        
        if (metrics.performance.avgStage1Time > 10000) {
            alerts.push(`🚨 SLOW STAGE 1: ${metrics.performance.avgStage1Time}ms (target: <10s)`);
        }
        
        if (metrics.accuracy.overallAccuracy !== 'No data' && metrics.accuracy.overallAccuracy < 90) {
            alerts.push(`🚨 LOW ACCURACY: ${metrics.accuracy.overallAccuracy}% (target: >90%)`);
        }
        
        if (alerts.length > 0) {
            console.log('\n🚨 PERFORMANCE ALERTS:');
            alerts.forEach(alert => console.log(`   ${alert}`));
        }
    }

    // Helper methods
    updateTimingMetric(avgKey, maxKey, newTime) {
        const currentAvg = this.metrics[avgKey];
        const totalRequests = this.metrics.totalRequests;
        
        this.metrics[avgKey] = ((currentAvg * (totalRequests - 1)) + newTime) / totalRequests;
        this.metrics[maxKey] = Math.max(this.metrics[maxKey], newTime);
    }

    detectEmailPattern(emailContext, result) {
        if (!emailContext) return 'unknown';
        
        const { from, subject, plaintext } = emailContext;
        const fromLower = (from || '').toLowerCase();
        const subjectLower = (subject || '').toLowerCase();
        const bodyLower = (plaintext || '').toLowerCase();
        
        // ATS patterns
        if (fromLower.includes('@greenhouse.io') || fromLower.includes('@workday.com') || 
            fromLower.includes('@lever.co') || fromLower.includes('@bamboohr.com')) {
            return 'ats-emails';
        }
        
        // Job rejection patterns
        if (bodyLower.includes('unfortunately') || bodyLower.includes('regret to inform') ||
            bodyLower.includes('not selected') || bodyLower.includes('other candidates')) {
            return 'rejections';
        }
        
        // Job board patterns
        if (fromLower.includes('@indeed.com') || fromLower.includes('@linkedin.com') ||
            subjectLower.includes('job alert') || subjectLower.includes('recommended for you')) {
            return 'job-boards';
        }
        
        // Interview patterns
        if (subjectLower.includes('interview') || bodyLower.includes('schedule') ||
            bodyLower.includes('phone screen')) {
            return 'interviews';
        }
        
        // Offer patterns
        if (subjectLower.includes('offer') || bodyLower.includes('congratulations') ||
            bodyLower.includes('pleased to offer')) {
            return 'offers';
        }
        
        return 'general';
    }

    categorizeError(error) {
        const message = error.message?.toLowerCase() || '';
        
        if (message.includes('timeout') || message.includes('aborted')) {
            return 'timeout';
        }
        if (message.includes('json') || message.includes('parse')) {
            return 'parsing-error';
        }
        if (message.includes('model') || message.includes('llama')) {
            return 'model-error';
        }
        if (message.includes('context') || message.includes('session')) {
            return 'context-error';
        }
        
        return 'other-error';
    }

    compareResults(original, corrected) {
        return (
            original.is_job_related === corrected.is_job_related &&
            this.normalizeString(original.company) === this.normalizeString(corrected.company) &&
            this.normalizeString(original.position) === this.normalizeString(corrected.position) &&
            original.status === corrected.status
        );
    }

    normalizeString(str) {
        return (str || '').toLowerCase().trim().replace(/\s+/g, ' ');
    }

    hashEmail(emailContext) {
        const content = `${emailContext.from || ''}|${emailContext.subject || ''}|${(emailContext.plaintext || '').slice(0, 200)}`;
        return crypto.createHash('md5').update(content).digest('hex');
    }

    addToRecentResults(result) {
        this.metrics.recentResults.push(result);
        
        // Keep only last 100 results
        if (this.metrics.recentResults.length > 100) {
            this.metrics.recentResults.shift();
        }
    }

    getRecentTrends() {
        if (this.metrics.recentResults.length < 10) return null;
        
        const recent = this.metrics.recentResults.slice(-20);
        const successRate = (recent.filter(r => r.success).length / recent.length) * 100;
        const avgTime = recent.reduce((sum, r) => sum + r.timeTaken, 0) / recent.length;
        
        return {
            recentSuccessRate: Math.round(successRate * 100) / 100,
            recentAvgTime: Math.round(avgTime)
        };
    }

    // Save metrics to file for persistence
    saveMetricsToFile(filepath) {
        try {
            fs.writeFileSync(filepath, JSON.stringify(this.metrics, null, 2));
            console.log(`📁 Metrics saved to ${filepath}`);
        } catch (error) {
            console.error(`❌ Failed to save metrics: ${error.message}`);
        }
    }

    // Load metrics from file
    loadMetricsFromFile(filepath) {
        try {
            if (fs.existsSync(filepath)) {
                const data = fs.readFileSync(filepath, 'utf-8');
                this.metrics = { ...this.metrics, ...JSON.parse(data) };
                console.log(`📁 Metrics loaded from ${filepath}`);
            }
        } catch (error) {
            console.error(`❌ Failed to load metrics: ${error.message}`);
        }
    }

    // Reset metrics (useful for testing)
    resetMetrics() {
        this.metrics = {
            totalRequests: 0,
            successfulRequests: 0,
            failedRequests: 0,
            timeouts: 0,
            avgStage1Time: 0,
            avgStage2Time: 0,
            maxStage1Time: 0,
            maxStage2Time: 0,
            accuracyChecks: 0,
            correctClassifications: 0,
            patternStats: {
                'ats-emails': { total: 0, correct: 0 },
                'rejections': { total: 0, correct: 0 },
                'job-boards': { total: 0, correct: 0 },
                'interviews': { total: 0, correct: 0 },
                'offers': { total: 0, correct: 0 }
            },
            cacheHitRate: 0,
            fallbackUsage: 0,
            commonErrors: {},
            recentResults: [],
            lastReset: Date.now()
        };
        
        this.confidenceTracker.clear();
        this.errorPatterns.clear();
        
        console.log('🔄 Metrics reset');
    }
}

// Global monitor instance
let globalMonitor = null;

function getGlobalMonitor() {
    if (!globalMonitor) {
        globalMonitor = new ProductionLLMMonitor();
    }
    return globalMonitor;
}

module.exports = {
    ProductionLLMMonitor,
    getGlobalMonitor
};