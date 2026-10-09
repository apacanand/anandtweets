# anandtweets

Static, searchable archive viewer for @anand1512 tweets.

## Build from an X/Twitter archive

1. Copy archive data files into `_archive-data/`:
   - `data/account.js`
   - `data/tweets.js` or `data/tweets-part*.js`
2. Copy tweet media files into `media/`.
3. Run:

```bash
node scripts/build-archive.js
```

The build writes:

- `data/tweets.json` - cleaned tweet data sorted newest first
- `data/meta.json` - generated archive summary
- `data/extras.json` - optional hand-authored details keyed by tweet ID

Open `index.html` through a static server or publish the repository with GitHub Pages.
