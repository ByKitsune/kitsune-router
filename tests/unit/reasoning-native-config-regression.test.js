import { describe, it, expect } from 'vitest';
import { translateRequest } from '../../open-sse/translator/index.js';
import { applyThinking } from '../../open-sse/translator/concerns/thinkingUnified.js';
import { normalizeClaudePassthrough, prepareClaudeRequest } from '../../open-sse/translator/formats/claude.js';
import { getCapabilitiesForModel } from '../../open-sse/providers/capabilities.js';
import { DefaultExecutor } from '../../open-sse/executors/default.js';

const messages = () => [{ role: 'user', content: 'hello' }];
const translate = (source, target, model, body, provider, credentials = null) =>
  translateRequest(source, target, model, structuredClone(body), false, credentials, provider);

describe('Native DeepSeek effort mapping', () => {
  it.each([['low', 'low'], ['minimal', 'low'], ['xhigh', 'high'], ['ultra', 'max']])('maps %s to native %s', (effort, expected) => {
    const body = applyThinking('openai', 'deepseek-v4-pro', { reasoning_effort: effort }, 'deepseek');
    expect(body.reasoning_effort).toBe(expected);
  });
  it('retains distinct MiMo and OpenRouter native wire contracts', () => {
    expect(applyThinking('openai', 'mimo-v2.5-pro', { reasoning_effort: 'xhigh' }, 'opencode-go').reasoning_effort).toBe('xhigh');
    const routed = applyThinking('openai', 'deepseek-v4-pro', { reasoning_effort: 'xhigh' }, 'openrouter');
    expect(routed.reasoning).toEqual({ effort: 'xhigh' });
    expect(routed).not.toHaveProperty('reasoning_effort');
  });
});

describe('Claude valid manual thinking', () => {
  it('does not preserve native manual fields on a non-Claude wire', () => {
    const body = applyThinking('openai', 'claude-sonnet-4.6', { thinking: { type: 'enabled', budget_tokens: 8192 } }, 'claude');
    expect(body.reasoning_effort).toBe('medium');
    expect(body.thinking).toBeUndefined();
  });
  it.each(['auto', 'minimal'])('generates a required valid budget for %s without raising output', (effort) => {
    const result = translate('openai', 'claude', 'claude-sonnet-4.5', {
      messages: messages(), max_tokens: 4096, reasoning_effort: effort,
    }, 'claude');
    expect(result.max_tokens).toBe(4096);
    expect(result.thinking.type).toBe('enabled');
    expect(Number.isInteger(result.thinking.budget_tokens)).toBe(true);
    expect(result.thinking.budget_tokens).toBeGreaterThanOrEqual(1024);
    expect(result.thinking.budget_tokens).toBeLessThan(4096);
  });
  it('fits native Haiku adaptive downgrade into the already chosen output', () => {
    const result = normalizeClaudePassthrough({ model: 'claude-haiku-4.5', messages: messages(), max_tokens: 4096,
      thinking: { type: 'adaptive', display: 'omitted' } }, 'claude-haiku-4.5');
    expect(result.max_tokens).toBe(4096);
    expect(result.thinking).toEqual({ type: 'enabled', budget_tokens: 3072, display: 'omitted' });
  });
  it.each([undefined, 512])('normalizes native enabled budget %s', (budget) => {
    const result = normalizeClaudePassthrough({ messages: messages(), max_tokens: 4096,
      thinking: { type: 'enabled', ...(budget === undefined ? {} : { budget_tokens: budget }) } }, 'claude-sonnet-4.5');
    expect(result.thinking.budget_tokens).toBeGreaterThanOrEqual(1024);
    expect(result.thinking.budget_tokens).toBeLessThan(4096);
  });
  it.each([0, 1000, 1024])('rejects an impossible enabled output cap %s with a coded error', (max_tokens) => {
    expect(() => normalizeClaudePassthrough({ max_tokens, thinking: { type: 'enabled', budget_tokens: 1024 } }, 'claude-sonnet-4.5'))
      .toThrow(expect.objectContaining({ code: 'invalid_thinking_budget' }));
  });
  it('preserves supported manual interleaved budgets and mode in native and same-format paths', () => {
    const rawHeaders = { 'Anthropic-Beta': 'other-beta,interleaved-thinking-2025-05-14' };
    for (const model of ['claude-sonnet-4.5', 'claude-sonnet-4.6']) {
      const body = { model, messages: messages(), max_tokens: 4096, tools: [{ name: 'search', input_schema: { type: 'object' } }],
        thinking: { type: 'enabled', budget_tokens: 8192, display: 'omitted' } };
      const normalized = normalizeClaudePassthrough(structuredClone(body), model, new Headers(rawHeaders));
      const executor = new DefaultExecutor('claude');
      executor.buildHeaders({ rawHeaders }, false, 'https://api.anthropic.com/v1/messages', model, normalized);
      expect(normalized.thinking).toEqual(body.thinking);
      const result = translate('claude', 'claude', model, body, 'claude', { rawHeaders });
      executor.buildHeaders({ rawHeaders }, false, 'https://api.anthropic.com/v1/messages', model, result);
      expect(result.thinking).toEqual(body.thinking);
      expect(result.max_tokens).toBe(4096);
    }
  });
  it('does not grant the interleaved exception to unsupported Haiku or Opus 4.6', () => {
    for (const model of ['claude-haiku-4.5', 'claude-opus-4.6']) {
      const body = { model, max_tokens: 4096, tools: [{ name: 'search', input_schema: { type: 'object' } }], thinking: { type: 'enabled', budget_tokens: 8192 } };
      prepareClaudeRequest(body, 'claude', null, null, { 'anthropic-beta': 'interleaved-thinking-2025-05-14' });
      expect(body.thinking.budget_tokens).toBeLessThan(4096);
    }
  });
  it('leaves adaptive budgets and foreign DeepSeek enabled configuration alone', () => {
    const adaptive = translate('openai', 'claude', 'claude-opus-4.7', { messages: messages(), max_tokens: 1000, reasoning_effort: 'high' }, 'claude');
    expect(adaptive.thinking).not.toHaveProperty('budget_tokens');
    const foreign = { model: 'deepseek-v4-pro', max_tokens: 1000, thinking: { type: 'enabled' } };
    prepareClaudeRequest(foreign, 'deepseek');
    expect(foreign.thinking).toEqual({ type: 'enabled' });
  });
});

