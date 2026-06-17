// Unit tests for the minimal RIFF/WAVE duration parser. The live
// engine uses this to compute L2 (audio playback duration) for each
// ComfyUI-produced segment; the surplus accumulator relies on it.
//
// Only PCM (audioFormat === 1) is supported. Non-PCM, non-WAV, or
// truncated headers must return null so the caller can skip the
// surplus update without crashing the pipeline.

import { describe, it, expect } from "vitest";
import { parseWavDurationMs } from "../lib/audio/wav-duration";

// Build a minimal but well-formed RIFF/WAVE header for a PCM track of
// the requested shape. Returns the header bytes WITHOUT a data
// payload — duration is computed from dataSize alone, so the audio
// bytes themselves are not required for the parser to be exercised.
function makeWavHeader(opts: {
  numChannels: number;
  sampleRate: number;
  bitsPerSample: number;
  durationSec: number;
  audioFormat?: number;
  dataChunkSizeOverride?: number;
}): Buffer {
  const { numChannels, sampleRate, bitsPerSample, durationSec } = opts;
  const audioFormat = opts.audioFormat ?? 1; // PCM
  const bytesPerSample = bitsPerSample / 8;
  const dataSize = opts.dataChunkSizeOverride ?? Math.floor(
    durationSec * numChannels * sampleRate * bytesPerSample,
  );
  const fmtSize = 16;
  const header = Buffer.alloc(12 + 8 + fmtSize + 8);
  let o = 0;
  header.write("RIFF", o); o += 4;
  header.writeUInt32LE(36 + dataSize, o); o += 4;
  header.write("WAVE", o); o += 4;
  // fmt chunk
  header.write("fmt ", o); o += 4;
  header.writeUInt32LE(fmtSize, o); o += 4;
  header.writeUInt16LE(audioFormat, o); o += 2;
  header.writeUInt16LE(numChannels, o); o += 2;
  header.writeUInt32LE(sampleRate, o); o += 4;
  header.writeUInt32LE(numChannels * sampleRate * bytesPerSample, o); o += 4; // byteRate
  header.writeUInt16LE(numChannels * bytesPerSample, o); o += 2; // blockAlign
  header.writeUInt16LE(bitsPerSample, o); o += 2;
  // data chunk header
  header.write("data", o); o += 4;
  header.writeUInt32LE(dataSize, o); o += 4;
  return header;
}

