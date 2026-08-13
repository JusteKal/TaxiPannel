# TaxiPannel

**Purpose**
- Simple client-side tool to "pannelise" images (4-quadrant panel layout) and export an animated GIF. Supports multiple images per panel, transition duration, display duration, scale, GIF quality and simple frame deduplication to reduce file size.

**Features**
- Drag & drop or file input for two image panels.
- Per-panel image ordering and removal.
- Animation parameters: display duration, transition duration, fps.
- Compression/size controls: output scale, GIF quality, skip similar frames.
- Client-side GIF generation (gif.js) with progressive feedback.

**Prerequisites**
- No build step required; site is static HTML/CSS/JS.
- Optional (local dev): `live-server` or Python 3 for serving files.
- Optional (server rendering, recommended for heavy jobs): `ffmpeg`, `gifsicle` and a Node/Python backend.

**Quick start (local)**
1. Open the project folder in VS Code.
2. Serve the folder and open in browser:

- Using Python 3 (simple):

```bash
python -m http.server 5500
# then open http://localhost:5500/
```

- Using `live-server` (npm):

```bash
npx live-server --port=5500
```

3. Open the page, add images to the two panels, configure parameters and click "Générer le GIF".

**Usage tips to reduce GIF size with minimal quality loss**
- Lower `Échelle sortie` (50% or 25%) to reduce pixel count.
- Reduce `Fluidité (images/s)` (8–12 recommended).
- Increase `Ignorer trames similaires (%)` to coalesce near-identical frames (2–10%).
- Tune `Qualité GIF` (worker `gif.js` exposes a numeric `quality` option).

**Where to look in the code**
- UI and logic: `index.html`, `styles.css`, `script.js`
- Client-side GIF generation uses `gif.js` (CDN included).

**Contributing / Next steps**
- Integrate server-side frame extraction for source GIFs (gifuct-js or server-side tools).
- Add palette quantization or a server worker for ffmpeg+gifsicle to increase compression.

**License**
- MIT-style (add your preferred license file if needed).
