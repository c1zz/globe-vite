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
  - Network-based timeout (fast: 0ms, slow: 1200ms via Network Information API)

This achieves fast First Contentful Paint before heavy 3D assets load.

### Key Files & Responsibilities

**`src/js/main.js`** (54 lines) - Entry point with lazy-loading logic
**`src/js/app.js`** (797 lines) - UI layer: navigation, language switching, modals, GSAP animations
**`src/js/scene.js`** (1761 lines) - 3D layer: Three.js scene setup, objects (Earth/Moon/Mars), camera system, post-processing

**Post-processing files** - Custom EffectComposer implementation:
- `EffectComposer.js`, `RenderPass.js`, `ShaderPass.js`, `Pass.js` - Pipeline infrastructure
- `GlitchPass.js`, `UnrealBloomPass.js`, `FXAAShader.js` - Visual effects
- `src/shaders/*.js` - Custom GLSL shaders (vignette, film grain, chromatic aberration, etc.)

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
- Only critical assets (JS/CSS/HTML/fonts) are precached, not textures

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

## Three.js Scene Structure

**scene.js** contains:
- Single THREE.Scene with PerspectiveCamera (75° FOV)
- WebGLRenderer with OrbitControls
- **Objects**:
  - Earth: MeshStandardMaterial with normal/AO maps, atmosphere halo
  - Moon: Simplified sphere with diffuse/normal maps
  - Mars: Dune texture with atmosphere shader
  - Sun: DirectionalLight positioned for realistic lighting
- **Post-processing pipeline**: EffectComposer with RenderPass, FXAA, Bloom, Glitch, film effects
- **Custom shaders**: Vertex/fragment shaders for atmospheric glow (Fresnel effect)

## Important Patterns

### 1. Performance-First Loading
Never bypass the lazy-loading pattern in main.js - it's critical for perceived performance. Three.js is expensive to parse.

### 2. Custom Post-Processing
The project uses custom EffectComposer files instead of Three.js examples because they're not treeshakeable. All Pass classes and shaders are manually included.

### 3. Embedded Multi-Language Content
Don't separate language files - the embedded approach in index.html is intentional for simplicity (no server-side i18n needed).

### 4. Manual Chunk Splitting
The build configuration manually splits chunks by library to enable independent browser caching. Don't remove manualChunks logic without understanding bundle size impact.

### 5. Service Worker Cache Strategy
The sw.js must never be cached itself (Cache-Control: no-cache). Only static assets get long-term caching. This ensures auto-updates work.

## Deployment Context

- **Old version** still exists at `/var/www/vhosts/grashouse.de/c1zz/globe/` (PHP-based)
- **This version** is the modern replacement using Vite + PWA
- Server: grashouse.de with Apache
- Build output goes to `dist/` and requires SPA routing (mod_rewrite or nginx try_files)

## Browser Requirements

- Chrome/Edge 90+
- Firefox 88+
- Safari 15+
- WebGL support required