describe("parseWavDurationMs", () => {
  it("returns the right duration for a 16-bit mono 44.1kHz track", () => {
    const buf = makeWavHeader({
      numChannels: 1,
      sampleRate: 44_100,
      bitsPerSample: 16,
      durationSec: 5,
    });
    const ms = parseWavDurationMs(buf);
    expect(ms).not.toBeNull();
    expect(ms!).toBeCloseTo(5000, 1);
  });

  it("returns the right duration for a 16-bit stereo 44.1kHz track", () => {
    const buf = makeWavHeader({
      numChannels: 2,
      sampleRate: 44_100,
      bitsPerSample: 16,
      durationSec: 3,
    });
    const ms = parseWavDurationMs(buf);
    expect(ms).not.toBeNull();
    expect(ms!).toBeCloseTo(3000, 1);
  });

  it("handles 8-bit, 24-bit, and 32-bit PCM", () => {
    for (const bits of [8, 24, 32]) {
      const buf = makeWavHeader({
        numChannels: 1,
        sampleRate: 16_000,
        bitsPerSample: bits,
        durationSec: 2,
      });
      const ms = parseWavDurationMs(buf);
      expect(ms).not.toBeNull();
      expect(ms!).toBeCloseTo(2000, 1);
    }
  });

  it("handles unusual sample rates (8kHz, 22.05kHz, 48kHz, 96kHz)", () => {
    for (const rate of [8_000, 22_050, 48_000, 96_000]) {
      const buf = makeWavHeader({
        numChannels: 1,
        sampleRate: rate,
        bitsPerSample: 16,
        durationSec: 1,
      });
      const ms = parseWavDurationMs(buf);
      expect(ms).not.toBeNull();
      expect(ms!).toBeCloseTo(1000, 1);
    }
  });

  it("returns null for non-PCM audio formats (float, extensible)", () => {
    for (const fmt of [3 /* IEEE float */, 0xFFFE /* extensible */, 6 /* A-law */, 7 /* mu-law */]) {
      const buf = makeWavHeader({
        numChannels: 1,
        sampleRate: 44_100,
        bitsPerSample: 16,
        durationSec: 1,
        audioFormat: fmt,
      });
      expect(parseWavDurationMs(buf)).toBeNull();
    }
  });

  it("returns null when the RIFF/WAVE magic is missing", () => {
    const buf = Buffer.from("not a wav file, just text content".repeat(2));
    expect(parseWavDurationMs(buf)).toBeNull();
  });

  it("returns null for an empty buffer", () => {
    expect(parseWavDurationMs(Buffer.alloc(0))).toBeNull();
  });

  it("returns null for a buffer that's just the 12-byte RIFF header", () => {
    const buf = Buffer.from("RIFF\x00\x00\x00\x00WAVE", "ascii");
    expect(parseWavDurationMs(buf)).toBeNull();
  });

  it("returns null when the fmt chunk is truncated", () => {
    // Header + fmt chunk with size < 16 is malformed.
    const header = Buffer.alloc(12 + 8 + 4);
    header.write("RIFF", 0);
    header.writeUInt32LE(100, 4);
    header.write("WAVE", 8);
    header.write("fmt ", 12);
    header.writeUInt32LE(4, 16); // fmt size too small
    expect(parseWavDurationMs(header)).toBeNull();
  });

  it("returns null when data size is 0", () => {
    const buf = makeWavHeader({
      numChannels: 1,
      sampleRate: 44_100,
      bitsPerSample: 16,
      durationSec: 0,
      dataChunkSizeOverride: 0,
    });
    expect(parseWavDurationMs(buf)).toBeNull();
  });

  it("returns null when computed duration exceeds the 10-minute sanity cap", () => {
    // Use an override that pretends a 30-minute track — the parser
    // would compute a huge duration and bail.
    const buf = makeWavHeader({
      numChannels: 1,
      sampleRate: 44_100,
      bitsPerSample: 16,
      durationSec: 1,
      dataChunkSizeOverride: 44_100 * 2 * 60 * 30, // 30 minutes
    });
    expect(parseWavDurationMs(buf)).toBeNull();
  });

  it("accepts Uint8Array input (not just Buffer)", () => {
    const buf = makeWavHeader({
      numChannels: 1,
      sampleRate: 44_100,
      bitsPerSample: 16,
      durationSec: 1,
    });
    const view = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
    const ms = parseWavDurationMs(view);
    expect(ms).not.toBeNull();
    expect(ms!).toBeCloseTo(1000, 1);
  });

  it("tolerates a LIST/INFO chunk between fmt and data", () => {
    // Real-world WAVs often have LIST/INFO chunks. The parser should
    // skip them while still locating the data chunk correctly.
    const fmt = makeWavHeader({
      numChannels: 1,
      sampleRate: 44_100,
      bitsPerSample: 16,
      durationSec: 1,
    });
    const listChunk = Buffer.alloc(8 + 4);
    listChunk.write("LIST", 0);
    listChunk.writeUInt32LE(4, 4);
    listChunk.write("INFO", 8);
    const dataChunk = Buffer.alloc(8 + 44_100 * 2);
    dataChunk.write("data", 0);
    dataChunk.writeUInt32LE(44_100 * 2, 4);
    // We need the fmt chunk's dataSize to reflect the LIST chunk too.
    // Build a fresh header manually: RIFF + fmt + LIST + data
    const out = Buffer.concat([fmt, listChunk, dataChunk]);
    // Fix the RIFF file size to match the total.
    out.writeUInt32LE(out.length - 8, 4);
    const ms = parseWavDurationMs(out);
    expect(ms).not.toBeNull();
    expect(ms!).toBeCloseTo(1000, 1);
  });
});
