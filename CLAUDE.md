# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Globe Vite** is a modern 3D interactive portfolio website built with Vite, Three.js, and GSAP. It features a space-themed visualization with Earth, Moon, and Mars rendered in WebGL, with multi-language support (German/English) and PWA capabilities.

## Tech Stack

- **Build Tool**: Vite 5.4.11
- **3D Graphics**: Three.js 0.181.0 with custom GLSL shaders
- **Animation**: GSAP 3.12.5
- **PWA**: vite-plugin-pwa 0.20.5 with Workbox
- **Runtime**: Node.js (v16+ via .node-version)

## Development Commands

```bash
# Install dependencies
npm install

# Development server (localhost:3000 with HMR)
npm run dev

# Production build (outputs to dist/)
npm run build

# Preview production build
npm run preview
```

## High-Level Architecture

### Load Strategy (Critical Performance Pattern)

The application uses a **lazy-loading architecture** for optimal performance:

```
index.html → main.js (1.8 KB)
    ├─→ app.js (UI/navigation - loads immediately)
    └─→ scene.js (Three.js - lazy-loaded on user interaction)
```

**main.js** implements intelligent deferred loading:
- Immediately loads CSS + UI (app.js)
- Defers Three.js (~130 KB) and textures until:
  - User interaction (scroll/mouse/touch), OR
  - Network-based timeout via Network Information API: 4G/5G = 0ms, 2G/3G/slow-2g = 1200ms, unknown/no API = 200ms

This achieves fast First Contentful Paint before heavy 3D assets load.

### Key Files & Responsibilities

**`src/js/main.js`** (54 lines) - Entry point with lazy-loading logic
**`src/js/app.js`** (797 lines) - UI layer: navigation, language switching, modals, GSAP animations
**`src/js/scene.js`** (2460 lines) - 3D layer: Three.js scene setup, objects (Earth/Moon/Mars), camera system, post-processing, and the Franconia LOD chain + low-altitude flight (see below). All GLSL shaders (Earth, atmosphere, stars, nebula, sun/glow, god rays) are inlined here as template strings — the external `src/shaders/*.frag` / `*.vert` files are legacy and NOT loaded.

**Post-processing files** - Custom EffectComposer implementation:
- `EffectComposer.js`, `RenderPass.js`, `ShaderPass.js`, `Pass.js`, `MaskPass.js` - Pipeline infrastructure
- Active passes (in `src/shaders/`): `ChromaticAberrationShader.js`, `VignetteShader.js`, `FilmGrainShader.js`, `CRTShader.js`; plus `GlitchPass.js` (uses `DigitalGlitch.js`) and `FXAAShader.js`
- **Dead code (not imported anywhere):** `UnrealBloomPass.js`, `LuminosityHighPassShader.js`, `GodRaysShader.js`, `LensFlareShader.js`, `SimpleLensFlareShader.js`, `OutputShader.js`, and all external `*.frag` / `*.vert` files. Safe to remove; kept as reference for now.

### Build Configuration

**vite.config.js** implements manual chunk splitting:
- `three` chunk (496 KB) - Three.js library
- `gsap` chunk (68 KB) - GSAP library
- `postprocessing` chunk - Effect composer and passes
- `app` chunk - UI code
- `scene` chunk - 3D rendering code

Build drops console logs and debugger statements in production via Terser.

**PWA Configuration**:
- Service Worker with autoUpdate registration
- Runtime caching: Google Fonts (1 year), images (30 days, CacheFirst)
- Only critical assets (JS/CSS/HTML/fonts) are precached (~775 KiB); textures load on demand via the `image-cache` runtime rule (CacheFirst, 30 days, maxEntries 20 — the app loads 17 images, so there is little headroom)
- **Do not add `img/**/*` to `includeAssets`.** It appends every image to the precache manifest regardless of `globPatterns`, which every visitor then downloads in the background — it was 20.5 MB until it was found. The build line `precache N entries (X KiB)` does **not** count `includeAssets` and hides this.

## Multi-Language System

Content is embedded in `index.html` with both German and English versions. Language switching is handled by:
- Class-based showing/hiding (`.de` / `.en` classes)
- localStorage persistence (`globe_lang` key)
- Browser language auto-detection on first visit
- Toggle controlled in app.js with state variable `currentLang`

