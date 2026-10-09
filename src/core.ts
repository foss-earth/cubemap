import { add, scale, normalize, dot, type Vec3 } from "@foss-earth/images";

export type CubeFaceName = "px" | "nx" | "py" | "ny" | "pz" | "nz";
export const CUBE_FACE_NAMES: readonly CubeFaceName[] = ["px", "nx", "py", "ny", "pz", "nz"];

/** The format's face table (§2): forward, right and the direction of the image's top edge. */
export const SOURCE_CUBE_FACES: Readonly<Record<CubeFaceName, { f: Vec3; r: Vec3; t: Vec3 }>> = {
  px: { f: [1, 0, 0], r: [0, -1, 0], t: [0, 0, 1] },
  nx: { f: [-1, 0, 0], r: [0, 1, 0], t: [0, 0, 1] },
  py: { f: [0, 1, 0], r: [1, 0, 0], t: [0, 0, 1] },
  ny: { f: [0, -1, 0], r: [-1, 0, 0], t: [0, 0, 1] },
  pz: { f: [0, 0, 1], r: [1, 0, 0], t: [0, -1, 0] },
  nz: { f: [0, 0, -1], r: [1, 0, 0], t: [0, 1, 0] },
};

export function sourceCubeDirection(face: CubeFaceName, u: number, v: number): Vec3 {
  const { f, r, t } = SOURCE_CUBE_FACES[face];
  return normalize(add(f, add(scale(r, 2 * u - 1), scale(t, 1 - 2 * v))));
}

/** The source face and coordinates a direction lands on. */
export function sourceCubeLookup(direction: Vec3): { face: CubeFaceName; u: number; v: number } {
  let face: CubeFaceName = "px";
  let best = -Infinity;
  for (const name of CUBE_FACE_NAMES) {
    const along = dot(direction, SOURCE_CUBE_FACES[name].f);
    if (along > best) { best = along; face = name; }
  }
  const { r, t } = SOURCE_CUBE_FACES[face];
  return { face, u: (dot(direction, r) / best + 1) / 2, v: (1 - dot(direction, t) / best) / 2 };
}

/**
 * WebGPU samples cube textures as Vulkan does: layer order +X −X +Y −Y +Z −Z,
 * and per major axis the (sc, tc) components below, with t = 0 on a layer's
 * first row. gpuweb §texture-sampling defers to that table.
 */
const GPU_CUBE_LAYERS: ReadonlyArray<{ axis: 0 | 1 | 2; sign: 1 | -1; sc: (s: Vec3) => number; tc: (s: Vec3) => number }> = [
  { axis: 0, sign: 1, sc: s => -s[2], tc: s => -s[1] },
  { axis: 0, sign: -1, sc: s => s[2], tc: s => -s[1] },
  { axis: 1, sign: 1, sc: s => s[0], tc: s => s[2] },
  { axis: 1, sign: -1, sc: s => s[0], tc: s => -s[2] },
  { axis: 2, sign: 1, sc: s => s[0], tc: s => -s[1] },
  { axis: 2, sign: -1, sc: s => -s[0], tc: s => -s[1] },
];

export function gpuCubeLookup(sample: Vec3): { layer: number; u: number; v: number } {
  const magnitudes = sample.map(Math.abs);
  const axis = magnitudes[0] >= magnitudes[1] && magnitudes[0] >= magnitudes[2] ? 0 : magnitudes[1] >= magnitudes[2] ? 1 : 2;
  const sign = sample[axis] >= 0 ? 1 : -1;
  const layer = GPU_CUBE_LAYERS.findIndex(entry => entry.axis === axis && entry.sign === sign);
  const entry = GPU_CUBE_LAYERS[layer];
  const rc = magnitudes[axis];
  return { layer, u: (entry.sc(sample) / rc + 1) / 2, v: (entry.tc(sample) / rc + 1) / 2 };
}

/**
 * The format's faces are WebGPU's with Y and Z exchanged: sampling the GPU cube
 * with (x, z, y) of an image-local direction lands on the same texel of the
 * same source face. Each face therefore uploads unrotated into the layer below,
 * and the shaders swap the two components. panoramaMath.test.ts proves it.
 */
export const GPU_LAYER_SOURCE_FACES: readonly CubeFaceName[] = ["px", "nx", "pz", "nz", "py", "ny"];

export function gpuSampleVector(imageDirection: Vec3): Vec3 {
  return [imageDirection[0], imageDirection[2], imageDirection[1]];
}

/** Cube face texels for a disc of this diameter at the flat window's centre: diameter / tan βR, times the density asked for. */
export function previewFaceTexels(diameterPx: number, previewHalfAngleRad: number, texelsPerPixel: number): number {
  return diameterPx / Math.tan(previewHalfAngleRad) * texelsPerPixel;
}

/** Cube face texels to show a fullscreen view at `texelsPerPixel` at its centre. */
export function immersionFaceTexels(viewportHeightPx: number, verticalFovRad: number, texelsPerPixel: number): number {
  return viewportHeightPx / Math.tan(verticalFovRad / 2) * texelsPerPixel;
}

