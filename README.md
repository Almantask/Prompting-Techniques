# Prompting-Techniques
A library of prompting techniques and prompts

The site in this repository is an interactive map of 553 prompting techniques, grouped into 6 pillars, 19 families and 96 groups. Click a node to open it and read its description and origin, search by name, author or keyword, and share a link to any technique (for example `index.html#f1t1`).

## Run it locally

The page loads its data with `fetch`, so it has to be served over HTTP rather than opened from disk. From the repository root, run either of these:

```bash
npx serve .
```

```bash
python -m http.server 8000
```

## Deployment

GitHub Actions checks and deploys the site ([`.github/workflows/deploy.yml`](.github/workflows/deploy.yml)):

- **Every push and pull request** validates `data/techniques.json` and checks the script's syntax.
- **Every push to `main`** then publishes `index.html`, `assets/` and `data/` to GitHub Pages. You can also start a deploy by hand from the **Actions** tab with **Run workflow**.

One-time setup: in the repository's **Settings › Pages**, set **Source** to **GitHub Actions**.

To run the data check yourself before pushing:

```bash
node scripts/validate-data.mjs
```

## Files

| Path | What it holds |
| --- | --- |
| `index.html` | Page structure |
| `assets/styles.css` | Styles |
| `assets/app.js` | Tree layout, search, details panel and deep links |
| `data/techniques.json` | The technique tree |
| `scripts/validate-data.mjs` | Data check run by CI |
| `.github/workflows/deploy.yml` | CI and deployment to GitHub Pages |

## Editing the techniques

`data/techniques.json` is one nested tree: `root` › `pillar` › `family` › `group` › `technique`. Every node has an `id`, `name` and `kind`. The optional fields are:

- `color`: pillars only (children inherit it)
- `full`: a longer title shown in the details panel
- `desc`: the description
- `origin`: who introduced the technique, or where it comes from
- `flag`: set to `"Unproven"` to mark a technique with no evidence yet that it works

Counts in the header and details panel are computed from the tree, so they update on their own when techniques are added or removed. Keep every `id` unique, because links use it.
