import type { LinearImage, ImageSamplingPlan } from "@foss-earth/images";
import { SOURCE_CUBE_FACES, type CubeFaceName } from "./core.js";

/**
 * One cube face of `size` texels from a supplied source sampler, in linear
 * light: each texel averages a supersampled grid read from the source plan supplied at the face texel's footprint at the face centre.
 */
export function renderCubeFace(plan: ImageSamplingPlan, face: CubeFaceName, size: number): LinearImage {
  const { f, r, t } = SOURCE_CUBE_FACES[face];
  const samples = plan.samplesPerAxis;
  if (!Number.isSafeInteger(size) || size < 1 || !Number.isSafeInteger(samples) || samples < 1 || !Number.isFinite(plan.footprintRadians) || plan.footprintRadians < 0) throw new RangeError("Preparation requires a positive size/grid and nonnegative finite angular footprint.");
  const data = new Float32Array(size * size * 3);
  const colour = [0, 0, 0];
  for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
    let red = 0, green = 0, blue = 0;
    for (let sj = 0; sj < samples; sj++) for (let si = 0; si < samples; si++) {
      const a = 2 * ((i + (si + 0.5) / samples) / size) - 1;
      const b = 1 - 2 * ((j + (sj + 0.5) / samples) / size);
      plan.source.sample([f[0] + a * r[0] + b * t[0], f[1] + a * r[1] + b * t[1], f[2] + a * r[2] + b * t[2]], plan.footprintRadians, colour);
      red += colour[0]; green += colour[1]; blue += colour[2];
    }
    const n = samples * samples, d = (j * size + i) * 3;
    data[d] = red / n; data[d + 1] = green / n; data[d + 2] = blue / n;
  }
  return { width: size, height: size, data };
}

