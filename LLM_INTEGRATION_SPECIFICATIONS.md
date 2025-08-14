# LLM Integration Specifications for Manual Record Support

This document provides comprehensive integration specifications for the fullstack development coordinator to implement job record editing and manual record creation with optimized LLM processing.

## 1. Database Schema Enhancements

### Required Database Table Modifications

#### Extended `job_applications` Table
```sql
-- Add these columns to existing job_applications table
ALTER TABLE job_applications ADD COLUMN record_source TEXT DEFAULT 'llm_processed' 
  CHECK (record_source IN ('llm_processed', 'manual_created', 'user_edited', 'hybrid'));
ALTER TABLE job_applications ADD COLUMN creation_method TEXT DEFAULT 'email_processing';
ALTER TABLE job_applications ADD COLUMN llm_confidence REAL;
ALTER TABLE job_applications ADD COLUMN data_quality TEXT DEFAULT 'medium' 
  CHECK (data_quality IN ('high', 'medium', 'low', 'manual'));
ALTER TABLE job_applications ADD COLUMN original_extraction_data TEXT; -- JSON of original LLM extraction
ALTER TABLE job_applications ADD COLUMN user_modifications TEXT; -- JSON of user edits
ALTER TABLE job_applications ADD COLUMN processing_metadata TEXT; -- JSON of LLM processing context
ALTER TABLE job_applications ADD COLUMN last_llm_processing DATETIME;
ALTER TABLE job_applications ADD COLUMN skip_llm_processing BOOLEAN DEFAULT 0;
```

#### New Metadata Tables
```sql
-- LLM processing history for audit trail
CREATE TABLE llm_processing_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id TEXT NOT NULL,
  email_id TEXT,
  processing_type TEXT NOT NULL,
  model_version TEXT,
  prompt_version TEXT,
  input_hash TEXT,
  output_data TEXT,
  confidence_score REAL,
  processing_context TEXT,
  processing_duration_ms INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (job_id) REFERENCES job_applications (job_id)
);

-- Cache invalidation tracking
CREATE TABLE cache_invalidation_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id TEXT NOT NULL,
  invalidation_reason TEXT NOT NULL,
  affected_caches TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (job_id) REFERENCES job_applications (job_id)
);

-- Manual record conflict tracking
CREATE TABLE manual_record_conflicts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id TEXT NOT NULL,
  email_id TEXT,
  conflict_type TEXT NOT NULL,
  manual_data TEXT,
  llm_data TEXT,
  resolution_strategy TEXT,
  resolved BOOLEAN DEFAULT 0,
  resolved_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (job_id) REFERENCES job_applications (job_id)
);
```

### Indexes for Performance
```sql
CREATE INDEX idx_record_source ON job_applications(record_source);
CREATE INDEX idx_skip_llm_processing ON job_applications(skip_llm_processing);
CREATE INDEX idx_llm_processing_type ON llm_processing_history(processing_type);
CREATE INDEX idx_manual_conflicts_unresolved ON manual_record_conflicts(resolved, job_id);
```

## 2. API Interface Specifications

### Manual Record Creation Endpoint
```typescript
POST /api/jobs/manual
{
  company: string;
  job_title: string;
  location?: string;
  status: 'Applied' | 'Interview' | 'Declined' | 'Offer';
  application_date?: string;
  notes?: string;
  user_metadata?: object;
}

Response:
{
  job_id: string;
  record_source: 'manual_created';
  validation_result: {
    hasConflicts: boolean;
    conflictingRecords?: Array<{job_id: string, similarity: number}>;
    recommendation: 'proceed' | 'review_conflicts';
  }
}
```

