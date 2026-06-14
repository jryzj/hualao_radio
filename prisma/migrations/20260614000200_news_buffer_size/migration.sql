-- Add NewsConfig.newsBufferSize for the per-theme content buffer
-- (FTS5 + Tavily + random top-up to N items, consumed sequentially
-- across LLM segments). Was patched into the dev DB via
-- scripts/add-news-buffer-size.cjs; production never got the column.
ALTER TABLE "NewsConfig" ADD COLUMN "newsBufferSize" INTEGER NOT NULL DEFAULT 100;
