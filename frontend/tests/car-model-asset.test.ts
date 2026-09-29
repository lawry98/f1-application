/**
 * The weight of the shipped car model, and whether the scenes can still read it.
 *
 * `public/models/f1-car.glb` shipped at 7.57 MB, 7.18 MB of it float32 geometry, for a car that
 * renders inside a modal. `scripts/compress-car-model.mjs` quantizes and meshopt-compresses the
 * geometry to 1.35 MB. Nothing forces a re-export through that script, and every way of getting
 * it wrong looks fine until a browser loads it: an uncompressed model is merely slow, and one
 * compressed in a form `RealCar` cannot decode is a blank canvas.
 *
 * So the decoder here is the one `RealCar` registers — three-stdlib's `MeshoptDecoder` — and not
 * meshoptimizer's own. The newer one also reads the v1 vertex codec (`gltfpack -ce khr`); this one
 * throws `Malformed buffer data` on it, and three-stdlib's GLTFLoader does not know the KHR
 * extension that carries it. A test decoding with the newer library would pass on a file no page
 * can load.
 */

import { beforeAll, describe, expect, it } from 'vitest';
import { decodeBufferViews, glbByteLength, readAccessor, readGlb, type Gltf } from './glb';

/**
 * About 10% over the 1.35 MB that ships. The uncompressed source is 7.57 MB and quantization
 * without meshopt 3.60 MB, so either fails here; a re-export that grows a texture by more than
 * ~150 KB does too, which is the point — the geometry is no longer where the weight is.
 */
const WEIGHT_BUDGET_BYTES = 1_500_000;

/** What three-stdlib's GLTFLoader can read once `RealCar` has given it a meshopt decoder. */
const DECODABLE_EXTENSIONS = ['EXT_meshopt_compression', 'KHR_mesh_quantization'];

/**
 * The source's triangle count. Decimating would change the silhouette of a car that is the whole
 * subject of /showcase, for 139 KB gzipped at half the triangles — so it is a decision to make in
 * a diff, not something a re-export may do on its own.
 */
const SOURCE_TRIANGLES = 205_876;

describe('public/models/f1-car.glb', () => {
  let gltf: Gltf;
  let views: Uint8Array[];

  beforeAll(async () => {
    const glb = readGlb();
    gltf = glb.gltf;
    views = await decodeBufferViews(gltf, glb.bin);
  });

  it('stays inside its weight budget', () => {
    expect(glbByteLength()).toBeLessThan(WEIGHT_BUDGET_BYTES);
  });

  it('requires no extension the scenes cannot decode', () => {
    /*
     * Draco (KHR_draco_mesh_compression) needs a DRACOLoader and a hosted decoder nobody set up;
     * `gltfpack -ce khr` needs a loader three-stdlib does not have. Either would load nowhere.
     */
    const required = gltf.extensionsRequired ?? [];

    expect(required.filter((extension) => !DECODABLE_EXTENSIONS.includes(extension))).toEqual([]);
  });

  it('decodes into indices that stay inside their own vertex buffers', () => {
    /*
     * Decoding without throwing is half of it; garbage decodes too. An index past its mesh's last
     * vertex is what reading a buffer at the wrong stride or offset produces.
     */
    for (const mesh of gltf.meshes) {
      for (const primitive of mesh.primitives) {
        const vertexCount = gltf.accessors[primitive.attributes.POSITION]!.count;
        const indices = readAccessor(gltf, views, gltf.accessors[primitive.indices!]!);
        // A loop, not `Math.max(...)`: 322,701 arguments overflow the call stack.
        const highest = indices.reduce((most, [index]) => Math.max(most, index!), 0);

        expect(highest).toBeLessThan(vertexCount);
      }
    }
  });

  it('declares the POSITION bounds its decoded vertices actually have', () => {
    /*
     * three-stdlib's GLTFLoader never measures the vertices: it builds every geometry's
     * `boundingBox` and `boundingSphere` from accessor min/max, and those are what frustum
     * culling tests. Bounds tighter than the data cull a mesh while part of it is on screen.
     * Draco through gltf-transform writes exactly that: it keeps the source's float bounds while
     * the decoded vertices move by up to 2.1e-4.
     */
    for (const mesh of gltf.meshes) {
      for (const primitive of mesh.primitives) {
        const accessor = gltf.accessors[primitive.attributes.POSITION]!;
        const positions = readAccessor(gltf, views, accessor);

        const min = [Infinity, Infinity, Infinity];
        const max = [-Infinity, -Infinity, -Infinity];
        for (const position of positions) {
          for (let axis = 0; axis < 3; axis++) {
            min[axis] = Math.min(min[axis]!, position[axis]!);
            max[axis] = Math.max(max[axis]!, position[axis]!);
          }
        }
        expect(min).toEqual(accessor.min);
        expect(max).toEqual(accessor.max);
      }
    }
  });

  it('keeps every triangle of the source', () => {
    const triangles = gltf.meshes
      .flatMap((mesh) => mesh.primitives)
      .reduce((sum, primitive) => sum + gltf.accessors[primitive.indices!]!.count / 3, 0);

    expect(triangles).toBe(SOURCE_TRIANGLES);
  });
});
