/** Run only in the reserved owner check turn; consumes archives, never packs source. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const repository = path.resolve(fileURLToPath(new URL("../", import.meta.url)));
const metadata = JSON.parse(readFileSync(path.join(repository, "package.json"), "utf8"));
const args = Object.fromEntries(process.argv.slice(2).map(argument => {
  const at = argument.indexOf("=");
  assert.ok(argument.startsWith("--") && at > 2, "Use --name=value arguments.");
  return [argument.slice(2, at), argument.slice(at + 1)];
}));
const owner = metadata.name.split("/")[1];
const stamp = new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-");
const build = path.join(repository, "build");
const output = path.resolve(args.out ?? path.join(build, "installed-consumer", stamp));
assert.ok(output.startsWith(build + path.sep), "Output must remain under this owner's build/.");
mkdirSync(build, { recursive: true });
let ancestor = output;
while (!existsSync(ancestor)) ancestor = path.dirname(ancestor);
assert.ok(realpathSync(ancestor) === realpathSync(build) || realpathSync(ancestor).startsWith(realpathSync(build) + path.sep), "Output ancestor escapes owner build/.");
const workspace = path.join(output, "workspace");
assert.equal(existsSync(workspace), false, "Refusing to overwrite an existing consumer workspace.");
mkdirSync(workspace, { recursive: true });
const artifacts = [["owner", metadata.name, "0.1.0"], ["images", "@foss-earth/images", "0.1.0"], ["renderer", "@foss-earth/renderer", "0.1.0"], ["ui", "@foss-earth/ui", "0.1.0"], ["babylon", "@babylonjs/core", "8.56.2"], ["typescript", "typescript", "5.9.3"], ["jpeg", "jpeg-js", "0.4.4"]];
if (owner === "equirectangular") artifacts.push(["cubemap", "@foss-earth/cubemap", "0.1.0"]);
const dependencies = {}, pins = {};
for (const [argument, name, version] of artifacts) {
  assert.ok(args[argument], `Missing --${argument}=archive.tgz`);
  assert.match(args[`${argument}-sha256`] ?? "", /^[a-f0-9]{64}$/, `Missing exact --${argument}-sha256`);
  const archive = path.resolve(args[argument]);
  const bytes = readFileSync(archive);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  assert.equal(sha256, args[`${argument}-sha256`], `${name} archive digest differs`);
  dependencies[name] = `file:${archive}`;
  pins[name] = { version, sha256, bytes: bytes.byteLength };
}
writeFileSync(path.join(workspace, "package.json"), JSON.stringify({ name: `${owner}-installed-fixture`, version: "1.0.0", private: true, type: "module", dependencies }, null, 2));
const run = (command, argv, filename, environment = process.env) => {
  const log = path.join(output, filename), fd = openSync(log, "w");
  let result;
  try { result = spawnSync(command, argv, { cwd: workspace, env: environment, stdio: ["ignore", fd, fd] }); }
  finally { closeSync(fd); }
  if (result.error) throw result.error;
  assert.equal(result.status, 0, `Installed consumer failed; inspect ${log}`);
  return readFileSync(log, "utf8");
};
run("npm", ["install", "--offline", "--ignore-scripts", "--omit=optional", "--no-audit", "--no-fund", "--cache", path.join(output, "npm-cache")], "install.log");
for (const [name, pin] of Object.entries(pins)) {
  const installed = JSON.parse(readFileSync(path.join(workspace, "node_modules", name, "package.json"), "utf8"));
  assert.equal(installed.name, name); assert.equal(installed.version, pin.version);
}
writeFileSync(path.join(workspace, "guard.mjs"), `
import { registerHooks } from "node:module";
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
const workspace = realpathSync(${JSON.stringify(workspace)}) + path.sep;
registerHooks({ resolve(specifier, context, next) {
  const result = next(specifier, context);
  if (result.url.startsWith("file:")) {
    const resolved = realpathSync(fileURLToPath(result.url));
    if (!resolved.startsWith(workspace)) throw new Error("OUTSIDE_ISOLATED_WORKSPACE: " + resolved);
    if (process.env.OWNER_PURE === "1" && /[/\\\\]node_modules[/\\\\](?:@babylonjs[/\\\\]core|@foss-earth[/\\\\](?:renderer|ui)|react(?:-dom)?)(?:[/\\\\]|$)/.test(resolved)) throw new Error("PURE_IMPORTED_OPTIONAL_PEER: " + resolved);
  }
  return result;
}});
`);
writeFileSync(path.join(workspace, "pure.mjs"), `
import assert from "node:assert/strict";
import * as root from ${JSON.stringify(metadata.name)};
import * as core from ${JSON.stringify(metadata.name + "/core")};
import * as preparation from ${JSON.stringify(metadata.name + "/preparation")};
import * as shaders from ${JSON.stringify(metadata.name + "/shaders")};
assert.equal(typeof globalThis.document, "undefined"); assert.equal(typeof globalThis.window, "undefined");
assert.ok(Object.keys(root).length > Object.keys(core).length);
assert.ok(Object.keys(preparation).length); assert.ok(Object.keys(shaders).length);
console.log("Installed root/core/preparation/shaders load without DOM globals or optional peer imports.");
`);
writeFileSync(path.join(workspace, "consumer.mjs"), readFileSync(path.join(repository, "fixtures", "installed-consumer.mjs")));
writeFileSync(path.join(output, "outside-control.mjs"), "export const shouldNeverLoad = true;\n");
run(process.execPath, ["--import", path.join(workspace, "guard.mjs"), "pure.mjs"], "pure-runtime.log", { ...process.env, OWNER_PURE: "1" });
run(process.execPath, ["--import", path.join(workspace, "guard.mjs"), "consumer.mjs"], "public-runtime.log", { ...process.env, OWNER_OUTSIDE_CONTROL: path.join(output, "outside-control.mjs") });
writeFileSync(path.join(workspace, "public-types.ts"), readFileSync(path.join(repository, "fixtures", "public-types.ts")));
writeFileSync(path.join(workspace, "host-ports.ts"), readFileSync(path.join(repository, "fixtures", "composition", "host-ports.ts")));
const config = { compilerOptions: { target: "ES2023", module: "NodeNext", moduleResolution: "NodeNext", lib: ["ES2023", "DOM", "DOM.Iterable"], types: [], strict: true, skipLibCheck: true, noEmit: true }, files: ["public-types.ts", "host-ports.ts"] };
writeFileSync(path.join(workspace, "tsconfig.json"), JSON.stringify(config, null, 2));
const trace = run(process.execPath, [path.join(workspace, "node_modules", "typescript", "bin", "tsc"), "-p", "tsconfig.json", "--traceResolution"], "public-types.log");
const realWorkspace = realpathSync(workspace) + path.sep;
for (const match of trace.matchAll(/successfully resolved to '([^']+)'/g)) assert.ok(realpathSync(match[1]).startsWith(realWorkspace), `Type resolution escaped isolated workspace: ${match[1]}`);
const receipt = { package: metadata.name, version: metadata.version, artifactPins: pins, runtime: { node: process.version, platform: process.platform, arch: process.arch },
  exports: Object.keys(metadata.exports), checks: ["digest-verified offline archives", "guarded transitive runtime resolution", "outside-workspace negative control", "pure imports without DOM/optional peers", "public host-port lifecycle mock", "guarded public declaration resolution"],
  limitations: ["mock uploader only; no GPU/native qualification", "DOM library types used for optional browser declarations", "source/common CI/remote/publication admission and actual app adoption separate"] };
writeFileSync(path.join(output, "receipt.json"), JSON.stringify(receipt, null, 2) + "\n");
console.log(JSON.stringify({ output, receipt }));
