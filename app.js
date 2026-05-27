// App — Main application logic, UI wiring, and gallery management

// ─── State ───────────────────────────────────────────────────────────────
let loadedQuilts = [];       // Active quilt objects (in memory)
let selectedQuiltIds = new Set();

// ─── DOM refs ────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);

// ─── Init ────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  await initStorage();
  initUI();
  initVRScene();
  checkWebXRSupport();

  // Load cached quilts from IndexedDB
  await loadCachedQuilts();
});

// ─── Storage ─────────────────────────────────────────────────────────────
async function initStorage() {
  try {
    await openDB();
    setStatus('Ready');
  } catch (err) {
    console.error('[App] Storage init failed:', err);
    setStatus('Storage error');
  }
}

async function loadCachedQuilts() {
  try {
    setStatus('Loading cached quilts...');
    const records = await loadAllQuilts();

    if (records.length > 0) {
      // Reconstruct quilts from records (async per quilt)
      const promises = records.map(record => quiltFromRecord(record));
      const quilts = (await Promise.all(promises)).filter(q => q !== null);

      // Sync quiltStore IDs so new quilts don't collide
      if (quilts.length > 0) {
        const maxId = Math.max(...quilts.map(q => q.id));
        quiltStore.nextId = maxId + 1;
      }

      loadedQuilts = quilts;
      quiltStore.quilts = quilts;
      renderQuiltList();
      updateButtons();
      setStatus(`Loaded ${quilts.length} cached quilt${quilts.length !== 1 ? 's' : ''}`);
    } else {
      setStatus('Ready');
    }
  } catch (err) {
    console.error('[App] Cache load failed:', err);
    setStatus('Ready');
  }
}

// ─── UI Wiring ───────────────────────────────────────────────────────────
function initUI() {
  // Load from URL
  $('loadUrlBtn').addEventListener('click', handleLoadUrl);

  // File input
  $('fileInput').addEventListener('change', handleFileSelect);

  // Drop zone
  const dropZone = $('dropZone');
  dropZone.addEventListener('click', () => $('fileInput').click());
  dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
  dropZone.addEventListener('drop', e => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    if (e.dataTransfer.files.length > 0) {
      handleFile(e.dataTransfer.files[0]);
    }
  });

  // Gallery actions
  $('buildGalleryBtn').addEventListener('click', buildGalleryFromUI);
  $('clearGalleryBtn').addEventListener('click', clearGalleryFromUI);

  // VR
  $('enterVrBtn').addEventListener('click', enterVR);

  // Layout controls — rebuild gallery on change if gallery exists
  ['displaySize', 'displaySpacing', 'layoutSelect'].forEach(id => {
    $(id).addEventListener('change', () => {
      if (galleryDisplays.length > 0) buildGalleryFromUI();
    });
  });
}

// ─── Quilt Loading ───────────────────────────────────────────────────────
async function handleLoadUrl() {
  const url = $('quiltUrl').value.trim();
  if (!url) return;

  setStatus('Fetching quilt...');
  try {
    const imageUrl = await fetchQuiltUrl(url);
    const quilt = await loadQuiltFromUrl(imageUrl);
    quilt.id = await getNextId();
    await addQuilt(quilt);
    $('quiltUrl').value = '';
  } catch (err) {
    console.error('[App] URL load failed:', err);
    setStatus('Load failed: ' + err.message);
  }
}

function handleFileSelect(e) {
  if (e.target.files.length > 0) {
    handleFile(e.target.files[0]);
  }
  e.target.value = ''; // Reset for reuse
}

async function handleFile(file) {
  if (!file.type.startsWith('image/')) {
    setStatus('Please select an image file');
    return;
  }

  setStatus('Processing quilt...');
  try {
    const quilt = await loadQuiltFile(file);
    quilt.id = await getNextId();
    await addQuilt(quilt);
  } catch (err) {
    console.error('[App] File load failed:', err);
    setStatus('Load failed: ' + err.message);
  }
}

// ─── Quilt Management ────────────────────────────────────────────────────
async function addQuilt(quilt) {
  // Save to IndexedDB
  try {
    await saveQuilt(quilt);
  } catch (err) {
    console.error('[App] Save failed:', err);
  }

  // Add to in-memory store
  loadedQuilts.push(quilt);
  quiltStore.quilts.push(quilt);

  renderQuiltList();
  updateButtons();
  setStatus(`Loaded "${quilt.name}" (${loadedQuilts.length} total)`);
}

