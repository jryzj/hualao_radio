-- Add AudioBufferConfig.pauseThresholdMs for the live engine's
-- self-throttle when generation (LLM + TTS) is consistently faster
-- than the client can play. When Σ(L2 − L1) across recent TTS units
-- exceeds this value, the engine sleeps (ΣD − A/2) ms before
-- submitting the next unit. 0 disables the throttle entirely.
ALTER TABLE "AudioBufferConfig" ADD COLUMN "pauseThresholdMs" INTEGER NOT NULL DEFAULT 60000;
