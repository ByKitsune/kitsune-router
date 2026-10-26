import { compressSingleToolName } from "../../utils/toolCompressor.js";

export function compressGeminiToolNames(body) {
  const request = body.request || body;
  if (!Array.isArray(request.tools)) return { body, toolNameMap: null };
  const aliases = new Map();
  for (const tool of request.tools) {
    for (const fn of Array.isArray(tool?.functionDeclarations) ? tool.functionDeclarations : []) {
      const wire = compressSingleToolName(fn.name);
      if (wire !== fn.name) aliases.set(fn.name, wire);
    }
  }
  if (!aliases.size) return { body, toolNameMap: null };
  const tools = request.tools.map(tool => !tool.functionDeclarations ? tool : { ...tool,
    functionDeclarations: tool.functionDeclarations.map(fn => aliases.has(fn.name) ? { ...fn, name: aliases.get(fn.name) } : fn) });
  const contents = request.contents?.map(content => ({ ...content, parts: content.parts?.map(part => {
    for (const field of ["functionCall", "functionResponse"]) {
      if (aliases.has(part[field]?.name)) return { ...part, [field]: { ...part[field], name: aliases.get(part[field].name) } };
    }
    return part;
  }) }));
  const choice = request.toolConfig?.functionCallingConfig;
  const toolConfig = choice?.allowedFunctionNames ? { ...request.toolConfig,
    functionCallingConfig: { ...choice, allowedFunctionNames: choice.allowedFunctionNames.map(name => aliases.get(name) || name) } } : request.toolConfig;
  const result = { ...request, tools, ...(contents ? { contents } : {}), ...(toolConfig ? { toolConfig } : {}) };
  return { body: body.request ? { ...body, request: result } : result,
    toolNameMap: new Map([...aliases].map(([original, wire]) => [wire, original])) };
}
