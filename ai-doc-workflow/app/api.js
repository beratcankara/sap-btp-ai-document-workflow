async function parseResponseBody(response) {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch (err) {
    return { raw: text };
  }
}

async function handleResponse(response) {
  const data = await parseResponseBody(response);
  if (!response.ok) {
    throw new Error(data.error || data.message || response.statusText);
  }
  return data;
}

async function uploadDocument(formData) {
  const response = await fetch('/documents', {
    method: 'POST',
    body: formData,
  });
  return handleResponse(response);
}

async function analyzeDocument(documentId) {
  const response = await fetch(`/documents/${documentId}/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  return handleResponse(response);
}

async function routeDocument(documentId, analysisId) {
  const response = await fetch(`/documents/${documentId}/route`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ analysisId }),
  });
  return handleResponse(response);
}

async function sendFeedback(documentId, payload) {
  const response = await fetch(`/documents/${documentId}/feedback`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return handleResponse(response);
}

async function fetchDocumentSummaries() {
  const response = await fetch('/documents');
  return handleResponse(response);
}

async function fetchDocumentDetail(id) {
  const response = await fetch(`/documents/${id}`);
  return handleResponse(response);
}

async function fetchWorkflowStatuses() {
  const response = await fetch('/workflow/status');
  return handleResponse(response);
}

function interpretDecision(routingDecision) {
  if (!routingDecision) return { label: 'Pending Decision', tone: 'info', description: 'Awaiting analysis results.' };
  if (routingDecision.decision === 'AUTO_APPROVE') {
    return { label: 'Auto-Approve', tone: 'success', description: routingDecision.reason };
  }
  if (routingDecision.highRisk) {
    return { label: 'Reject / Manual Review', tone: 'danger', description: routingDecision.reason };
  }
  if (routingDecision.amountExceedsThreshold) {
    return { label: 'Finance Approval', tone: 'warning', description: routingDecision.reason };
  }
  return { label: 'Manager Approval', tone: 'info', description: routingDecision.reason };
}

function badgeForOutcome(outcome) {
  if (!outcome) return 'info';
  const mapping = {
    'Auto-Approve': 'success',
    'Finance Approval': 'warning',
    'Reject / Manual Review': 'danger',
    'Manager Approval': 'info',
  };
  return mapping[outcome] || 'info';
}

function getQueryParam(key) {
  const params = new URLSearchParams(window.location.search);
  return params.get(key);
}

function friendlyDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function showError(target, message) {
  target.innerHTML = `<div class="alert error">${message}</div>`;
}

function showSuccess(target, message) {
  target.innerHTML = `<div class="alert success">${message}</div>`;
}
