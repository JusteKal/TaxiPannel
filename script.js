// ------------------------------------------------------------------
// Éléments DOM
// ------------------------------------------------------------------
const inputX = document.getElementById('input-x');
const inputY = document.getElementById('input-y');
const dropzoneX = document.getElementById('dropzone-x');
const dropzoneY = document.getElementById('dropzone-y');
const galleryX = document.getElementById('gallery-x');
const galleryY = document.getElementById('gallery-y');
 
const displayDurationInput = document.getElementById('display-duration');
const transitionDurationInput = document.getElementById('transition-duration');
const fpsSelect = document.getElementById('fps-select');
const estimateText = document.getElementById('estimate-text');
const scaleSelect = document.getElementById('scale-select');
const gifQualityInput = document.getElementById('gif-quality');
const skipSimilarityInput = document.getElementById('skip-similarity');
 
const mergeBtn = document.getElementById('merge-btn');
const downloadBtn = document.getElementById('download-btn');
const outputPreview = document.getElementById('output-preview');
 
const progressWrap = document.getElementById('progress-wrap');
const progressFill = document.getElementById('progress-fill');
const progressText = document.getElementById('progress-text');
 
// ------------------------------------------------------------------
// État
// ------------------------------------------------------------------
const galleries = { x: [], y: [] };
let idCounter = 0;
let outputBlob = null;
let cachedWorkerURL = null;
 
const PANEL_WIDTH = 256;
const PANEL_HEIGHT = 128;
const MAX_RECOMMENDED_FRAMES = 600;
 
// ------------------------------------------------------------------
// Chargement / prévisualisation des images
// ------------------------------------------------------------------
function loadImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = reader.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
 
async function addFilesToGallery(fileList, key) {
  const files = Array.from(fileList || []).filter(f => f.type.startsWith('image/'));
  for (const file of files) {
    try {
      const img = await loadImage(file);
      galleries[key].push({ id: 'img' + (idCounter++), img, name: file.name });
    } catch (err) {
      console.error('Erreur de chargement image :', err);
    }
  }
  renderGallery(key);
  updateEstimate();
  updateGenerateButton();
}
 
function renderGallery(key) {
  const container = key === 'x' ? galleryX : galleryY;
  const items = galleries[key];
  container.innerHTML = '';
 
  if (items.length === 0) {
    const empty = document.createElement('span');
    empty.className = 'gallery-empty';
    empty.textContent = 'Aucune image ajoutée';
    container.appendChild(empty);
    return;
  }
 
  items.forEach((item, index) => {
    const thumb = document.createElement('div');
    thumb.className = 'thumb';
    thumb.dataset.id = item.id;
    thumb.innerHTML = `
      <span class="thumb-index">${index + 1}</span>
      <img src="${item.img.src}" alt="${item.name}">
      <div class="thumb-controls">
        <button type="button" data-action="up" title="Monter">▲</button>
        <button type="button" data-action="down" title="Descendre">▼</button>
        <button type="button" data-action="remove" title="Supprimer">✕</button>
      </div>`;
    container.appendChild(thumb);
  });
}
 
function handleGalleryClick(event, key) {
  const btn = event.target.closest('button');
  if (!btn) return;
  const thumb = event.target.closest('.thumb');
  if (!thumb) return;
  const arr = galleries[key];
  const idx = arr.findIndex(it => it.id === thumb.dataset.id);
  if (idx === -1) return;
 
  const action = btn.dataset.action;
  if (action === 'remove') {
    arr.splice(idx, 1);
  } else if (action === 'up' && idx > 0) {
    [arr[idx - 1], arr[idx]] = [arr[idx], arr[idx - 1]];
  } else if (action === 'down' && idx < arr.length - 1) {
    [arr[idx + 1], arr[idx]] = [arr[idx], arr[idx + 1]];
  }
  renderGallery(key);
  updateEstimate();
  updateGenerateButton();
}
 
galleryX.addEventListener('click', (e) => handleGalleryClick(e, 'x'));
galleryY.addEventListener('click', (e) => handleGalleryClick(e, 'y'));
 
function updateGenerateButton() {
  mergeBtn.disabled = galleries.x.length === 0 || galleries.y.length === 0;
}
 
// ------------------------------------------------------------------
// Entrées fichiers / drag & drop
// ------------------------------------------------------------------
inputX.addEventListener('change', (event) => {
  addFilesToGallery(event.target.files, 'x');
  event.target.value = '';
});
inputY.addEventListener('change', (event) => {
  addFilesToGallery(event.target.files, 'y');
  event.target.value = '';
});
 
[dropzoneX, dropzoneY].forEach((zone) => {
  zone.addEventListener('dragover', (event) => {
    event.preventDefault();
    zone.classList.add('dragover');
  });
  zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
});
 
dropzoneX.addEventListener('drop', (event) => {
  event.preventDefault();
  dropzoneX.classList.remove('dragover');
  addFilesToGallery(event.dataTransfer.files, 'x');
});
dropzoneY.addEventListener('drop', (event) => {
  event.preventDefault();
  dropzoneY.classList.remove('dragover');
  addFilesToGallery(event.dataTransfer.files, 'y');
});
 
