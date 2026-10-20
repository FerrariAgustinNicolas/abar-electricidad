import { FileCatalogImageStorage, pngTestFixture, validatePng } from '../src/catalog/image-storage';
import { deflateSync, inflateSync } from 'node:zlib';

describe('H2 catalog PNG validation', () => {
  it('accepts a bounded, fully decodable PNG and reports its raster dimensions', () => {
    expect(validatePng(pngTestFixture(32, 16))).toEqual({ width: 32, height: 16 });
  });

  it('rejects corrupt chunk checksums instead of trusting the PNG signature', () => {
    const png = pngTestFixture();
    png[png.length - 5] ^= 0xff;
    expect(() => validatePng(png)).toThrow('INVALID_IMAGE');
  });

  it('rejects dimensions outside the frozen 4096-pixel bound', () => {
    expect(() => validatePng(pngTestFixture(4097, 1))).toThrow('INVALID_IMAGE');
  });

  it('rejects an invalid decompressed scanline filter', () => {
    const png = pngTestFixture();
    // The first decompressed byte is the per-row PNG filter selector.
    const idatData = png.subarray(41, png.length - 16);
    const raster = inflateSync(idatData); raster[0] = 5;
    const encoded = deflateSync(raster);
    // Rebuild the IDAT chunk with its new payload and checksum.
    const type = Buffer.from('IDAT'); const len = Buffer.alloc(4); len.writeUInt32BE(encoded.length);
    const body = Buffer.concat([type, encoded]); const crc = Buffer.alloc(4);
    let value = 0xffffffff;
    for (const byte of body) {
      value ^= byte;
      for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    crc.writeUInt32BE((value ^ 0xffffffff) >>> 0);
    const rebuilt = Buffer.concat([png.subarray(0, 33), len, body, crc, png.subarray(png.length - 12)]);
    expect(() => validatePng(rebuilt)).toThrow('INVALID_IMAGE');
  });
});

function pngChunk(type: string, payload: Uint8Array = Buffer.alloc(0)): Buffer {
  const body = Buffer.concat([Buffer.from(type), payload]);
  let crc = 0xffffffff;
  for (const byte of body) { crc ^= byte; for (let i = 0; i < 8; i++) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1; }
  const chunk = Buffer.alloc(payload.length + 12); chunk.writeUInt32BE(payload.length); body.copy(chunk, 4); chunk.writeUInt32BE((crc ^ 0xffffffff) >>> 0, chunk.length - 4);
  return chunk;
}
function pngWith(idat: Uint8Array, beforeIdat: Uint8Array = Buffer.alloc(0), header: Uint8Array = pngTestFixture().subarray(8, 33)): Buffer {
  const template = pngTestFixture();
  return Buffer.concat([template.subarray(0, 8), header, beforeIdat, pngChunk('IDAT', idat), template.subarray(-12)]) as Buffer<ArrayBuffer>;
}

describe('H2 PNG independent regression probes', () => {
  it('rejects unknown critical chunks and accepts standard tEXt ancillary chunks', () => {
    const data = deflateSync(Buffer.alloc(5));
    expect(() => validatePng(pngWith(data, pngChunk('ABCD')))).toThrow('INVALID_IMAGE');
    expect(validatePng(pngWith(data, pngChunk('tEXt', Buffer.from('key\0value'))))).toEqual({ width: 1, height: 1 });
  });
  it('rejects chunk type reserved-bit violations and APNG animation chunks', () => {
    const data = deflateSync(Buffer.alloc(5));
    expect(() => validatePng(pngWith(data, pngChunk('ABcD')))).toThrow('INVALID_IMAGE');
    expect(() => validatePng(pngWith(data, pngChunk('acTL', Buffer.alloc(8))))).toThrow('INVALID_IMAGE');
  });
  it('requires the entire IDAT payload to be exactly one zlib stream', () => {
    const stream = deflateSync(Buffer.alloc(5));
    expect(() => validatePng(pngWith(Buffer.concat([stream, Buffer.from('trailing bytes')])))).toThrow('INVALID_IMAGE');
    expect(() => validatePng(pngWith(Buffer.concat([stream, deflateSync(Buffer.alloc(5))])))).toThrow('INVALID_IMAGE');
  });
  it('rejects invalid CRC, unsupported filters, truncated raster, and excessive inflation', () => {
    const valid = pngTestFixture(); const badCrc = Buffer.from(valid); badCrc[29] ^= 1;
    expect(() => validatePng(badCrc)).toThrow('INVALID_IMAGE');
    const badFilter = Buffer.alloc(5); badFilter[0] = 5;
    expect(() => validatePng(pngWith(deflateSync(badFilter)))).toThrow('INVALID_IMAGE');
    expect(() => validatePng(pngWith(deflateSync(Buffer.alloc(3))))) .toThrow('INVALID_IMAGE');
    expect(() => validatePng(pngWith(deflateSync(Buffer.alloc(10000))))) .toThrow('INVALID_IMAGE');
  });
  it('rejects dimensions above the frozen 4096 pixel limit', () => {
    const header = Buffer.from(pngTestFixture().subarray(8, 33)); header.writeUInt32BE(4097, 8);
    expect(() => validatePng(pngWith(deflateSync(Buffer.alloc(5)), Buffer.alloc(0), header))).toThrow('INVALID_IMAGE');
  });
  it.each(['../x.png', '/tmp/x.png', '00000000-0000-4000-8000-000000000000.png/../x'])('rejects image path traversal key %s', async (key) => {
    await expect(new FileCatalogImageStorage('/private/tmp/h2-png-probe-images').read(key)).rejects.toThrow('INVALID_IMAGE_KEY');
  });
});
