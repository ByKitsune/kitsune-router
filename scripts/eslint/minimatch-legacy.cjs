// Compatibility for the audited callable minimatch consumers in three legacy
// ESLint plugins. Matching always uses the patched publisher implementation.
const modern = require("minimatch");

function createLegacyMatcher(defaultOptions = {}) {
  const options = value => ({ ...defaultOptions, ...value });
  const matcher = (path, pattern, value) => modern.minimatch(path, pattern, options(value));

  class LegacyMinimatch extends modern.Minimatch {
    constructor(pattern, value) { super(pattern, options(value)); }
    // import/no-internal-modules only calls makeRe(pattern).test(path). Keep
    // that tested interface without rebuilding the removed regex engine.
    makeRe() {
      if (this.comment || this.empty || !this.set.length) return false;
      return Object.freeze({ test: path => this.match(path) });
    }
    static defaults(value) { return createLegacyMatcher(options(value)).Minimatch; }
  }

  Object.assign(matcher, modern.minimatch, {
    Minimatch: LegacyMinimatch,
    defaults: value => createLegacyMatcher(options(value)),
    filter: (pattern, value) => modern.filter(pattern, options(value)),
    braceExpand: (pattern, value) => modern.braceExpand(pattern, options(value)),
    match: (paths, pattern, value) => modern.match(paths, pattern, options(value)),
    makeRe: (pattern, value) => new LegacyMinimatch(pattern, value).makeRe(),
  });
  return Object.freeze(matcher);
}

module.exports = createLegacyMatcher();
