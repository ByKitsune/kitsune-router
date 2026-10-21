// Content-block "type" discriminators — fixed per format. Pure data (no logic).

// OpenAI chat content blocks + tool_call wrapper.
export const OPENAI_BLOCK = {
  TEXT: "text",
  IMAGE_URL: "image_url",
  IMAGE: "image",
  INPUT_AUDIO: "input_audio",
  AUDIO_URL: "audio_url",
  VIDEO_URL: "video_url",
  INPUT_VIDEO: "input_video",
  FILE: "file",
  FUNCTION: "function",
};

// OpenAI-compatible vendor reasoning_details discriminators.
export const REASONING_DETAIL = {
  TEXT: "reasoning.text",
  SUMMARY: "reasoning.summary",
};

// Claude content blocks.
export const CLAUDE_BLOCK = {
  TEXT: "text",
  IMAGE: "image",
  DOCUMENT: "document",
  TOOL_USE: "tool_use",
  TOOL_RESULT: "tool_result",
  TOOL_ADDITION: "tool_addition",
  THINKING: "thinking",
  REDACTED_THINKING: "redacted_thinking",
  SERVER_TOOL_USE: "server_tool_use",
  WEB_SEARCH_TOOL_RESULT: "web_search_tool_result",
  CONTAINER_UPLOAD: "container_upload",
};

export const CLAUDE_TOOL_DEFINITION = "tool_definition";

// OpenAI tool messages have no error flag; preserve failures in readable content.
export const TOOL_ERROR_PREFIX = "[tool_error] ";

// OpenAI Responses API item types.
export const RESPONSES_ITEM = {
  MESSAGE: "message",
  FUNCTION_CALL: "function_call",
  FUNCTION_CALL_OUTPUT: "function_call_output",
  CUSTOM_TOOL_CALL: "custom_tool_call",
  CUSTOM_TOOL_CALL_OUTPUT: "custom_tool_call_output",
  ADDITIONAL_TOOLS: "additional_tools",
  REASONING: "reasoning",
  OUTPUT_TEXT: "output_text",
  REFUSAL: "refusal",
  INPUT_TEXT: "input_text",
  INPUT_IMAGE: "input_image",
  INPUT_FILE: "input_file",
  SUMMARY_TEXT: "summary_text",
  REASONING_TEXT: "reasoning_text",
};

// Valid OpenAI block types (used by filterToOpenAIFormat).
export const VALID_OPENAI_CONTENT_TYPES = [
  OPENAI_BLOCK.TEXT, OPENAI_BLOCK.IMAGE_URL, OPENAI_BLOCK.IMAGE, OPENAI_BLOCK.INPUT_AUDIO, OPENAI_BLOCK.AUDIO_URL, OPENAI_BLOCK.VIDEO_URL, OPENAI_BLOCK.INPUT_VIDEO, OPENAI_BLOCK.FILE,
];
export const VALID_OPENAI_MESSAGE_TYPES = [
  OPENAI_BLOCK.TEXT, OPENAI_BLOCK.IMAGE_URL, OPENAI_BLOCK.IMAGE, "tool_calls", CLAUDE_BLOCK.TOOL_RESULT,
];
