import { describe, expect, it } from "vitest";
import { createImageSessionBroker } from "@foss-earth/images";
import { createImageFileService, type WholeImageTexture } from "@foss-earth/images/browser";
import { encodePng } from "@foss-earth/images/node";
import { CUBE_FACE_NAMES } from "../src/core.js";
import { acquireCubeFaces, loadCube, type CubeLoadPorts } from "../src/browser/index.js";
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (error: unknown) => void;
  return { promise: new Promise<T>((a, b) => { resolve = a; reject = b; }), resolve, reject };
}
const messages = (error: unknown): string[] => error instanceof AggregateError
  ? error.errors.flatMap(messages) : error instanceof Error ? [error.message] : [String(error)];

describe("actual common decoded input remains held through host upload", () => {
  async function pendingUpload(end: "scope" | "invalidate" | "dispose" | "callback", completion: "resolve" | "reject", throwingCleanup = false) {
    const width = 4, height = 4, count = 6;
    const bytes = encodePng({ width, height, rgb: new Uint8Array(width * height * 3).fill(20) });
    const broker = createImageSessionBroker({ requests: 6, decodes: 1, pools: { encoded: 100_000, decoded: 100_000, sourceGpu: 100_000, uploadOutstanding: 100_000, overlap: 100_000 } });
    const scope = broker.scope();
    const events: { resource: string; decoded: number; closed: number }[] = [];
    let closed = 0, disposed = 0, readiness = 0;
    const images: ImageBitmap[] = [];
    const common = createImageFileService({ broker, priority: () => 1, limits: () => ({ responseBytes: 100_000, timeoutMs: 1000 }),
      fetch: async () => new Response(bytes as BodyInit, { headers: { "content-type": "image/png" } }),
      decode: async () => {
        const image = { width, height, close() { closed += 1; events.push({ resource: "input", decoded: broker.pools.stats().decoded.reserved, closed }); if (throwingCleanup) throw new Error("input cleanup"); } } as ImageBitmap;
        images.push(image); return image;
      } });
    const native = deferred<WholeImageTexture>(); let began!: () => void;
    const started = new Promise<void>(resolve => { began = resolve; });
    const ports: CubeLoadPorts<WholeImageTexture> = { broker, scope, label: "pending native upload", maxTextureSide: 4096, overlap: true,
      obtain: (file, size) => common.obtain(file, size, scope), decode: (body, file) => common.decode(body, file, scope),
      uploadCube: input => { expect(CUBE_FACE_NAMES.map(face => input[face])).toEqual(images); if (end === "callback") { scope.dispose(); expect(closed).toBe(0); expect(broker.pools.stats().decoded.reserved).toBe(count * width * height * 4); } began(); return native.promise; },
      whenReady: async (_texture, signal) => { readiness += 1; signal.throwIfAborted(); } };
    const record = { id: "pending", role: "preview" as const, projection: "cube" as const, mimeType: "image/png" as const, encodedBytes: 6 * bytes.length, faceSize: width, faces: Object.fromEntries(CUBE_FACE_NAMES.map(face => [face, `https://example.invalid/${face}.png`])) as Record<typeof CUBE_FACE_NAMES[number], string> };
    const work = loadCube(record, ports);
    const failure = work.catch((error: unknown) => error);
    await started;
    const decodedBytes = count * width * height * 4;
    if (end === "scope") scope.dispose(); else if (end === "invalidate") broker.invalidate(); else if (end === "dispose") broker.dispose();
    expect(closed).toBe(0); expect(broker.pools.stats().decoded.reserved).toBe(decodedBytes);
    expect(broker.pools.stats().encoded.reserved).toBe(0);
    if (completion === "reject") native.reject(new Error("native upload failed"));
    else native.resolve({ dispose() {
      disposed += 1; events.push({ resource: "output", decoded: broker.pools.stats().decoded.reserved, closed });
      if (throwingCleanup) throw new Error("output cleanup");
    } });
    const error = await failure;
    expect(error).toBeInstanceOf(Error); expect(readiness).toBe(0);
    expect(disposed).toBe(completion === "resolve" ? 1 : 0);
    expect(closed).toBe(count); expect(broker.pools.live()).toEqual([]);
    if (completion === "resolve") expect(events[0]).toEqual({ resource: "output", decoded: decodedBytes, closed: 0 });
    if (throwingCleanup) {
      const failures = messages(error);
      expect(failures[0]).toBe(completion === "resolve" ? "The image operation ended." : "native upload failed");
      if (completion === "resolve") expect(failures[1]).toBe("output cleanup");
      expect(failures.slice(completion === "resolve" ? 2 : 1)).toEqual(Array(count).fill("input cleanup"));
    }
    scope.dispose(); broker.dispose(); expect(closed).toBe(count); expect(disposed).toBe(completion === "resolve" ? 1 : 0);
  }
  for (const end of ["scope", "invalidate", "dispose", "callback"] as const) for (const completion of ["resolve", "reject"] as const) {
    it(`${end}: holds bitmap and decoded charge until upload ${completion} and disposes late output first`, () => pendingUpload(end, completion));
  }
  for (const completion of ["resolve", "reject"] as const) {
    it(`attempts every cleanup and retains ordered errors after upload ${completion}`, () => pendingUpload("dispose", completion, true));
  }
});