// ------------------------------------------------------------------
// Réglages / estimation
// ------------------------------------------------------------------
function gcd(a, b) { return b === 0 ? a : gcd(b, a % b); }
function lcm(a, b) { return (a * b) / gcd(a, b); }
function mod(a, b) { return ((a % b) + b) % b; }
 
function getSettings() {
  const displayDur = Math.max(0.1, parseFloat(displayDurationInput.value) || 3);
  const transDur = Math.max(0, parseFloat(transitionDurationInput.value) || 0);
  const fps = parseInt(fpsSelect.value, 10) || 12;
  const scale = parseFloat(scaleSelect.value) || 1;
  const gifQuality = Math.max(1, parseInt(gifQualityInput.value, 10) || 10);
  const skipSimilarity = Math.max(0, Math.min(100, parseFloat(skipSimilarityInput.value) || 2));
  return { displayDur, transDur, fps, scale, gifQuality, skipSimilarity };
}
 
function computeTimeline() {
  const Nx = galleries.x.length;
  const Ny = galleries.y.length;
  const { displayDur, transDur, fps } = getSettings();
  const step = displayDur + transDur;
  const cycleX = Nx * step;
  const cycleY = Ny * step;
  const lcmN = Nx && Ny ? lcm(Nx, Ny) : 0;
  const totalLoopSeconds = lcmN * step;
  const totalFrames = Math.max(1, Math.round(totalLoopSeconds * fps));
  return { Nx, Ny, displayDur, transDur, fps, step, cycleX, cycleY, totalLoopSeconds, totalFrames };
}
 
function updateEstimate() {
  const { Nx, Ny, totalLoopSeconds, totalFrames } = computeTimeline();
  if (!Nx || !Ny) {
    estimateText.textContent = 'Ajoutez des images dans les deux panneaux pour voir une estimation.';
    return;
  }
  estimateText.textContent = `Boucle complète : ${totalLoopSeconds.toFixed(1)}s · ${totalFrames} images générées avant export`;
}
 
[displayDurationInput, transitionDurationInput, fpsSelect, scaleSelect, gifQualityInput, skipSimilarityInput].forEach((el) => {
  el.addEventListener('input', updateEstimate);
  el.addEventListener('change', updateEstimate);
});
 
// ------------------------------------------------------------------
// Rendu des trames
// ------------------------------------------------------------------
function resizeToCanvas(img, width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, width, height);
  return canvas;
}
 
// Construit la trame d'un panneau (fondu façon "transition pub") à un instant donné
function composePanelFrame(resizedImgs, position, displayDur, transDur, step, width, height) {
  const n = resizedImgs.length;
  const cycleIndex = Math.floor(position / step);
  const idx = mod(cycleIndex, n);
  const localPos = position - cycleIndex * step;
 
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(resizedImgs[idx], 0, 0);
 
  if (n > 1 && transDur > 0 && localPos >= displayDur) {
    const nextIdx = mod(idx + 1, n);
    const progress = Math.min(1, Math.max(0, (localPos - displayDur) / transDur));
    ctx.globalAlpha = progress;
    ctx.drawImage(resizedImgs[nextIdx], 0, 0);
    ctx.globalAlpha = 1;
  }
  return canvas;
}
 
function nextTick() {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}
 
async function getWorkerScriptURL() {
  if (cachedWorkerURL) return cachedWorkerURL;
  const response = await fetch('https://cdn.jsdelivr.net/npm/gif.js@0.2.0/dist/gif.worker.js');
  const blob = await response.blob();
  cachedWorkerURL = URL.createObjectURL(blob);
  return cachedWorkerURL;
}
 
function showProgress(visible, percent, text) {
  progressWrap.hidden = !visible;
  if (!visible) return;
  const clamped = Math.min(100, Math.max(0, percent));
  progressFill.style.width = clamped + '%';
  progressText.textContent = text || Math.round(clamped) + '%';
}
 