### Record Editing Endpoint
```typescript
PUT /api/jobs/{jobId}
{
  company?: string;
  job_title?: string;
  location?: string;
  status?: 'Applied' | 'Interview' | 'Declined' | 'Offer';
  notes?: string;
  preserve_llm_data?: boolean; // Flag to keep original LLM extraction
}

Response:
{
  job_id: string;
  record_source: 'user_edited' | 'hybrid';
  edit_metadata: {
    edited_fields: string[];
    edit_timestamp: string;
    conflicts_detected?: Array<ConflictInfo>;
  };
  cache_invalidation: {
    invalidated_keys: string[];
    affected_systems: string[];
  }
}
```

### Record Source Validation Endpoint
```typescript
GET /api/jobs/{jobId}/source-validation
Response:
{
  record_source: string;
  should_process_with_llm: boolean;
  metadata: {
    creation_method: string;
    llm_confidence?: number;
    data_quality: string;
    last_llm_processing?: string;
  }
}
```

### Conflict Resolution Endpoint
```typescript
POST /api/jobs/{jobId}/resolve-conflicts
{
  conflicts: Array<{
    field: string;
    manual_value: any;
    llm_value: any;
    resolution_preference: 'manual' | 'llm' | 'merge';
  }>;
}

Response:
{
  resolved_data: object;
  resolution_summary: {
    conflicts_resolved: number;
    requires_review: boolean;
    rationale: string[];
  }
}
```

## 3. LLM Processing Integration Points

### Email Processing Pipeline Integration
```typescript
// Updated email processing flow
async function processEmail(emailData) {
  // 1. Pre-processing validation
  const validationResult = await recordSourceValidator.shouldProcessEmail(emailData);
  
  if (!validationResult.shouldProcess) {
    return {
      skipped: true,
      reason: validationResult.reason,
      manual_record_risk: validationResult.manualRecordRisk
    };
  }

  // 2. LLM processing with enhanced metadata
  const llmResult = await llmEngine.parseEmailWithTwoStage(emailData);
  
  // 3. Conflict detection
  const conflicts = await conflictResolver.detectConflicts(llmResult);
  
  // 4. Record creation/update with metadata tracking
  const jobId = await createOrUpdateJob(llmResult, {
    record_source: 'llm_processed',
    processing_metadata: validationResult,
    conflicts: conflicts
  });

  return { jobId, llmResult, conflicts };
}
```

### Cache Management Integration
```typescript
// Cache invalidation on record edits
async function updateJobRecord(jobId, updates) {
  // 1. Get current record state
  const currentRecord = await getJobRecord(jobId);
  
  // 2. Apply updates
  const updatedRecord = await applyUpdates(currentRecord, updates);
  
  // 3. Invalidate affected caches
  const invalidatedKeys = cacheManager.invalidateJobCaches(jobId, updates);
  
  // 4. Update record source tracking
  await recordMetadata.handleUserEdit(jobId, updates, currentRecord);
  
  return { updatedRecord, invalidatedKeys };
}
```

## 4. Frontend Integration Requirements

### Manual Record Creation Form
```typescript
interface ManualRecordForm {
  company: string;
  jobTitle: string;
  location?: string;
  status: JobStatus;
  applicationDate?: Date;
  notes?: string;
  
  // Validation feedback
  onConflictDetected: (conflicts: ConflictInfo[]) => void;
  onValidationComplete: (result: ValidationResult) => void;
}

// Usage
<ManualRecordForm
  onSubmit={async (data) => {
    const result = await api.createManualRecord(data);
    if (result.validation_result.hasConflicts) {
      // Show conflict resolution UI
      showConflictResolution(result.validation_result.conflictingRecords);
    }
  }}
/>
```

### Record Editing Interface
```typescript
interface EditRecordForm {
  jobId: string;
  currentData: JobRecord;
  allowLLMOverride?: boolean; // Option to let high-confidence LLM data override
  
  onFieldEdit: (field: string, newValue: any) => void;
  onConflictResolution: (conflicts: ConflictInfo[]) => void;
}

// Enhanced edit form with source awareness
const EditForm = ({ jobId, currentData }) => {
  const [recordSource, setRecordSource] = useState(currentData.record_source);
  const [conflicts, setConflicts] = useState([]);
  
  const handleEdit = async (field, value) => {
    const result = await api.updateJobRecord(jobId, { [field]: value });
    
    if (result.edit_metadata.conflicts_detected) {
      setConflicts(result.edit_metadata.conflicts_detected);
      // Show conflict resolution UI
    }
  };
  
  return (
    <div>
      <RecordSourceIndicator source={recordSource} />
      <EditableFields onEdit={handleEdit} />
      {conflicts.length > 0 && (
        <ConflictResolutionPanel conflicts={conflicts} />
      )}
    </div>
  );
};
```

