// Minimal audio duration parser. Used by the live audio engine to
// measure how long a ComfyUI-produced audio segment will play on the
// client (L2 in the generation-pacing algorithm). The server doesn't
// otherwise know the audio length — the client probes it via
// HTMLAudioElement / AudioBuffer.duration after delivery, but the
// engine needs L2 on the server to decide when to self-throttle.
//
// Supports three formats that ComfyUI's omni-voice workflow can emit:
//
//   1. RIFF/WAVE with PCM (audioFormat === 1)         — classic 16-bit
//   2. RIFF/WAVE with IEEE float (audioFormat === 3)  — 32-bit float
//      (used when the bf16-model native path skips the int conversion)
//   3. FLAC (`fLaC` magic)                            — lossless
//      compression of float audio, emitted by ComfyUI's PreviewAudio
//      node when the workflow produces multi-megabyte float buffers
//
// Other audio types (A-law, μ-law, WAVE_FORMAT_EXTENSIBLE, MP3, OGG,
// Opus) return null so the caller can skip the surplus update without
// crashing the pipeline.

const MAX_DURATION_MS = 600_000; // 10 min — anything longer is almost certainly a parse error

// Read a 4-byte ASCII tag from `buf` at `offset`. Returns null if the
// buffer is too short.
function readAscii(buf: Buffer, offset: number, length: number): string | null {
  if (offset + length > buf.length) return null;
  return buf.toString("ascii", offset, offset + length);
}

// Parse the RIFF/WAVE header for the `data` chunk size + the
// `fmt ` chunk's (sampleRate, numChannels, bitsPerSample, audioFormat).
// See spec: http://soundfile.sapp.org/doc/WaveFormat/
function parseRiffWavDurationMs(b: Buffer): number | null {
  if (b.length < 44) return null;

  // RIFF header
  const riff = readAscii(b, 0, 4);
  const wave = readAscii(b, 8, 4);
  if (riff !== "RIFF" || wave !== "WAVE") return null;

  // Walk chunks: each is 4-byte id + 4-byte LE size + payload. We're
  // looking for `fmt ` (codec info) and `data` (audio bytes). Stop on
  // end-of-buffer or after a chunk whose size would overflow.
  let offset = 12;
  let numChannels = 0;
  let sampleRate = 0;
  let bitsPerSample = 0;
  let audioFormat = 0;
  let dataSize = 0;

  while (offset + 8 <= b.length) {
    const id = readAscii(b, offset, 4);
    const size = b.readUInt32LE(offset + 4);
    if (id === null) return null;
    // The fmt chunk's payload is read directly; for other chunks we
    // don't care about the payload bytes (the data chunk's `size`
    // field IS the answer we want, and we don't need the audio
    // samples themselves). For non-fmt chunks, only require that the
    // 8-byte chunk header fits in the buffer — anything more is
    // optional for our purposes.
    if (id === "fmt ") {
      if (size < 16) return null;
      const payload = offset + 8;
      if (payload + size > b.length) return null;
      audioFormat = b.readUInt16LE(payload); // 1 = PCM, 3 = IEEE float
      numChannels = b.readUInt16LE(payload + 2);
      sampleRate = b.readUInt32LE(payload + 4);
      bitsPerSample = b.readUInt16LE(payload + 14);
    } else if (id === "data") {
      // Duration is fully determined by (dataSize, sampleRate,
      // numChannels, bitsPerSample). The audio bytes themselves
      // would just confirm what the header already says, so a
      // header-only WAV (common in our pipeline — we sometimes
      // only see the metadata region) still parses cleanly.
      dataSize = size;
      // We don't need to walk past the data chunk — subsequent chunks
      // (LIST/INFO/JUNK/etc.) don't affect duration.
      break;
    }

    // Chunks are word-aligned: the payload occupies `size` bytes, then
    // a 0/1 padding byte to land on the next 2-byte boundary.
    // `size` is read from the chunk header (always present), so we
    // don't need the actual payload to be in the buffer.
    offset += 8 + size + (size % 2);
  }

  // PCM (1) and IEEE float (3) both have a constant
  // bytesPerSample = bitsPerSample/8 — duration math is identical.
  // Other formats (A-law, μ-law, extensible) need different handling
  // and are intentionally not supported yet.
  if (audioFormat !== 1 && audioFormat !== 3) return null;
  if (numChannels <= 0 || sampleRate <= 0 || bitsPerSample <= 0) return null;
  if (dataSize <= 0) return null;

  // bytes / (channels * sampleRate * bitsPerSample/8) = seconds
  const bytesPerSecond = numChannels * sampleRate * (bitsPerSample / 8);
  if (!Number.isFinite(bytesPerSecond) || bytesPerSecond <= 0) return null;
  const durationMs = (dataSize * 1000) / bytesPerSecond;
  if (!Number.isFinite(durationMs) || durationMs <= 0 || durationMs > MAX_DURATION_MS) return null;

  return durationMs;
}

