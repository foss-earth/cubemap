# Validation preparation

No commands below have been executed for this source-only handoff. They require
an exclusive coordinator grant. All output must stay in this owner's `build/`;
do not discard previous runs or force/reset the incremental caches.

## Owner checks

After the primary agent installs exact local shared dependencies and records the
common CI caller/policy pins, run `npm run check:implementation` once with its
output retained under a dated `build/checks/` directory. It runs incremental TS,
cached lint, Vitest capped at 50% workers, ESM/declaration build and public consumer
typechecking. Fix failures and rerun the affected step/test only.

14 prepared unit cases in source/browser, acquisition and adapter tests.
These counts describe authored cases, not pass results. `forceRerunTriggers`
include fixtures, schema, metadata, scripts and TypeScript config so disk-read
fixtures cannot silently select no tests. The suite has no browser, native device,
server, benchmark or WASM qualification.

The primary agent owns the common `foss-earth/ci` attribution component and shared
conformance invocation, including docs-only changes. The local implementation
suite does not substitute for that gate, clean-lineage or remote-policy admission.

## Installed public consumer

After owner checks and the primary's metadata/lineage sealing, create one archive
with `npm pack --ignore-scripts --pack-destination=build/artifacts` and retain the
actual digest. Do not treat an earlier archive as the final sealed candidate.

`npm run test:installed-consumer --` invokes the prepared archive harness. Supply
all arguments as `--name=value`, with each local `.tgz` paired with its actual
64-character `--name-sha256` digest:

- `owner`: this owner at version 0.1.0.
- `images`, `renderer`, `ui`: their exact local 0.1.0 candidates.
- `babylon`: @babylonjs/core 8.56.2.
- `typescript`: TypeScript 5.9.3.
- `jpeg`: jpeg-js 0.4.4, the images/node codec dependency.
- Optional `out`: a new dated directory beneath this owner's `build/`.

The installed consumer exercises six authored faces, repeated-URL diagnostic
fields, GPU layer order and a generic supplied source sampler.

Example argument shape (replace both placeholders with the actual receipt):

```sh
npm run test:installed-consumer -- \
  --owner=build/artifacts/OWNER_ARCHIVE.tgz --owner-sha256=ACTUAL_SHA256 \
  --images=IMAGES_ARCHIVE.tgz --images-sha256=ACTUAL_SHA256 \
  --renderer=RENDERER_ARCHIVE.tgz --renderer-sha256=ACTUAL_SHA256 \
  --ui=UI_ARCHIVE.tgz --ui-sha256=ACTUAL_SHA256 \
  --babylon=BABYLON_ARCHIVE.tgz --babylon-sha256=ACTUAL_SHA256 \
  --typescript=TYPESCRIPT_ARCHIVE.tgz --typescript-sha256=ACTUAL_SHA256 \
  --jpeg=JPEG_ARCHIVE.tgz --jpeg-sha256=ACTUAL_SHA256
```

The harness verifies supplied hashes before installing only these local archives
offline, without lifecycle scripts. It refuses to overwrite a previous workspace.
Its cache, workspace, logs and receipt stay under this owner. This harness uses
Node's `registerHooks` API; the actual granted Node runtime must be recorded and
support that API. No Node version/device qualification has been claimed.

A transitive runtime guard rejects every file resolved outside the isolated
workspace, with an explicit outside-file negative control. Pure root/core/
preparation/shader imports are checked without DOM globals and reject optional
renderer/UI/Babylon/React imports. Public browser/optional adapter calls use one
mock host uploader and shared broker to exercise source release, explicit
`settleReplacement`, idempotent disposal and submitted-byte retention until mock
physical completion. This is not a real GPU run.

The copied public type and composition fixtures use only installed public exports.
The harness records TypeScript's resolution trace and rejects any resolved file
outside the consumer workspace, including symlinked checkout sources. DOM library
types are provided for browser declarations; ambient Node types are not borrowed
from the checkout. Each phase has a retained log and success writes an exact
archive/runtime/export receipt. A fixture success is not application adoption.

## Source receipt

`PROVENANCE.json` maps immutable original blobs to destination slices and hashes,
with authored host ports/tests/consumer harnesses distinguished from extraction.
`SOURCE_RECEIPT.json` lists every intended source/config/doc byte except itself,
`.git`, `build`, `dist` and `node_modules`; it hashes `PROVENANCE.json` as well.
The tree digest hashes the sorted records as `path + NUL + sha256 + LF` in UTF-8.
Later primary edits require a fresh receipt before packaging. Artifact, candidate
commit, accepted CI/policy pins and consumer adoption fields remain explicitly
unqualified until their real evidence exists.
