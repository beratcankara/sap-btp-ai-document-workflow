const { performance } = require('perf_hooks');

function createLogger(baseContext = {}) {
  function emit(level, message, extra = {}) {
    const entry = { level, message, timestamp: new Date().toISOString(), ...baseContext, ...extra };
    const serialized = JSON.stringify(entry);
    if (level === 'error') {
      console.error(serialized);
    } else {
      console.log(serialized);
    }
  }

  return {
    info(message, extra) {
      emit('info', message, extra);
    },
    error(message, extra) {
      emit('error', message, extra);
    },
    child(additionalContext = {}) {
      return createLogger({ ...baseContext, ...additionalContext });
    },
  };
}

class MetricsRecorder {
  constructor() {
    this.aiLatencies = [];
    this.workflowOutcomes = { success: 0, failure: 0 };
  }

  recordAiLatency(durationMs) {
    this.aiLatencies.push(durationMs);
  }

  recordWorkflowOutcome(result) {
    if (result === 'success') this.workflowOutcomes.success += 1;
    if (result === 'failure') this.workflowOutcomes.failure += 1;
  }

  snapshot() {
    const sortedLatencies = [...this.aiLatencies].sort((a, b) => a - b);
    const percentile = (p) => {
      if (sortedLatencies.length === 0) return null;
      const index = Math.ceil((p / 100) * sortedLatencies.length) - 1;
      return sortedLatencies[Math.max(0, index)];
    };

    return {
      count: this.aiLatencies.length,
      p50: percentile(50),
      p95: percentile(95),
      workflowOutcomes: { ...this.workflowOutcomes },
    };
  }
}

function timeOperation(callback) {
  const start = performance.now();
  const result = callback();
  const end = performance.now();
  return { duration: end - start, result };
}

module.exports = {
  createLogger,
  MetricsRecorder,
  timeOperation,
};
