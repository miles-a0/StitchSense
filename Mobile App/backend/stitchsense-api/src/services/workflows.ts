import { config } from '../config.js';
import { fetchWithTimeout } from './http.js';
import { recordWorkflowMetrics } from './metrics.js';

type WorkflowType = 'chat' | 'upload' | 'library' | 'image';

const endpointByType: Record<WorkflowType, string> = {
  chat: config.n8n.chatUrl,
  upload: config.n8n.uploadUrl,
  library: config.n8n.libraryProxyUrl,
  image: config.n8n.imageUrl || config.n8n.chatUrl,
};

function sharedSecretFor(type: WorkflowType) {
  if (type === 'chat') return config.n8n.chatSharedSecret;
  return type === 'upload' ? config.n8n.uploadSharedSecret : config.n8n.sharedSecret;
}

function workflowErrorMessage(type: WorkflowType, status: number, body: unknown) {
  if (body && typeof body === 'object' && !Array.isArray(body)) {
    const record = body as { error?: unknown; message?: unknown };
    const detail = record.error ?? record.message;
    if (typeof detail === 'string' && detail.trim()) {
      return detail.trim();
    }
  }

  if (type === 'upload' && status === 401) {
    return 'Upload workflow rejected the API secret. Check N8N_UPLOAD_SHARED_SECRET on the StitchSense API server, or update the StitchSense WordPress plugin so the mobile API can use the WordPress upload bridge.';
  }

  return `Workflow ${type} failed with ${status}`;
}

function workflowFailureMessage(type: WorkflowType, body: unknown) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return '';
  }
  const record = body as { success?: unknown; ok?: unknown; error?: unknown; message?: unknown };
  if (record.success === false || record.ok === false) {
    return String(record.error ?? record.message ?? `Workflow ${type} failed`);
  }
  return '';
}

export async function callWorkflow(type: WorkflowType, payload: unknown) {
  const primaryEndpoint = endpointByType[type];
  const fallbackEndpoints =
    type === 'image' && config.n8n.chatUrl && config.n8n.chatUrl !== primaryEndpoint
      ? [config.n8n.chatUrl]
      : [];
  const endpoints = [primaryEndpoint, ...fallbackEndpoints].filter(Boolean);

  if (endpoints.length === 0) {
    throw new Error(`Workflow endpoint for ${type} is not configured`);
  }

  const sharedSecret = sharedSecretFor(type);
  const body =
    sharedSecret && payload && typeof payload === 'object' && !Array.isArray(payload)
      ? { ...payload, secret: sharedSecret }
      : payload;

  let lastStatus = 0;
  for (const endpoint of endpoints) {
    const startedAt = Date.now();
    let response: Response;
    try {
      response = await fetchWithTimeout(endpoint, {
        method: 'POST',
        timeoutMs: type === 'upload' || type === 'chat' ? 600000 : 90000,
        headers: {
          'content-type': 'application/json',
          ...(sharedSecret
            ? {
                'x-stitchsense-secret': sharedSecret,
                'x-pattern-helper-secret': sharedSecret,
              }
            : {}),
        },
        body: JSON.stringify(body),
      });
    } catch (error) {
      recordWorkflowMetrics({ workflowType: type, outcome: 'exception', durationMs: Date.now() - startedAt });
      throw error;
    }

    const text = await response.text();
    let responseBody: unknown = text;
    try {
      responseBody = text ? JSON.parse(text) : {};
    } catch {
      responseBody = { answer: text };
    }

    const workflowFailure = workflowFailureMessage(type, responseBody);
    if (workflowFailure) {
      recordWorkflowMetrics({
        workflowType: type,
        outcome: 'workflow_error',
        statusCode: response.status,
        durationMs: Date.now() - startedAt,
      });
      throw new Error(workflowFailure);
    }

    if (response.ok) {
      recordWorkflowMetrics({
        workflowType: type,
        outcome: 'success',
        statusCode: response.status,
        durationMs: Date.now() - startedAt,
      });
      return responseBody;
    }

    lastStatus = response.status;
    if (!(type === 'image' && response.status === 404)) {
      recordWorkflowMetrics({
        workflowType: type,
        outcome: 'http_error',
        statusCode: response.status,
        durationMs: Date.now() - startedAt,
      });
      throw new Error(workflowErrorMessage(type, response.status, responseBody));
    }
    recordWorkflowMetrics({
      workflowType: type,
      outcome: 'http_error',
      statusCode: response.status,
      durationMs: Date.now() - startedAt,
    });
  }

  throw new Error(`Workflow ${type} failed with ${lastStatus || 404}`);
}

export async function callUploadWorkflowWithFile(params: {
  payload: Record<string, unknown>;
  buffer: Buffer;
  filename: string;
  mimeType: string;
}) {
  const endpoint = endpointByType.upload;
  if (!endpoint) {
    throw new Error('Workflow endpoint for upload is not configured');
  }

  const sharedSecret = sharedSecretFor('upload');
  const payload =
    sharedSecret
      ? { ...params.payload, secret: sharedSecret }
      : params.payload;
  const formData = new FormData();
  formData.append('payload', JSON.stringify(payload));
  if (sharedSecret) {
    formData.append('secret', sharedSecret);
  }

  const arrayBuffer = params.buffer.buffer.slice(
    params.buffer.byteOffset,
    params.buffer.byteOffset + params.buffer.byteLength,
  ) as ArrayBuffer;
  const blob = new Blob([arrayBuffer], { type: params.mimeType || 'application/octet-stream' });
  // The upload workflow's Validate File node reads the `file` binary key; extra copies tripled the request size.
  formData.append('file', blob, params.filename);

  const startedAt = Date.now();
  let response: Response;
  try {
    response = await fetchWithTimeout(endpoint, {
      method: 'POST',
      timeoutMs: 600000,
      headers: {
        accept: 'application/json',
        ...(sharedSecret
          ? {
              'x-stitchsense-secret': sharedSecret,
              'x-pattern-helper-secret': sharedSecret,
            }
          : {}),
      },
      body: formData,
    });
  } catch (error) {
    recordWorkflowMetrics({ workflowType: 'upload', outcome: 'exception', durationMs: Date.now() - startedAt });
    throw error;
  }

  const text = await response.text();
  let responseBody: unknown = text;
  try {
    responseBody = text ? JSON.parse(text) : {};
  } catch {
    responseBody = { answer: text };
  }

  if (!response.ok) {
    recordWorkflowMetrics({
      workflowType: 'upload',
      outcome: 'http_error',
      statusCode: response.status,
      durationMs: Date.now() - startedAt,
    });
    throw new Error(workflowErrorMessage('upload', response.status, responseBody));
  }

  const workflowFailure = workflowFailureMessage('upload', responseBody);
  if (workflowFailure) {
    recordWorkflowMetrics({
      workflowType: 'upload',
      outcome: 'workflow_error',
      statusCode: response.status,
      durationMs: Date.now() - startedAt,
    });
    throw new Error(workflowFailure);
  }

  recordWorkflowMetrics({
    workflowType: 'upload',
    outcome: 'success',
    statusCode: response.status,
    durationMs: Date.now() - startedAt,
  });
  return responseBody;
}
