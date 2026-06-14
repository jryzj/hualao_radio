-- Add NewsConfig.newsPoolSize to make the A-path's random-sample
-- pool operator-controlled. Was patched into the dev DB via
-- scripts/add-news-pool-size.cjs; production never got the column.
ALTER TABLE "NewsConfig" ADD COLUMN "newsPoolSize" INTEGER NOT NULL DEFAULT 100;
