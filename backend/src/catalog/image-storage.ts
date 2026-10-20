import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { deflateSync, inflateSync } from 'node:zlib';

export const CATALOG_IMAGE_STORAGE = Symbol('CATALOG_IMAGE_STORAGE');
export type StoredImage = Readonly<{ key: string; bytes: number; width: number; height: number; contentType: 'image/png' }>;
export interface CatalogImageStorage {
  put(data: Buffer): Promise<StoredImage>;
  read(key: string): Promise<Buffer>;
  remove(key: string): Promise<void>;
  listKeys(): Promise<readonly string[]>;
}

const MAX_BYTES = 5 * 1024 * 1024;
const SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const CRC_TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  CRC_TABLE[n] = c >>> 0;
}
function crc32(data: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of data) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/** Fully validates non-interlaced PNG structure, CRCs, bounded inflation, scanlines and filters. */
export function validatePng(data: Buffer): Readonly<{ width: number; height: number }> {
  if (data.length > MAX_BYTES) throw new Error('IMAGE_TOO_LARGE');
  if (data.length < 8 || !data.subarray(0, 8).equals(SIGNATURE)) throw new Error('UNSUPPORTED_IMAGE_TYPE');
  if (data.length < 45) throw new Error('INVALID_IMAGE');
  let offset = 8;
  let width = 0; let height = 0; let bitDepth = 0; let colorType = -1; let seenHeader = false; let seenEnd = false;
  let seenPalette = false; let paletteEntries = 0; let seenData = false; let idatEnded = false;
  const compressed: Buffer[] = [];
  const knownCritical = new Set(['IHDR', 'PLTE', 'IDAT', 'IEND']);
  while (offset + 12 <= data.length) {
    const length = data.readUInt32BE(offset);
    if (length > MAX_BYTES || offset + 12 + length > data.length) throw new Error('INVALID_IMAGE');
    const type = data.toString('ascii', offset + 4, offset + 8);
    if (!/^[A-Za-z]{4}$/.test(type) || (type.charCodeAt(2) & 32) !== 0 ||
        (type.charCodeAt(0) & 32) === 0 && !knownCritical.has(type) || ['acTL', 'fcTL', 'fdAT'].includes(type)) {
      throw new Error('INVALID_IMAGE');
    }
    const payload = data.subarray(offset + 8, offset + 8 + length);
    const expectedCrc = data.readUInt32BE(offset + 8 + length);
    if (crc32(data.subarray(offset + 4, offset + 8 + length)) !== expectedCrc) throw new Error('INVALID_IMAGE');
    if (!seenHeader && type !== 'IHDR') throw new Error('INVALID_IMAGE');
    if (type === 'IHDR') {
      if (seenHeader || length !== 13) throw new Error('INVALID_IMAGE');
      width = payload.readUInt32BE(0); height = payload.readUInt32BE(4); bitDepth = payload[8]; colorType = payload[9];
      if (width < 1 || height < 1 || width > 4096 || height > 4096 || payload[10] !== 0 || payload[11] !== 0 || payload[12] !== 0) throw new Error('INVALID_IMAGE');
      seenHeader = true;
    } else if (type === 'PLTE') {
      if (seenPalette || seenData || [0, 4].includes(colorType) || length === 0 || length > 768 || length % 3 !== 0) throw new Error('INVALID_IMAGE');
      seenPalette = true; paletteEntries = length / 3;
    } else if (type === 'IDAT') {
      if (idatEnded || seenEnd || colorType === 3 && !seenPalette) throw new Error('INVALID_IMAGE');
      seenData = true; compressed.push(payload);
    } else {
      if (seenData) idatEnded = true;
      if (type === 'IEND') {
        if (seenEnd || length !== 0 || !seenData) throw new Error('INVALID_IMAGE');
        seenEnd = true; offset += 12; break;
      }
    }
    offset += 12 + length;
  }
  if (!seenHeader || !seenData || !seenEnd || offset !== data.length) throw new Error('INVALID_IMAGE');
  const channels = ({ 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 } as Record<number, number>)[colorType];
  const depths: Record<number, readonly number[]> = { 0: [1, 2, 4, 8, 16], 2: [8, 16], 3: [1, 2, 4, 8], 4: [8, 16], 6: [8, 16] };
  if (!channels || !depths[colorType]?.includes(bitDepth)) throw new Error('INVALID_IMAGE');
  if (colorType === 3 && paletteEntries > 2 ** bitDepth) throw new Error('INVALID_IMAGE');
  const rowBytes = Math.ceil(width * channels * bitDepth / 8);
  const expected = (rowBytes + 1) * height;
  if (expected > 64 * 1024 * 1024 + height || expected < height) throw new Error('INVALID_IMAGE');
  const compressedData = Buffer.concat(compressed);
  let raster: Buffer;
  try {
    const inflated = inflateSync(compressedData, { maxOutputLength: expected, info: true }) as unknown as {
      buffer: Buffer; engine: { bytesWritten: number };
    };
    if (inflated.engine.bytesWritten !== compressedData.length) throw new Error('INVALID_IMAGE');
    raster = inflated.buffer;
  } catch { throw new Error('INVALID_IMAGE'); }
  if (raster.length !== expected) throw new Error('INVALID_IMAGE');
  const bytesPerPixel = Math.max(1, Math.ceil(channels * bitDepth / 8));
  let previous = Buffer.alloc(rowBytes);
  for (let row = 0; row < height; row++) {
    const rowStart = row * (rowBytes + 1); const filter = raster[rowStart];
    if (filter > 4) throw new Error('INVALID_IMAGE');
    const decoded = Buffer.from(raster.subarray(rowStart + 1, rowStart + 1 + rowBytes));
    for (let x = 0; x < rowBytes; x++) {
      const left = x >= bytesPerPixel ? decoded[x - bytesPerPixel] : 0;
      const above = previous[x]; const upperLeft = x >= bytesPerPixel ? previous[x - bytesPerPixel] : 0;
      let predictor = 0;
      if (filter === 1) predictor = left;
      else if (filter === 2) predictor = above;
      else if (filter === 3) predictor = Math.floor((left + above) / 2);
      else if (filter === 4) {
        const p = left + above - upperLeft; const pa = Math.abs(p - left); const pb = Math.abs(p - above); const pc = Math.abs(p - upperLeft);
        predictor = pa <= pb && pa <= pc ? left : pb <= pc ? above : upperLeft;
      }
      decoded[x] = (decoded[x] + predictor) & 0xff;
    }
    if (colorType === 3) for (let pixel = 0; pixel < width; pixel++) {
      const bit = pixel * bitDepth; const shift = 8 - bitDepth - bit % 8;
      const index = (decoded[Math.floor(bit / 8)] >> shift) & ((1 << bitDepth) - 1);
      if (index >= paletteEntries) throw new Error('INVALID_IMAGE');
    }
    previous = decoded;
  }
  return { width, height };
}

