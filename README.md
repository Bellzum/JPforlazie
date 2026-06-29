# JPforlazies

The editable dictionary source is CSV:

- `data/categories.csv`: JLPT level, category name, and category description.
- `data/jlpt_n3_n2_quiz_content_300_rows_v1.csv`: vocab and grammar quiz items currently imported by the build script.
- `data/items.csv`: older small sample item file, kept as a reference.

The web app loads generated JSON:

- `data/content.json`

After editing CSV, rebuild JSON:

```sh
node scripts/build-content.mjs
```

For full coverage, keep adding rows until the app coverage panel reaches:

- N3: about 1,500 to 1,800 vocab and 180 to 200 grammar items.
- N2: about 6,000 vocab and 200 grammar items.

Because the app uses `fetch()` to load JSON, run it through a local web server:

```sh
python3 -m http.server 8000
```

Then open:

```text
http://localhost:8000
```

## Deploy on GitHub Pages

This is a static app, so GitHub Pages can host it directly.

1. Rebuild JSON after CSV edits:

```sh
node scripts/build-content.mjs
```

2. Push this folder to a GitHub repository.

3. In GitHub, open the repository settings:

```text
Settings -> Pages -> Build and deployment
```

4. Choose:

```text
Source: Deploy from a branch
Branch: main
Folder: / (root)
```

5. Open the GitHub Pages URL after deployment finishes.

If using GitHub CLI, authenticate first:

```sh
gh auth login -h github.com
```
# JPforlazie
