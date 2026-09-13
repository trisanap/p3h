# SiHalal — Panduan Aplikasi

Static gallery of step-by-step screenshots for the SiHalal app (`ptsp.halal.go.id`),
with a presentation-mode viewer for walking through the steps.

Two guides:

| Guide | Page | Steps |
|---|---|---|
| Pendaftaran Pelaku Usaha (PU) | `sihalal-pu.html` | 58 |
| Verifikasi P3H | `sihalal-p3h.html` | 9 |

`index.html` is the landing page that links to both.

## Layout

```
index.html            landing page
sihalal-pu.html       PU gallery
sihalal-p3h.html      P3H gallery
build.py              regenerates img/ + assets/manifest.js from the source folders
assets/
  style.css           all styling
  app.js              gallery grid + presentation player
  manifest.js         GENERATED — do not edit by hand
img/pu/*.png          copied screenshots
img/p3h/*.png
```

## Rebuilding

Screenshots live outside this repo. After adding, renaming, or deleting any,
run:

```bash
python3 build.py
```

It copies images into `img/`, removes stale ones, and rewrites
`assets/manifest.js`. Change `SOURCES` at the top of `build.py` if the
originals move.

### Editing captions

Captions are generated from filenames (e.g. `10-sub5-2a.png` → `10 · Sub 5 · 2a`).
To override any of them, add entries to `OVERRIDES` in `build.py`:

```python
OVERRIDES = {
    "pu": {"10-sub9-ok.png": "Pengajuan berhasil dikirim"},
    "p3h": {},
}
```

Then re-run `python3 build.py`.

### Adding a card that links elsewhere

The landing page can also show cards pointing at pages hosted on another site
(the `Langkah Verval Pendamping PPH` card points at `p3jph.biz.id`). Add an
entry to `EXTERNAL_LINKS` in `build.py`:

```python
EXTERNAL_LINKS = [
    {
        "title": "Langkah Verval Pendamping PPH",
        "subtitle": "Short description shown under the title.",
        "url": "https://www.p3jph.biz.id/informasi/cara-verval-p3h",
        "site": "p3jph.biz.id",   # shown on the card so the click is not a surprise
        "tag": "Panduan",
    },
]
```

These render with a glyph panel in place of the thumbnail strip, open in a new
tab, and are not galleries — no images are copied and no viewer is involved.
An empty list removes them entirely.

## The viewer

Click any thumbnail (or **Mulai presentasi**) to open the presentation overlay.

| Key | Action |
|---|---|
| `←` `→` | previous / next step |
| `Space` | play / pause |
| `F` | fullscreen |
| `Esc` | close |

Auto-advance defaults to 5 seconds; the control bar has 3 / 5 / 8 / 12 s.
Playback pauses automatically when the tab loses focus.

Deep links work: `sihalal-pu.html#36` opens straight to step 36, so you can
paste a link to a specific step in a chat or ticket.

Viewers with `prefers-reduced-motion: reduce` get the viewer open but paused,
with no smooth scrolling.

## Previewing locally

No build step and no server needed — `assets/manifest.js` is a plain script,
not a fetch, so the pages work straight off the filesystem. Open `index.html`
in a browser.

## Deploying

The whole tree is static — commit it and serve the repo root. On Cloudflare
Workers, point static assets at the repository root; `_headers` sets caching
(a day for `img/`, five minutes for `assets/`). Those are deliberately short:
filenames are stable step numbers rather than content hashes, so re-capturing
a screenshot reuses the same URL and a long cache would serve the old one.

Each path gets exactly one `Cache-Control` rule on purpose — when several
patterns match, Cloudflare merges their headers and comma-joins duplicates,
which would yield an invalid `Cache-Control` with two `max-age` values.

`.assetsignore` keeps `build.py` and this README from being served (wrangler
>= 3.77.0). Do not add `_headers` to it — Workers parses that file at deploy
time and never serves it as an asset.

## Notes

- Screenshots are redacted where they showed names, addresses, phone numbers,
  email addresses, and registration numbers.
- `01-sub5-1.png` in the source folder was mis-numbered — it is the "Bahan"
  tab of step 10, captured immediately before `10-sub5-1a.png`. `build.py`
  renames it to `10-sub5-1.png` on copy. The original is untouched.
