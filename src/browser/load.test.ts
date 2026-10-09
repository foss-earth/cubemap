import { describe, expect, it } from "vitest";
import { createImageSessionBroker } from "@foss-earth/images";
import type { ImageSessionBroker } from "@foss-earth/images";
import type { WholeImageTexture } from "@foss-earth/images/browser";
import { CUBE_FACE_NAMES } from "../core.js";
import { estimateCube, type CubeRepresentationRecord } from "../representation.js";
import { loadCube, type CubeFaceSource, type CubeLoadPorts } from "./index.js";
const record: CubeRepresentationRecord = { id: "preview", role: "preview", projection: "cube", mimeType: "image/png", encodedBytes: 6, faceSize: 8, faces: Object.fromEntries(CUBE_FACE_NAMES.map(face => [face, `https://example.invalid/${face}.png`])) as CubeRepresentationRecord["faces"] };
function broker(): ImageSessionBroker {
  return createImageSessionBroker({ pools: { encoded: 100000, decoded: 100000, sourceGpu: 100000, uploadOutstanding: 100000, overlap: 100000 }, requests: 2, decodes: 1 });
}
function sheetSource(close: () => void): CubeFaceSource {
  return { faces: Object.fromEntries(CUBE_FACE_NAMES.map(face => [face, { width: 8, height: 8 }])) as unknown as CubeFaceSource["faces"], from: "sheet", close };
}
function ports(session: ImageSessionBroker, source: CubeFaceSource, upload: () => Promise<WholeImageTexture>): CubeLoadPorts<WholeImageTexture> {
  return { broker: session, scope: session.scope(), maxTextureSide: 4096, overlap: true, label: "fixture", acquireFaces: async () => source, obtain: async () => { throw new Error("Sheet source must not acquire six files."); }, decode: async () => { throw new Error("Sheet source must not decode again."); }, uploadCube: upload, whenReady: async (_texture, signal) => signal.throwIfAborted() };
}
describe("shared cube sources and host replacement authority", () => {
  it("uploads a sheet source once and retains overlap until the host settles", async () => {
    const session = broker(); let closes = 0; let uploads = 0; let disposals = 0;
    const host = ports(session, sheetSource(() => { closes++; }), async () => { uploads++; return { dispose: () => { disposals++; } }; });
    const loaded = await loadCube(record, host);
    expect([uploads, closes, disposals]).toEqual([1, 1, 0]);
    expect(session.pools.stats().overlap.reserved).toBe(estimateCube(record, host).sourceGpu);
    loaded.settleReplacement();
    expect(session.pools.stats().overlap.reserved).toBe(0);
    expect(session.pools.stats().sourceGpu.reserved).toBeGreaterThan(0);
    loaded.dispose(); loaded.dispose();
    expect(disposals).toBe(1);
    expect(session.pools.live()).toHaveLength(0);
    session.dispose();
  });
  it("closes a supplied source and operation when GPU admission fails", async () => {
    const session = broker(); let closes = 0; let uploads = 0;
    session.setLimits({ pools: { encoded: 100, decoded: 100, sourceGpu: 0, uploadOutstanding: 100, overlap: 0 }, requests: 1, decodes: 1 });
    const host = ports(session, sheetSource(() => { closes++; }), async () => { uploads++; return { dispose() {} }; });
    host.scope.reserve("encoded", 1, "prepared source");
    await expect(loadCube(record, host)).rejects.toThrow(/sourceGpu/);
    expect([closes, uploads]).toEqual([1, 0]);
    expect(host.scope.signal.aborted).toBe(true);
    expect(session.pools.live()).toHaveLength(0);
    session.dispose();
  });
  it("disposes an upload that completes after replacement and closes its source", async () => {
    const session = broker(); let closes = 0; let disposals = 0; let resolve!: (value: WholeImageTexture) => void;
    const host = ports(session, sheetSource(() => { closes++; }), () => new Promise(done => { resolve = done; }));
    const pending = loadCube(record, host);
    await Promise.resolve(); await Promise.resolve();
    host.scope.dispose();
    resolve({ dispose: () => { disposals++; } });
    await expect(pending).rejects.toThrow();
    expect([closes, disposals]).toEqual([1, 1]);
    expect(session.pools.live()).toHaveLength(0);
    session.dispose();
  });
});
