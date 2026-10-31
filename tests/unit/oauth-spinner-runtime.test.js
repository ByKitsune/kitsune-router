import { afterEach, expect, it, vi } from "vitest";
import { Writable } from "node:stream";
import { spinner as createSpinner } from "../../src/lib/oauth/utils/ui.js";

afterEach(() => vi.useRealTimers());

it("keeps OAuth spinner start/success/retry/failure usable without retaining terminal hooks or timers", async () => {
  vi.useFakeTimers();
  const chunks = [];
  const terminal = new Writable({ write(chunk, _encoding, callback) { chunks.push(chunk.toString()); callback(); } });
  Object.assign(terminal, { isTTY: true, columns: 40, rows: 20,
    cursorTo() {}, moveCursor() {}, clearLine() {} });
  const write = terminal.write;
  const spinner = createSpinner({ text: "Starting synthetic OAuth", stream: terminal,
    isEnabled: true, hideCursor: false, discardStdin: false, interval: 50 });
  try {
    expect(spinner.start().isSpinning).toBe(true);
    terminal.write("External UTF-8 output ✓");
    await vi.advanceTimersByTimeAsync(250);
    terminal.write("\n");
    spinner.text = "Exchanging synthetic authorization code";
    await vi.advanceTimersByTimeAsync(50);
    expect(spinner.succeed("Synthetic authorization completed").isSpinning).toBe(false);
    expect(terminal.write).toBe(write);
    expect(vi.getTimerCount()).toBe(0);
    expect(spinner.start("Retrying synthetic OAuth").isSpinning).toBe(true);
    expect(spinner.fail("Synthetic failure handled").isSpinning).toBe(false);
    expect(terminal.write).toBe(write);
    expect(vi.getTimerCount()).toBe(0);
    const output = chunks.join("");
    expect(output).toContain("External UTF-8 output ✓");
    expect(output).toContain("Synthetic authorization completed");
    expect(output).toContain("Synthetic failure handled");
  } finally { spinner.stop(); terminal.end(); }
});
