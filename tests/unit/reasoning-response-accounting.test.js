import { beforeEach, afterEach, expect, it, vi } from 'vitest';
const db = vi.hoisted(() => ({ enqueueRequestUsage: vi.fn(async entry => ({ accepted: true, eventId: entry.eventId })), saveRequestDetail: vi.fn(async () => {}), appendRequestLog: vi.fn(async () => {}), trackPendingRequest: vi.fn() }));
vi.mock('@/lib/usageDb.js', () => db);
const { FORMATS: F } = await import('../../open-sse/translator/formats.js');
const { handleNonStreamingResponse: native } = await import('../../open-sse/handlers/chatCore/nonStreamingHandler.js');
const { handleForcedSSEToJson: forced } = await import('../../open-sse/handlers/chatCore/sseToJsonHandler.js');
const { createSSETransformStreamWithLogger: transform, createPassthroughStreamWithLogger: passthrough } = await import('../../open-sse/utils/stream.js');
const { buildOnStreamComplete } = await import('../../open-sse/handlers/chatCore/streamingHandler.js');
const { handleComboChat, peekStreamForContent } = await import('../../open-sse/services/combo.js');
const usage = { prompt_tokens: 12, completion_tokens: 16, total_tokens: 28, completion_tokens_details: { reasoning_tokens: 16 } };
const noop = () => {};
const log = { info: noop, warn: noop, debug: noop };
const network = vi.fn(() => { throw new Error('No network allowed'); });
beforeEach(() => { vi.clearAllMocks(); vi.stubGlobal('fetch', network); });
afterEach(() => { expect(network).not.toHaveBeenCalled(); vi.unstubAllGlobals(); });
const ctx = (providerResponse, sourceFormat = F.OPENAI, targetFormat = F.OPENAI) => ({ providerResponse, sourceFormat, targetFormat, provider: 'audit', model: 'audit-model', body: { max_completion_tokens: 16, messages: [] }, stream: false, requestStartTime: Date.now(), trackDone: noop, appendLog: noop, reqLogger: { logProviderResponse: noop, logConvertedResponse: noop } });
const chat = (text = '', finish = 'length') => ({ id: 'chatcmpl-audit', object: 'chat.completion', model: 'audit-model', choices: [{ message: { role: 'assistant', content: text, reasoning_content: 'Thinking' }, finish_reason: finish }], usage });
const chatSSE = (text = '', finish = 'length') => new Response([
  { id: 'chatcmpl-audit', choices: [{ delta: { role: 'assistant', reasoning_content: 'Thinking', ...(text ? { content: text } : {}) }, finish_reason: null }] },
  { choices: [{ delta: {}, finish_reason: finish }] },
  { choices: [], usage }
].map(c => `data: ${JSON.stringify(c)}\n\n`).join('') + 'data: [DONE]\n\n', { headers: { 'content-type': 'text/event-stream' } });
const responsesSSE = () => new Response([
 ['response.created', { response: { id: 'resp_audit' } }],
 ['response.incomplete', { response: { id: 'resp_audit', object: 'response', status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' }, output: [], usage: { input_tokens: 12, output_tokens: 16, total_tokens: 28, output_tokens_details: { reasoning_tokens: 16 } } } }]
].map(([event, data]) => `event: ${event}\ndata: ${JSON.stringify({ type: event, ...data })}\n\n`).join(''), { headers: { 'content-type': 'text/event-stream' } });
function observed(label, value) { console.log('AUDIT', JSON.stringify({ label, value })); }

it('CONTROL native partial text is returned and raw billed output persists', async () => {
 const result = await native(ctx(Response.json(chat('Partial'))));
 expect(result.response.status).toBe(200);
 expect((await result.response.json()).choices[0].finish_reason).toBe('length');
 expect(db.enqueueRequestUsage).toHaveBeenCalledTimes(1);
 expect(db.enqueueRequestUsage.mock.calls[0][0].tokens).toMatchObject({ prompt_tokens: 12, completion_tokens: 16, reasoning_tokens: 16 });
});
it('RED native reasoning-only budget failure must still persist actual usage', async () => {
 const result = await native(ctx(Response.json(chat())));
 expect(result.response.status).toBe(400);
 observed('native budget usage persistence', { status: result.response.status, records: db.enqueueRequestUsage.mock.calls.length });
 expect(db.enqueueRequestUsage).toHaveBeenCalledTimes(1);
 expect(db.enqueueRequestUsage.mock.calls[0][0].tokens).toMatchObject({ prompt_tokens: 12, completion_tokens: 16, reasoning_tokens: 16 });
 expect(db.saveRequestDetail).toHaveBeenCalledTimes(1);
 expect(db.saveRequestDetail.mock.calls[0][0]).toMatchObject({ status: 'failed', tokens: { prompt_tokens: 12, completion_tokens: 16 } });
});
it('RED native Gemini MAX_TOKENS reasoning-only must return budget failure', async () => {
 const result = await native(ctx(Response.json({ candidates: [{ content: { parts: [{ thought: true, text: 'Thinking' }] }, finishReason: 'MAX_TOKENS' }], usageMetadata: { promptTokenCount: 12, candidatesTokenCount: 0, thoughtsTokenCount: 16, totalTokenCount: 28 } }), F.OPENAI, F.GEMINI));
 observed('Gemini exhausted', { status: result.response.status, body: await result.response.clone().json(), saved: db.enqueueRequestUsage.mock.calls });
 expect(result.response.status).toBe(400);
});
it('RED Responses refusal string counts as usable output despite incomplete status', async () => {
 const result = await native(ctx(Response.json({ object: 'response', status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' }, output: [{ type: 'message', content: [{ type: 'refusal', refusal: 'Cannot comply' }] }], usage: { input_tokens: 12, output_tokens: 16 } }), F.OPENAI_RESPONSES, F.OPENAI_RESPONSES));
 observed('Responses refusal', result.response.status);
 expect(result.response.status).toBe(200);
});
it('RED forced Chat SSE reasoning-only must match native budget failure', async () => {
 const result = await forced(ctx(chatSSE()));
 observed('forced Chat budget', { status: result.response.status, saved: db.enqueueRequestUsage.mock.calls[0]?.[0]?.tokens });
 expect(result.response.status).toBe(400);
});

it('wrapped Gemini thought-only MAX_TOKENS reports the native client budget field after accounting', async () => {
 const onRequestSuccess = vi.fn();
 const payload = { response: { candidates: [{ content: { parts: [{ thought: true, text: 'Thinking' }] }, finishReason: 'MAX_TOKENS' }], usageMetadata: { promptTokenCount: 12, candidatesTokenCount: 0, thoughtsTokenCount: 16, totalTokenCount: 28 } } };
 const result = await native({ ...ctx(Response.json(payload), F.GEMINI, F.GEMINI_CLI), body: { generationConfig: { maxOutputTokens: 16 } }, onRequestSuccess });
 expect(result.response.status).toBe(400);
 expect(await result.response.json()).toMatchObject({ error: { code: 'output_budget_exhausted', param: 'generationConfig.maxOutputTokens' } });
 expect(db.enqueueRequestUsage).toHaveBeenCalledTimes(1);
 expect(db.saveRequestDetail.mock.calls[0][0].status).toBe('failed');
 expect(onRequestSuccess).not.toHaveBeenCalled();
});
it('forced Chat budget failure is accounted once, detailed as failed, and never marks account successful', async () => {
 const onRequestSuccess = vi.fn();
 const result = await forced({ ...ctx(chatSSE()), onRequestSuccess });
 expect(result.response.status).toBe(400);
 expect(await result.response.json()).toMatchObject({ error: { code: 'output_budget_exhausted', param: 'max_completion_tokens' } });
 expect(db.enqueueRequestUsage).toHaveBeenCalledTimes(1);
 expect(db.enqueueRequestUsage.mock.calls[0][0].tokens).toMatchObject({ prompt_tokens: 12, completion_tokens: 16, reasoning_tokens: 16 });
 expect(db.saveRequestDetail).toHaveBeenCalledTimes(1);
 expect(db.saveRequestDetail.mock.calls[0][0]).toMatchObject({ status: 'failed', tokens: { prompt_tokens: 12, completion_tokens: 16 } });
 expect(onRequestSuccess).not.toHaveBeenCalled();
});
it('RED Gemini actual completion accounting must include thought tokens', async () => {
 await native(ctx(Response.json({ candidates: [{ content: { parts: [{ text: 'Answer' }] }, finishReason: 'STOP' }], usageMetadata: { promptTokenCount: 12, candidatesTokenCount: 3, thoughtsTokenCount: 16, totalTokenCount: 31 } }), F.OPENAI, F.GEMINI));
 observed('Gemini saved', db.enqueueRequestUsage.mock.calls[0][0].tokens);
 expect(db.enqueueRequestUsage.mock.calls[0][0].tokens.completion_tokens).toBe(19);
});
it('RED JSON client usage must be actual tokens, not context guard buffer', async () => {
 const result = await native(ctx(Response.json(chat('Answer', 'stop'))));
 const json = await result.response.json(); observed('native actual usage', { client: json.usage, saved: db.enqueueRequestUsage.mock.calls[0][0].tokens });
 expect(json.usage.prompt_tokens).toBe(12);
});

it('wrapped Gemini completion includes thoughts exactly once in actual client and stored usage', async () => {
 const payload = { response: { candidates: [{ content: { parts: [{ text: 'Answer' }] }, finishReason: 'STOP' }], usageMetadata: { promptTokenCount: 12, candidatesTokenCount: 3, thoughtsTokenCount: 16, totalTokenCount: 31 } } };
 const result = await native(ctx(Response.json(payload), F.OPENAI, F.GEMINI_CLI));
 expect(db.enqueueRequestUsage.mock.calls[0][0].tokens).toMatchObject({ prompt_tokens: 12, completion_tokens: 19, total_tokens: 31, reasoning_tokens: 16 });
 expect((await result.response.json()).usage).toMatchObject({ prompt_tokens: 12, completion_tokens: 19, total_tokens: 31, completion_tokens_details: { reasoning_tokens: 16 } });
});
it('RED native Chat to Responses partial length must be incomplete', async () => {
 const result = await native(ctx(Response.json(chat('Partial')), F.OPENAI_RESPONSES));
 const json = await result.response.json(); observed('native Chat to Responses length', json);
 expect(json.status).toBe('incomplete'); expect(json.incomplete_details).toEqual({ reason: 'max_output_tokens' });
});
it('RED forced Chat SSE partial length must be incomplete for Responses client', async () => {
 const result = await forced(ctx(chatSSE('Partial'), F.OPENAI_RESPONSES));
 const json = await result.response.json(); observed('forced Chat to Responses length', json);
 expect(json.status).toBe('incomplete');
});

it.each(['native', 'forced'])('%s Chat partial output preserves actual detailed Responses usage', async (transport) => {
 const result = await (transport === 'native' ? native(ctx(Response.json(chat('Partial')), F.OPENAI_RESPONSES)) : forced(ctx(chatSSE('Partial'), F.OPENAI_RESPONSES)));
 const json = await result.response.json();
 expect(json.status).toBe('incomplete');
 expect(json.incomplete_details).toEqual({ reason: 'max_output_tokens' });
 expect(json.usage).toEqual({ input_tokens: 12, output_tokens: 16, total_tokens: 28, output_tokens_details: { reasoning_tokens: 16 } });
 expect(json.output.find(x => x.type === 'message').content[0].text).toBe('Partial');
});
it('forced Responses empty incomplete preserves incurred usage before its structured budget error', async () => {
 const onRequestSuccess = vi.fn();
 const result = await forced({ ...ctx(responsesSSE(), F.OPENAI_RESPONSES, F.OPENAI_RESPONSES), onRequestSuccess });
 expect(db.enqueueRequestUsage).toHaveBeenCalledTimes(1);
 expect(db.enqueueRequestUsage.mock.calls[0][0].tokens).toMatchObject({ prompt_tokens: 12, completion_tokens: 16, reasoning_tokens: 16 });
 expect(result.response.status).toBe(400);
 expect(await result.response.json()).toMatchObject({ error: { code: 'output_budget_exhausted', param: 'max_output_tokens' } });
 expect(db.saveRequestDetail.mock.calls[0][0]).toMatchObject({ status: 'failed', tokens: { prompt_tokens: 12, completion_tokens: 16, reasoning_tokens: 16 } });
 expect(onRequestSuccess).not.toHaveBeenCalled();
});
it.each(['output_text', 'refusal'])('forced Responses incomplete preserves usable %s and terminal usage', async (type) => {
 const payload = { id: 'resp_partial', object: 'response', status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' }, output: [{ type: 'message', content: [type === 'refusal' ? { type, refusal: 'Cannot comply' } : { type, text: 'Partial' }] }], usage: { input_tokens: 12, output_tokens: 16, total_tokens: 28, output_tokens_details: { reasoning_tokens: 16 } } };
 const upstream = new Response(`event: response.incomplete\ndata: ${JSON.stringify({ type: 'response.incomplete', response: payload })}\n\n`, { headers: { 'content-type': 'text/event-stream' } });
 const result = await forced(ctx(upstream, F.OPENAI_RESPONSES, F.OPENAI_RESPONSES));
 expect(result.response.status).toBe(200);
 expect(await result.response.json()).toMatchObject(payload);
 expect(db.enqueueRequestUsage).toHaveBeenCalledTimes(1);
});

it.each([F.OPENAI, F.CLAUDE])('forced Responses partial budget terminal maps correctly to %s', async (sourceFormat) => {
 const payload = { id: 'resp_partial', object: 'response', status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' }, output: [{ type: 'message', content: [{ type: 'output_text', text: 'Partial' }] }], usage: { input_tokens: 12, output_tokens: 16, total_tokens: 28, output_tokens_details: { reasoning_tokens: 16 } } };
 const upstream = new Response(`event: response.incomplete\ndata: ${JSON.stringify({ type: 'response.incomplete', response: payload })}\n\n`, { headers: { 'content-type': 'text/event-stream' } });
 const result = await forced(ctx(upstream, sourceFormat, F.OPENAI_RESPONSES));
 const json = await result.response.json();
 expect(result.response.status).toBe(200);
 if (sourceFormat === F.CLAUDE) {
   expect(json.stop_reason).toBe('max_tokens');
   expect(json.content).toContainEqual({ type: 'text', text: 'Partial' });
 } else {
   expect(json.choices[0].finish_reason).toBe('length');
   expect(json.usage.completion_tokens_details).toEqual({ reasoning_tokens: 16 });
 }
});
it('forced Chat refusal is usable and survives Responses conversion', async () => {
 const upstream = new Response(`data: ${JSON.stringify({ choices: [{ delta: { refusal: 'Cannot comply' }, finish_reason: 'length' }], usage })}\n\ndata: [DONE]\n\n`, { headers: { 'content-type': 'text/event-stream' } });
 const result = await forced(ctx(upstream, F.OPENAI_RESPONSES));
 expect(result.response.status).toBe(200);
 const json = await result.response.json();
 expect(json.output.find(x => x.type === 'message').content).toContainEqual({ type: 'refusal', refusal: 'Cannot comply' });
 expect(json.status).toBe('incomplete');
});
it('request detail retains budget configuration without arbitrary body secrets', async () => {
 const body = { messages: [], model: 'fixture', max_output_tokens: 16, reasoning_effort: 'high', generationConfig: { maxOutputTokens: 16, thinkingConfig: { thinkingBudget: 8 } }, credential: 'offline-private-field' };
 await native({ ...ctx(Response.json(chat())), body });
 const request = db.saveRequestDetail.mock.calls[0][0].request;
 expect(request).toMatchObject({ max_output_tokens: 16, reasoning_effort: 'high', generationConfig: body.generationConfig });
 expect(request).not.toHaveProperty('credential');
});

it.each([F.OPENAI, F.CLAUDE])('forced Responses refusal remains usable for %s clients', async (sourceFormat) => {
 const payload = { object: 'response', status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' }, output: [{ type: 'message', content: [{ type: 'refusal', refusal: 'Cannot comply' }] }], usage: { input_tokens: 12, output_tokens: 16 } };
 const upstream = new Response(`event: response.incomplete\ndata: ${JSON.stringify({ type: 'response.incomplete', response: payload })}\n\n`, { headers: { 'content-type': 'text/event-stream' } });
 const result = await forced(ctx(upstream, sourceFormat, F.OPENAI_RESPONSES));
 expect(result.response.status).toBe(200);
 const json = await result.response.json();
 if (sourceFormat === F.OPENAI) expect(json.choices[0].message.refusal).toBe('Cannot comply');
 else expect(json.content).toContainEqual({ type: 'text', text: 'Cannot comply' });
});

function pendingCompletion(message = { role: 'assistant', content: '' }, tokens = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }) {
 return { object: 'chat.completion', choices: [{ index: 0, message, finish_reason: 'in_progress' }], usage: tokens };
}

it('advances a combo after a real nonstream handler receives zero-output nonfinal JSON', async () => {
 const attempted = [];
 const response = await handleComboChat({
  body: { messages: [], stream: false }, models: ['first/empty', 'second/answer'], comboName: 'empty-json-fixture', autoSwitch: false, log,
  handleSingleModel: async (_body, model) => {
   attempted.push(model);
   const payload = model === 'first/empty' ? pendingCompletion() : chat('Answer from the next model', 'stop');
   return (await native(ctx(Response.json(payload)))).response;
  },
 });
 expect(response.status).toBe(200);
 expect((await response.json()).choices[0].message.content).toBe('Answer from the next model');
 expect(attempted).toEqual(['first/empty', 'second/answer']);
});

it('does not return HTTP 200 when every combo member produces nonfinal empty JSON', async () => {
 const attempted = [];
 const response = await handleComboChat({
  body: { messages: [], stream: false }, models: ['first/empty', 'second/empty'], comboName: 'all-empty-json-fixture', autoSwitch: false, log,
  handleSingleModel: async (_body, model) => {
   attempted.push(model);
   const payload = pendingCompletion();
   payload.choices[0].finish_reason = 'incomplete';
   return (await native(ctx(Response.json(payload)))).response;
  },
 });
 expect(response.status).toBe(502);
 expect(await response.json()).toMatchObject({ error: { code: 'empty_response' } });
 expect(attempted).toEqual(['first/empty', 'second/empty']);
});

it.each([
 ['reasoning alias', { role: 'assistant', content: '', reasoning: 'Actual generated reasoning' }],
 ['thinking blocks', { role: 'assistant', content: '', thinking: [{ type: 'thinking', thinking: 'Actual generated reasoning' }] }],
 ['tool calls', { role: 'assistant', content: '', tool_calls: [{ id: 'call_fixture', type: 'function', function: { name: 'read_file', arguments: '{}' } }] }],
 ['legacy function call', { role: 'assistant', content: '', function_call: { name: 'read_file', arguments: '{}' } }],
 ['refusal', { role: 'assistant', content: '', refusal: 'Cannot comply' }],
 ['image output', { role: 'assistant', content: '', images: [{ type: 'image_url', image_url: { url: 'https://example.invalid/generated.png' } }] }],
 ['audio output', { role: 'assistant', content: '', audio: { id: 'audio_fixture', data: 'AQ==', transcript: 'Generated speech' } }],
])('preserves nonfinal JSON with %s rather than generating another paid answer', async (_name, message) => {
 const attempted = [];
 const response = await handleComboChat({
  body: { messages: [], stream: false }, models: ['first/output', 'second/unused'], comboName: 'preserve-output-fixture', autoSwitch: false, log,
  handleSingleModel: async (_body, model) => {
   attempted.push(model);
   return (await native(ctx(Response.json(pendingCompletion(message))))).response;
  },
 });
 expect(response.status).toBe(200);
 const json = await response.json();
 expect(json.choices[0].message).toMatchObject(message);
 expect(attempted).toEqual(['first/output']);
});

it('preserves positive incurred usage even when nonfinal JSON has no visible output', async () => {
 const attempted = [];
 const response = await handleComboChat({
  body: { messages: [], stream: false }, models: ['first/paid', 'second/unused'], comboName: 'preserve-paid-fixture', autoSwitch: false, log,
  handleSingleModel: async (_body, model) => {
   attempted.push(model);
   return (await native(ctx(Response.json(pendingCompletion(undefined, { prompt_tokens: 12, completion_tokens: 0, total_tokens: 12 }))))).response;
  },
 });
 expect(response.status).toBe(200);
 expect((await response.json()).usage.prompt_tokens).toBe(12);
 expect(attempted).toEqual(['first/paid']);
});

it('keeps output from a later choice when the first choice is nonfinal and empty', async () => {
 const payload = pendingCompletion();
 payload.choices.push({ index: 1, message: { role: 'assistant', content: 'Second candidate answer' }, finish_reason: 'stop' });
 const result = await native(ctx(Response.json(payload)));
 expect(result.response.status).toBe(200);
 expect((await result.response.json()).choices[1].message.content).toBe('Second candidate answer');
});

it.each(['native', 'forced'])('%s rejects zero-output nonfinal SSE after aggregation', async (transport) => {
 const payload = { choices: [{ index: 0, delta: { role: 'assistant' }, finish_reason: 'in_progress' }], usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 } };
 const upstream = new Response(`data: ${JSON.stringify(payload)}\n\ndata: [DONE]\n\n`, { headers: { 'content-type': 'text/event-stream' } });
 const result = await (transport === 'native' ? native(ctx(upstream)) : forced(ctx(upstream)));
 expect(result.response.status).toBe(502);
 expect(await result.response.json()).toMatchObject({ error: { code: 'empty_response' } });
});

it('retains a terminal no-op completion instead of replaying it through another model', async () => {
 const attempted = [];
 const payload = pendingCompletion();
 payload.choices[0].finish_reason = 'stop';
 const response = await handleComboChat({
  body: { messages: [], stream: false }, models: ['first/done', 'second/unused'], comboName: 'terminal-noop-fixture', autoSwitch: false, log,
  handleSingleModel: async (_body, model) => {
   attempted.push(model);
   return (await native(ctx(Response.json(payload)))).response;
  },
 });
 expect(response.status).toBe(200);
 expect((await response.json()).choices[0]).toMatchObject({ message: { content: '' }, finish_reason: 'stop' });
 expect(attempted).toEqual(['first/done']);
});
