# Flashcards

Static offline-first Italian flashcards for French speakers.

## Files

- `flashcards/`: hosted static app for Vercel, including service worker and manifest.
- `dist/flashcards.html`: standalone single-file export for local offline use.
- `scripts/build-standalone.mjs`: rebuilds the standalone export from the hosted source files.

## Build the standalone file

```bash
node scripts/build-standalone.mjs
```

## Deploy on Vercel

Deploy the repo as a static project. Vercel will serve `flashcards/index.html` at `/flashcards/`, and `vercel.json` redirects `/flashcards.html` to the new route.