// ------------------------------------------------------------------
// Génération du GIF
// ------------------------------------------------------------------
async function generate() {
  if (galleries.x.length === 0 || galleries.y.length === 0) {
    alert('Ajoutez au moins une image dans chaque panneau.');
    return;
  }
 
  const { Nx, Ny, displayDur, transDur, fps, step, cycleX, cycleY, totalFrames } = computeTimeline();
 
  if (totalFrames > MAX_RECOMMENDED_FRAMES) {
    const proceed = confirm(
      `Cette animation nécessitera ${totalFrames} images (boucle complète) et pourrait être longue à générer et volumineuse.\n` +
      `Astuce : utilisez le même nombre d'images des deux côtés pour raccourcir la boucle.\n\nContinuer quand même ?`
    );
    if (!proceed) return;
  }
 
  mergeBtn.disabled = true;
  downloadBtn.disabled = true;
  outputPreview.innerHTML = '';
  showProgress(true, 0, 'Préparation des images...');
 
  try {
    const workerScript = await getWorkerScriptURL();
 
    const frameDelay = Math.round(1000 / fps);
    const settings = getSettings();
    const scale = settings.scale || 1;
    const gifQuality = settings.gifQuality || 10;
    const skipSimilarity = settings.skipSimilarity || 0;

    // resize canvases according to scale
    const panelW = Math.max(1, Math.round(PANEL_WIDTH * scale));
    const panelH = Math.max(1, Math.round(PANEL_HEIGHT * scale));

    // prepare resized images at scaled size
    const resizedXScaled = galleries.x.map(it => resizeToCanvas(it.img, panelW, panelH));
    const resizedYScaled = galleries.y.map(it => resizeToCanvas(it.img, panelW, panelH));

    // recreate gif with requested quality
    const gifOptim = new GIF({
      workers: 3,
      quality: gifQuality,
      width: panelW * 2,
      height: panelH * 2,
      workerScript,
      repeat: 0
    });

    // helper for sampling difference between two ImageData arrays
    function computeChangedRatio(dataA, dataB, sampleStep = 8) {
      if (!dataA || !dataB || dataA.length !== dataB.length) return 1;
      let changed = 0;
      let sampled = 0;
      for (let i = 0; i < dataA.length; i += 4 * sampleStep) {
        sampled++;
        if (dataA[i] !== dataB[i] || dataA[i+1] !== dataB[i+1] || dataA[i+2] !== dataB[i+2] || dataA[i+3] !== dataB[i+3]) {
          changed++;
        }
      }
      return changed / Math.max(1, sampled);
    }

    let prevCanvas = null;
    let prevData = null;
    let pendingDelay = 0;
    let addedFrames = 0;

    for (let i = 0; i < totalFrames; i++) {
      const t = i / fps;
      const posX = cycleX > 0 ? mod(t, cycleX) : 0;
      const posY = cycleY > 0 ? mod(t, cycleY) : 0;

      const frameRight = composePanelFrame(resizedXScaled, posX, displayDur, transDur, step, panelW, panelH);
      const frameLeft = composePanelFrame(resizedYScaled, posY, displayDur, transDur, step, panelW, panelH);

      const full = document.createElement('canvas');
      full.width = panelW * 2;
      full.height = panelH * 2;
      const ctx = full.getContext('2d');
      // draw in same pattern: right on left? keep previous layout
      ctx.drawImage(frameRight, 0, 0, panelW, panelH);
      ctx.drawImage(frameLeft, panelW, 0, panelW, panelH);
      ctx.drawImage(frameLeft, 0, panelH, panelW, panelH);
      ctx.drawImage(frameRight, panelW, panelH, panelW, panelH);

      // sample image data to compare with previous
      const curData = ctx.getImageData(0, 0, full.width, full.height).data;

      if (!prevData) {
        // first frame: set as previous and wait
        prevCanvas = full;
        prevData = curData;
        pendingDelay = frameDelay;
      } else {
        const changedRatio = computeChangedRatio(prevData, curData);
        if ((changedRatio * 100) < skipSimilarity) {
          // frames are similar: accumulate delay
          pendingDelay += frameDelay;
        } else {
          // frames differ enough: add prevCanvas with accumulated delay
          gifOptim.addFrame(prevCanvas, { delay: pendingDelay, copy: true });
          addedFrames++;
          // set current as new previous
          prevCanvas = full;
          prevData = curData;
          pendingDelay = frameDelay;
        }
      }

      if (i % 8 === 0) {
        showProgress(true, (i / totalFrames) * 50, `Composition des images (${i + 1}/${totalFrames})`);
        await nextTick();
      }
    }

    // add the last pending frame
    if (prevCanvas) {
      gifOptim.addFrame(prevCanvas, { delay: pendingDelay, copy: true });
      addedFrames++;
    }

    gifOptim.on('progress', (p) => {
      showProgress(true, 50 + p * 50, `Encodage du GIF... ${Math.round(p * 100)}%`);
    });

    gifOptim.on('finished', (blob) => {
      outputBlob = blob;
      const url = URL.createObjectURL(blob);
      outputPreview.innerHTML = '';
      const img = document.createElement('img');
      img.src = url;
      img.alt = 'Animation pannelisée';
      outputPreview.appendChild(img);
      downloadBtn.disabled = false;
      mergeBtn.disabled = false;
      showProgress(false);
    });

    gifOptim.render();
  } catch (err) {
    console.error(err);
    alert("Une erreur est survenue pendant la génération du GIF. Vérifiez votre connexion et réessayez.");
    mergeBtn.disabled = false;
    showProgress(false);
  }
}
 
function downloadOutput() {
  if (!outputBlob) return;
  const link = document.createElement('a');
  link.href = URL.createObjectURL(outputBlob);
  link.download = 'pannelisation.gif';
  link.click();
}
 
mergeBtn.addEventListener('click', generate);
downloadBtn.addEventListener('click', downloadOutput);