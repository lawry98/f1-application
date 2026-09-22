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

interface Gltf {
  materials: { name?: string; pbrMetallicRoughness?: { baseColorTexture?: { index: number } } }[];
  textures: { source: number }[];
  images: { bufferView: number }[];
  bufferViews: { byteOffset?: number; byteLength: number }[];
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