## Navigation & UI Modes

The app has multiple navigation states managed in app.js:
- **Breadcrumb navigation**: Start / About / Projects / Contact
- **Info mode vs. scene-specific modes**: Content overlays toggle 3D scene visibility
- **Modals**: Impressum, Datenschutz, Menu (with GSAP fade animations)
- **Camera positions**: Predefined positions for Earth, Moon, Mars with smooth transitions
- **Guided tour** (`startSceneTour`, 72 s + ~75 s Franconia ring): Earth orbit → Franconia approach → **Upper Franconia ring** (five cities at ~6 km, see below) → Moon → Mars. Phase boundaries `P_EARTH` 0.17 / `P_FRANKEN` 0.50 / `P_MOON` 0.72. The station data panel is `#tourInfo`, positioned left of the stop button; it drops to three rows below 560 px viewport width.

## Three.js Scene Structure

**scene.js** contains:
- Single THREE.Scene with PerspectiveCamera (75° FOV)
- WebGLRenderer with OrbitControls that are **disabled** (`controls.enabled = false`) — navigation runs entirely through predefined camera positions (`getStart/getHome/getMoon/getMars`), the guided tour, and swipe handling
- **Objects**:
  - Earth: MeshStandardMaterial with normal/AO maps, atmosphere halo
  - Moon: Simplified sphere with diffuse/normal maps
  - Mars: Dune texture with atmosphere shader
  - Sun: DirectionalLight plus custom sun/glow ShaderMaterials, god-ray meshes, and a `Lensflare` from three's examples
  - Background: custom star field and nebula ShaderMaterials
- **Post-processing pipeline** (actual order): EffectComposer → RenderPass → ChromaticAberration → Vignette → FilmGrain → Glitch → CRT/scanline → FXAA. **No Bloom is active.**
- **Sci-Fi FX**: a random "CONNECTION LOST" overlay and periodic subtle glitches driven by timers that toggle `glitchPass.goWild`
- **Custom shaders**: inline vertex/fragment shaders for atmospheric glow (Fresnel effect), stars, nebula, and sun

## Franconia LOD Chain & Low-Altitude Flight

The tour descends from Earth orbit to ~6 km over Upper Franconia and flies a ring of five
cities. Everything below is in `scene.js`. Distances are camera distance to earth centre
(`R`); the globe has radius 5, so 1 unit ≈ 1274 km and altitude = `R - 5`.

**Four stacked spherical-cap patches**, all `depthWrite: false` — so **`renderOrder` decides
what is on top, not the radius**:

| Patch | renderOrder | Radius | Source | Resolution | Fades in |
|---|---|---|---|---|---|
| `europePatch` | 1 | 5.0015 | NASA GIBS Blue Marble | ~600 m/px | R 7.5 → 5.8 |
| `midPatch` | 2 | 5.002 | Sentinel-2 cloudless (EOX) | ~36 m/px | R 5.7 → 5.3 |
| `routePatch` | 3 | 5.001 | Sentinel-2 cloudless (EOX) | ~10.7 m/px | R 5.06 → 5.03 |
| station patches (5) | 4 | 5.001 | Bavaria DOP40 | ~8 m/px | within 18 km of the city |

**Constraints that are easy to break:**

- Every patch radius must be **below `STATION_DIVE_RADIUS` (5.005) minus the low-alt near
  plane (0.0025)**, i.e. ≤ 5.0025 — otherwise the patch sits behind the camera during the
  low flight and gets clipped away.
- `europePatch` **must not be hidden** in `enterLowAlt()`. It is the backdrop that
  `midPatch`'s edge fades into; without it that edge sits on the bare 9.8 km/px base globe.
- `sunLight` intensity is **11**. Anything `MeshStandardMaterial` is blown out at close
  range. Hence: aerials are `MeshBasicMaterial`, and `europePatch`/`midPatch` are
  **de-lit** over R 5.3 → 5.08 via a shared `delitFactor()` (diffuse → black,
  `emissiveIntensity` → 1). Both share the curve so their common edge never differs in
  brightness.
- The base globe needs **two** brightnesses (`earthTintOrbit` 0.95, `earthTintNear` 0.50,
  ramped over R 10 → 7.5). One constant cannot serve both — from orbit the texture must be
  strong, filling the screen the same value is far too bright.