async function removeQuilt(id) {
  // Remove from memory
  loadedQuilts = loadedQuilts.filter(q => q.id !== id);
  quiltStore.quilts = quiltStore.quilts.filter(q => q.id !== id);
  selectedQuiltIds.delete(id);

  // Remove from storage
  try {
    await deleteQuilt(id);
  } catch (err) {
    console.error('[App] Delete failed:', err);
  }

  // Rebuild gallery if active
  if (galleryDisplays.length > 0) {
    buildGalleryFromUI();
  }

  renderQuiltList();
  updateButtons();
}

function toggleQuiltSelection(id) {
  if (selectedQuiltIds.has(id)) {
    selectedQuiltIds.delete(id);
  } else {
    selectedQuiltIds.add(id);
  }
  renderQuiltList();
}

// ─── Rendering ───────────────────────────────────────────────────────────
function renderQuiltList() {
  const list = $('quiltList');
  const count = $('quiltCount');
  count.textContent = loadedQuilts.length > 0 ? `(${loadedQuilts.length})` : '';

  list.innerHTML = '';

  loadedQuilts.forEach(quilt => {
    const item = document.createElement('div');
    item.className = 'quilt-item' + (selectedQuiltIds.has(quilt.id) ? ' active' : '');

    // Thumbnail
    const thumb = document.createElement('canvas');
    thumb.className = 'quilt-thumb';
    thumb.width = 32;
    thumb.height = 32;
    const tCtx = thumb.getContext('2d');
    if (quilt.thumbnail) {
      tCtx.drawImage(quilt.thumbnail, 0, 0, 32, 32);
    } else {
      tCtx.fillStyle = '#2a2a40';
      tCtx.fillRect(0, 0, 32, 32);
    }

    // Info
    const info = document.createElement('div');
    info.className = 'quilt-info';

    const name = document.createElement('div');
    name.className = 'quilt-name';
    name.textContent = quilt.name;

    const meta = document.createElement('div');
    meta.className = 'quilt-meta';
    meta.textContent = `${quilt.cols}x${quilt.rows} • ${quilt.device || 'Unknown'}`;

    info.appendChild(name);
    info.appendChild(meta);

    // Delete button
    const del = document.createElement('button');
    del.textContent = '✕';
    del.style.cssText = 'background:none;border:none;color:var(--danger);cursor:pointer;font-size:0.8rem;padding:0.2rem;';
    del.addEventListener('click', (e) => {
      e.stopPropagation();
      removeQuilt(quilt.id);
    });

    item.appendChild(thumb);
    item.appendChild(info);
    item.appendChild(del);

    // Click to toggle selection
    item.addEventListener('click', () => toggleQuiltSelection(quilt.id));

    list.appendChild(item);
  });
}

function updateButtons() {
  const hasQuilts = loadedQuilts.length > 0;
  const hasSelection = selectedQuiltIds.size > 0;

  $('buildGalleryBtn').disabled = !hasSelection;
  $('enterVrBtn').disabled = !hasQuilts;
}

// ─── Gallery ─────────────────────────────────────────────────────────────
function buildGalleryFromUI() {
  if (selectedQuiltIds.size === 0) {
    // If nothing selected, use all quilts
    const quilts = loadedQuilts;
    buildGallery(quilts, $('layoutSelect').value, parseFloat($('displaySize').value), parseFloat($('displaySpacing').value));
  } else {
    const quilts = loadedQuilts.filter(q => selectedQuiltIds.has(q.id));
    buildGallery(quilts, $('layoutSelect').value, parseFloat($('displaySize').value), parseFloat($('displaySpacing').value));
  }

  // Hide overlay
  $('canvasOverlay').classList.add('hidden');
  setStatus(`Gallery built with ${galleryDisplays.length} display${galleryDisplays.length !== 1 ? 's' : ''}`);
}

function clearGalleryFromUI() {
  clearGallery();
  $('canvasOverlay').classList.remove('hidden');
  setStatus('Gallery cleared');
}

// ─── Status ──────────────────────────────────────────────────────────────
function setStatus(text) {
  $('statusText').textContent = text;
}
