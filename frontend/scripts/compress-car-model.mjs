#!/usr/bin/env node
/**
 * Rebuilds public/models/f1-car.glb, geometry-compressed, from the untouched Sketchfab export.
 *
 * Not part of the build — the committed GLB is what ships. Re-run only to change how the model
 * is compressed:
 *
 *   node scripts/compress-car-model.mjs                 rebuild public/models/f1-car.glb
 *   node scripts/compress-car-model.mjs --check         fail if a rebuild would change the committed file
 *   node scripts/compress-car-model.mjs --source <glb>  read the source from a file rather than git
 *
 * THE SOURCE. "F1 2026 Release Car" by Nimaxo, CC BY 4.0,
 * https://sketchfab.com/3d-models/f1-2026-release-car-b5c4f3ef041345c68b8e918190d32a9c — the GLB
 * Sketchfab's own converter produced ("Sketchfab-16.16.0"), committed as-is in 9447c31. By default
 * it is read back out of git history, so no copy of the 7.57 MB original lives in the tree. Both
 * routes are pinned to the same bytes by SHA-256: a fresh download may come out of a newer
 * converter, and CAR_BOUNDS, LIVERY_BASE_RGB and the livery tolerances were all measured against
 * this exact file — a different source means re-measuring them, not just re-running this.
 *
 * THE WEIGHT WAS GEOMETRY. Of the source's 7.57 MB, 0.39 MB is four PNGs and the rest is 205,876
 * triangles of float32 vertex data. gltfpack quantizes that (KHR_mesh_quantization) and
 * compresses it (EXT_meshopt_compression): 1.35 MB on disk. The PNGs pass through byte-identical,
 * which matters — `lib/livery.ts` recolours by exact texel value, so any lossy texture codec would
 * break it outright.
 *
 * Every flag is load-bearing:
 *
 *   -cc      meshopt compression at gltfpack's higher ratio. Same decoder as -c.
 *   -ce ext  the EXT_ extension, not KHR_meshopt_compression: three-stdlib's GLTFLoader, which is
 *            what RealCar loads with, implements only EXT_ and would refuse the file.
 *   -kn      keep the node hierarchy. Flattened, gltfpack merges the car into one unnamed node
 *            and bakes the `Car` node's 0.648° rake into the vertices: the `Sketchfab_model` and
 *            `Car` nodes a live camera check walks are gone, and the re-quantized vertices move
 *            CAR_BOUNDS 5.4e-4 in z, just past tests/scene-fit.test.ts's tolerance.
 *   -km      keep named materials. `selectLiveryMaterials` matches `Livery` exactly.
 *
 * Deliberately absent: -si (no decimation — the silhouette stays the source's; halving the
 * triangles would save 139 KB gzipped), texture flags (above), and precision overrides. The
 * defaults, 14-bit positions, 12-bit UVs and 8-bit octahedral normals, measure at most 5.9e-4
 * units, 0.35 texels and 1.07° from the source, and rendered under the scenes' own lights they
 * differ from it on 0.04–0.06% of pixels by more than 8/255 — the same as Draco. `-vn 10` cuts
 * the normal error to 0.41° for +59 KB and buys nothing measurable under those lights; it starts
 * to pay only once a scene reflects an environment map (0.1–0.34% of pixels off, against
 * 0.08–0.16%), which neither does.
 *
 * gltfpack is exact-pinned in package.json because its output bytes depend on its version; with
 * the same version the build is deterministic, which is what `--check` relies on.
 */

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pack } from 'gltfpack';

const FRONTEND = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT = join(FRONTEND, 'public', 'models', 'f1-car.glb');

/** `git rev-parse 9447c31:frontend/public/models/f1-car.glb` */
const SOURCE_BLOB = 'a40ada2c06c9e0fc233e2ecbd99dc73f0b095be2';
const SOURCE_SHA256 = '82389d3be57e54f5f6a45426691a63cea9b9138e6bf4e8bbe283e6475c3a9382';

const GLTFPACK_ARGS = ['-cc', '-ce', 'ext', '-kn', '-km'];

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

function readSource(path) {
  if (path) return readFileSync(path);
  try {
    return execFileSync('git', ['cat-file', 'blob', SOURCE_BLOB], {
      cwd: FRONTEND,
      maxBuffer: 64 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch {
    throw new Error(
      `source blob ${SOURCE_BLOB} is not in this clone's history. ` +
        'Run `git fetch --unshallow`, or pass --source <path> to the original GLB.',
    );
  }
}

async function compress(source) {
  let output;
  await pack(['-i', 'source.glb', '-o', 'output.glb', ...GLTFPACK_ARGS], {
    read: (name) => {
      if (name !== 'source.glb') throw new Error(`gltfpack asked for an unexpected file: ${name}`);
      return source;
    },
    write: (name, data) => {
      if (name !== 'output.glb') throw new Error(`gltfpack wrote an unexpected file: ${name}`);
      output = Buffer.from(data);
    },
  });
  if (!output) throw new Error('gltfpack produced no output');
  return output;
}

function triangles(glb) {
  const gltf = JSON.parse(glb.subarray(20, 20 + glb.readUInt32LE(12)).toString('utf8'));
  return gltf.meshes
    .flatMap((mesh) => mesh.primitives)
    .reduce((sum, primitive) => sum + gltf.accessors[primitive.indices].count / 3, 0);
}

const argv = process.argv.slice(2);
const check = argv.includes('--check');
const sourceFlag = argv.indexOf('--source');
const sourcePath = sourceFlag === -1 ? undefined : argv[sourceFlag + 1];
if (sourceFlag !== -1 && !sourcePath) throw new Error('--source needs a path');

const source = readSource(sourcePath);
if (sha256(source) !== SOURCE_SHA256) {
  throw new Error(
    `source SHA-256 is ${sha256(source)}, expected ${SOURCE_SHA256}. ` +
      'A different export needs CAR_BOUNDS and the livery constants re-measured before it ships.',
  );
}

const output = await compress(source);
const mb = (bytes) => `${(bytes / 1e6).toFixed(2)} MB`;
console.log(
  `f1-car.glb: ${mb(source.length)} → ${mb(output.length)}, ` +
    `${triangles(source)} → ${triangles(output)} triangles, sha256 ${sha256(output)}`,
);

if (check) {
  if (!readFileSync(OUTPUT).equals(output)) {
    console.error('public/models/f1-car.glb does not match a fresh build. Re-run without --check.');
    process.exit(1);
  }
  console.log('public/models/f1-car.glb matches a fresh build.');
} else {
  writeFileSync(OUTPUT, output);
}