describe("owned cube input holds preserve all six common decoded allocations", () => {
  async function acquired(failedRetain = false) {
    const bytes = encodePng({ width: 4, height: 4, rgb: new Uint8Array(4 * 4 * 3) });
    const broker = createImageSessionBroker({ requests: 6, decodes: 1, pools: { encoded: 100_000, decoded: 100_000, sourceGpu: 100_000, uploadOutstanding: 100_000, overlap: 100_000 } });
    const scope = broker.scope(); let closed = 0, index = 0;
    const common = createImageFileService({ broker, priority: () => 1, limits: () => ({ responseBytes: 100_000, timeoutMs: 1000 }),
      fetch: async () => new Response(bytes as BodyInit, { headers: { "content-type": "image/png" } }),
      decode: async () => ({ width: 4, height: 4, close() { closed += 1; } }) as ImageBitmap });
    const record = { id: "held", role: "preview" as const, projection: "cube" as const, mimeType: "image/png" as const, encodedBytes: 6 * bytes.length, faceSize: 4, faces: Object.fromEntries(CUBE_FACE_NAMES.map(face => [face, `https://example.invalid/${face}.png`])) as Record<typeof CUBE_FACE_NAMES[number], string> };
    const source = await acquireCubeFaces(record, { broker, scope, maxTextureSide: 4096,
      obtain: (file, size) => common.obtain(file, size, scope),
      decode: async (body, file) => {
        const decoded = await common.decode(body, file, scope);
        return failedRetain && index++ === 1 ? { ...decoded, retain() { throw new Error("second retain refused"); } } : decoded;
      }, whenReady: async () => {} });
    return { broker, scope, source, closed: () => closed };
  }
  it("keeps all faces across scope closure until the final independent hold ends", async () => {
    const h = await acquired(), first = h.source.retain!(), second = h.source.retain!();
    h.scope.dispose(); h.source.close();
    expect(() => h.source.retain!()).toThrow("closing");
    first(); first(); expect(h.closed()).toBe(0); expect(h.broker.pools.stats().decoded.reserved).toBe(6 * 4 * 4 * 4);
    second(); second(); expect(h.closed()).toBe(6); expect(h.broker.pools.live()).toEqual([]);
    h.source.close(); h.broker.dispose(); expect(h.closed()).toBe(6);
  });
  it("releases earlier real holds when a later face refuses retention", async () => {
    const h = await acquired(true);
    expect(() => h.source.retain!()).toThrow("second retain refused");
    h.source.close(); expect(h.closed()).toBe(6); expect(h.broker.pools.live()).toEqual([]);
    h.scope.dispose(); h.broker.dispose(); expect(h.closed()).toBe(6);
  });
  it("does not advertise a pixel hold for legacy foreign decoded faces", async () => {
    const broker = createImageSessionBroker({ requests: 6, decodes: 1, pools: { encoded: 1000, decoded: 1000, sourceGpu: 1000, uploadOutstanding: 1000, overlap: 1000 } });
    const scope = broker.scope(); let closed = 0;
    const record = { id: "legacy", role: "preview" as const, projection: "cube" as const, mimeType: "image/png" as const, encodedBytes: 6, faceSize: 4, faces: Object.fromEntries(CUBE_FACE_NAMES.map(face => [face, `https://example.invalid/${face}.png`])) as Record<typeof CUBE_FACE_NAMES[number], string> };
    const source = await acquireCubeFaces(record, { broker, scope, maxTextureSide: 4096,
      obtain: async () => ({ bytes: new Uint8Array([1]), contentType: "image/png", release() {} }),
      decode: async () => ({ image: { width: 4, height: 4 } as ImageBitmap, close() { closed += 1; } }), whenReady: async () => {} });
    expect(source.retain).toBeUndefined(); source.close(); source.close(); expect(closed).toBe(6);
    scope.dispose(); broker.dispose();
  });
});
