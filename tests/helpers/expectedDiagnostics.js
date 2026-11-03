import { expect, vi } from "vitest";

// A fixture must declare each diagnostic before triggering it. Only a matching
// argument list is captured; unexpected output is forwarded and fails verify().
export function captureExpectedDiagnostics() {
  const expected = [];
  const unexpected = [];
  const spies = {};
  for (const method of ["error", "warn"]) {
    const forward = console[method].bind(console);
    spies[method] = vi.spyOn(console, method).mockImplementation((...args) => {
      const next = expected[0];
      if (next?.method === method) {
        try {
          expect(args).toEqual(next.args);
          expected.shift();
          return;
        } catch { /* Forward and fail an unexpected argument list below. */ }
      }
      unexpected.push({ method, args });
      forward(...args);
    });
  }
  return {
    error: spies.error,
    warn: spies.warn,
    expectError: (...args) => expected.push({ method: "error", args }),
    expectWarn: (...args) => expected.push({ method: "warn", args }),
    verify() {
      try {
        expect(unexpected, "Unexpected console diagnostics must remain visible").toEqual([]);
        expect(expected, "Every declared fixture diagnostic must occur").toEqual([]);
      } finally {
        for (const spy of Object.values(spies)) spy.mockRestore();
      }
    },
  };
}
