const PAGE_SIZE = 40;

const state = {
  tweets: [],
  extras: {},
  filtered: [],
  rendered: 0,
  query: "",
  year: "all",
};

const elements = {
  summary: document.querySelector("#archiveSummary"),
  search: document.querySelector("#searchInput"),
  year: document.querySelector("#yearFilter"),
  clear: document.querySelector("#clearFilters"),
  resultCount: document.querySelector("#resultCount"),
  mediaCount: document.querySelector("#mediaCount"),
  timeline: document.querySelector("#timeline"),
  sentinel: document.querySelector("#sentinel"),
  template: document.querySelector("#tweetTemplate"),
};

const formatter = new Intl.DateTimeFormat("en", {
  year: "numeric",
  month: "short",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  timeZoneName: "short",
});

function formatNumber(value) {
  return Number(value || 0).toLocaleString("en-US");
}

function tweetYear(tweet) {
  return String(new Date(tweet.createdAt).getUTCFullYear());
}

function searchBlob(tweet) {
  return [
    tweet.text,
    tweet.url,
    ...(tweet.hashtags || []),
    ...(tweet.mentions || []).map((mention) => mention.screenName),
    ...(tweet.links || []).map((link) => `${link.expandedUrl} ${link.displayUrl}`),
  ]
    .join(" ")
    .toLowerCase();
}

function applyFilters() {
  const query = state.query.trim().toLowerCase();
  state.filtered = state.tweets.filter((tweet) => {
    const matchesYear = state.year === "all" || tweetYear(tweet) === state.year;
    const matchesQuery = !query || searchBlob(tweet).includes(query);
    return matchesYear && matchesQuery;
  });
  state.rendered = 0;
  elements.timeline.replaceChildren();
  updateStats();
  renderNextPage();
}

function updateStats() {
  const mediaCount = state.filtered.reduce((sum, tweet) => sum + (tweet.media || []).length, 0);
  elements.resultCount.textContent = `${formatNumber(state.filtered.length)} tweets`;
  elements.mediaCount.textContent = `${formatNumber(mediaCount)} media files`;
}

function textNode(value) {
  return document.createTextNode(value);
}

function createLink(url, label) {
  const link = document.createElement("a");
  link.href = url;
  link.textContent = label || url;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  return link;
}

function renderMedia(container, media) {
  container.replaceChildren();
  for (const item of media || []) {
    if (item.type === "video") {
      const video = document.createElement("video");
      video.src = item.file;
      video.controls = true;
      video.preload = "none";
      container.append(video);
    } else {
      const image = document.createElement("img");
      image.src = item.file;
      image.loading = "lazy";
      image.alt = item.alt || "Tweet media";
      container.append(image);
    }
  }
  container.hidden = !media || media.length === 0;
}

function renderLinks(container, links) {
  container.replaceChildren();
  for (const link of links || []) {
    container.append(createLink(link.expandedUrl, link.displayUrl || link.expandedUrl));
  }
  container.hidden = !links || links.length === 0;
}

function renderExtra(details, tweet) {
  const extra = state.extras[tweet.id];
  if (!extra) {
    details.hidden = true;
    return;
  }

  details.hidden = false;
  const body = details.querySelector(".tweet-extra-body");
  body.replaceChildren();

  if (extra.title) {
    const title = document.createElement("strong");
    title.textContent = extra.title;
    body.append(title, document.createElement("br"));
  }
  if (extra.body) {
    body.append(textNode(extra.body), document.createElement("br"));
  }
  for (const link of extra.links || []) {
    body.append(createLink(link.url, link.label || link.url), document.createElement("br"));
  }
}

function renderTweet(tweet) {
  const node = elements.template.content.firstElementChild.cloneNode(true);
  const date = node.querySelector(".tweet-date");
  const tweetDate = new Date(tweet.createdAt);

  date.href = tweet.url;
  date.target = "_blank";
  date.textContent = formatter.format(tweetDate);
  node.querySelector(".tweet-id").textContent = `Tweet ID ${tweet.id}`;
  node.querySelector(".tweet-open").href = tweet.url;
  node.querySelector(".tweet-text").textContent = tweet.text || "[No text in archive entry]";
  renderMedia(node.querySelector(".tweet-media"), tweet.media);
  renderLinks(node.querySelector(".tweet-links"), tweet.links);

  node.querySelector(".tweet-metrics").replaceChildren(
    textNode(`Likes ${formatNumber(tweet.metrics?.likes)}`),
    textNode(`Retweets ${formatNumber(tweet.metrics?.retweets)}`),
    textNode(`Replies ${formatNumber(tweet.metrics?.replies)}`),
  );
  renderExtra(node.querySelector(".tweet-extra"), tweet);
  return node;
}

function renderNextPage() {
  const next = state.filtered.slice(state.rendered, state.rendered + PAGE_SIZE);
  if (!next.length) return;
  const fragment = document.createDocumentFragment();
  for (const tweet of next) {
    fragment.append(renderTweet(tweet));
  }
  elements.timeline.append(fragment);
  state.rendered += next.length;
}

function setupYears(meta) {
  for (const year of meta.years || []) {
    const option = document.createElement("option");
    option.value = String(year);
    option.textContent = String(year);
    elements.year.append(option);
  }
}

function bindEvents() {
  elements.search.addEventListener("input", () => {
    state.query = elements.search.value;
    applyFilters();
  });
  elements.year.addEventListener("change", () => {
    state.year = elements.year.value;
    applyFilters();
  });
  elements.clear.addEventListener("click", () => {
    elements.search.value = "";
    elements.year.value = "all";
    state.query = "";
    state.year = "all";
    applyFilters();
  });

  const observer = new IntersectionObserver((entries) => {
    if (entries.some((entry) => entry.isIntersecting)) renderNextPage();
  });
  observer.observe(elements.sentinel);
}

async function loadArchive() {
  const [tweets, extras, meta] = await Promise.all([
    fetch("data/tweets.json").then((response) => response.json()),
    fetch("data/extras.json").then((response) => response.json()),
    fetch("data/meta.json").then((response) => response.json()),
  ]);

  state.tweets = tweets;
  state.extras = extras;
  setupYears(meta);
  elements.summary.textContent = `${formatNumber(meta.tweetCount)} tweets from ${meta.years.at(-1)}-${meta.years[0]}, with ${formatNumber(meta.mediaCount)} matched media files. Search runs locally in your browser.`;
  bindEvents();
  applyFilters();
}

loadArchive().catch((error) => {
  elements.summary.textContent = `Could not load archive data: ${error.message}`;
});