// Parse the FLAC STREAMINFO block. Layout (all big-endian):
//
//   offset 0-3:  "fLaC" magic
//   offset 4:    block type (bits 6-0); bit 7 = "is last metadata block"
//   offset 5-7:  block length in bytes (24 bits, always 34 for STREAMINFO)
//   offset 8-9:  minimum block size (samples per block)
//   offset 10-11: maximum block size
//   offset 12-14: minimum frame size (bytes)
//   offset 15-17: maximum frame size (bytes)
//   offset 18-25: 8 packed bytes, big-endian bit fields:
//                 sample rate (20) | channels-1 (3) | bps-1 (5) | total samples (36)
//   offset 26-41: MD5 signature of unencoded audio
//
// See spec: https://xiph.org/flac/format.html#metadata_block_streaminfo
function parseFlacDurationMs(b: Buffer): number | null {
  // Need at least 4 (magic) + 4 (block header) + 18 (up to packed
  // bytes) = 26 bytes to extract duration. We require the full
  // 42-byte STREAMINFO for a "proper" file but tolerate slightly
  // truncated inputs as long as the packed bytes are present.
  if (b.length < 26) return null;

  // Per spec the first metadata block is ALWAYS STREAMINFO. We don't
  // care whether it's the last block (high bit set) — we just need
  // the duration fields. Mask off the high bit before comparing.
  const blockType = b[4] & 0x7f;
  if (blockType !== 0) return null;
  // blockLength is informational; we only need the 18 bytes from
  // the start of the block, not the full 34. The 24-bit length is
  // required by spec to be 34 for STREAMINFO but we don't validate
  // strictly — some encoders might write a different value and we
  // still want to compute duration from the packed 8 bytes.

  // Unpack the 8 packed bytes at offset 18. Layout (MSB first):
  //   bits 63-44: sample rate (20 bits, Hz)
  //   bits 43-41: channels - 1 (3 bits)
  //   bits 40-36: bits per sample - 1 (5 bits)
  //   bits 35-0:  total samples in stream (36 bits)
  // Use BigInt() wrapper instead of literal `0xfn` / `44n` so this
  // compiles under tsconfig target ES2017 (BigInt literals need
  // ES2020). The runtime behavior is identical.
  const packed = b.readBigUInt64BE(18);
  const SR_SHIFT = BigInt(44);
  const CH_SHIFT = BigInt(41);
  const BPS_SHIFT = BigInt(36);
  const SR_MASK = BigInt(0xfffff);
  const CH_MASK = BigInt(0x7);
  const BPS_MASK = BigInt(0x1f);
  const TS_MASK = BigInt(0xfffffffff);
  const sampleRate = Number((packed >> SR_SHIFT) & SR_MASK);
  const channels = Number((packed >> CH_SHIFT) & CH_MASK) + 1;
  const bps = Number((packed >> BPS_SHIFT) & BPS_MASK) + 1;
  const totalSamples = Number(packed & TS_MASK);

  if (sampleRate <= 0) return null;
  // totalSamples === 0 means "unknown" per FLAC spec (some live
  // stream encoders do this) — we genuinely can't compute duration
  // without it, so return null and let the caller skip the surplus.
  if (totalSamples <= 0) return null;
  if (channels < 1 || channels > 8) return null;
  if (bps < 4 || bps > 32) return null;

  // durationSec = totalSamples / sampleRate
  const durationMs = (totalSamples * 1000) / sampleRate;
  if (!Number.isFinite(durationMs) || durationMs <= 0 || durationMs > MAX_DURATION_MS) return null;

  return durationMs;
}

export function parseWavDurationMs(buf: Buffer | Uint8Array): number | null {
  const b = Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
  if (b.length < 4) return null;

  // FLAC magic: "fLaC" (0x66 0x4C 0x61 0x43). ComfyUI's PreviewAudio
  // node emits this when the upstream float audio is large enough
  // that lossless compression beats a WAV container.
  if (
    b[0] === 0x66 && b[1] === 0x4c && b[2] === 0x61 && b[3] === 0x43
  ) {
    return parseFlacDurationMs(b);
  }

  return parseRiffWavDurationMs(b);
}
