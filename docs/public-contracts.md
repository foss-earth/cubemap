# Public contracts

## Pure entries

The root exports `./core`, representation records, `validateCubeRepresentation`,
`cubeRepresentation`, `estimateCube` and preparation. Pure entries import only
public images contracts/math. They initialize no browser or renderer.

`CubeRepresentationRecord` preserves `projection: "cube"`, positive integer
`faceSize` in texels, the six URL fields in `faces`, MIME type, total
`encodedBytes`, role/id and opaque namespaced extensions. Validation resolves URLs
against the supplied final manifest URL and retains the original field addresses.
`cubeRepresentation.files(record)` enumerates `px,nx,py,ny,pz,nz` without changing
the common `ImageFile` shape. `filePath(record,file,enumerationIndex)` returns
`.faces.px` through `.faces.nz` using that ordinal, including when URLs repeat.
The schema fragment is exported at `./schema.json`.

`CUBE_FACE_NAMES` is authored order `px,nx,py,ny,pz,nz`.
`SOURCE_CUBE_FACES` holds image-local forward/right/top vectors: X east, Y north,
Z up at zero pose. `sourceCubeDirection(face,u,v)` and `sourceCubeLookup(direction)`
retain normalized top-left image coordinates. `GPU_LAYER_SOURCE_FACES` is
`px,nx,pz,nz,py,ny`. Each source face uploads unrotated; `gpuSampleVector` swaps Y
and Z for the GPU convention. `gpuCubeLookup` exposes the matching layer/UV table.
`previewFaceTexels` and `immersionFaceTexels` consume pixels, radians and
texels-per-pixel and return required face texels.

`estimateCube(record,{maxTextureSide})` returns byte costs for total encoded
files, all six held RGBA decoded faces, the complete source mip chain and upload
staging. `maxTextureSide` is the actual host device limit in texels. Policy
admission is performed by the host's shared images pools.

`./preparation` exports `renderCubeFace(plan,face,size)`. `size` is target texels;
the supplied common `ImageSamplingPlan` contains an angular footprint in radians,
supersampling grid count and linear RGB `SourceSampler`. The target owner never
imports an equirectangular source implementation. Source codecs/orientation and
the output conversion to sRGB remain common images operations.

`./shaders` exports `CUBE_VECTOR_WGSL` and `CUBE_VECTOR_GLSL`. These are retained
sampling fragments for the supplied viewer material, without device/material
allocation. The viewer applies image pose; the cube faces are not rotated again.

## Browser and optional renderer adapter

`CubeFaceSource` is `{faces,from:"sheet"|"faces",close()}`. Its pixel close is
idempotent. `acquireCubeFaces(record,ports)` acquires the six original files using
the common host service and performs no upload. Face mapping follows authored
order even when downloads finish in reverse order. A failed face cancels CPU work
and waits for nonabortable late arrivals so every body is released. Cleanup
continues after another body/pixel/resource cleanup throws.

`uploadCubeSource(record,source,ports)` reserves the source GPU estimate, uploads
once, adopts the returned disposable texture into the supplied source scope,
waits for host readiness and closes source pixels. Failures at admission, upload,
readiness, adoption or pixel close end the operation scope. `loadCube` composes
these operations. Its optional `acquireFaces` host port can bind the preview-sheet
owner; the fallback calls `acquireCubeFaces` and retains all six original files.

`CubeUploadPorts<T>` and `CubeLoadPorts<T>` extend public
`@foss-earth/images/browser` `WholeImagePorts<T>`. Required ports are one broker,
one dedicated operation scope, actual device texture limit, encoded acquisition,
decoded pixel acquisition, `uploadCube(faces,label)` and `whenReady(texture,signal)`.
The host supplies `label` and replacement `overlap` policy. Common
`createImageFileService` handles cache, bounded transport, headers and decode.
[The host-port fixture](../fixtures/composition/host-ports.ts) binds those exact
public services without creating another renderer or session.

The returned `LoadedWholeImage<T>` contains `texture`, byte `estimate`,
`settleReplacement()` and idempotent `dispose()`. Loading/renderer readiness does
not acknowledge the visibility swap. The host shows incoming content and removes
outgoing content in one task, disposes its outgoing source reference, then calls
`settleReplacement()`. A shared `createImageSourceCache` may hold this result by
`imageSourceKey({id,revision},representation)`; the package creates no private cache.

`./babylon` exports `createCubeUploadAdapter(uploader,broker,scope)` and consumes
the optional renderer's public `ImageTextureUploader`. It maps source faces to
GPU order and requests upload/staging grants from the same broker. Submitted
grants remain charged after CPU cancellation until the renderer observes device
completion or actual device loss. The host pumps its one uploader on its existing
frame authority and supplies its existing scene/device/render scheduler.

## Compatibility and outstanding admission

Version-1 records, face basis, layer order and file shapes remain compatible.
New ports separate formerly combined acquisition/upload code; consumers must
adopt them at composition. Source/tests/fixtures are prepared, not executed.
Native GPU execution, complete app adoption, accepted archive pins, clean lineage,
lockfile, pinned common CI caller/policy conformance and actual remote admission
settings remain primary/coordinator work. Docs-only metadata changes must still
run the common metadata conformance once its exact shared component pin is wired.
