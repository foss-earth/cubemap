import type { EncodedImageFile, HeldDecodedImage, WholeImagePorts, WholeImageTexture, LoadedWholeImage } from "@foss-earth/images/browser";
import { CUBE_FACE_NAMES, type CubeFaceName } from "../core.js";
import { cubeRepresentation, estimateCube, type CubeRepresentationRecord } from "../representation.js";

/** A shared preview-sheet source and a six-file source use the same uploader. */
export interface CubeFaceSource {
  readonly faces: Readonly<Record<CubeFaceName, ImageBitmap>>;
  readonly from: "sheet" | "faces";
  /** Optional only for legacy foreign sources. A supplied implementation keeps
   * every face and its existing decoded charge live through nonabortable native
   * input use, even after close/scope cancellation. Acquire before upload;
   * release after settlement and late-output disposal. Cannot retain after close. */
  retain?(): () => void;
  /** Releases source pixels once upload/readiness has finished; idempotent. */
  close(): void;
}
export interface CubeUploadPorts<T extends WholeImageTexture> extends WholeImagePorts<T> {
  /** Promise settlement proves that the supplied uploader stopped reading faces. */
  uploadCube(faces: Readonly<Record<CubeFaceName, ImageBitmap>>, label: string): Promise<T>;
  label: string;
}
export interface CubeLoadPorts<T extends WholeImageTexture> extends CubeUploadPorts<T> {
  /** Optional shared sheet source. Its fallback calls acquireCubeFaces below. */
  acquireFaces?(record: CubeRepresentationRecord, ports: WholeImagePorts<T>): Promise<CubeFaceSource>;
}

/** Six-file fallback, with common broker/cache/decode ports and no GPU allocation. */
export async function acquireCubeFaces<T extends WholeImageTexture>(record: CubeRepresentationRecord, ports: WholeImagePorts<T>): Promise<CubeFaceSource> {
  const { scope } = ports;
  const files = Array.from(cubeRepresentation.files(record));
  const encoded: EncodedImageFile[] = [];
  const decoded: HeldDecodedImage[] = [];
  const failures: unknown[] = [];
  let source: CubeFaceSource | undefined;
  let closed = false;
  const close = (): void => {
    if (closed) return;
    closed = true;
    const errors: unknown[] = [];
    for (const body of decoded.splice(0)) { try { body.close(); } catch (error) { errors.push(error); } }
    if (errors.length) throw new AggregateError(errors, "Cube source cleanup failed.");
  };
  try {
    scope.signal.throwIfAborted();
    const downloads = files.map(file => Promise.resolve().then(() => {
      scope.signal.throwIfAborted();
      return ports.obtain(file, Math.ceil(record.encodedBytes / files.length));
    }).then(result => { encoded.push(result); return result; }));
    const bodies = await Promise.all(downloads).catch(async error => {
      // Cancel promptly, then collect every nonabortable late arrival before
      // releasing the encoded bodies. Cleanup failure cannot skip this wait.
      try { scope.dispose(); } catch (cleanup) { failures.push(cleanup); }
      await Promise.allSettled(downloads);
      throw error;
    });
    scope.signal.throwIfAborted();
    for (let index = 0; index < files.length; index++) {
      decoded.push(await ports.decode(bodies[index], files[index]));
      scope.signal.throwIfAborted();
    }
    const faces = Object.fromEntries(CUBE_FACE_NAMES.map((face, index) => [face, decoded[index].image])) as Record<CubeFaceName, ImageBitmap>;
    const pixels = decoded.slice();
    // Do not invent a hold around foreign decoders: it cannot prevent their
    // scope-owned close. Common decoded sources provide the real pixel hold.
    const retained = pixels.every(body => typeof body.retain === "function") ? {
      retain(): () => void {
        if (closed) throw new Error("Cannot retain closing cube faces.");
        const releases: (() => void)[] = [];
        const finish = (): void => {
          const errors: unknown[] = [];
          for (const release of releases.splice(0)) { try { release(); } catch (error) { errors.push(error); } }
          if (errors.length) throw new AggregateError(errors, "Cube input hold cleanup failed.");
        };
        try { for (const body of pixels) releases.push(body.retain!()); }
        catch (error) {
          try { finish(); } catch (cleanup) { throw new AggregateError([error, cleanup], "Cube input retention and cleanup failed."); }
          throw error;
        }
        return finish;
      },
    } : {};
    source = { faces, from: "faces", ...retained, close };
  } catch (error) { failures.unshift(error); }
  for (const body of encoded.splice(0)) {
    try { body.release(); } catch (cleanup) { failures.push(cleanup); }
  }
  if (!failures.length) {
    try { scope.signal.throwIfAborted(); if (!scope.isCurrent()) throw new Error("Stale cube acquisition."); }
    catch (error) { failures.push(error); }
  }
  if (failures.length) {
    try { close(); } catch (cleanup) { failures.push(cleanup); }
    try { scope.dispose(); } catch (cleanup) { failures.push(cleanup); }
    throw failures.length === 1 ? failures[0] : new AggregateError(failures, "Cube acquisition and cleanup failed.");
  }
  return source!;
}

