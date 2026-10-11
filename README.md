# @foss-earth/cubemap

Cube-map image representations for FOSS Earth: six-face records, face geometry, GPU layer conventions, target-face preparation and shader sampling fragments.

The package creates no device, scene, scheduler, cache, viewer or geographic engine. Its browser loader works through services the host supplies: the shared image broker, an operation scope, an acquisition/decode service, an uploader and renderer readiness. A preview sheet may supply a face source, with the six original files as fallback.

## Entries

| Export | Contents |
| --- | --- |
| `@foss-earth/cubemap` and `/core` | Representation records, validation, face geometry, lookups, size estimates. Pure; no browser or renderer code. |
| `/preparation` | Target-face preparation. |
| `/browser` | Browser loader over host-supplied broker, scope, decoder, uploader and readiness. |
| `/babylon` | Optional adapter for [`@foss-earth/renderer`](https://github.com/foss-earth/renderer). It does not own a backend. |
| `/shaders` | Shader sampling fragments. |
| `/schema.json` | JSON schema for the representation record. |

[Public contracts](docs/public-contracts.md) describe units, face order and lifecycle.

## Using it

- A `CubeRepresentationRecord` has `projection: "cube"`, a positive integer `faceSize` in texels, six face URLs, a MIME type, the total `encodedBytes`, a role/id and namespaced extensions. `validateCubeRepresentation` resolves face URLs against the final manifest URL.
- Faces are in the order `px,nx,py,ny,pz,nz` (`CUBE_FACE_NAMES`). At zero pose X is east, Y is north and Z is up.
- `estimateCube(record, { maxTextureSide })` returns byte costs for the encoded files, the six decoded RGBA faces, the full mip chain and upload staging. `maxTextureSide` is the device limit in texels. The host's shared image pools decide admission.
- Loader callers must provide a dedicated operation scope and must call `settleReplacement()` once a visibility swap has completed.
- Decoded inputs and sheet-crop face sources keep their pixels alive across awaited host uploads and stale texture cleanup. See [native input lifetime](docs/native-input-lifetime.md).

## Development

`@foss-earth/cubemap` depends on `@foss-earth/images` and, optionally, `@foss-earth/renderer`, and names them by versions that are not published. Its own `npm install`, tests and build therefore do not work on their own yet. Develop it through the app, which uses libraries straight from their checkouts: see [local source](https://github.com/foss-earth/app#local-source).

## Project policies

- [Code of conduct](https://github.com/foss-earth/.github/blob/main/CODE_OF_CONDUCT.md)
- [Contributing](https://github.com/foss-earth/.github/blob/main/CONTRIBUTING.md)
- [AGPL-3.0 license](LICENSE)
- [Security](https://github.com/foss-earth/.github/blob/main/SECURITY.md)