### Conflict Resolution UI
```typescript
interface ConflictResolutionPanel {
  conflicts: ConflictInfo[];
  onResolve: (resolutions: ConflictResolution[]) => void;
}

const ConflictResolutionPanel = ({ conflicts, onResolve }) => {
  return (
    <div className="conflict-panel">
      {conflicts.map(conflict => (
        <ConflictItem 
          key={conflict.field}
          conflict={conflict}
          onResolve={(resolution) => handleResolve(conflict.field, resolution)}
        />
      ))}
    </div>
  );
};
```

## 5. Performance Optimization Guidelines

### Database Query Optimization
```sql
-- Efficient manual record lookup
SELECT job_id, company, job_title, normalized_job_title 
FROM job_applications 
WHERE record_source IN ('manual_created', 'user_edited')
  AND skip_llm_processing = 1;

-- Index usage for conflict detection
CREATE INDEX idx_company_title_source ON job_applications(company, job_title, record_source);
```

### Caching Strategy
```typescript
// Separate cache namespaces for different record types
const CACHE_NAMESPACES = {
  LLM_CLASSIFICATION: 'llm_class',
  LLM_PARSING: 'llm_parse', 
  MANUAL_RECORDS: 'manual',
  CONFLICT_DETECTION: 'conflicts'
};

// Cache invalidation on record changes
async function invalidateRecordCaches(jobId, changedFields) {
  const cacheKeys = [
    `${CACHE_NAMESPACES.MANUAL_RECORDS}:${jobId}`,
    `${CACHE_NAMESPACES.CONFLICT_DETECTION}:${jobId}`
  ];
  
  if (changedFields.includes('company') || changedFields.includes('job_title')) {
    // Invalidate broader caches
    await cache.invalidatePattern(`${CACHE_NAMESPACES.MANUAL_RECORDS}:*`);
  }
  
  return cache.del(cacheKeys);
}
```

## 6. Error Handling and Edge Cases

### Manual Record Validation
```typescript
async function validateManualRecord(recordData) {
  const validation = {
    isValid: true,
    errors: [],
    warnings: [],
    conflicts: []
  };

  // Check for potential duplicates
  const duplicates = await findSimilarRecords(recordData);
  if (duplicates.length > 0) {
    validation.warnings.push({
      type: 'potential_duplicates',
      message: 'Similar records found',
      data: duplicates
    });
  }

  // Validate required fields
  if (!recordData.company || !recordData.job_title) {
    validation.isValid = false;
    validation.errors.push({
      type: 'required_fields',
      message: 'Company and job title are required'
    });
  }

  return validation;
}
```

### LLM Processing Error Handling
```typescript
async function processEmailWithErrorHandling(emailData) {
  try {
    // Pre-validation
    const shouldProcess = await validateEmailForProcessing(emailData);
    if (!shouldProcess.valid) {
      return { skipped: true, reason: shouldProcess.reason };
    }

    // LLM processing
    const result = await llmEngine.parseEmail(emailData);
    
    // Post-processing validation
    const conflicts = await detectConflicts(result);
    
    return { success: true, result, conflicts };
    
  } catch (error) {
    console.error('LLM processing error:', error);
    
    // Fallback to rule-based processing
    const fallbackResult = await fallbackProcessor.processEmail(emailData);
    
    return { 
      success: false, 
      error: error.message,
      fallback: fallbackResult 
    };
  }
}
```

