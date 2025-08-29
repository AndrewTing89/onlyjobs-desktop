const fs = require('fs').promises;
const path = require('path');
const { app } = require('electron');
const Database = require('better-sqlite3');
const { createHash } = require('crypto');

/**
 * Training Data Exporter
 * Exports training data corrections in multiple formats for model retraining
 */
class TrainingDataExporter {
  constructor() {
    this.db = null;
    this.exportPath = path.join(app.getPath('userData'), 'training-exports');
  }

  /**
   * Initialize database connection
   */
  initializeDb() {
    if (!this.db) {
      const dbPath = path.join(app.getPath('userData'), 'jobs.db');
      this.db = new Database(dbPath);
    }
  }

  /**
   * Ensure export directory exists
   */
  async ensureExportDir() {
    try {
      await fs.mkdir(this.exportPath, { recursive: true });
    } catch (error) {
      console.error('Error creating export directory:', error);
    }
  }

  /**
   * Anonymize sensitive email content
   * @param {string} text - Text to anonymize
   * @returns {string} Anonymized text
   */
  anonymizeText(text) {
    if (!text) return text;

    // Replace email addresses with placeholder
    text = text.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[EMAIL]');
    
    // Replace phone numbers with placeholder
    text = text.replace(/(\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g, '[PHONE]');
    
    // Replace URLs with placeholder
    text = text.replace(/https?:\/\/[^\s]+/g, '[URL]');
    
    // Replace potential names (capitalized words that appear multiple times)
    const words = text.split(/\s+/);
    const wordCounts = {};
    words.forEach(word => {
      const cleaned = word.replace(/[^a-zA-Z]/g, '');
      if (cleaned.length > 2 && cleaned[0] === cleaned[0].toUpperCase()) {
        wordCounts[cleaned] = (wordCounts[cleaned] || 0) + 1;
      }
    });

    // Replace repeated capitalized words (likely names) with placeholders
    Object.keys(wordCounts).forEach(word => {
      if (wordCounts[word] > 1) {
        const regex = new RegExp(`\\b${word}\\b`, 'g');
        text = text.replace(regex, '[NAME]');
      }
    });

    return text;
  }

  /**
   * Get training data for export (only valuable examples)
   * @param {boolean} includeExported - Include already exported data
   * @returns {Array} Training examples
   */
  getTrainingData(includeExported = false) {
    this.initializeDb();

    const whereClause = includeExported 
      ? 'WHERE is_valuable_example = 1'
      : 'WHERE is_valuable_example = 1 AND exported_at IS NULL';

    const stmt = this.db.prepare(`
      SELECT 
        id,
        email_hash,
        subject,
        body_snippet,
        sender_domain,
        original_prediction,
        original_confidence,
        model_version,
        user_classification,
        correction_type,
        correction_reason,
        user_feedback,
        features_json,
        created_at
      FROM training_feedback
      ${whereClause}
      ORDER BY created_at DESC
    `);

    return stmt.all();
  }

  /**
   * Export training data in CSV format
   * @param {Object} options - Export options
   * @returns {Promise<Object>} Export result
   */
  async exportCSV(options = {}) {
    try {
      await this.ensureExportDir();

      const {
        anonymize = true,
        includeExported = false,
        includeFeatures = true
      } = options;

      const data = this.getTrainingData(includeExported);
      
      if (data.length === 0) {
        return { success: false, message: 'No training data to export' };
      }

      // CSV headers
      const headers = [
        'id',
        'email_hash',
        'subject',
        'body_snippet',
        'sender_domain',
        'original_prediction',
        'original_confidence',
        'model_version',
        'user_classification',
        'correction_type',
        'correction_reason',
        'user_feedback',
        'created_at'
      ];

      if (includeFeatures) {
        headers.push('features_json');
      }

      // Convert data to CSV rows
      const csvRows = [headers.join(',')];
      
      data.forEach(row => {
        const csvRow = [
          row.id,
          row.email_hash,
          `"${this.escapeCsvField(anonymize ? this.anonymizeText(row.subject) : row.subject)}"`,
          `"${this.escapeCsvField(anonymize ? this.anonymizeText(row.body_snippet) : row.body_snippet)}"`,
          row.sender_domain,
          row.original_prediction,
          row.original_confidence,
          row.model_version,
          row.user_classification,
          row.correction_type,
          `"${this.escapeCsvField(row.correction_reason || '')}"`,
          `"${this.escapeCsvField(row.user_feedback || '')}"`,
          row.created_at
        ];

        if (includeFeatures) {
          csvRow.push(`"${this.escapeCsvField(row.features_json || '{}')}"`);
        }

        csvRows.push(csvRow.join(','));
      });

      const csvContent = csvRows.join('\n');
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `training-data-${timestamp}.csv`;
      const filePath = path.join(this.exportPath, filename);

      await fs.writeFile(filePath, csvContent, 'utf8');

      // Mark as exported
      if (!includeExported) {
        this.markAsExported(data.map(row => row.id));
      }

      return {
        success: true,
        filename,
        filePath,
        recordCount: data.length,
        format: 'CSV'
      };

    } catch (error) {
      console.error('Error exporting CSV:', error);
      return { success: false, message: error.message };
    }
  }

  /**
   * Export training data in JSON format
   * @param {Object} options - Export options
   * @returns {Promise<Object>} Export result
   */
  async exportJSON(options = {}) {
    try {
      await this.ensureExportDir();

      const {
        anonymize = true,
        includeExported = false,
        includeFeatures = true
      } = options;

      const data = this.getTrainingData(includeExported);
      
      if (data.length === 0) {
        return { success: false, message: 'No training data to export' };
      }

      // Process data for JSON export
      const jsonData = {
        metadata: {
          exportedAt: new Date().toISOString(),
          recordCount: data.length,
          anonymized: anonymize,
          includesFeatures: includeFeatures,
          exportVersion: '1.0'
        },
        trainingExamples: data.map(row => {
          const example = {
            id: row.id,
            emailHash: row.email_hash,
            subject: anonymize ? this.anonymizeText(row.subject) : row.subject,
            bodySnippet: anonymize ? this.anonymizeText(row.body_snippet) : row.body_snippet,
            senderDomain: row.sender_domain,
            originalPrediction: row.original_prediction,
            originalConfidence: row.original_confidence,
            modelVersion: row.model_version,
            userClassification: row.user_classification,
            correctionType: row.correction_type,
            correctionReason: row.correction_reason,
            userFeedback: row.user_feedback,
            createdAt: row.created_at
          };

          if (includeFeatures && row.features_json) {
            try {
              example.features = JSON.parse(row.features_json);
            } catch (e) {
              example.features = {};
            }
          }

          return example;
        })
      };

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `training-data-${timestamp}.json`;
      const filePath = path.join(this.exportPath, filename);

      await fs.writeFile(filePath, JSON.stringify(jsonData, null, 2), 'utf8');

      // Mark as exported
      if (!includeExported) {
        this.markAsExported(data.map(row => row.id));
      }

      return {
        success: true,
        filename,
        filePath,
        recordCount: data.length,
        format: 'JSON'
      };

    } catch (error) {
      console.error('Error exporting JSON:', error);
      return { success: false, message: error.message };
    }
  }

  /**
   * Export training data for scikit-learn/XGBoost (pickle-compatible format)
   * @param {Object} options - Export options
   * @returns {Promise<Object>} Export result
   */
  async exportForMLTraining(options = {}) {
    try {
      await this.ensureExportDir();

      const {
        anonymize = true,
        includeExported = false
      } = options;

      const data = this.getTrainingData(includeExported);
      
      if (data.length === 0) {
        return { success: false, message: 'No training data to export' };
      }

      // Format data for ML training (similar to existing XGBoost pipeline)
      const mlData = {
        metadata: {
          exportedAt: new Date().toISOString(),
          recordCount: data.length,
          features: [
            'subject_length', 'body_length', 'subject_word_count',
            'has_job_keywords', 'has_application_keywords', 'has_rejection_keywords',
            'is_common_domain', 'has_company_signature',
            'subject_has_re', 'subject_has_fwd'
          ],
          targetColumn: 'is_job_related'
        },
        training_data: data.map(row => {
          let features = {};
          try {
            features = JSON.parse(row.features_json || '{}');
          } catch (e) {
            console.warn('Failed to parse features for row', row.id);
          }

          return {
            // Text features (anonymized if requested)
            subject: anonymize ? this.anonymizeText(row.subject) : row.subject,
            body: anonymize ? this.anonymizeText(row.body_snippet) : row.body_snippet,
            sender_domain: row.sender_domain,
            
            // Extracted features
            subject_length: features.subject_length || row.subject.length,
            body_length: features.body_length || row.body_snippet.length,
            subject_word_count: features.subject_word_count || row.subject.split(' ').length,
            
            has_job_keywords: features.has_job_keywords || false,
            has_application_keywords: features.has_application_keywords || false,
            has_rejection_keywords: features.has_rejection_keywords || false,
            
            is_common_domain: features.is_common_domain || false,
            has_company_signature: features.has_company_signature || false,
            
            subject_has_re: features.subject_has_re || false,
            subject_has_fwd: features.subject_has_fwd || false,
            
            // Target variable
            is_job_related: row.user_classification,
            
            // Metadata for analysis
            original_prediction: row.original_prediction,
            original_confidence: row.original_confidence,
            correction_type: row.correction_type
          };
        })
      };

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `ml-training-data-${timestamp}.json`;
      const filePath = path.join(this.exportPath, filename);

      await fs.writeFile(filePath, JSON.stringify(mlData, null, 2), 'utf8');

      // Also create a Python script to load this data
      const pythonScript = this.generatePythonLoader(filename);
      const scriptPath = path.join(this.exportPath, `load-${filename.replace('.json', '.py')}`);
      await fs.writeFile(scriptPath, pythonScript, 'utf8');

      // Mark as exported
      if (!includeExported) {
        this.markAsExported(data.map(row => row.id));
      }

      return {
        success: true,
        filename,
        filePath,
        scriptPath,
        recordCount: data.length,
        format: 'ML Training'
      };

    } catch (error) {
      console.error('Error exporting ML training data:', error);
      return { success: false, message: error.message };
    }
  }

  /**
   * Generate Python script to load training data
   * @param {string} jsonFilename - JSON filename to load
   * @returns {string} Python script content
   */
  generatePythonLoader(jsonFilename) {
    return `#!/usr/bin/env python3
"""
Training Data Loader for OnlyJobs ML Model
Generated automatically by training-data-exporter.js

Usage:
    python load-${jsonFilename.replace('.json', '.py')}
"""

import json
import pandas as pd
import numpy as np
from pathlib import Path

def load_training_data():
    """Load training data from JSON export"""
    data_file = Path(__file__).parent / "${jsonFilename}"
    
    with open(data_file, 'r') as f:
        data = json.load(f)
    
    print(f"Loaded {data['metadata']['recordCount']} training examples")
    print(f"Exported at: {data['metadata']['exportedAt']}")
    
    # Convert to DataFrame
    df = pd.DataFrame(data['training_data'])
    
    # Feature columns
    feature_cols = data['metadata']['features']
    target_col = data['metadata']['targetColumn']
    
    X = df[feature_cols]
    y = df[target_col]
    
    print(f"Features: {feature_cols}")
    print(f"Target distribution: {y.value_counts().to_dict()}")
    
    return X, y, df

def analyze_corrections():
    """Analyze user corrections vs original predictions"""
    _, _, df = load_training_data()
    
    # Correction analysis
    corrections = df[df['original_prediction'] != df['is_job_related']]
    print(f"\\nCorrections made: {len(corrections)} out of {len(df)} examples")
    
    if len(corrections) > 0:
        print("Correction breakdown by type:")
        print(corrections['correction_type'].value_counts())
        
        print("\\nConfidence distribution for corrected examples:")
        print(f"Mean confidence: {corrections['original_confidence'].mean():.3f}")
        print(f"Min confidence: {corrections['original_confidence'].min():.3f}")
        print(f"Max confidence: {corrections['original_confidence'].max():.3f}")

if __name__ == "__main__":
    X, y, df = load_training_data()
    analyze_corrections()
    
    print(f"\\nReady for training with {X.shape[0]} examples and {X.shape[1]} features")
`;
  }

  /**
   * Mark training examples as exported
   * @param {Array} ids - Array of training example IDs
   */
  markAsExported(ids) {
    if (!ids || ids.length === 0) return;

    this.initializeDb();
    
    const placeholders = ids.map(() => '?').join(',');
    const stmt = this.db.prepare(`
      UPDATE training_feedback 
      SET exported_at = CURRENT_TIMESTAMP 
      WHERE id IN (${placeholders})
    `);
    
    const result = stmt.run(...ids);
    console.log(`📊 Marked ${result.changes} training examples as exported`);
  }

  /**
   * Escape CSV field content
   * @param {string} field - Field content
   * @returns {string} Escaped content
   */
  escapeCsvField(field) {
    if (!field) return '';
    // Escape double quotes by doubling them
    return field.toString().replace(/"/g, '""');
  }

  /**
   * Get export statistics
   * @returns {Object} Export statistics
   */
  getExportStats() {
    this.initializeDb();

    const stats = this.db.prepare(`
      SELECT 
        COUNT(*) as total_examples,
        COUNT(CASE WHEN exported_at IS NOT NULL THEN 1 END) as exported_examples,
        COUNT(CASE WHEN exported_at IS NULL AND is_valuable_example = 1 THEN 1 END) as ready_to_export,
        MIN(created_at) as oldest_example,
        MAX(created_at) as newest_example
      FROM training_feedback
    `).get();

    return {
      totalExamples: stats.total_examples || 0,
      exportedExamples: stats.exported_examples || 0,
      readyToExport: stats.ready_to_export || 0,
      oldestExample: stats.oldest_example,
      newestExample: stats.newest_example
    };
  }

  /**
   * Generate summary report
   * @returns {Object} Summary report
   */
  generateSummary() {
    this.initializeDb();

    const exportStats = this.getExportStats();
    
    const correctionAccuracy = this.db.prepare(`
      SELECT 
        AVG(CASE WHEN original_prediction = user_classification THEN 1.0 ELSE 0.0 END) as accuracy,
        COUNT(CASE WHEN original_prediction != user_classification THEN 1 END) as corrections,
        AVG(original_confidence) as avg_confidence
      FROM training_feedback
      WHERE original_prediction IS NOT NULL
    `).get();

    const domainBreakdown = this.db.prepare(`
      SELECT 
        sender_domain,
        COUNT(*) as count,
        AVG(CASE WHEN user_classification = 1 THEN 1.0 ELSE 0.0 END) as job_rate
      FROM training_feedback
      GROUP BY sender_domain
      ORDER BY count DESC
      LIMIT 10
    `).all();

    return {
      exportStats,
      modelAccuracy: correctionAccuracy.accuracy || 0,
      totalCorrections: correctionAccuracy.corrections || 0,
      averageConfidence: correctionAccuracy.avg_confidence || 0,
      topDomains: domainBreakdown,
      generatedAt: new Date().toISOString()
    };
  }
}

// Singleton instance
let instance = null;

module.exports = {
  /**
   * Get Training Data Exporter instance
   */
  getTrainingDataExporter() {
    if (!instance) {
      instance = new TrainingDataExporter();
    }
    return instance;
  }
};