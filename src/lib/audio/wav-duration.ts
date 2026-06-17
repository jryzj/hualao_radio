// Minimal RIFF/WAVE duration parser. Used by the live audio engine to
// measure how long a ComfyUI-produced audio segment will play on the
// client (L2 in the generation-pacing algorithm). The server doesn't
// otherwise know the audio length — the client probes it via
// HTMLAudioElement / AudioBuffer.duration after delivery, but the
// engine needs L2 on the server to decide when to self-throttle.
//
// Only PCM (audioFormat === 1) is supported. ComfyUI's omni-voice
// workflow outputs PCM WAV, so the omni-voice path is always parseable.
// Non-WAV or non-PCM blobs return null so the caller can skip the
// surplus update without crashing the pipeline.

const MAX_DURATION_MS = 600_000; // 10 min — anything longer is almost certainly a parse error

// Read a 4-byte ASCII tag from `buf` at `offset`. Returns null if the
// buffer is too short.
function readAscii(buf: Buffer, offset: number, length: number): string | null {
  if (offset + length > buf.length) return null;
  return buf.toString("ascii", offset, offset + length);
}

export function parseWavDurationMs(buf: Buffer | Uint8Array): number | null {
  const b = Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
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
      audioFormat = b.readUInt16LE(payload); // 1 = PCM
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

  if (audioFormat !== 1) return null;
  if (numChannels <= 0 || sampleRate <= 0 || bitsPerSample <= 0) return null;
  if (dataSize <= 0) return null;

  // bytes / (channels * sampleRate * bitsPerSample/8) = seconds
  const bytesPerSecond = numChannels * sampleRate * (bitsPerSample / 8);
  if (!Number.isFinite(bytesPerSecond) || bytesPerSecond <= 0) return null;
  const durationMs = (dataSize * 1000) / bytesPerSecond;
  if (!Number.isFinite(durationMs) || durationMs <= 0 || durationMs > MAX_DURATION_MS) return null;

  return durationMs;
}
