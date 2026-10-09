import { describe, expect, it } from "vitest";
import { CUBE_FACE_NAMES, sourceCubeLookup, sourceCubeDirection, gpuCubeLookup, gpuSampleVector, GPU_LAYER_SOURCE_FACES } from "./core.js";
import { validateCubeRepresentation, cubeRepresentation } from "./representation.js";
import { renderCubeFace } from "./preparation.js";

describe("source cube conventions", () => {
  it("all six source faces round trip and upload unrotated into the correct GPU layer", () => {
    for (const face of CUBE_FACE_NAMES) for (let j = 0; j < 16; j++) for (let i = 0; i < 16; i++) {
      const u = (i + 0.5) / 16, v = (j + 0.5) / 16;
      const direction = sourceCubeDirection(face, u, v);
      const source = sourceCubeLookup(direction);
      expect(source.face).toBe(face);
      expect(source.u).toBeCloseTo(u, 12);
      expect(source.v).toBeCloseTo(v, 12);
      const gpu = gpuCubeLookup(gpuSampleVector(direction));
      expect(GPU_LAYER_SOURCE_FACES[gpu.layer]).toBe(face);
      expect(gpu.u).toBeCloseTo(u, 12);
      expect(gpu.v).toBeCloseTo(v, 12);
    }
  });
  it("requires every square face and retains opaque namespaced extension data", () => {
    const faces = Object.fromEntries(CUBE_FACE_NAMES.map(face => [face, `${face}.jpg`]));
    const input = { id: "preview", role: "preview", projection: "cube", mimeType: "image/jpeg", encodedBytes: 60, faceSize: 4, faces, extensions: { "foss-earth.preview-sheets": { id: "sheet", x: 0, y: 0 } } };
    const result = validateCubeRepresentation(input, { path: "$", baseUrl: "https://example.invalid/images/scene.json" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect([...cubeRepresentation.files(result.representation)]).toHaveLength(6);
      expect(result.representation.extensions).toEqual(input.extensions);
      expect(cubeRepresentation.estimate(result.representation, { maxTextureSide: 4096 }).decoded).toBe(384);
    }
    const { nz: _missing, ...partial } = faces;
    expect(validateCubeRepresentation({ ...input, faces: partial }, { path: "$", baseUrl: null }).ok).toBe(false);
  });
  it("prepares a target cube from a supplied sampler without an equirectangular dependency", () => {
    const seen: number[] = [];
    const image = renderCubeFace({ samplesPerAxis: 2, footprintRadians: 0.25, source: { sample(direction, footprint, out) { seen.push(footprint); out[0] = Math.sign(direction[0]); out[1] = 0.25; out[2] = 0.5; } } }, "px", 2);
    expect(image.width).toBe(2);
    expect([...image.data]).toEqual([1, 0.25, 0.5, 1, 0.25, 0.5, 1, 0.25, 0.5, 1, 0.25, 0.5]);
    expect(seen).toHaveLength(16);
    expect(seen.every(value => value === 0.25)).toBe(true);
  });
  it("keeps six authored diagnostic fields when every face uses the same URL", () => {
    const input = { id: "same", role: "preview", projection: "cube", mimeType: "image/png", encodedBytes: 6, faceSize: 4,
      faces: Object.fromEntries(CUBE_FACE_NAMES.map(face => [face, "same.png"])) };
    const checked = validateCubeRepresentation(input, { path: "$.representation", baseUrl: "https://example.invalid/scene.json" });
    expect(checked.ok).toBe(true);
    if (!checked.ok) return;
    const files = [...cubeRepresentation.files(checked.representation)];
    expect(files.map((file, index) => cubeRepresentation.filePath!(checked.representation, file, index))).toEqual(CUBE_FACE_NAMES.map(face => `.faces.${face}`));
    expect(files.every(file => Object.keys(file).sort().join(",") === "height,mimeType,url,width")).toBe(true);
  });
});