describe('Gemini native model controls', () => {
  it.each(['gemini', 'vertex'])('uses the native Pro budget range on %s, without disabling thinking', (provider) => {
    const caps = getCapabilitiesForModel(provider, 'gemini-2.5-pro');
    expect(caps.thinkingRange).toEqual({ min: 128, max: 32768 });
    expect(caps.thinkingCanDisable).toBe(false);
    const body = { generationConfig: { maxOutputTokens: 1000, thinkingConfig: { thinkingBudget: 32768 } } };
    applyThinking(provider, 'gemini-2.5-pro', body, provider);
    expect(body.generationConfig.thinkingConfig.thinkingBudget).toBe(32768);
    const disabled = applyThinking(provider, 'gemini-2.5-pro', { reasoning_effort: 'none' }, provider);
    expect(disabled.generationConfig.thinkingConfig.thinkingBudget).toBeGreaterThanOrEqual(128);
  });
  it('enforces Flash Lite positive minimum while retaining zero and dynamic sentinels', () => {
    for (const [input, expected] of [[1, 512], [0, 0], [-1, -1]]) {
      const body = { generationConfig: { maxOutputTokens: 1000, thinkingConfig: { thinkingBudget: input } } };
      applyThinking('gemini', 'gemini-2.5-flash-lite', body, 'gemini');
      expect(body.generationConfig.thinkingConfig.thinkingBudget).toBe(expected);
    }
  });
  it.each(['gemini-3.1-pro-preview', 'gemini-3.7-flash', 'gemini-3.8-flash'])('%s maps unsupported minimal to low', (model) => {
    const result = translate('openai', 'gemini', model, { messages: messages(), reasoning_effort: 'minimal', max_tokens: 1000 }, 'gemini');
    expect(result.generationConfig.thinkingConfig.thinkingLevel).toBe('low');
    expect(result.generationConfig.maxOutputTokens).toBe(1000);
  });
  it('never leaks ultra into the Gemini level enum', () => {
    const body = applyThinking('gemini', 'gemini-3.1-pro-preview(ultra)', {}, 'gemini');
    expect(body.generationConfig.thinkingConfig.thinkingLevel).toBe('high');
  });
  it('does not project native metadata onto reseller or audio variants', () => {
    expect(getCapabilitiesForModel('openrouter', 'google/gemini-2.5-pro').thinkingRange).toEqual({ min: 0, max: 24576 });
    expect(getCapabilitiesForModel('gemini', 'gemini-3.8-flash-tts').thinkingEfforts).toBeUndefined();
    const body = applyThinking('gemini', 'gemini-3-flash-preview', { reasoning_effort: 'minimal' }, 'gemini');
    expect(body.generationConfig.thinkingConfig.thinkingLevel).toBe('minimal');
  });
});