/** Uploads either source using the host renderer, shared budget and readiness. */
export async function uploadCubeSource<T extends WholeImageTexture>(record: CubeRepresentationRecord, source: CubeFaceSource, ports: CubeUploadPorts<T>): Promise<LoadedWholeImage<T>> {
  const { scope } = ports;
  let loaded: LoadedWholeImage<T> | undefined;
  const failures: unknown[] = [];
  const outputFailures: unknown[] = [];
  const inputFailures: unknown[] = [];
  let releaseInput: (() => void) | undefined;
  let unownedTexture: T | undefined;
  function requireCurrent(): void {
    scope.signal.throwIfAborted();
    if (!scope.isCurrent()) throw new Error("Stale cube upload.");
  }
  function endOutput(): void {
    const texture = unownedTexture; unownedTexture = undefined;
    try { texture?.dispose(); } catch (cleanup) { outputFailures.push(cleanup); }
    try { scope.dispose(); } catch (cleanup) { outputFailures.push(cleanup); }
  }
  try {
    requireCurrent();
    const estimate = estimateCube(record, ports);
    const gpu = scope.reserve("sourceGpu", estimate.sourceGpu, ports.label, { overlap: ports.overlap });
    releaseInput = source.retain?.();
    requireCurrent();
    unownedTexture = await ports.uploadCube(source.faces, ports.label);
    requireCurrent();
    const texture = unownedTexture; unownedTexture = undefined;
    if (!scope.adopt(texture)) { scope.signal.throwIfAborted(); throw new Error("Stale cube upload."); }
    await ports.whenReady(texture, scope.signal);
    requireCurrent();
    loaded = { texture, estimate, settleReplacement: () => gpu.settle(), dispose: () => scope.dispose() };
  } catch (error) { failures.push(error); }
  if (failures.length) endOutput();
  try { source.close(); } catch (cleanup) { inputFailures.push(cleanup); }
  try { releaseInput?.(); } catch (cleanup) { inputFailures.push(cleanup); }
  if (!failures.length && !inputFailures.length) {
    try { requireCurrent(); } catch (error) { failures.push(error); }
  }
  if (failures.length || inputFailures.length) endOutput();
  const errors = [...failures, ...outputFailures, ...inputFailures];
  if (errors.length) throw errors.length === 1 ? errors[0] : new AggregateError(errors, "Cube upload and cleanup failed.");
  return loaded!;
}

export async function loadCube<T extends WholeImageTexture>(record: CubeRepresentationRecord, ports: CubeLoadPorts<T>): Promise<LoadedWholeImage<T>> {
  try {
    // Validate format/device limits before doing work; budget reservation belongs
    // to uploadCubeSource so sheet and file sources cannot allocate twice.
    estimateCube(record, ports);
    const source = await (ports.acquireFaces ? ports.acquireFaces(record, ports) : acquireCubeFaces(record, ports));
    return await uploadCubeSource(record, source, ports);
  } catch (error) {
    try { ports.scope.dispose(); }
    catch (cleanup) { throw new AggregateError([error, cleanup], "Cube loading and cleanup failed."); }
    throw error;
  }
}
