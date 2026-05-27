# VR Light Field Gallery

An immersive WebXR gallery for browsing and experiencing 3D light field content on Meta Quest.

## Concept

Upload Looking Glass quilt images and view them as floating displays in a dark VR space. Walk between displays, move your head for real parallax, and browse collections of 3D photos.

## Features

- Import quilt images from blocks.glass URLs or local files
- Multiple floating displays arranged in a gallery space
- Head-tracked parallax (tile selection based on viewer position)
- Walk between displays in immersive VR
- Controller-based navigation to cycle through collections
- Desktop preview with mouse orbit controls

## Tech Stack

- Vanilla HTML/CSS/JS
- Three.js r152 (CDN)
- WebXR API for Meta Quest immersive mode
- Canvas API for tile extraction and texture updates

## Usage

1. Open `index.html` in a browser (Chrome/Edge recommended)
2. Load quilt images via URL or file picker
3. Click displays to add them to the gallery
4. On Quest: enter VR mode and walk around the gallery
5. Move your head near a display for parallax effect

## Project Structure

```
├── index.html
├── css/
│   └── styles.css
├── js/
│   ├── app.js          # Main app logic and gallery manager
│   ├── quilt-loader.js # Tile extraction and quilt processing
│   ├── display.js      # Virtual display objects with parallax
│   └── vr-scene.js     # Three.js scene and WebXR session
└── README.md
```

## Links

- [Looking Glass Quilt Docs](https://lfdocs.lookingglassfactory.com/keyconcepts/quilts)
- [Looking Glass Blocks](https://blocks.glass/discover)
- [Meta Quest WebXR Docs](https://developers.meta.com/horizon/documentation/web/webxr-first-steps/)