describe('Gemini explicit output cap', () => {
  it.each([0, 1000, null])('never raises explicit native maxOutputTokens=%s', (cap) => {
    const body = { generationConfig: { maxOutputTokens: cap, thinkingConfig: { thinkingBudget: 24576 } } };
    applyThinking('gemini', 'gemini-2.5-flash', body, 'gemini');
    expect(body.generationConfig.maxOutputTokens).toBe(cap);
  });
  it('preserves the explicit cap through Chat translation', () => {
    const result = translate('openai', 'gemini', 'gemini-3.1-pro-preview', {
      messages: messages(), max_tokens: 1000, reasoning_effort: 'high',
    }, 'gemini');
    expect(result.generationConfig.maxOutputTokens).toBe(1000);
  });
  it('bounds an oversized existing native cap by the known model maximum', () => {
    const body = { generationConfig: { maxOutputTokens: 100000, thinkingConfig: { thinkingBudget: 24576 } } };
    applyThinking('gemini', 'gemini-2.5-flash', body, 'gemini');
    expect(body.generationConfig.maxOutputTokens).toBe(getCapabilitiesForModel('gemini', 'gemini-2.5-flash').maxOutput);
  });
  it('retains the existing omitted-cap policy, not an explicit-cap floor', () => {
    const body = { generationConfig: { thinkingConfig: { thinkingBudget: 24576 } } };
    applyThinking('gemini', 'gemini-2.5-flash', body, 'gemini');
    expect(body.generationConfig.maxOutputTokens).toBe(32768);
  });
});

describe('Responses native reasoning configuration', () => {
  it('uses reasoning.effort after Chat translation', () => {
    const result = translate('openai', 'openai-responses', 'gpt-5.4', {
      messages: messages(), max_completion_tokens: 1000, reasoning_effort: 'high',
    }, 'openai');
    expect(result.reasoning).toEqual({ effort: 'high', summary: 'auto' });
    expect(result).not.toHaveProperty('reasoning_effort');
    expect(result.max_output_tokens).toBe(1000);
  });
  it('retains same-format summary, native options and encrypted include with suffix override', () => {
    const result = translate('openai-responses', 'openai-responses', 'gpt-5.4(low)', {
      input: 'hello', reasoning: { effort: 'high', summary: 'detailed', generate_summary: 'concise' },
      include: ['reasoning.encrypted_content'], max_output_tokens: 1000,
    }, 'openai');
    expect(result.reasoning).toEqual({ effort: 'low', summary: 'detailed', generate_summary: 'concise' });
    expect(result.include).toEqual(['reasoning.encrypted_content']);
    expect(result).not.toHaveProperty('reasoning_effort');
  });
  it('retains original native reasoning options when the Chat converter rebuilds reasoning', () => {
    const result = translate('openai', 'openai-responses', 'gpt-5.4', {
      messages: messages(), reasoning_effort: 'low', reasoning: { summary: 'detailed', generate_summary: 'concise' },
    }, 'openai');
    expect(result.reasoning).toEqual({ effort: 'low', summary: 'detailed', generate_summary: 'concise' });
    expect(result).not.toHaveProperty('reasoning_effort');
  });
  it('leaves summary-only native requests intact', () => {
    const result = translate('openai-responses', 'openai-responses', 'gpt-5.4', {
      input: 'hello', reasoning: { summary: 'detailed' }, include: ['reasoning.encrypted_content'],
    }, 'openai');
    expect(result.reasoning).toEqual({ summary: 'detailed' });
    expect(result.include).toEqual(['reasoning.encrypted_content']);
  });
});
