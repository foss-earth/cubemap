import { describe, expect, it, vi } from "vitest";
import { createImageSessionBroker } from "@foss-earth/images";
import type { EncodedImageFile, HeldDecodedImage, WholeImageTexture } from "@foss-earth/images/browser";
import { CUBE_FACE_NAMES, type CubeRepresentationRecord } from "../src/index.js";
import { acquireCubeFaces, loadCube, type CubeLoadPorts } from "../src/browser/index.js";

const record: CubeRepresentationRecord = {
  id: "preview", role: "preview", projection: "cube", mimeType: "image/png", encodedBytes: 60, faceSize: 4,
  faces: Object.fromEntries(CUBE_FACE_NAMES.map(face => [face, `https://example.invalid/${face}.png`])) as CubeRepresentationRecord["faces"],
};
const session = () => createImageSessionBroker({ pools: { encoded: 10000, decoded: 10000, sourceGpu: 10000, uploadOutstanding: 10000, overlap: 10000 }, requests: 6, decodes: 1 });
const body = (id: number): EncodedImageFile => ({ bytes: new Uint8Array([id]), contentType: "image/png", release: vi.fn() });
const image = (id: number): HeldDecodedImage => ({ image: { width: 4, height: 4, id } as unknown as ImageBitmap, close: vi.fn() });
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (error: unknown) => void;
  return { promise: new Promise<T>((done, fail) => { resolve = done; reject = fail; }), resolve, reject };
}
function host(broker: ReturnType<typeof session>): CubeLoadPorts<WholeImageTexture> {
  return { broker, scope: broker.scope(), maxTextureSide: 4096, label: "fixture", overlap: true,
    obtain: async () => body(0), decode: async () => image(0), uploadCube: async () => ({ dispose: vi.fn() }),
    whenReady: async (_texture, signal) => signal.throwIfAborted() };
}
describe("six-file acquisition through public owner ports", () => {
  it("preserves face names despite reversed download completion and closes all faces once", async () => {
    const broker = session(), ports = host(broker);
    const downloads = CUBE_FACE_NAMES.map(() => deferred<EncodedImageFile>());
    const bodies = CUBE_FACE_NAMES.map((_, i) => body(i));
    const images = CUBE_FACE_NAMES.map((_, i) => image(i));
    const obtain = vi.fn((file: { url: string }) => downloads[CUBE_FACE_NAMES.findIndex(face => record.faces[face] === file.url)].promise);
    ports.obtain = obtain;
    ports.decode = async encoded => images[encoded.bytes[0]];
    const pending = acquireCubeFaces(record, ports);
    await vi.waitFor(() => expect(obtain).toHaveBeenCalledTimes(6));
    for (let i = 5; i >= 0; i--) downloads[i].resolve(bodies[i]);
    const source = await pending;
    expect(source.from).toBe("faces");
    for (let i = 0; i < 6; i++) expect(source.faces[CUBE_FACE_NAMES[i]]).toBe(images[i].image);
    for (const encoded of bodies) expect(encoded.release).toHaveBeenCalledOnce();
    source.close(); source.close();
    for (const decoded of images) expect(decoded.close).toHaveBeenCalledOnce();
    ports.scope.dispose(); broker.dispose();
  });
  it("collects late downloaded bodies even when cancellation resource cleanup throws", async () => {
    const broker = session(), ports = host(broker);
    ports.scope.adopt({ dispose() { throw new Error("resource cleanup failed"); } });
    ports.scope.reserve("encoded", 1, "fixture owned body");
    const downloads = CUBE_FACE_NAMES.map(() => deferred<EncodedImageFile>());
    const bodies = CUBE_FACE_NAMES.map((_, i) => body(i));
    let index = 0;
    ports.obtain = vi.fn(() => downloads[index++].promise);
    ports.decode = vi.fn(async () => image(0));
    const pending = acquireCubeFaces(record, ports);
    const rejected = expect(pending).rejects.toBeInstanceOf(AggregateError);
    await vi.waitFor(() => expect(index).toBe(6));
    downloads[0].reject(new Error("first face failed"));
    await vi.waitFor(() => expect(ports.scope.signal.aborted).toBe(true));
    for (let i = 1; i < 6; i++) downloads[i].resolve(bodies[i]);
    await rejected;
    for (const encoded of bodies.slice(1)) expect(encoded.release).toHaveBeenCalledOnce();
    expect(ports.decode).not.toHaveBeenCalled();
    expect(broker.pools.live()).toHaveLength(0); broker.dispose();
  });
  it("attempts every body release and face close after a mid-cube decode failure", async () => {
    const broker = session(), ports = host(broker);
    const bodies = CUBE_FACE_NAMES.map((_, i) => body(i));
    const images = [image(0), image(1)];
    bodies[0].release = vi.fn(() => { throw new Error("body cleanup"); });
    images[0].close = vi.fn(() => { throw new Error("pixel cleanup"); });
    let requested = 0, decoded = 0;
    ports.obtain = async () => bodies[requested++];
    ports.decode = async () => { if (decoded === 2) throw new Error("decode failed"); return images[decoded++]; };
    await expect(acquireCubeFaces(record, ports)).rejects.toBeInstanceOf(AggregateError);
    for (const encoded of bodies) expect(encoded.release).toHaveBeenCalledOnce();
    for (const pixels of images) expect(pixels.close).toHaveBeenCalledOnce();
    expect(ports.scope.signal.aborted).toBe(true); broker.dispose();
  });
  it("closes a late decode without returning a stale source", async () => {
    const broker = session(), ports = host(broker);
    const decode = deferred<HeldDecodedImage>(), pixels = image(0);
    ports.decode = vi.fn(() => decode.promise);
    const pending = acquireCubeFaces(record, ports), rejected = expect(pending).rejects.toThrow();
    await vi.waitFor(() => expect(ports.decode).toHaveBeenCalledOnce());
    ports.scope.dispose(); decode.resolve(pixels);
    await rejected; expect(pixels.close).toHaveBeenCalledOnce(); broker.dispose();
  });
  it("ends an adopted GPU source when closing source pixels fails", async () => {
    const broker = session(), ports = host(broker), dispose = vi.fn();
    ports.acquireFaces = async () => ({ from: "sheet", faces: Object.fromEntries(CUBE_FACE_NAMES.map(face => [face, image(0).image])) as Record<typeof CUBE_FACE_NAMES[number], ImageBitmap>, close() { throw new Error("source close failed"); } });
    ports.uploadCube = async () => ({ dispose });
    await expect(loadCube(record, ports)).rejects.toThrow("source close failed");
    expect(dispose).toHaveBeenCalledOnce();
    expect(broker.pools.live()).toHaveLength(0); broker.dispose();
  });
  it("rejects failed renderer readiness without leaving an adopted texture or overlap", async () => {
    const broker = session(), ports = host(broker), dispose = vi.fn(), close = vi.fn();
    ports.acquireFaces = async () => ({ from: "sheet", faces: Object.fromEntries(CUBE_FACE_NAMES.map(face => [face, image(0).image])) as Record<typeof CUBE_FACE_NAMES[number], ImageBitmap>, close });
    ports.uploadCube = async () => ({ dispose });
    ports.whenReady = async () => { throw new Error("renderer not ready"); };
    await expect(loadCube(record, ports)).rejects.toThrow("renderer not ready");
    expect(dispose).toHaveBeenCalledOnce(); expect(close).toHaveBeenCalledOnce();
    expect(broker.pools.live()).toHaveLength(0); broker.dispose();
  });
});
