// VR Scene — Three.js scene, WebXR session, and render loop

let vrScene, vrCamera, vrRenderer;
let galleryDisplays = [];
let orbitAngle = { x: 0, y: 0 };
let isDragging = false;
let lastMouse = { x: 0, y: 0 };
let currentXrSession = null;

function initVRScene() {
  if (typeof THREE === 'undefined') {
    setTimeout(initVRScene, 100);
    return;
  }

  const canvas = document.getElementById('preview-canvas');
  const container = canvas.parentElement;
  const w = container.clientWidth || 800;
  const h = container.clientHeight || 600;

  canvas.width = w;
  canvas.height = h;

  if (w === 0 || h === 0) { setTimeout(initVRScene, 200); return; }

  // Dispose old renderer
  if (vrRenderer) {
    try { const s = vrRenderer.xr.getSession(); if (s) s.end(); } catch(e) {}
    vrRenderer.dispose();
    vrRenderer = null;
  }

  // Scene
  vrScene = new THREE.Scene();
  vrScene.background = new THREE.Color(0x0a0a12);
  vrScene.fog = new THREE.Fog(0x0a0a12, 15, 30);

  // Camera
  vrCamera = new THREE.PerspectiveCamera(70, w / h, 0.01, 100);
  vrCamera.position.set(0, 1.6, 0);

  // Renderer
  vrRenderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false,
    alpha: false,
    xrCompatible: true
  });
  vrRenderer.setPixelRatio(1);
  vrRenderer.setSize(w, h);
  vrRenderer.xr.enabled = true;

  // Floor
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(60, 60),
    new THREE.MeshBasicMaterial({ color: 0x0e0e18, side: THREE.DoubleSide })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0;
  vrScene.add(floor);

  // Grid
  const grid = new THREE.GridHelper(60, 60, 0x1a1a30, 0x121220);
  grid.position.y = 0.01;
  vrScene.add(grid);

  // Ambient light
  const ambient = new THREE.AmbientLight(0x404060, 0.5);
  vrScene.add(ambient);

  // Point light
  const point = new THREE.PointLight(0x6c63ff, 1, 20);
  point.position.set(0, 5, 0);
  vrScene.add(point);

  // Desktop orbit controls
  canvas.addEventListener('mousedown', e => { isDragging = true; lastMouse = { x: e.clientX, y: e.clientY }; });
  canvas.addEventListener('mousemove', e => {
    if (!isDragging) return;
    orbitAngle.x -= (e.clientX - lastMouse.x) * 0.005;
    orbitAngle.y -= (e.clientY - lastMouse.y) * 0.005;
    orbitAngle.y = Math.max(-Math.PI / 3, Math.min(Math.PI / 3, orbitAngle.y));
    lastMouse = { x: e.clientX, y: e.clientY };
  });
  canvas.addEventListener('mouseup', () => { isDragging = false; });
  canvas.addEventListener('mouseleave', () => { isDragging = false; });
  canvas.addEventListener('touchstart', e => {
    isDragging = true;
    lastMouse = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  }, { passive: true });
  canvas.addEventListener('touchmove', e => {
    if (!isDragging) return;
    orbitAngle.x -= (e.touches[0].clientX - lastMouse.x) * 0.005;
    orbitAngle.y -= (e.touches[0].clientY - lastMouse.y) * 0.005;
    orbitAngle.y = Math.max(-Math.PI / 3, Math.min(Math.PI / 3, orbitAngle.y));
    lastMouse = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  }, { passive: true });
  canvas.addEventListener('touchend', () => { isDragging = false; });

  // Render loop
  vrRenderer.setAnimationLoop(renderFrame);
  vrRenderer.render(vrScene, vrCamera);

  console.log('[Gallery] Scene initialized');
}