## 7. Testing Specifications

### Unit Test Coverage
```typescript
describe('Record Source Management', () => {
  test('should prevent LLM processing of manual records', async () => {
    const manualRecord = await createManualRecord(sampleData);
    const shouldProcess = await recordValidator.shouldProcessEmail(emailData);
    expect(shouldProcess.shouldProcess).toBe(false);
    expect(shouldProcess.reason).toBe('manual_record_exists');
  });

  test('should handle user edits correctly', async () => {
    const llmRecord = await createLLMRecord(sampleData);
    const editResult = await updateRecord(llmRecord.id, { company: 'New Company' });
    expect(editResult.record_source).toBe('user_edited');
  });

  test('should resolve conflicts intelligently', async () => {
    const conflicts = [{ field: 'status', manualValue: 'Applied', llmValue: 'Interview' }];
    const resolution = await conflictResolver.resolve(conflicts);
    expect(resolution.resolvedData.status).toBe('Applied'); // Prefer manual
  });
});
```

### Integration Test Scenarios
```typescript
describe('End-to-End Manual Record Integration', () => {
  test('complete manual record creation flow', async () => {
    // 1. Create manual record
    const manualRecord = await api.createManualRecord(testData);
    
    // 2. Process related email
    const emailResult = await processEmail(relatedEmailData);
    expect(emailResult.skipped).toBe(true);
    
    // 3. Verify no duplicate created
    const allRecords = await api.getJobRecords();
    const duplicates = allRecords.filter(r => 
      r.company === testData.company && r.job_title === testData.job_title
    );
    expect(duplicates.length).toBe(1);
  });
});
```

## 8. Migration Strategy

### Data Migration Script
```sql
-- Step 1: Add new columns with default values
ALTER TABLE job_applications ADD COLUMN record_source TEXT DEFAULT 'llm_processed';
ALTER TABLE job_applications ADD COLUMN skip_llm_processing BOOLEAN DEFAULT 0;

-- Step 2: Update existing records based on creation context
UPDATE job_applications 
SET record_source = 'llm_processed', 
    creation_method = 'email_processing'
WHERE created_at < '2024-08-14'; -- Date of migration

-- Step 3: Create new tables
-- (Run the CREATE TABLE statements from section 1)

-- Step 4: Verify data integrity
SELECT record_source, COUNT(*) FROM job_applications GROUP BY record_source;
```

### Deployment Checklist
- [ ] Database schema updated
- [ ] New LLM modules deployed
- [ ] Cache system configured
- [ ] API endpoints tested
- [ ] Frontend components updated
- [ ] Performance monitoring enabled
- [ ] Error handling tested
- [ ] Documentation updated

## 9. Performance Monitoring

### Key Metrics to Track
```typescript
interface LLMProcessingMetrics {
  email_processing_rate: number;           // Emails processed per minute
  manual_record_creation_rate: number;     // Manual records created per day
  conflict_detection_rate: number;         // Percentage of conflicts detected
  cache_hit_rate: number;                  // Cache efficiency
  llm_processing_duration: number;         // Average LLM processing time
  duplicate_prevention_rate: number;       // Successfully prevented duplicates
}

// Monitoring dashboard queries
const getProcessingMetrics = () => ({
  daily_email_processing: db.prepare(`
    SELECT DATE(created_at) as date, COUNT(*) as count 
    FROM llm_processing_history 
    WHERE created_at > datetime('now', '-30 days')
    GROUP BY DATE(created_at)
  `).all(),
  
  conflict_resolution_stats: db.prepare(`
    SELECT resolution_strategy, COUNT(*) as count
    FROM manual_record_conflicts 
    WHERE created_at > datetime('now', '-7 days')
    GROUP BY resolution_strategy
  `).all()
});
```

This specification provides a comprehensive foundation for implementing manual record support while maintaining optimal LLM processing performance. The system is designed to be robust, efficient, and user-friendly while preventing data conflicts and maintaining processing accuracy.