import { cloneRequestBody } from "../../utils/requestBody.js";
import { captureThinking, parseSuffix } from "./thinkingUnified.js";

const CONTROL_FIELDS = ["reasoning_effort", "reasoning", "thinking", "thinkingConfig",
  "enable_thinking", "thinking_budget", "budget_tokens", "output_config"];

// A relay does not own the final provider's reasoning dialect or restrictions.
// Snapshot controls before a source translator reduces a budget to an effort.
export function captureGatewayReasoning(body) {
  const controls = Object.fromEntries(CONTROL_FIELDS.filter(key => Object.hasOwn(body, key)).map(key => [key, body[key]]));
  if (body.generationConfig?.thinkingConfig !== undefined) {
    controls.generationConfig = { thinkingConfig: body.generationConfig.thinkingConfig };
  }
  if (body.request?.generationConfig?.thinkingConfig !== undefined) {
    controls.request = { generationConfig: { thinkingConfig: body.request.generationConfig.thinkingConfig } };
  }
  return { controls: cloneRequestBody(controls), intent: captureThinking(body) };
}

export function restoreGatewayReasoning(body, snapshot, model) {
  for (const key of CONTROL_FIELDS) delete body[key];
  if (body.generationConfig) delete body.generationConfig.thinkingConfig;
  if (body.request?.generationConfig) delete body.request.generationConfig.thinkingConfig;
  const controls = cloneRequestBody(snapshot.controls);
  const { override } = parseSuffix(model);
  if (override) {
    // Suffixes are explicit caller overrides. Forward their intent without
    // clamping it against a guessed underlying model; the final route admits it.
    const reasoning = controls.reasoning && typeof controls.reasoning === "object" && !Array.isArray(controls.reasoning)
      ? { ...controls.reasoning } : {};
    for (const key of ["effort", "enabled", "max_tokens"]) delete reasoning[key];
    if (snapshot.intent?.includeThoughts !== undefined) reasoning.exclude = !snapshot.intent.includeThoughts;
    if (override.mode === "none") reasoning.enabled = false;
    else if (override.mode === "auto") reasoning.enabled = true;
    else if (override.mode === "budget") reasoning.max_tokens = override.budget;
    else reasoning.effort = override.level;
    const outputConfig = controls.output_config;
    if (outputConfig && typeof outputConfig === "object" && !Array.isArray(outputConfig)) {
      const { effort, ...remaining } = outputConfig;
      if (Object.keys(remaining).length) body.output_config = remaining;
    }
    body.reasoning = reasoning;
    return body;
  }
  for (const [key, value] of Object.entries(controls)) {
    if (key === "generationConfig") body.generationConfig = { ...body.generationConfig, ...value };
    else if (key === "request") body.request = { ...body.request,
      generationConfig: { ...body.request?.generationConfig, ...value.generationConfig } };
    else body[key] = value;
  }
  return body;
}
