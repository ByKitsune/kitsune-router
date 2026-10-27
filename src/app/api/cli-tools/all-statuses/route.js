"use server";

import { NextResponse } from "next/server";
import { GET as claudeGet } from "../claude-settings/route";
import { GET as codexGet } from "../codex-settings/route";
import { GET as opencodeGet } from "../opencode-settings/route";
import { GET as droidGet } from "../droid-settings/route";
import { GET as openclawGet } from "../openclaw-settings/route";
import { GET as hermesGet } from "../hermes-settings/route";
import { GET as coworkGet } from "../cowork-settings/route";
import { GET as copilotGet } from "../copilot-settings/route";
import { GET as clineGet } from "../cline-settings/route";
import { GET as kiloGet } from "../kilo-settings/route";
import { GET as deepseekTuiGet } from "../deepseek-tui-settings/route";
import { GET as jcodeGet } from "../jcode-settings/route";
import { GET as grokBuildGet } from "../grok-build-settings/route";
import { GET as devinGet } from "../devin-settings/route";

const STATUS_GETTERS = {
  claude: claudeGet,
  codex: codexGet,
  opencode: opencodeGet,
  droid: droidGet,
  openclaw: openclawGet,
  hermes: hermesGet,
  cowork: coworkGet,
  copilot: copilotGet,
  cline: clineGet,
  kilo: kiloGet,
  "deepseek-tui": deepseekTuiGet,
  jcode: jcodeGet,
  "grok-build": grokBuildGet,
  devin: devinGet,
};

// The overview only needs connection state, never host configuration or credentials.
export async function GET(request, context) {
  const entries = await Promise.all(
    Object.entries(STATUS_GETTERS).map(async ([toolId, getter]) => {
      try {
        const res = await getter(request, context);
        if (!res.ok) {
          return [toolId, { error: res.status === 403 ? "Local only: CLI token required" : "Status unavailable" }];
        }
        const data = await res.json();
        return [toolId, { installed: !!data.installed, hasKitsuneRouter: !!data.hasKitsuneRouter }];
      } catch {
        return [toolId, null];
      }
    })
  );
  return NextResponse.json(Object.fromEntries(entries));
}
