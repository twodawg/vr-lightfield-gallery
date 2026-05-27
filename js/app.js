// App — Main application logic and gallery manager

document.addEventListener('DOMContentLoaded', async () => {
  const dropZone = document.getElementById('dropZone');
  const fileInput = document.getElementById('fileInput');
  const quiltUrl = document.getElementById('quiltUrl');
  const loadUrlBtn = document.getElementById('loadUrlBtn');
  const buildGalleryBtn = document.getElementById('buildGalleryBtn');
  const clearGalleryBtn = document.getElementById('clearGalleryBtn');
  const enterVrBtn = document.getElementById('enterVrBtn');
  const quiltList = document.getElementById('quiltList');
  const quiltCount = document.getElementById('quiltCount');
  const canvasOverlay = document.getElementById('canvasOverlay');
  const statusText = document.getElementById('statusText');
  const statusDot = document.getElementById('statusDot');

  // Check WebXR support only (scene init is deferred until gallery build)
  checkWebXRSupport();

  // Open IndexedDB and load saved quilts
  setStatus('Loading stored quilts...');
  try {
    await openDB();
    const savedQuilts = await getAllQuilts();

    // Load each quilt from storage
    let loadedCount = 0;
    for (const quiltData of savedQuilts) {
      try {
        const quilt = await loadQuilt(quiltData.id);
        if (quilt) {
          quiltStore.quilts.push(quilt);
          loadedCount++;
        }
      } catch (e) {
        console.error('Failed to load stored quilt:', quiltData.id, e);
      }
    }

    updateUI();
    if (loadedCount > 0) {
      // Init scene after quilts are restored — canvas has layout now
      if (!vrRenderer) initVRScene();
      setStatus(loadedCount + ' quilt(s) restored from storage');
    } else {
      setStatus('Ready');
    }
  } catch (err) {
    console.error('Failed to load stored quilts:', err);
    setStatus('Ready');
  }

  // Drop zone
  dropZone.addEventListener('click', () => fileInput.click());
  dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
  dropZone.addEventListener('drop', e => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
  });
  fileInput.addEventListener('change', () => {
    if (fileInput.files.length) handleFile(fileInput.files[0]);
  });

  // Load from URL
  loadUrlBtn.addEventListener('click', async () => {
    const url = quiltUrl.value.trim();
    if (!url) return alert('Please enter a blocks.glass URL');
    setStatus('Loading from URL...');
    try {
      const imageUrl = await fetchQuiltUrl(url);
      await loadQuiltFromUrl(imageUrl);
      updateUI();
      setStatus('Quilt loaded and saved');
    } catch (err) {
      setStatus('Error: ' + err.message);
      if (url.match(/\.(png|jpg|jpeg|webp)$/i)) {
        try {
          await loadQuiltFromUrl(url);
          updateUI();
          setStatus('Quilt loaded and saved');
        } catch (e) {
          setStatus('Error: ' + e.message);
        }
      }
    }
  });

  // File handler
  async function handleFile(file) {
    if (!file.type.startsWith('image/')) return alert('Please select an image file.');
    setStatus('Loading file...');
    try {
      await loadQuiltFile(file);
      updateUI();
      setStatus('Quilt loaded and saved');
    } catch (err) {
      setStatus('Error: ' + err.message);
    }
  }

  // Build gallery
  buildGalleryBtn.addEventListener('click', () => {
    if (quiltStore.quilts.length === 0) return;
    const screenSize = parseFloat(document.getElementById('displaySize').value) || 2.5;
    const spacing = parseFloat(document.getElementById('displaySpacing').value) || 4;
    const layout = document.getElementById('layoutSelect').value;

    // Init scene now — canvas has layout dimensions after user interaction
    if (!vrRenderer) {
      initVRScene();
    }

    buildGallery(quiltStore.quilts, layout, screenSize, spacing);
    canvasOverlay.classList.add('hidden');
    setStatus('Gallery built with ' + quiltStore.quilts.length + ' displays');
  });

  // Clear gallery
  clearGalleryBtn.addEventListener('click', async () => {
    clearGallery();
    // Also clear storage
    try {
      await clearAllQuilts();
      quiltStore.quilts = [];
      quiltStore.nextId = 1;
    } catch (e) {
      console.error('Failed to clear storage:', e);
    }
    updateUI();
    canvasOverlay.classList.remove('hidden');
    setStatus('Gallery cleared');
  });

  // Enter VR
  enterVrBtn.addEventListener('click', enterVR);

  // Update UI
  function updateUI() {
    const quilts = quiltStore.quilts;
    quiltCount.textContent = quilts.length > 0 ? '(' + quilts.length + ')' : '';
    buildGalleryBtn.disabled = quilts.length === 0;

    quiltList.innerHTML = '';
    for (const quilt of quilts) {
      const item = document.createElement('div');
      item.className = 'quilt-item';

      // Get thumbnail data URL from first tile or stored thumbnail
      let thumbSrc = '';
      if (quilt.tiles && quilt.tiles.length > 0) {
        try { thumbSrc = quilt.tiles[0].toDataURL(); } catch(e) {}
      } else if (quilt.thumbnail) {
        try { thumbSrc = quilt.thumbnail.toDataURL(); } catch(e) {}
      }

      item.innerHTML =
        '<img class="quilt-thumb" src="' + thumbSrc + '">' +
        '<div class="quilt-info">' +
          '<div class="quilt-name">' + quilt.name + '</div>' +
          '<div class="quilt-meta">' + quilt.cols + 'x' + quilt.rows + ' · ' + quilt.device + '</div>' +
        '</div>' +
        '<button class="quilt-delete" title="Remove" style="background:none;border:none;color:var(--danger);cursor:pointer;font-size:1rem;padding:0.25rem;">&#10005;</button>';
      quiltList.appendChild(item);

      // Delete button
      const deleteBtn = item.querySelector('.quilt-delete');
      deleteBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        try {
          await deleteQuilt(quilt.id);
          quiltStore.quilts = quiltStore.quilts.filter(q => q.id !== quilt.id);
          updateUI();
          setStatus('Quilt removed');
        } catch (err) {
          setStatus('Error removing quilt');
        }
      });
    }
  }

  // Status
  function setStatus(text) {
    statusText.textContent = text;
    statusDot.style.background = 'var(--success)';
  }
});
