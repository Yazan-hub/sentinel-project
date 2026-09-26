// Shared argv parsing for the bridge's CLIs: one positional file path plus --flag value pairs.
// (The brief for this task assumed this module already existed from the Governed Intake work; it
// didn't — intake.mjs and artefact-import.mjs each inline the same few lines. This gives
// new CLIs, starting with manifest.mjs, one place to get it from without touching those in scope.)
export function parseCliArgs(argv) {
  const file = argv.find((a) => !a.startsWith("--"));
  const flag = (name, def) => {
    const i = argv.indexOf(`--${name}`);
    return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : def;
  };
  const has = (name) => argv.includes(`--${name}`);
  return { file, flag, has };
}
