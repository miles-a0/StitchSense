import assert from 'node:assert/strict';
import test from 'node:test';

process.env.N8N_CHAT_URL = 'https://workflow.example.test/chat';
process.env.N8N_UPLOAD_URL = 'https://workflow.example.test/upload';
process.env.N8N_UPLOAD_SHARED_SECRET = 'test-upload-secret-with-more-than-32-characters';

test('workflow metrics record success, workflow errors, HTTP errors, and exceptions without high-cardinality labels', async (t) => {
  const originalFetch = globalThis.fetch;
  const { callUploadWorkflowWithFile, callWorkflow } = await import('../dist/services/workflows.js');
  const { renderPrometheusMetrics } = await import('../dist/services/metrics.js');

  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const responses = [
    new Response(JSON.stringify({ answer: 'ok' }), { status: 200 }),
    new Response(JSON.stringify({ success: false, error: 'workflow rejected' }), { status: 200 }),
    new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 }),
  ];

  globalThis.fetch = async () => {
    const response = responses.shift();
    if (!response) {
      throw new Error('network unavailable');
    }
    return response;
  };

  await callWorkflow('chat', { question: 'hello' });
  await assert.rejects(callWorkflow('chat', { question: 'bad' }), /Workflow chat reported failure/);
  await assert.rejects(
    callUploadWorkflowWithFile({
      payload: { pattern_id: 'pattern-1' },
      buffer: Buffer.from('pattern text'),
      filename: 'pattern.txt',
      mimeType: 'text/plain',
    }),
    /Workflow upload failed with 401/,
  );
  await assert.rejects(callWorkflow('chat', { question: 'network' }), /network unavailable/);

  const metrics = renderPrometheusMetrics();
  assert.match(metrics, /stitchsense_workflow_requests_total\{workflow_type="chat",outcome="success",status_class="2xx"\} 1/);
  assert.match(metrics, /stitchsense_workflow_requests_total\{workflow_type="chat",outcome="workflow_error",status_class="2xx"\} 1/);
  assert.match(metrics, /stitchsense_workflow_requests_total\{workflow_type="upload",outcome="http_error",status_class="4xx"\} 1/);
  assert.match(metrics, /stitchsense_workflow_requests_total\{workflow_type="chat",outcome="exception",status_class="none"\} 1/);
  assert.match(metrics, /stitchsense_workflow_request_duration_seconds_bucket\{workflow_type="chat",outcome="success",status_class="2xx",le="\+Inf"\} 1/);
  assert.doesNotMatch(metrics, /workflow\.example\.test/);
  assert.doesNotMatch(metrics, /pattern-1/);
  assert.doesNotMatch(metrics, /test-upload-secret/);
});

test('library proxy workflow type is retired and never calls n8n', async (t) => {
  const originalFetch = globalThis.fetch;
  const originalLibraryProxyUrl = process.env.N8N_LIBRARY_PROXY_URL;
  let workflowCalls = 0;
  process.env.N8N_LIBRARY_PROXY_URL = 'https://workflow.example.test/library';
  globalThis.fetch = async () => {
    workflowCalls += 1;
    return new Response('{}', { status: 200 });
  };
  t.after(() => {
    globalThis.fetch = originalFetch;
    if (originalLibraryProxyUrl === undefined) delete process.env.N8N_LIBRARY_PROXY_URL;
    else process.env.N8N_LIBRARY_PROXY_URL = originalLibraryProxyUrl;
  });

  const { callWorkflow } = await import('../dist/services/workflows.js');
  await assert.rejects(callWorkflow('library', { userId: 'another-user-id' }), /Workflow endpoint for library is not configured/);
  assert.equal(workflowCalls, 0);
});
