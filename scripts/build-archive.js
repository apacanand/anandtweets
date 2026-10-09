const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const rawDir = path.join(root, "_archive-data");
const publicDataDir = path.join(root, "data");
const mediaDir = path.join(root, "media");

const startDate = new Date("2010-01-01T00:00:00.000Z");
const endDate = new Date("2026-10-09T23:59:59.999+05:30");

function readArchiveArray(filePath, ytdName) {
  const raw = fs.readFileSync(filePath, "utf8");
  const prefix = new RegExp(`^window\\.YTD\\.${ytdName}\\.part\\d+\\s*=\\s*`);
  return JSON.parse(raw.replace(prefix, ""));
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function parseCount(value) {
  const parsed = Number.parseInt(value ?? "0", 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeText(value) {
  return String(value || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .trim();
}

function replaceUrls(text, urls) {
  let expanded = text;
  for (const item of urls || []) {
    if (item.url && item.expanded_url) {
      expanded = expanded.split(item.url).join(item.expanded_url);
    }
  }
  return expanded;
}

function displayUrl(item) {
  return item.display_url || item.expanded_url || item.url || "";
}

function mediaKind(fileName) {
  const ext = path.extname(fileName).toLowerCase();
  if ([".mp4", ".mov", ".m4v"].includes(ext)) return "video";
  return "photo";
}

function listMediaByTweetId() {
  const result = new Map();
  if (!fs.existsSync(mediaDir)) return result;

  for (const fileName of fs.readdirSync(mediaDir)) {
    const match = fileName.match(/^(\d+)-(.+)$/);
    if (!match) continue;
    const tweetId = match[1];
    if (!result.has(tweetId)) result.set(tweetId, []);
    const stat = fs.statSync(path.join(mediaDir, fileName));
    result.get(tweetId).push({
      type: mediaKind(fileName),
      file: `media/${fileName}`,
      alt: "",
      bytes: stat.size,
    });
  }

  for (const media of result.values()) {
    media.sort((a, b) => a.file.localeCompare(b.file));
  }
  return result;
}

function tweetFiles() {
  return fs
    .readdirSync(rawDir)
    .filter((file) => /^tweets(?:-part\d+)?\.js$/.test(file))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

ensureDir(publicDataDir);

const accountPath = path.join(rawDir, "account.js");
const account = fs.existsSync(accountPath)
  ? readArchiveArray(accountPath, "account")[0]?.account || {}
  : {};
const username = account.username || "anand1512";
const mediaByTweetId = listMediaByTweetId();

const tweets = [];
for (const file of tweetFiles()) {
  const part = readArchiveArray(path.join(rawDir, file), "tweets");
  for (const item of part) {
    const tweet = item.tweet || item;
    const id = tweet.id_str || tweet.id;
    const createdAt = new Date(tweet.created_at);
    if (!id || createdAt < startDate || createdAt > endDate) continue;

    const urls = (tweet.entities?.urls || []).map((url) => ({
      url: url.url,
      expandedUrl: url.expanded_url || url.url,
      displayUrl: displayUrl(url),
    }));

    const rawText = normalizeText(tweet.full_text || tweet.text || "");
    const text = replaceUrls(rawText, tweet.entities?.urls);
    const media = mediaByTweetId.get(id) || [];

    tweets.push({
      id,
      createdAt: createdAt.toISOString(),
      text,
      rawText,
      url: `https://x.com/${username}/status/${id}`,
      lang: tweet.lang || "",
      source: tweet.source || "",
      metrics: {
        likes: parseCount(tweet.favorite_count),
        retweets: parseCount(tweet.retweet_count),
        replies: parseCount(tweet.reply_count),
      },
      links: urls,
      hashtags: (tweet.entities?.hashtags || []).map((tag) => tag.text).filter(Boolean),
      mentions: (tweet.entities?.user_mentions || []).map((mention) => ({
        name: mention.name || "",
        screenName: mention.screen_name || "",
      })),
      media,
      hasDetails: false,
    });
  }
}

tweets.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt) || b.id.localeCompare(a.id));

const extrasPath = path.join(publicDataDir, "extras.json");
if (!fs.existsSync(extrasPath)) {
  fs.writeFileSync(
    extrasPath,
    JSON.stringify(
      {
        "_example_tweet_id": {
          "title": "Optional detail title",
          "body": "Add extra context for a selected tweet here. Delete or replace this sample entry.",
          "links": [{ "label": "Related link", "url": "https://example.com" }],
          "media": []
        }
      },
      null,
      2,
    ) + "\n",
  );
}

const extras = JSON.parse(fs.readFileSync(extrasPath, "utf8"));
for (const tweet of tweets) {
  tweet.hasDetails = Boolean(extras[tweet.id]);
}

const years = [...new Set(tweets.map((tweet) => new Date(tweet.createdAt).getUTCFullYear()))].sort(
  (a, b) => b - a,
);
const totalMedia = tweets.reduce((sum, tweet) => sum + tweet.media.length, 0);

fs.writeFileSync(path.join(publicDataDir, "tweets.json"), JSON.stringify(tweets, null, 2) + "\n");
fs.writeFileSync(
  path.join(publicDataDir, "meta.json"),
  JSON.stringify(
    {
      username,
      accountId: account.accountId || "",
      displayName: account.accountDisplayName || username,
      generatedAt: new Date().toISOString(),
      dateRange: {
        start: startDate.toISOString(),
        end: endDate.toISOString(),
      },
      tweetCount: tweets.length,
      mediaCount: totalMedia,
      years,
    },
    null,
    2,
  ) + "\n",
);

console.log(
  JSON.stringify(
    {
      tweets: tweets.length,
      media: totalMedia,
      years: years.length,
      output: path.relative(process.cwd(), publicDataDir),
    },
    null,
    2,
  ),
);
