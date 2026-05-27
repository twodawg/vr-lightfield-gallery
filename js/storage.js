// Storage — IndexedDB persistence for quilt data

const DB_NAME = 'VRGalleryDB';
const DB_VERSION = 1;
const STORE = 'quilts';

let db = null;

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (e) => {
      const database = e.target.result;
      if (!database.objectStoreNames.contains(STORE)) {
        database.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
    request.onsuccess = (e) => { db = e.target.result; resolve(db); };
    request.onerror = (e) => reject(new Error('IndexedDB open failed'));
  });
}

function saveQuilt(quilt) {
  return new Promise((resolve, reject) => {
    if (!db) {
      openDB().then(() => saveQuilt(quilt).then(resolve).catch(reject));
      return;
    }

    // Convert the full quilt image to a blob
    if (!quilt.image) {
      resolve();
      return;
    }

    // Create a canvas from the full quilt image and convert to blob
    const fullCanvas = document.createElement('canvas');
    fullCanvas.width = quilt.image.naturalWidth;
    fullCanvas.height = quilt.image.naturalHeight;
    const ctx = fullCanvas.getContext('2d');
    ctx.drawImage(quilt.image, 0, 0);

    fullCanvas.toBlob((blob) => {
      if (!blob) {
        console.warn('[Storage] Could not convert quilt image to blob');
        resolve();
        return;
      }

      const data = {
        id: quilt.id,
        name: quilt.name,
        cols: quilt.cols,
        rows: quilt.rows,
        tileW: quilt.tileW,
        tileH: quilt.tileH,
        device: quilt.device,
        imageBlob: blob,
        timestamp: Date.now()
      };

      const tx = db.transaction([STORE], 'readwrite');
      tx.objectStore(STORE).put(data);
      tx.oncomplete = () => {
        console.log('[Storage] Saved quilt:', quilt.name, blob.size, 'bytes');
        resolve();
      };
      tx.onerror = (e) => {
        console.error('[Storage] Save failed:', e.target.error);
        reject(new Error('Failed to save quilt'));
      };
    }, 'image/png');
  });
}

function loadQuilt(quiltId) {
  return new Promise((resolve, reject) => {
    if (!db) {
      openDB().then(() => loadQuilt(quiltId).then(resolve).catch(reject));
      return;
    }

    const tx = db.transaction([STORE], 'readonly');
    const store = tx.objectStore(STORE);
    const request = store.get(quiltId);

    request.onsuccess = () => {
      const data = request.result;
      if (!data) {
        resolve(null);
        return;
      }

      // Load the image blob
      const blob = data.imageBlob;
      if (!blob) {
        console.warn('[Storage] No image blob for quilt:', quiltId);
        resolve(null);
        return;
      }

      const url = URL.createObjectURL(blob);
      const img = new Image();

      img.onload = () => {
        URL.revokeObjectURL(url);

        // Re-extract tiles from the loaded image
        const tiles = [];
        const { cols, rows, tileW, tileH } = data;

        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            const canvas = document.createElement('canvas');
            canvas.width = tileW;
            canvas.height = tileH;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, c * tileW, (rows - 1 - r) * tileH, tileW, tileH, 0, 0, tileW, tileH);
            tiles.push(canvas);
          }
        }

        console.log('[Storage] Loaded quilt:', data.name, tiles.length, 'tiles');

        resolve({
          id: data.id,
          name: data.name,
          cols: data.cols,
          rows: data.rows,
          tileW: data.tileW,
          tileH: data.tileH,
          device: data.device,
          tiles: tiles,
          image: img,
          thumbnail: tiles[0] || null,
          timestamp: data.timestamp
        });
      };

      img.onerror = () => {
        URL.revokeObjectURL(url);
        console.error('[Storage] Failed to load image for quilt:', quiltId);
        resolve(null);
      };

      img.src = url;
    };

    request.onerror = () => {
      reject(new Error('Failed to load quilt ' + quiltId));
    };
  });
}

function getAllQuilts() {
  return new Promise((resolve, reject) => {
    if (!db) {
      openDB().then(() => getAllQuilts().then(resolve).catch(reject));
      return;
    }

    const tx = db.transaction([STORE], 'readonly');
    const request = tx.objectStore(STORE).getAll();

    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(new Error('Failed to get quilts'));
  });
}

function deleteQuilt(quiltId) {
  return new Promise((resolve, reject) => {
    if (!db) {
      openDB().then(() => deleteQuilt(quiltId).then(resolve).catch(reject));
      return;
    }

    const tx = db.transaction([STORE], 'readwrite');
    tx.objectStore(STORE).delete(quiltId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(new Error('Failed to delete quilt'));
  });
}

function clearAllQuilts() {
  return new Promise((resolve, reject) => {
    if (!db) {
      openDB().then(() => clearAllQuilts().then(resolve).catch(reject));
      return;
    }

    const tx = db.transaction([STORE], 'readwrite');
    tx.objectStore(STORE).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(new Error('Failed to clear quilts'));
  });
}
