import { existsSync, statSync, openSync, readSync, closeSync, readFileSync } from "node:fs";
import { TextDecoder } from "node:util";

const [id, mode, stdout = "0", stderr = "0"] = process.argv.slice(2);
if (!/^[a-z0-9-]{1,80}$/.test(id || "") || !["output", "follow"].includes(mode)) throw new Error("Invalid reader request");
const offsets = [stdout, stderr].map(Number);
if (offsets.some((offset) => !Number.isSafeInteger(offset) || offset < 0)) throw new Error("Invalid byte offsets");
const dir = `/root/kitsune-router-worker-mesh/jobs/${id}`;
const decoder = new TextDecoder("utf-8", { fatal: true });
const frame = (value) => new Promise((accept, reject) => process.stdout.write(`${JSON.stringify(value)}\n`, (error) => error ? reject(error) : accept()));
async function emit() {
  // An exit marker is published only after the runner/wrapper finishes writing.
  // Observe completion before taking file sizes, so terminal offsets describe a
  // post-completion snapshot rather than racing the producer's final append.
  const completed = existsSync(`${dir}/exit-code`);
  let remaining = false;
  for (const [i, stream] of ["stdout", "stderr"].entries()) {
    const file = `${dir}/${stream}.log`;
    if (!existsSync(file)) continue;
    const size = statSync(file).size;
    if (offsets[i] > size) throw new Error("Offset exceeds persisted stream length");
    if (size > offsets[i]) {
      const buffer = Buffer.alloc(Math.min(65536, size - offsets[i]));
      const fd = openSync(file, "r");
      const read = readSync(fd, buffer, 0, buffer.length, offsets[i]); closeSync(fd);
      let consumed = read;
      let text;
      // Leave at most the incomplete UTF8 suffix unread. Reconnect offsets always
      // point at complete code-point boundaries; never silently replace bytes.
      for (let trim = 0; trim <= 3; trim++) {
        try { consumed = read - trim; text = decoder.decode(buffer.subarray(0, consumed)); break; }
        catch { if (trim === 3) throw new Error("Invalid UTF8 or reconnect offset is not a code-point boundary"); }
      }
      offsets[i] += consumed;
      if (consumed) await frame({ stream, offset: offsets[i], text });
      if (size > offsets[i]) remaining = true;
    }
  }
  if (!remaining && completed) {
    await frame({ exitCode: Number(readFileSync(`${dir}/exit-code`, "utf8")), offsets });
    return true;
  }
  // If completion appeared during the pass, repeat with the post-completion
  // snapshot even for a one-shot output request; never omit final diagnostics.
  return mode === "output" && !remaining && !existsSync(`${dir}/exit-code`);
}
while (!(await emit())) await new Promise((accept) => setTimeout(accept, mode === "follow" ? 500 : 10));
// Natural exit lets pipe writes finish; never force process.exit after frames.
