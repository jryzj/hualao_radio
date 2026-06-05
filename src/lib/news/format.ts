// News context formatter
// Pure functions, no I/O. Renders an array of news items into the
// `{{news}}` placeholder string for the LLM prompt.

export interface NewsItemInput {
  title: string;
  contentMd: string;
  link: string;
  sourceTitle: string;
  publishedAt: Date | null;
  fetchedAt: Date;
}

export interface FormatOptions {
  maxItems?: number;
  maxItemChars?: number;
  maxTotalChars?: number;
}

const DEFAULTS: Required<FormatOptions> = {
  maxItems: 3,
  maxItemChars: 2000,
  maxTotalChars: 5000,
};

function timeAgo(date: Date | null, now: Date = new Date()): string {
  if (!date) return "未知时间";
  const diffMs = now.getTime() - date.getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function formatNewsContext(
  items: NewsItemInput[],
  options: FormatOptions = {},
): string {
  const opts = { ...DEFAULTS, ...options };
  if (items.length === 0) return "";

  const sorted = [...items].sort((a, b) => {
    const aTime = (a.publishedAt ?? a.fetchedAt).getTime();
    const bTime = (b.publishedAt ?? b.fetchedAt).getTime();
    return bTime - aTime;
  });

  const blocks: string[] = [];
  const sliced = sorted.slice(0, opts.maxItems);
  for (let i = 0; i < sliced.length; i++) {
    const item = sliced[i];
    const content =
      item.contentMd.length > opts.maxItemChars
        ? item.contentMd.substring(0, opts.maxItemChars) + "... [truncated]"
        : item.contentMd;
    const block = `[${i + 1}] ${item.title} (来源: ${item.sourceTitle || "未知"}, ${timeAgo(item.publishedAt)})\n${content}\n链接: ${item.link}`;
    blocks.push(block);
  }

  const joined = blocks.join("\n\n");
  if (joined.length > opts.maxTotalChars) {
    return joined.substring(0, opts.maxTotalChars) + "... [truncated]";
  }
  return joined;
}
