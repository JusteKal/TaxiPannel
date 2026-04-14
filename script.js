const inputX = document.getElementById('input-x');
const inputY = document.getElementById('input-y');
const previewX = document.getElementById('preview-x');
const previewY = document.getElementById('preview-y');
const mergeBtn = document.getElementById('merge-btn');
const downloadBtn = document.getElementById('download-btn');
const outputPreview = document.getElementById('output-preview');

let imageX = null;
let imageY = null;
let outputDataUrl = null;

mergeBtn.disabled = true;

function createPreview(element, image) {
  element.innerHTML = '';
  const img = document.createElement('img');
  img.src = image.src;
  img.alt = 'Preview';
  element.appendChild(img);
}

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

async function handleFileInput(file, setter, previewElement) {
  if (!file) return;
  const img = await loadImage(file);
  setter(img);
  createPreview(previewElement, img);
  updateMergeButton();
}

function handleDrop(event, setter, previewElement, dropzone) {
  event.preventDefault();
  dropzone.classList.remove('dragover');
  const file = event.dataTransfer.files[0];
  handleFileInput(file, setter, previewElement);
}

function resizeToCanvas(img, width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, width, height);
  return canvas;
}

function updateMergeButton() {
  mergeBtn.disabled = !imageX || !imageY;
}

function createMergedImage() {
  if (!imageX || !imageY) {
    alert('Veuillez sélectionner les deux images.');
    return;
  }

  const width = 256;
  const height = 128;
  const resizedX = resizeToCanvas(imageX, width, height);
  const resizedY = resizeToCanvas(imageY, width, height);

  const canvas = document.createElement('canvas');
  canvas.width = width * 2;
  canvas.height = height * 2;
  const ctx = canvas.getContext('2d');

  ctx.drawImage(resizedX, 0, 0, width, height);
  ctx.drawImage(resizedY, width, 0, width, height);
  ctx.drawImage(resizedY, 0, height, width, height);
  ctx.drawImage(resizedX, width, height, width, height);

  outputDataUrl = canvas.toDataURL('image/png');
  const outputImage = new Image();
  outputImage.src = outputDataUrl;
  outputImage.alt = 'Image pannelisée';

  outputPreview.innerHTML = '';
  outputPreview.appendChild(outputImage);
  downloadBtn.disabled = false;
}

function downloadOutput() {
  if (!outputDataUrl) return;
  const link = document.createElement('a');
  link.href = outputDataUrl;
  link.download = 'pannelisation.png';
  link.click();
}

inputX.addEventListener('change', (event) => {
  handleFileInput(event.target.files[0], (img) => { imageX = img; }, previewX);
});

inputY.addEventListener('change', (event) => {
  handleFileInput(event.target.files[0], (img) => { imageY = img; }, previewY);
});

const dropzoneX = document.getElementById('dropzone-x');
const dropzoneY = document.getElementById('dropzone-y');

dropzoneX.addEventListener('dragover', (event) => {
  event.preventDefault();
  dropzoneX.classList.add('dragover');
});
dropzoneY.addEventListener('dragover', (event) => {
  event.preventDefault();
  dropzoneY.classList.add('dragover');
});

dropzoneX.addEventListener('dragleave', () => dropzoneX.classList.remove('dragover'));
dropzoneY.addEventListener('dragleave', () => dropzoneY.classList.remove('dragover'));

dropzoneX.addEventListener('drop', (event) => handleDrop(event, (img) => { imageX = img; }, previewX, dropzoneX));
dropzoneY.addEventListener('drop', (event) => handleDrop(event, (img) => { imageY = img; }, previewY, dropzoneY));

mergeBtn.addEventListener('click', createMergedImage);
downloadBtn.addEventListener('click', downloadOutput);