export class FileCatalogImageStorage implements CatalogImageStorage {
  private readonly directory: string;
  constructor(directory = process.env.CATALOG_IMAGE_DIRECTORY ?? resolve(process.cwd(), '.local/catalog-images')) {
    this.directory = resolve(directory);
  }
  async put(data: Buffer): Promise<StoredImage> {
    const dimensions = validatePng(data);
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    const key = `${randomUUID()}.png`;
    const temporary = resolve(this.directory, `.${key}.tmp`);
    const destination = resolve(this.directory, key);
    try {
      await writeFile(temporary, data, { flag: 'wx', mode: 0o600 });
      await rename(temporary, destination);
    } catch (error) { await rm(temporary, { force: true }); throw error; }
    return { key, bytes: data.length, width: dimensions.width, height: dimensions.height, contentType: 'image/png' };
  }
  async read(key: string): Promise<Buffer> {
    if (!/^[0-9a-f-]{36}\.png$/i.test(key) || basename(key) !== key) throw new Error('INVALID_IMAGE_KEY');
    const data = await readFile(resolve(this.directory, key));
    validatePng(data);
    return data;
  }
  async remove(key: string): Promise<void> {
    if (!/^[0-9a-f-]{36}\.png$/i.test(key) || basename(key) !== key) throw new Error('INVALID_IMAGE_KEY');
    await rm(resolve(this.directory, key), { force: true });
  }
  async listKeys(): Promise<readonly string[]> {
    const { readdir } = await import('node:fs/promises');
    return (await readdir(this.directory)).filter((key) => /^[0-9a-f-]{36}\.png$/i.test(key));
  }
}

export function pngTestFixture(width = 1, height = 1): Buffer {
  const chunk = (type: string, payload: Buffer) => {
    const typeBytes = Buffer.from(type); const length = Buffer.alloc(4); length.writeUInt32BE(payload.length);
    const body = Buffer.concat([typeBytes, payload]); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
    return Buffer.concat([length, body, crc]);
  };
  const header = Buffer.alloc(13); header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 6;
  const rows = Buffer.alloc((width * 4 + 1) * height);
  return Buffer.concat([SIGNATURE, chunk('IHDR', header), chunk('IDAT', deflateSync(rows)), chunk('IEND', Buffer.alloc(0))]);
}
