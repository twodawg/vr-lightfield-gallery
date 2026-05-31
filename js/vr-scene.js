// VR Scene — Three.js scene, WebXR session, and render loop

let vrScene, vrCamera, vrRenderer;
let galleryDisplays = [];
let orbitAngle = { x: 0, y: 0 };
let isDragging = false;
let lastMouse = { x: 0, y: 0 };
let currentXrSession = null;
let xrPlayer = null;
let xrDolly = null;
let xrYaw = 0;
let lastXrTimestamp = null;
let snapTurnState = { left: false, right: false };
let xrExitButtonWasPressed = false;

const XR_MOVE_SPEED = 2.0; // meters per second
const XR_STICK_DEADZONE = 0.18;
const XR_SNAP_TURN_ANGLE = Math.PI / 8; // 22.5 degrees
const XR_SNAP_TURN_THRESHOLD = 0.65;
const XR_SNAP_TURN_RESET = 0.35;

function initVRScene() {
  if (typeof THREE === 'undefined') {
    setTimeout(initVRScene, 100);
    return;
  }

  const canvas = document.getElementById('preview-canvas');
  const container = document.getElementById('viewerContainer');

  // Use container dimensions — has min-width/min-height CSS guards
  let w = container.clientWidth || 800;
  let h = container.clientHeight || 600;

  // Force minimum dimensions for Quest browser WebGL context
  if (w < 100) w = 800;
  if (h < 100) h = 600;

  canvas.width = w;
  canvas.height = h;

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

  // XR movement rig. WebXR owns the camera transform while immersive, so move
  // this parent object instead of trying to move the XR camera directly.
  xrDolly = new THREE.Group();
  xrPlayer = new THREE.Group();
  xrPlayer.add(vrCamera);
  xrDolly.add(xrPlayer);
  vrScene.add(xrDolly);

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

  // Lights
  const ambient = new THREE.AmbientLight(0x404060, 0.5);
  vrScene.add(ambient);

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
}

