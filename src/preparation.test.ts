import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { ImageSamplingPlan, LinearImage, SourceSampler } from "@foss-earth/images";
import { CUBE_FACE_NAMES } from "./core.js";
import { renderCubeFace } from "./preparation.js";

const CUBE_PREPARATION_LEVEL = Symbol.for("foss-earth.equirectangular.cubePreparationLevel");

/** The generator the shipped faces were hashed from, at cubemap 6784a2c. */
function testLevel(width: number, height: number, seed: number): LinearImage {
  const data = new Float32Array(width * height * 3);
  let s = seed;
  for (let k = 0; k < data.length; k++) {
    s ^= s << 13; s ^= s >>> 17; s ^= s << 5;
    data[k] = k % 101 === 0 ? -0 : k % 211 === 0 ? 1e-40 : k % 307 === 0 ? 3e38 : (s >>> 0) / 2 ** 32;
  }
  return { width, height, data };
}

function testPyramid(): LinearImage[] {
  return [testLevel(128, 64, 1), testLevel(64, 32, 2), testLevel(33, 17, 3)];
}

/** The level and grid `cubePreparationPlan` chooses. The sampler throws: the face must come from the level, not from a call. */
function markedPlan(pyramid: readonly LinearImage[], faceSize: number): ImageSamplingPlan & { samplesPerAxis: number } {
  const ratio = pyramid[0].width / 4 / faceSize;
  const index = Math.max(0, Math.min(pyramid.length - 1, Math.floor(Math.log2(Math.max(1, ratio)))));
  const source = pyramid[index];
  const sampler: SourceSampler = { sample() { throw new Error("marked level was sampled one direction at a time"); } };
  Object.defineProperty(sampler, CUBE_PREPARATION_LEVEL, { value: source });
  return { samplesPerAxis: source.width / 4 / faceSize > 1.5 ? 3 : 2, footprintRadians: Math.PI / (2 * faceSize), source: sampler };
}

function digest(images: readonly LinearImage[]): string {
  const hash = createHash("sha256");
  for (const { width, height, data } of images) hash.update(`${width}x${height}:`).update(new Uint8Array(data.buffer, data.byteOffset, data.byteLength));
  return hash.digest("hex");
}

// What renderCubeFace wrote when every sample went through the plan's sampler.
const FACES: Record<string, { samplesPerAxis: number; sha256: string }> = {
  1: { samplesPerAxis: 3, sha256: "5c7afd4b753efdc2fc547e8de017d16e2f32b606c5e16a777e62ef29ee179bf3" },
  2: { samplesPerAxis: 3, sha256: "9bfccaa5042a6dbaeafafc1855d4a39962cf1491301063c71b2b3f256361374d" },
  5: { samplesPerAxis: 3, sha256: "b2aebf15ba868c2f7024ab8344708ac36bb63626b52729404531c982d59846d2" },
  8: { samplesPerAxis: 2, sha256: "8059d1f3f93eca48fbcf7d0971473aa4f36c3ff56dd31d58eb8b7ad382ae308d" },
  16: { samplesPerAxis: 2, sha256: "c897f7d1aeca4b43213321978c5d0323078c8a845f6f227639277c39409a242a" },
  21: { samplesPerAxis: 3, sha256: "6bd694de7e6282b725f3015fcc5bdd0e0e21918e0d05e393f8e774fdc3846c78" },
};

describe("equirectangular face, one loop", () => {
  const pyramid = testPyramid();

  it("gives the bits the per-sample loop gave, without calling the sampler", () => {
    for (const [size, expected] of Object.entries(FACES)) {
      const faceSize = Number(size);
      const plan = markedPlan(pyramid, faceSize);
      expect(plan.samplesPerAxis, size).toBe(expected.samplesPerAxis);
      const images = CUBE_FACE_NAMES.map(face => renderCubeFace(plan, face, faceSize));
      expect(digest(images), size).toBe(expected.sha256);
    }
  });

  it("reads any other sampler one direction at a time, including a mark that is not a level", () => {
    const seen: number[] = [];
    const plain = renderCubeFace({ samplesPerAxis: 1, footprintRadians: 0.5, source: { sample(_d, footprint, out) { seen.push(footprint); out[0] = 0.25; out[1] = 0.5; out[2] = 1; } } }, "nx", 2);
    expect(seen).toEqual([0.5, 0.5, 0.5, 0.5]);
    expect([...plain.data.slice(0, 3)]).toEqual([0.25, 0.5, 1]);
    const bad: SourceSampler = { sample(_d, _f, out) { out[0] = 1; out[1] = 2; out[2] = 3; } };
    Object.defineProperty(bad, CUBE_PREPARATION_LEVEL, { value: { width: 2, height: 2, data: [0] } });
    const image = renderCubeFace({ samplesPerAxis: 1, footprintRadians: 0, source: bad }, "px", 1);
    expect([...image.data]).toEqual([1, 2, 3]);
  });
});
