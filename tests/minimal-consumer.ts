import type { RepresentationHooks } from "@foss-earth/images";
import { cubeRepresentation } from "@foss-earth/cubemap";
import type { CubeFaceSource, CubeUploadPorts } from "@foss-earth/cubemap/browser";
import type { WholeImageTexture } from "@foss-earth/images/browser";
const hooks: RepresentationHooks = cubeRepresentation;
console.log(hooks.projection);
/** Absence remains an explicit legacy source, never a fabricated ownership hold. */
export function retainCubeInput(source: CubeFaceSource): (() => void) | null { return source.retain?.() ?? null; }
export type CubeHostUpload = CubeUploadPorts<WholeImageTexture>["uploadCube"];