function renderFrame(timestamp, frame) {
  if (!vrRenderer || !vrScene || !vrCamera) return;

  let viewerPosition = null;

  if (frame) {
    // XR mode: get head position from pose
    const refSpace = vrRenderer.xr.getReferenceSpace();
    if (refSpace) {
      const pose = frame.getViewerPose(refSpace);
      if (pose && pose.views && pose.views.length > 0) {
        const view = pose.views[0];
        if (view && view.transform) {
          viewerPosition = view.transform.position;
        }
      }
    }
  } else {
    // Desktop mode: orbit camera
    const radius = 8;
    vrCamera.position.x = Math.sin(orbitAngle.x) * radius;
    vrCamera.position.y = 1.6 + orbitAngle.y * 3;
    vrCamera.position.z = Math.cos(orbitAngle.x) * radius;
    vrCamera.lookAt(0, 1.6, -5);
    viewerPosition = vrCamera.position;
  }

  // Update all display tiles based on viewer position
  for (const display of galleryDisplays) {
    if (display.active) {
      display.updateTile(viewerPosition);
    }
  }

  vrRenderer.render(vrScene, vrCamera);
}

function buildGallery(quilts, layout, screenSize, spacing) {
  // Clear existing
  for (const d of galleryDisplays) {
    d.dispose();
    if (d.mesh && vrScene) vrScene.remove(d.mesh);
    if (d.frameMesh && vrScene) vrScene.remove(d.frameMesh);
  }
  galleryDisplays = [];

  const count = quilts.length;
  if (count === 0) return;

  for (let i = 0; i < count; i++) {
    let pos, rotY;

    if (layout === 'circular') {
      const radius = Math.max(spacing, count * 1.5);
      const angle = (i / count) * Math.PI * 2 - Math.PI / 2;
      pos = new THREE.Vector3(
        Math.sin(angle) * radius,
        1.6,
        Math.cos(angle) * radius - radius
      );
      rotY = -angle + Math.PI;
    } else if (layout === 'linear') {
      pos = new THREE.Vector3(
        (i - (count - 1) / 2) * spacing,
        1.6,
        -spacing
      );
      rotY = 0;
    } else {
      // Grid
      const gridCols = Math.ceil(Math.sqrt(count));
      const row = Math.floor(i / gridCols);
      const col = i % gridCols;
      pos = new THREE.Vector3(
        (col - (gridCols - 1) / 2) * spacing,
        1.6,
        -(row + 1) * spacing
      );
      rotY = 0;
    }

    const display = new GalleryDisplay(quilts[i], pos, rotY, screenSize);
    vrScene.add(display.mesh);
    vrScene.add(display.frameMesh);
    galleryDisplays.push(display);
  }

  console.log('[Gallery] Built', galleryDisplays.length, 'displays');
}

function clearGallery() {
  for (const d of galleryDisplays) {
    d.dispose();
    if (d.mesh && vrScene) vrScene.remove(d.mesh);
    if (d.frameMesh && vrScene) vrScene.remove(d.frameMesh);
  }
  galleryDisplays = [];
}

async function enterVR() {
  try {
    const session = await navigator.xr.requestSession('immersive-vr', {
      optionalFeatures: ['local-floor', 'bounded-floor']
    });
    currentXrSession = session;

    const refSpace = await session.requestReferenceSpace('local');
    vrRenderer.xr.setReferenceSpace(refSpace);
    vrRenderer.xr.setSession(session);

    session.addEventListener('end', () => {
      currentXrSession = null;
    });

    const canvas = document.getElementById('preview-canvas');
    const container = canvas.parentElement;
    canvas.width = container.clientWidth || 800;
    canvas.height = container.clientHeight || 600;
    vrRenderer.setSize(canvas.width, canvas.height);

    console.log('[Gallery] VR session started');
  } catch (err) {
    console.error('[Gallery] VR failed:', err);
    document.getElementById('vrStatus').textContent = 'VR Error: ' + err.message;
    document.getElementById('vrStatus').className = 'vr-status unsupported';
  }
}

function checkWebXRSupport() {
  const status = document.getElementById('vrStatus');
  if (!navigator.xr) {
    status.textContent = 'WebXR not supported';
    status.className = 'vr-status unsupported';
    return;
  }

  navigator.xr.isSessionSupported('immersive-vr').then(supported => {
    if (supported) {
      status.textContent = 'WebXR ready';
      status.className = 'vr-status ready';
      document.getElementById('enterVrBtn').disabled = false;
    } else {
      status.textContent = 'Immersive VR not supported';
      status.className = 'vr-status unsupported';
    }
  }).catch(() => {
    status.textContent = 'WebXR check failed';
    status.className = 'vr-status unsupported';
  });
}
