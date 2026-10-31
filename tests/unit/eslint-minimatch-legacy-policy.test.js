import { describe, expect, it } from "vitest";
import { ESLint } from "eslint";
import { fileURLToPath } from "node:url";
import config from "../../eslint.config.mjs";

const root = fileURLToPath(new URL("../..", import.meta.url));
async function findings(source, ruleId, options) {
  const eslint = new ESLint({ cwd: root, overrideConfigFile: true,
    overrideConfig: [...config, { rules: { [ruleId]: ["error", options] } }] });
  const results = await eslint.lintText(source, { filePath: "src/lint-minimatch-migration.jsx" });
  expect(results.flatMap(result => result.messages).some(message => message.fatal)).toBe(false);
  return results.flatMap(result => result.messages).filter(message => message.ruleId === ruleId);
}

describe("patched matcher at actual legacy ESLint rule boundaries", () => {
  it.each([["DemoCard", true], ["SafeCard", false]])("preserves React custom-component danger checks for %s", async (name, rejected) => {
    const source = `const ${name} = () => null; export default function App() { return <${name} dangerouslySetInnerHTML={{ __html: "fixture" }} />; }`;
    const messages = await findings(source, "react/no-danger", { customComponentNames: ["Demo*"] });
    expect(messages).toHaveLength(rejected ? 1 : 0);
  });

  it.each([["FancyControl", false], ["OtherControl", true]])("preserves custom accessibility controls for %s", async (name, rejected) => {
    const source = `const ${name} = () => null; export default function App() { return <label>Save <${name} /></label>; }`;
    const messages = await findings(source, "jsx-a11y/label-has-associated-control", { controlComponents: ["Fancy*"], assert: "nesting" });
    expect(messages).toHaveLength(rejected ? 1 : 0);
  });

  it.each([["react/jsx-runtime", true], ["react", false]])("preserves import forbids using makeRe(pattern).test(path): %s", async (specifier, rejected) => {
    const source = `import value from ${JSON.stringify(specifier)}; export default value;`;
    const messages = await findings(source, "import/no-internal-modules", { forbid: ["react/**"] });
    expect(messages).toHaveLength(rejected ? 1 : 0);
  });

  it.each([["example/public-sdk", false], ["example/private-sdk", true]])("preserves namespace import exceptions for %s", async (specifier, rejected) => {
    const source = `import * as value from ${JSON.stringify(specifier)}; export default value;`;
    const messages = await findings(source, "import/no-namespace", { ignore: ["**/public-*"] });
    expect(messages).toHaveLength(rejected ? 1 : 0);
  });
});
