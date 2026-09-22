/**
 * Reads the shipped `f1-car.glb` without three.js.
 *
 * The livery tests exist to catch an asset drifting away from the code that recolours it, so
 * they have to read the asset we actually ship rather than a fixture describing it. A GLTFLoader
 * needs a WebGL context jsdom cannot give, so this parses the container by hand: a GLB is a
 * 12-byte header followed by length-prefixed chunks, and everything these tests need — material
 * names, and the livery's base-colour PNG — lives in the JSON chunk plus one slice of the binary
 * one.
 *
 * The PNG decoder handles exactly the one encoding this asset uses (8-bit truecolour, no
 * interlacing) and throws on anything else, so an asset re-export in another encoding fails
 * loudly here instead of silently skipping the check.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { inflateSync } from 'node:zlib';

// `process.cwd()` rather than `import.meta.url`, matching `lib/credits.ts`: vitest serves test
// modules over http, so `import.meta.url` is not a file URL here.
const GLB_PATH = join(process.cwd(), 'public', 'models', 'f1-car.glb');

const CHUNK_JSON = 0x4e4f534a;
const CHUNK_BIN = 0x004e4942;

interface GltfNode {
  name?: string;
  mesh?: number;
  children?: number[];
  /** Column-major, and mutually exclusive with the TRS triple below. */
  matrix?: number[];
  translation?: [number, number, number];
  rotation?: [number, number, number, number];
  scale?: [number, number, number];
}

interface Gltf {
  materials: { name?: string; pbrMetallicRoughness?: { baseColorTexture?: { index: number } } }[];
  textures: { source: number }[];
  images: { bufferView: number }[];
  bufferViews: { byteOffset?: number; byteLength: number }[];
  nodes: GltfNode[];
  meshes: { primitives: { attributes: { POSITION: number } }[] }[];
  accessors: { min?: number[]; max?: number[] }[];
  scenes: { nodes: number[] }[];
  scene?: number;
}

function readGlb(): { gltf: Gltf; bin: Buffer } {
  const glb = readFileSync(GLB_PATH);

  let offset = 12;
  let json: Buffer | undefined;
  let bin: Buffer | undefined;
  while (offset < glb.length) {
    const length = glb.readUInt32LE(offset);
    const type = glb.readUInt32LE(offset + 4);
    const body = glb.subarray(offset + 8, offset + 8 + length);
    if (type === CHUNK_JSON) json = body;
    if (type === CHUNK_BIN) bin = body;
    offset += 8 + length;
  }

  if (!json || !bin) throw new Error('f1-car.glb: missing a JSON or BIN chunk');
  return { gltf: JSON.parse(json.toString('utf8')) as Gltf, bin };
}

/** Every material name in the shipped model, in file order. */
export function glbMaterialNames(): string[] {
  const { gltf } = readGlb();
  return gltf.materials.map((material) => material.name ?? '');
}

export interface DecodedTexture {
  width: number;
  height: number;
  /** RGBA, the shape a canvas `ImageData` hands the recolour at runtime. */
  data: Uint8ClampedArray;
}

/**
 * Decodes 8-bit truecolour (no alpha), non-interlaced PNG to RGBA.
 *
 * Only the filter types the spec defines; anything else is a corrupt stream, not a variant.
 */
function decodePng(png: Buffer): DecodedTexture {
  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idat: Buffer[] = [];

  while (offset < png.length) {
    const length = png.readUInt32BE(offset);
    const type = png.toString('ascii', offset + 4, offset + 8);
    const body = png.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      bitDepth = body[8]!;
      colorType = body[9]!;
    } else if (type === 'IDAT') {
      idat.push(body);
    } else if (type === 'IEND') {
      break;
    }
    offset += 12 + length;
  }

  if (bitDepth !== 8 || colorType !== 2) {
    throw new Error(
      `f1-car.glb livery texture: expected 8-bit truecolour, got bitDepth=${bitDepth} colorType=${colorType}`,
    );
  }

  const raw = inflateSync(Buffer.concat(idat));
  const bpp = 3;
  const stride = width * bpp;
  const data = new Uint8ClampedArray(width * height * 4);

  let previous = Buffer.alloc(stride);
  let read = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[read]!;
    read += 1;
    const line = Buffer.from(raw.subarray(read, read + stride));
    read += stride;

    for (let i = 0; i < stride; i++) {
      const left = i >= bpp ? line[i - bpp]! : 0;
      const up = previous[i]!;
      const upLeft = i >= bpp ? previous[i - bpp]! : 0;

      let addend = 0;
      if (filter === 1) {
        addend = left;
      } else if (filter === 2) {
        addend = up;
      } else if (filter === 3) {
        addend = (left + up) >> 1;
      } else if (filter === 4) {
        const pa = Math.abs(up - upLeft);
        const pb = Math.abs(left - upLeft);
        const pc = Math.abs(left + up - 2 * upLeft);
        addend = pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft;
      } else if (filter !== 0) {
        throw new Error(`f1-car.glb livery texture: unknown PNG filter ${filter}`);
      }
      line[i] = (line[i]! + addend) & 255;
    }

    for (let x = 0; x < width; x++) {
      const to = (y * width + x) * 4;
      data[to] = line[x * bpp]!;
      data[to + 1] = line[x * bpp + 1]!;
      data[to + 2] = line[x * bpp + 2]!;
      data[to + 3] = 255;
    }

    previous = line;
  }

  return { width, height, data };
}

