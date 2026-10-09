import type { ImageSessionBroker, ImageOperationScope } from "@foss-earth/images";
import type { ImageTextureUploader, UploadedImageTexture } from "@foss-earth/renderer/babylon";
import { GPU_LAYER_SOURCE_FACES, type CubeFaceName } from "../core.js";

/** Adapts face conventions to the ONE generic host uploader; no device creation. */
export function createCubeUploadAdapter(uploader: ImageTextureUploader, broker: ImageSessionBroker, scope: ImageOperationScope): (faces: Readonly<Record<CubeFaceName, ImageBitmap>>, label: string) => Promise<UploadedImageTexture> {
  return (faces, label) => uploader.upload({
    kind: "cube", images: GPU_LAYER_SOURCE_FACES.map(face => faces[face]), label, signal: scope.signal,
    reserveUpload(bytes, ticketLabel) {
      // Completion tickets outlive cancellation of CPU work: the uploader
      // releases them when the device has consumed the submitted rows.
      const result = broker.pools.reserve("uploadOutstanding", bytes, ticketLabel);
      if (!result.ok) throw new Error(result.reason);
      return result.reservation;
    },
    reserveDecodedStaging(bytes, ticketLabel) {
      const result = broker.pools.reserve("decoded", bytes, ticketLabel);
      if (!result.ok) throw new Error(result.reason);
      return result.reservation;
    },
  });
}
