import type { RepresentationHooks, SourceSampler, ImageIdentity } from "@foss-earth/images";
import { createImageSourceCache, imageSourceKey } from "@foss-earth/images";
import { createImageFileService } from "@foss-earth/images/browser";
import type { ImageTextureUploader, UploadedImageTexture } from "@foss-earth/renderer/babylon";
import { cubeRepresentation, type CubeRepresentationRecord } from "@foss-earth/sphere-cubemap";
import { loadCube, type CubeLoadPorts } from "@foss-earth/sphere-cubemap/browser";
import { createCubeUploadAdapter } from "@foss-earth/sphere-cubemap/babylon";
import * as preparation from "@foss-earth/sphere-cubemap/preparation";
import * as shaders from "@foss-earth/sphere-cubemap/shaders";
const hooks: RepresentationHooks<CubeRepresentationRecord> = cubeRepresentation;
const source: SourceSampler = { sample(_direction, _footprint, out) { out[0] = 0.5; out[1] = 0.5; out[2] = 0.5; } };
const consume = (ports: CubeLoadPorts<UploadedImageTexture>, record: CubeRepresentationRecord, uploader: ImageTextureUploader, asset: ImageIdentity) => {
  const cache = createImageSourceCache<Awaited<ReturnType<typeof loadCube<UploadedImageTexture>>>>({ broker: ports.broker, keptGpuBytes: 0, gpuBytes: value => value.estimate.sourceGpu });
  const key = imageSourceKey(asset, record);
  return { key, cache, upload: createCubeUploadAdapter(uploader, ports.broker, ports.scope), loading: loadCube(record, ports) };
};
void [hooks, source, consume, createImageFileService, preparation, shaders];
