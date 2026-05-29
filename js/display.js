// Display — Virtual display objects with parallax for the gallery

class GalleryDisplay {
  constructor(quilt, position, rotationY, screenSize) {
    this.quilt = quilt;
    this.position = position;
    this.rotationY = rotationY;
    this.screenSize = screenSize;
    this.mesh = null;
    this.texture = null;
    this.material = null;
    this.canvas = null;
    this.frameMesh = null;
    this.active = true;
    this.currentTileIndex = -1;

    const { cols, rows, tileW, tileH } = quilt;
    const aspect = tileW / tileH;
    this.screenW = screenSize;
    this.screenH = screenSize / aspect;

    this.canvas = document.createElement('canvas');
    this.canvas.width = tileW;
    this.canvas.height = tileH;

    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.magFilter = THREE.LinearFilter;

    this.material = new THREE.MeshBasicMaterial({
      map: this.texture,
      side: THREE.DoubleSide
    });

    this.mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(this.screenW, this.screenH),
      this.material
    );
    this.mesh.position.copy(this.position);
    this.mesh.rotation.y = this.rotationY;

    this.frameMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(this.screenW + 0.1, this.screenH + 0.1),
      new THREE.MeshBasicMaterial({
        color: 0x6c63ff,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.3
      })
    );
    this.frameMesh.position.copy(this.position);
    this.frameMesh.rotation.y = this.rotationY;
    const offset = new THREE.Vector3(0, 0, -0.02);
    offset.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.rotationY);
    this.frameMesh.position.add(offset);

    this.updateTile();
  }

  updateTile(viewerPosition) {
    const { cols, rows, tileW, tileH, tiles } = this.quilt;
    if (!tiles || tiles.length === 0) return;

    let tileCol, tileRow;

    if (viewerPosition) {
      // Normalize to THREE.Vector3 in case a non-Vector3 position object is passed
      const vp = (viewerPosition instanceof THREE.Vector3)
        ? viewerPosition
        : new THREE.Vector3(viewerPosition.x, viewerPosition.y, viewerPosition.z);
      const localPos = vp.clone().sub(this.position);
      const invRotation = -this.rotationY;
      const cos = Math.cos(invRotation);
      const sin = Math.sin(invRotation);
      const localX = localPos.x * cos - localPos.z * sin;
      const hOffset = (localX / this.screenW) * (cols - 1) * 0.3;
      const vOffset = (localPos.y / this.screenH) * (rows - 1) * 0.3;
      tileCol = Math.round((cols - 1) / 2 + hOffset);
      tileRow = Math.round((rows - 1) / 2 + vOffset);
    } else {
      tileCol = Math.floor(cols / 2);
      tileRow = Math.floor(rows / 2);
    }

    tileCol = Math.max(0, Math.min(cols - 1, tileCol));
    tileRow = Math.max(0, Math.min(rows - 1, tileRow));

    const tileIndex = tileRow * cols + tileCol;
    // Skip redraw when the tile hasn't changed (texture remains valid between frames)
    if (tileIndex === this.currentTileIndex) return;
    this.currentTileIndex = tileIndex;

    if (tileIndex >= 0 && tileIndex < tiles.length) {
      const ctx = this.canvas.getContext('2d');
      ctx.clearRect(0, 0, tileW, tileH);
      ctx.drawImage(tiles[tileIndex], 0, 0);
      this.texture.needsUpdate = true;
    }
  }

  dispose() {
    if (this.texture) this.texture.dispose();
    if (this.material) this.material.dispose();
    if (this.mesh && this.mesh.geometry) this.mesh.geometry.dispose();
    if (this.frameMesh) {
      if (this.frameMesh.geometry) this.frameMesh.geometry.dispose();
      if (this.frameMesh.material) this.frameMesh.material.dispose();
    }
  }
}
