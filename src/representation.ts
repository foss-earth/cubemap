import { ImageRecordChecker, checkImageRepresentationBase, resolveImageUrl, rgba8Bytes, type ImageRepresentation, type RepresentationHooks, type RepresentationValidation, type ImageEstimate } from "@foss-earth/images";
import { CUBE_FACE_NAMES, type CubeFaceName } from "./core.js";
export interface CubeRepresentationRecord extends ImageRepresentation {
  projection: "cube";
  faceSize: number;
  faces: Readonly<Record<CubeFaceName, string>>;
}
export function validateCubeRepresentation(value: unknown, context: { path: string; baseUrl: string | null }): RepresentationValidation<CubeRepresentationRecord> {
  const checker = new ImageRecordChecker();
  const { path } = context;
  const record = checker.record(value, path);
  if (!record) return { ok: false, errors: checker.errors };
  checker.keys(record, path, ["id", "role", "projection", "mimeType", "encodedBytes", "extensions", "faceSize", "faces"]);
  checker.oneOf(record.projection, `${path}.projection`, ["cube"]);
  const common = checkImageRepresentationBase(checker, record, path);
  const faceSize = checker.positiveInteger(record.faceSize, `${path}.faceSize`);
  const faces = checker.record(record.faces, `${path}.faces`);
  const resolved: Partial<Record<CubeFaceName, string>> = {};
  let base: URL | null = null;
  try { base = context.baseUrl === null ? null : new URL(context.baseUrl); }
  catch { checker.fail(path, "base URL must be absolute"); }
  if (faces) {
    checker.keys(faces, `${path}.faces`, CUBE_FACE_NAMES);
    for (const face of CUBE_FACE_NAMES) {
      if (faces[face] === undefined) { checker.fail(`${path}.faces.${face}`, "is missing: a cube needs all six faces"); continue; }
      const url = resolveImageUrl(checker, faces[face], `${path}.faces.${face}`, base);
      if (url) resolved[face] = url;
    }
  }
  if (!common || !faceSize || Object.keys(resolved).length !== 6 || checker.errors.length) return { ok: false, errors: checker.errors };
  return { ok: true, representation: { ...common, projection: "cube", faceSize, faces: resolved as Record<CubeFaceName, string> }, warnings: checker.warnings };
}
/** Includes six simultaneously held decoded faces; original loader reserves all six. */
export function estimateCube(record: CubeRepresentationRecord, context: { maxTextureSide: number }): ImageEstimate {
  if (record.faceSize > context.maxTextureSide) throw new RangeError("Cube face exceeds the supplied device texture limit.");
  const decoded = 6 * 4 * record.faceSize ** 2;
  return { encoded: record.encodedBytes, decoded, sourceGpu: rgba8Bytes(record.faceSize, record.faceSize, undefined, 6), uploadOutstanding: decoded };
}
export const cubeRepresentation: RepresentationHooks<CubeRepresentationRecord> = {
  projection: "cube", validate: validateCubeRepresentation,
  files: record => CUBE_FACE_NAMES.map(face => ({ url: record.faces[face], mimeType: record.mimeType, width: record.faceSize, height: record.faceSize })),
  filePath: (_record, _file, enumerationIndex) => {
    const face = CUBE_FACE_NAMES[enumerationIndex];
    if (!Number.isSafeInteger(enumerationIndex) || !face) throw new RangeError("Cube file ordinal must name one of the six authored faces.");
    return `.faces.${face}`;
  },
  estimate: estimateCube,
};
