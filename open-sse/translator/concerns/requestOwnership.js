import { cloneRequestBody } from "../../utils/requestBody.js";
import { getThinkingContext, setThinkingContext } from "./thinking.js";

export function ownRequestBody(body, context = null) {
  const ownership = context?.ownership ?? "borrowed";
  if (ownership !== "borrowed" && ownership !== "owned") {
    throw new TypeError("Request ownership must be borrowed or owned");
  }
  if (ownership === "owned" || !body || typeof body !== "object") return body;
  const result = cloneRequestBody({ ...body });
  for (const symbol of Object.getOwnPropertySymbols(body)) {
    const descriptor = Object.getOwnPropertyDescriptor(body, symbol);
    if (!Object.hasOwn(descriptor, "value")) continue;
    Object.defineProperty(result, symbol, { ...descriptor, value: cloneRequestBody(descriptor.value), writable: true, configurable: true });
  }
  const thinking = getThinkingContext(body);
  if (thinking) setThinkingContext(result, thinking);
  if (result._toolNameMap instanceof Map) result._toolNameMap = new Map(result._toolNameMap);
  return result;
}