function renderFrame(timestamp, frame) {
  if (!vrRenderer || !vrScene || !vrCamera) return;

  let viewerPosition = null;

  if (frame) {
    updateXRControllerNavigation(timestamp);
    updateXRSessionButtons();
    viewerPosition = getXRWorldPosition();
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

function updateXRControllerNavigation(timestamp) {
  if (!currentXrSession || !xrDolly) return;

  if (lastXrTimestamp === null) {
    lastXrTimestamp = timestamp;
    return;
  }

  const dt = Math.min(Math.max((timestamp - lastXrTimestamp) / 1000, 0), 0.1);
  lastXrTimestamp = timestamp;

  let moveX = 0;
  let moveY = 0;
  let turnX = 0;

  for (const inputSource of currentXrSession.inputSources) {
    const stick = getThumbstickAxes(inputSource.gamepad);
    if (!stick) continue;

    // Quest and most WebXR controllers report handedness, but also allow a
    // one-controller fallback: vertical stick moves, horizontal stick turns.
    if (inputSource.handedness === 'right') {
      turnX = Math.abs(stick.x) > Math.abs(turnX) ? stick.x : turnX;
    } else if (inputSource.handedness === 'left') {
      moveX = Math.abs(stick.x) > Math.abs(moveX) ? stick.x : moveX;
      moveY = Math.abs(stick.y) > Math.abs(moveY) ? stick.y : moveY;
    } else {
      moveY = Math.abs(stick.y) > Math.abs(moveY) ? stick.y : moveY;
      turnX = Math.abs(stick.x) > Math.abs(turnX) ? stick.x : turnX;
    }
  }

  moveX = applyDeadzone(moveX, XR_STICK_DEADZONE);
  moveY = applyDeadzone(moveY, XR_STICK_DEADZONE);
  turnX = applyDeadzone(turnX, XR_STICK_DEADZONE);

  if (Math.abs(moveX) > 0 || Math.abs(moveY) > 0) {
    // Move relative to current headset yaw plus any snap-turn yaw on the rig.
    const headYaw = getHeadsetYaw();
    const worldYaw = xrYaw + headYaw;
    const forwardAmount = -moveY; // WebXR gamepad Y is usually negative when pushed forward.
    const strafeAmount = moveX;
    const forward = new THREE.Vector3(Math.sin(worldYaw), 0, -Math.cos(worldYaw));
    const strafe = new THREE.Vector3(Math.cos(worldYaw), 0, Math.sin(worldYaw));

    xrDolly.position.addScaledVector(forward, forwardAmount * XR_MOVE_SPEED * dt);
    xrDolly.position.addScaledVector(strafe, strafeAmount * XR_MOVE_SPEED * dt);
  }

  if (turnX > XR_SNAP_TURN_THRESHOLD && !snapTurnState.right) {
    xrYaw -= XR_SNAP_TURN_ANGLE;
    xrDolly.rotation.y = xrYaw;
    snapTurnState.right = true;
  } else if (turnX < -XR_SNAP_TURN_THRESHOLD && !snapTurnState.left) {
    xrYaw += XR_SNAP_TURN_ANGLE;
    xrDolly.rotation.y = xrYaw;
    snapTurnState.left = true;
  }

  if (Math.abs(turnX) < XR_SNAP_TURN_RESET) {
    snapTurnState.left = false;
    snapTurnState.right = false;
  }
}

function updateXRSessionButtons() {
  if (!currentXrSession) return;

  let exitPressed = false;
  for (const inputSource of currentXrSession.inputSources) {
    const gamepad = inputSource.gamepad;
    if (!gamepad || !gamepad.buttons) continue;

    // xr-standard buttons: 0 trigger, 1 grip, 2 touchpad, 3 thumbstick,
    // 4 primary face button (A/X), 5 secondary face button (B/Y).
    // Prefer B/Y for exit, with thumbstick click as a fallback on controllers
    // that do not expose face buttons.
    const buttons = gamepad.buttons;
    const secondaryFace = buttons[5] && buttons[5].pressed;
    const primaryFace = buttons[4] && buttons[4].pressed;
    const thumbstickClick = buttons.length < 5 && buttons[3] && buttons[3].pressed;

    if (secondaryFace || primaryFace || thumbstickClick) {
      exitPressed = true;
      break;
    }
  }

  if (exitPressed && !xrExitButtonWasPressed) {
    exitVR();
  }
  xrExitButtonWasPressed = exitPressed;
}

function exitVR() {
  if (!currentXrSession) return;
  currentXrSession.end().catch(err => {
    console.error('[Gallery] Failed to exit VR:', err);
  });
}

function getThumbstickAxes(gamepad) {
  if (!gamepad || !gamepad.axes || gamepad.axes.length < 2) return null;

  // WebXR controller mappings vary. Prefer the last axis pair because that is
  // where Oculus/Quest reports thumbstick X/Y, but fall back to the strongest
  // pair so other controllers still work.
  const axes = gamepad.axes;
  const candidates = [];
  for (let i = 0; i < axes.length - 1; i += 2) {
    candidates.push({ x: axes[i] || 0, y: axes[i + 1] || 0 });
  }

  let best = candidates[candidates.length - 1];
  let bestMagnitude = Math.abs(best.x) + Math.abs(best.y);
  for (const candidate of candidates) {
    const magnitude = Math.abs(candidate.x) + Math.abs(candidate.y);
    if (magnitude > bestMagnitude) {
      best = candidate;
      bestMagnitude = magnitude;
    }
  }

  return bestMagnitude > XR_STICK_DEADZONE ? best : null;
}

function applyDeadzone(value, deadzone) {
  if (Math.abs(value) < deadzone) return 0;
  return value;
}

function getHeadsetYaw() {
  const camera = vrRenderer.xr.getCamera(vrCamera);
  const quaternion = new THREE.Quaternion();
  camera.getWorldQuaternion(quaternion);
  const euler = new THREE.Euler().setFromQuaternion(quaternion, 'YXZ');
  return euler.y - xrYaw;
}

function getXRWorldPosition() {
  const position = new THREE.Vector3();
  const xrCamera = vrRenderer.xr.getCamera(vrCamera);

  if (xrCamera) {
    // WebXRManager's XR camera position tracks physical headset motion in the
    // reference space. Add the dolly transform so controller locomotion also
    // affects quilt tile/parallax selection.
    position.copy(xrCamera.position);
  } else {
    vrCamera.getWorldPosition(position);
  }

  if (xrDolly) {
    position.applyQuaternion(xrDolly.quaternion);
    position.add(xrDolly.position);
  }

  return position;
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
    xrYaw = 0;
    lastXrTimestamp = null;
    xrExitButtonWasPressed = false;
    snapTurnState = { left: false, right: false };
    if (xrDolly) {
      xrDolly.position.set(0, 0, 0);
      xrDolly.rotation.set(0, 0, 0);
    }

    let refSpace;
    try {
      refSpace = await session.requestReferenceSpace('local-floor');
    } catch {
      refSpace = await session.requestReferenceSpace('local');
    }
    vrRenderer.xr.setReferenceSpace(refSpace);
    await vrRenderer.xr.setSession(session);

    session.addEventListener('end', () => {
      currentXrSession = null;
      lastXrTimestamp = null;
      xrExitButtonWasPressed = false;
    });

    const canvas = document.getElementById('preview-canvas');
    const container = canvas.parentElement;
    canvas.width = container.clientWidth || 800;
    canvas.height = container.clientHeight || 600;
    vrRenderer.setSize(canvas.width, canvas.height);
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
