// Quilt Loader — tile extraction and quilt processing

const quiltStore = {
  quilts: [],
  nextId: 1
};

// Device presets for auto-detection
const devicePresets = [
  { name: 'Looking Glass Go', cols: 11, rows: 6, w: 4092, h: 4092 },
  { name: 'Portrait', cols: 8, rows: 6, w: 3360, h: 3360 },
  { name: '16" Landscape', cols: 7, rows: 7, w: 5999, h: 5999 },
  { name: '27" Landscape', cols: 8, rows: 6, w: 7680, h: 4320 },
  { name: '27" Portrait', cols: 12, rows: 4, w: 7680, h: 4320 },
  { name: '32" Landscape', cols: 7, rows: 7, w: 8190, h: 8190 },
  { name: '65"', cols: 8, rows: 9, w: 8192, h: 8192 }
];

function detectDevice(imageW, imageH) {
  for (const preset of devicePresets) {
    const tileW = imageW / preset.cols;
    const tileH = imageH / preset.rows;
    // Check if tiles are roughly square and reasonable size
    if (tileW > 100 && tileH > 100 && Math.abs(tileW - tileH) / Math.max(tileW, tileH) < 0.5) {
      return { cols: preset.cols, rows: preset.rows, name: preset.name };
    }
  }
  return null;
}

function parseFilename(name) {
  const match = name.match(/qs(\d+)x(\d+)a([\d.]+)/i);
  if (match) {
    return { cols: parseInt(match[1]), rows: parseInt(match[2]), aspect: parseFloat(match[3]) };
  }
  return null;
}

function extractTiles(image, cols, rows) {
  const tileW = Math.floor(image.naturalWidth / cols);
  const tileH = Math.floor(image.naturalHeight / rows);
  const tiles = [];

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const canvas = document.createElement('canvas');
      canvas.width = tileW;
      canvas.height = tileH;
      const ctx = canvas.getContext('2d');
      // Bottom-left = view 0, top-right = last view
      ctx.drawImage(image, c * tileW, (rows - 1 - r) * tileH, tileW, tileH, 0, 0, tileW, tileH);
      tiles.push(canvas);
    }
  }

  return { tiles, tileW, tileH };
}

function loadQuiltFromImage(image, sourceName) {
  return new Promise((resolve, reject) => {
    image.onload = () => {
      try {
        const filename = sourceName || 'quilt';
        const parsed = parseFilename(filename);
        let cols, rows, device;

        if (parsed) {
          cols = parsed.cols;
          rows = parsed.rows;
          device = 'Custom';
        } else {
          device = detectDevice(image.naturalWidth, image.naturalHeight);
          if (!device) {
            // Default to 11x6
            cols = 11;
            rows = 6;
            device = 'Auto (11x6)';
          } else {
            cols = device.cols;
            rows = device.rows;
            device = device.name;
          }
        }

        const { tiles, tileW, tileH } = extractTiles(image, cols, rows);

        const quilt = {
          id: quiltStore.nextId++,
          name: filename.replace(/\.[^.]+$/, ''),
          cols,
          rows,
          tileW,
          tileH,
          tiles,
          image,
          device,
          thumbnail: tiles[0] || null
        };

        quiltStore.quilts.push(quilt);
        // Save to IndexedDB
        try {
          saveQuilt(quilt);
        } catch(e) {
          console.error('Failed to save quilt to storage:', e);
        }
        resolve(quilt);
      } catch (err) {
        reject(err);
      }
    };
    image.onerror = () => reject(new Error('Failed to load image'));
  });
}

function loadQuiltFromUrl(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      loadQuiltFromImage(img, 'blocks.glass quilt').then(resolve).catch(reject);
    };
    img.onerror = () => reject(new Error('Failed to load image (CORS)'));
    img.src = url;
  });
}

function loadQuiltFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      loadQuiltFromImage(img, file.name).then(resolve).catch(reject);
      img.src = e.target.result;
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

function fetchQuiltUrl(url) {
  return new Promise((resolve, reject) => {
    fetch(url, { mode: 'cors' })
      .then(response => {
        if (!response.ok) throw new Error('Failed to fetch page');
        return response.text();
      })
      .then(html => {
        const quiltUrlMatch = html.match(/(https?:\/\/[^"'<>\s]+\.(png|jpg|jpeg|webp))/i);
        if (quiltUrlMatch) return quiltUrlMatch[1];
        const allUrls = html.match(/(https?:\/\/dl\.blocks\.glass\/[^"'<>\s]+)/gi);
        if (allUrls && allUrls.length > 0) return allUrls[0];
        throw new Error('Could not find quilt image URL');
      })
      .then(resolve)
      .catch(reject);
  });
}
