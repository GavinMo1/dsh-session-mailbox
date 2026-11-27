// Minimal stand-in for `@deepseek-ai/schemastery`, used only by tests.
//
// `index.js` imports it at module load to declare `export const Config`, and this
// repo has no node_modules on purpose (see AGENTS.md). The stub therefore covers
// exactly the calls that declaration makes — z.object(...) and a chainable
// z.array(...)/z.natural() with .default(undefined) / .default(65536) — and
// nothing else. It is a loader stub, not an implementation: no validation ever
// runs through it in these tests.

const node = () => {
  const self = {
    default: () => self,
    description: () => self,
    required: () => self,
    optional: () => self,
  }
  return self
}

export default {
  object: () => node(),
  array: () => node(),
  natural: () => node(),
  number: () => node(),
  string: () => node(),
  boolean: () => node(),
}