/** The base-colour texture the `Livery` material points at, decoded to RGBA. */
export function decodeLiveryTexture(): DecodedTexture {
  const { gltf, bin } = readGlb();

  const livery = gltf.materials.find((material) => material.name === 'Livery');
  const textureIndex = livery?.pbrMetallicRoughness?.baseColorTexture?.index;
  if (textureIndex === undefined) throw new Error('f1-car.glb: no Livery baseColorTexture');

  const view = gltf.bufferViews[gltf.images[gltf.textures[textureIndex]!.source]!.bufferView]!;
  const start = view.byteOffset ?? 0;
  return decodePng(bin.subarray(start, start + view.byteLength));
}

/** The most common RGB triple in an RGBA buffer. */
export function modalColor(data: Uint8ClampedArray): [number, number, number] {
  const counts = new Map<number, number>();
  for (let i = 0; i < data.length; i += 4) {
    const key = (data[i]! << 16) | (data[i + 1]! << 8) | data[i + 2]!;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  let best = 0;
  let bestCount = -1;
  counts.forEach((count, key) => {
    if (count > bestCount) {
      best = key;
      bestCount = count;
    }
  });
  return [(best >> 16) & 255, (best >> 8) & 255, best & 255];
}

export interface GlbBounds {
  /** World-space extent, in the order `[x, y, z]`. */
  size: [number, number, number];
  /** World-space midpoint of the box, in the order `[x, y, z]`. */
  centre: [number, number, number];
  /** World-space lowest point — what has to meet the ground plane. */
  minY: number;
}

/** `a * b`, both column-major 4x4, glTF's convention and three.js's. */
function multiply(a: number[], b: number[]): number[] {
  const out = new Array<number>(16).fill(0);
  for (let column = 0; column < 4; column++) {
    for (let row = 0; row < 4; row++) {
      let sum = 0;
      for (let k = 0; k < 4; k++) sum += a[k * 4 + row]! * b[column * 4 + k]!;
      out[column * 4 + row] = sum;
    }
  }
  return out;
}

function fromTrs(node: GltfNode): number[] {
  const [tx, ty, tz] = node.translation ?? [0, 0, 0];
  const [qx, qy, qz, qw] = node.rotation ?? [0, 0, 0, 1];
  const [sx, sy, sz] = node.scale ?? [1, 1, 1];

  const x2 = qx + qx;
  const y2 = qy + qy;
  const z2 = qz + qz;
  const xx = qx * x2;
  const xy = qx * y2;
  const xz = qx * z2;
  const yy = qy * y2;
  const yz = qy * z2;
  const zz = qz * z2;
  const wx = qw * x2;
  const wy = qw * y2;
  const wz = qw * z2;

  // prettier-ignore
  return [
    (1 - (yy + zz)) * sx, (xy + wz) * sx,       (xz - wy) * sx,       0,
    (xy - wz) * sy,       (1 - (xx + zz)) * sy, (yz + wx) * sy,       0,
    (xz + wy) * sz,       (yz - wx) * sz,       (1 - (xx + yy)) * sz, 0,
    tx,                   ty,                   tz,                   1,
  ];
}

/**
 * The model's bounding box in **world** space, with the whole node hierarchy applied.
 *
 * Not the same thing as the accessors' own `min`/`max`, and the difference is the point: this
 * asset nests the meshes under `Sketchfab_model → F1 2026.fbx → RootNode → Car`, and those
 * wrappers both rescale (0.01 then ~100, which cancel) and permute axes Y-up → Z-up. Reading the
 * accessors alone reports the car 4.10 tall and 2.66 wide; in the scene it is 2.66 tall and 4.10
 * wide, and the camera has to be placed against the second pair.
 */
export function glbBounds(): GlbBounds {
  const { gltf } = readGlb();

  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];

  const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

  const walk = (index: number, parent: number[]): void => {
    const node = gltf.nodes[index]!;
    const world = multiply(parent, node.matrix ?? fromTrs(node));

    if (node.mesh !== undefined) {
      for (const primitive of gltf.meshes[node.mesh]!.primitives) {
        const accessor = gltf.accessors[primitive.attributes.POSITION]!;
        if (!accessor.min || !accessor.max) {
          throw new Error('f1-car.glb: a POSITION accessor has no min/max');
        }
        const [ax, ay, az] = accessor.min as [number, number, number];
        const [bx, by, bz] = accessor.max as [number, number, number];

        // Every corner, because the wrappers rotate: transforming only min and max would give
        // the box of two points rather than the box of the transformed box.
        for (const x of [ax, bx]) {
          for (const y of [ay, by]) {
            for (const z of [az, bz]) {
              const wx = world[0]! * x + world[4]! * y + world[8]! * z + world[12]!;
              const wy = world[1]! * x + world[5]! * y + world[9]! * z + world[13]!;
              const wz = world[2]! * x + world[6]! * y + world[10]! * z + world[14]!;
              const point = [wx, wy, wz];
              for (let axis = 0; axis < 3; axis++) {
                if (point[axis]! < min[axis]!) min[axis] = point[axis]!;
                if (point[axis]! > max[axis]!) max[axis] = point[axis]!;
              }
            }
          }
        }
      }
    }

    for (const child of node.children ?? []) walk(child, world);
  };

  for (const root of gltf.scenes[gltf.scene ?? 0]!.nodes) walk(root, identity);

  return {
    size: [max[0]! - min[0]!, max[1]! - min[1]!, max[2]! - min[2]!],
    centre: [(max[0]! + min[0]!) / 2, (max[1]! + min[1]!) / 2, (max[2]! + min[2]!) / 2],
    minY: min[1]!,
  };
}
