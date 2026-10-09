/** Application composition fixture: shared services, one source scope/uploader. */
import type { ImageSessionBroker, ImageOperationScope } from "@foss-earth/images";
import type { ImageFileService } from "@foss-earth/images/browser";
import type { ImageTextureUploader, UploadedImageTexture } from "@foss-earth/renderer/babylon";
import { createCubeUploadAdapter } from "@foss-earth/cubemap/babylon";
import type { CubeLoadPorts } from "@foss-earth/cubemap/browser";
export function cubeHostPorts(host: {
  broker: ImageSessionBroker; scope: ImageOperationScope; files: ImageFileService;
  uploader: ImageTextureUploader; maxTextureSide: number; label: string; overlap: boolean; priority: number;
  whenReady(texture: UploadedImageTexture, signal: AbortSignal): Promise<void>;
}): CubeLoadPorts<UploadedImageTexture> {
  return {
    broker: host.broker, scope: host.scope, maxTextureSide: host.maxTextureSide, label: host.label, overlap: host.overlap,
    obtain: (file, bytes) => host.files.obtain(file, bytes, host.scope, undefined, host.priority),
    decode: (file, declared) => host.files.decode(file, declared, host.scope, host.priority),
    uploadCube: createCubeUploadAdapter(host.uploader, host.broker, host.scope), whenReady: host.whenReady,
  };
}
