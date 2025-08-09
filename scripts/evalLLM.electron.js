const fs = require('fs');
const path = require('path');

// Load samples
const SAMPLES_PATH = path.resolve(process.cwd(), 'fixtures/llm_eval/samples.jsonl');

async function loadSamples() {
  const content = fs.readFileSync(SAMPLES_PATH, 'utf8');
  return content.trim().split('\n').map(line => JSON.parse(line));
}

async function runEvaluation() {
  console.log('🧪 LLM Evaluation Starting...');
  console.log('📁 Loading samples from:', SAMPLES_PATH);
  
  const samples = await loadSamples();
  console.log(`📋 Loaded ${samples.length} test samples`);
  
  // Import the LLM engine
  const { parseEmailWithLLM } = require('../electron/llm/llmEngine.js');
  
  const results = [];
  const metrics = {
    total: samples.length,
    correct_is_job_related: 0,
    correct_status: 0,
    decision_paths: {},
    latencies: [],
    llm_success_latencies: []
  };
  
  console.log('\n📊 Running evaluation...\n');
  
  for (const sample of samples) {
    const startTime = Date.now();
    
    try {
      const predicted = await parseEmailWithLLM({
        subject: sample.subject,
        plaintext: sample.plaintext
      });
      
      const latency = Date.now() - startTime;
      const decisionPath = extractDecisionPath(predicted, latency);
      
      // Check correctness
      const isJobCorrect = predicted.is_job_related === sample.gold.is_job_related;
      const isStatusCorrect = predicted.status === sample.gold.status;
      
      if (isJobCorrect) metrics.correct_is_job_related++;
      if (isStatusCorrect) metrics.correct_status++;
      
      // Track decision paths
      metrics.decision_paths[decisionPath] = (metrics.decision_paths[decisionPath] || 0) + 1;
      
      // Track latencies
      metrics.latencies.push(latency);
      if (decisionPath === 'llm_success') {
        metrics.llm_success_latencies.push(latency);
      }
      
      results.push({
        id: sample.id,
        predicted,
        gold: sample.gold,
        correct: { is_job_related: isJobCorrect, status: isStatusCorrect },
        latency,
        decision_path: decisionPath
      });
      
      console.log(`${isJobCorrect && isStatusCorrect ? '✅' : '❌'} ${sample.id}: ${decisionPath} (${latency}ms)`);
      
    } catch (error) {
      console.log(`❌ ${sample.id}: ERROR (${Date.now() - startTime}ms) - ${error.message}`);
      results.push({
        id: sample.id,
        error: error.message,
        latency: Date.now() - startTime,
        decision_path: 'error'
      });
    }
  }
  
  // Compute final metrics
  const jobAccuracy = metrics.correct_is_job_related / metrics.total;
  const statusAccuracy = metrics.correct_status / metrics.total;
  const avgLatency = metrics.latencies.reduce((a, b) => a + b, 0) / metrics.latencies.length;
  const avgLLMLatency = metrics.llm_success_latencies.length > 0 ? 
    metrics.llm_success_latencies.reduce((a, b) => a + b, 0) / metrics.llm_success_latencies.length : 0;
  
  // Compute macro-F1 for status
  const statusF1 = computeStatusMacroF1(results);
  
  console.log('\n📈 EVALUATION RESULTS');
  console.log('=' .repeat(50));
  console.log(`📊 Job Classification Accuracy: ${(jobAccuracy * 100).toFixed(1)}% (${metrics.correct_is_job_related}/${metrics.total})`);
  console.log(`📊 Status Classification Accuracy: ${(statusAccuracy * 100).toFixed(1)}% (${metrics.correct_status}/${metrics.total})`);
  console.log(`📊 Status Macro-F1: ${statusF1.toFixed(3)}`);
  console.log(`⏱️  Average Latency: ${avgLatency.toFixed(0)}ms`);
  console.log(`⏱️  LLM Success Latency: ${avgLLMLatency.toFixed(0)}ms (n=${metrics.llm_success_latencies.length})`);
  
  console.log('\n🔍 Decision Path Distribution:');
  Object.entries(metrics.decision_paths).forEach(([path, count]) => {
    const pct = (count / metrics.total * 100).toFixed(1);
    console.log(`   ${path}: ${count} (${pct}%)`);
  });
  
  console.log('\n🎯 Sample Results:');
  results.slice(0, 3).forEach(r => {
    if (r.error) {
      console.log(`   ${r.id}: ERROR - ${r.error}`);
    } else {
      console.log(`   ${r.id}: job=${r.predicted.is_job_related} status=${r.predicted.status} (${r.decision_path})`);
    }
  });
}

function extractDecisionPath(predicted, latency) {
  // Try to infer decision path from common patterns
  // This is a heuristic since we don't have direct access to the decision path
  if (latency < 50) return 'cache_hit';
  if (latency < 200) return 'prefilter_skip';
  if (latency > 7000) return 'timeout_fallback';
  return 'llm_success';
}

function computeStatusMacroF1(results) {
  const classes = ['Applied', 'Interview', 'Declined', 'Offer', null];
  const classMetrics = {};
  
  // Initialize metrics for each class
  classes.forEach(cls => {
    classMetrics[cls] = { tp: 0, fp: 0, fn: 0 };
  });
  
  // Count TP, FP, FN for each class
  results.forEach(r => {
    if (r.error) return;
    
    const predicted = r.predicted.status;
    const actual = r.gold.status;
    
    classes.forEach(cls => {
      if (predicted === cls && actual === cls) {
        classMetrics[cls].tp++;
      } else if (predicted === cls && actual !== cls) {
        classMetrics[cls].fp++;
      } else if (predicted !== cls && actual === cls) {
        classMetrics[cls].fn++;
      }
    });
  });
  
  // Compute F1 for each class and average
  const f1Scores = classes.map(cls => {
    const { tp, fp, fn } = classMetrics[cls];
    const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
    const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
    return precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;
  });
  
  return f1Scores.reduce((a, b) => a + b, 0) / f1Scores.length;
}

async function main() {
  try {
    await runEvaluation();
    console.log('\n🎉 Evaluation completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Evaluation failed:', error);
    process.exit(1);
  }
}

main().catch(console.error);