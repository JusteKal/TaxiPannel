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

**Server-side rendering (recommended for best speed & quality)**
For large jobs or many concurrent users, generate GIFs on the server. Recommended stack and pipeline:

- Stack: Node.js worker (Express + Bull/Redis queue) or Python worker.
- Tools: `sharp` or `libvips` for resize, `ffmpeg` for palette-aware GIF generation, `gifsicle` (or `giflossy`) for final optimization.

Example ffmpeg workflow (frames must be PNG sequence):

```bash
# generate palette
ffmpeg -y -i frames_%04d.png -vf palettegen palette.png
# generate gif with palette for better colors
ffmpeg -i frames_%04d.png -i palette.png -lavfi paletteuse -r 12 output.gif
# optional: optimize further
gifsicle -O3 --lossy=80 output.gif -o output.optim.gif
```

Expose an async `POST /render` endpoint that accepts images and parameters, enqueues a job, and returns a download URL once processing finishes.

**Where to look in the code**
- UI and logic: `index.html`, `styles.css`, `script.js`
- Client-side GIF generation uses `gif.js` (CDN included).

**Contributing / Next steps**
- Integrate server-side frame extraction for source GIFs (gifuct-js or server-side tools).
- Add palette quantization or a server worker for ffmpeg+gifsicle to increase compression.
- Add unit/integration tests for render pipeline if adding a backend.

**License**
- MIT-style (add your preferred license file if needed).