- DOP40 is **not colour-matched across flight campaigns** and stops at the Bavarian border.
  Usable for single-city crops (~28 km), useless as an area texture — at 64 km wide whole
  tiles show as differently-toned blocks. That is why the route texture is Sentinel-2.
  Kronach's crop reaches into Thuringia; its no-data corner is filled with gamma-matched
  Sentinel-2 (fetched with `TRANSPARENT=true` to get real alpha).

**Flight mechanics:** `flyDive` (radial, slerped direction) and `flyHop` (lateral, constant
radius) both read the camera position **at construction time** — a pre-built timeline would
freeze the start position into every leg, so `runLegs` builds each leg when it starts. The
tour computes its camera position from progress and therefore cannot be mixed with these:
`startSceneTour` **pauses** at the bottom of the Franconia approach (R 5.4), runs
`startFrankenTour`, and resumes; `diveOutTo` returns the camera exactly where it paused.
`stopTour` must call `killFrankenTour()` — killing the tour timeline alone would leave the
ring flying with a 0.0025 near plane.

`slerpVec3` has a near-parallel guard. It **must not return `b`** (that ignores `t`): the
cities are 17–50 km apart, i.e. `dot > 0.9999`, and every hop would teleport.

**Route order matters.** The city aerials reach ±14 km and are gone beyond ~17 km, so on
short legs the two cities' images overlap and cover the handover. `FRANKEN_ROUTE` is
Bayreuth → Kulmbach → Kronach → Coburg → Bamberg: this keeps the longest leg at 41 km.
The reverse order puts Bayreuth → Bamberg (50 km) in, which leaves 16.7 km with no aerial
at all and a visible texture edge.

**VRAM is ~410 MB** (base 43, Europe 27, mid 53, route 110, 5 aerials 181). Texture upload
is queued one per frame via `pumpUploadQueue()` + `renderer.initTexture()`; without it the
upload happens on first render, i.e. mid-flight, and stutters. `appearRamp(readyAt)` fades
each texture in from the moment it is decoded — a plain `ready` bool pops, because by then
the distance fade is often already at 1.

**Image attribution is a licence obligation** (CC BY 4.0 for Bavaria DOP40, EOX Sentinel-2
cloudless and Solar System Scope). It lives in the Impressum / Legal Notice in `index.html`.

## Important Patterns

### 1. Performance-First Loading
Never bypass the lazy-loading pattern in main.js - it's critical for perceived performance. Three.js is expensive to parse.

### 2. Custom Post-Processing
The project uses custom EffectComposer files instead of Three.js examples because they're not treeshakeable. Active passes: ChromaticAberration → Vignette → FilmGrain → Glitch → CRT → FXAA (no Bloom). Several Pass/shader files are present but unused — see the dead-code list under "Key Files".

### 3. Embedded Multi-Language Content
Don't separate language files - the embedded approach in index.html is intentional for simplicity (no server-side i18n needed).

### 4. Manual Chunk Splitting
The build configuration manually splits chunks by library to enable independent browser caching. Don't remove manualChunks logic without understanding bundle size impact.

### 5. Service Worker Cache Strategy
The sw.js must never be cached itself (Cache-Control: no-cache). Only static assets get long-term caching. This ensures auto-updates work.

## Deployment Context

- **Live URL: `https://three.grashouse.de/`** — serves this `dist/` directly. (`grashouse.de/c1zz/globe-vite` is password-protected and is *not* the live site.)
- **Old version** still exists at `/var/www/vhosts/grashouse.de/c1zz/globe/` (PHP-based)
- **This version** is the modern replacement using Vite + PWA
- Server: grashouse.de with Apache
- Build output goes to `dist/` and requires SPA routing (mod_rewrite or nginx try_files)
- **File permissions: everything must be world-readable (644).** Vite copies permissions from `public/`, so a source file at 600 ships a file the web server cannot read — that is a **403, not a 404**, which is easy to misread when debugging. One such file breaks the *entire* service-worker install, because Workbox aborts precaching if a single entry fails. Check with `find public dist -type f ! -perm -o=r`.

## Browser Requirements

- Chrome/Edge 90+
- Firefox 88+
- Safari 15+
- WebGL support required
