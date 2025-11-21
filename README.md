# Globe Vite - PWA Version

Modern Vite + PWA build of the c1zz globe project.

## 🚀 Features

- ⚡ **Vite** - Blazing fast dev server with HMR
- 📦 **Optimized Build** - Code splitting & tree-shaking
- 📱 **PWA** - Offline support with Service Worker
- 🎨 **Three.js r181** - Latest Three.js via npm
- ✨ **GSAP** - Animation library via npm
- 🔄 **Auto Cache-Busting** - No manual versioning needed

## 📦 Installation

```bash
cd /var/www/vhosts/grashouse.de/c1zz/globe-vite
npm install
```

## 🛠️ Development

Start the development server:

```bash
npm run dev
```

Server läuft auf: `http://localhost:3000`

## 🏗️ Production Build

Build für Production:

```bash
npm run build
```

Build-Output: `dist/` Ordner

Preview Production Build:

```bash
npm run preview
```

## 📁 Projektstruktur

```
globe-vite/
├── public/          # Statische Assets (Bilder, Icons)
├── src/
│   ├── css/         # Stylesheets
│   ├── js/          # JavaScript & Three.js Modules
│   └── shaders/     # GLSL Shader
├── index.html       # HTML Entry Point
├── vite.config.js   # Vite & PWA Konfiguration
└── package.json     # Dependencies
```

## 🌐 Deployment

1. Build erstellen: `npm run build`
2. `dist/` Ordner auf Server deployen
3. Webserver konfigurieren (siehe unten)

### Apache Config

```apache
<Directory /var/www/vhosts/grashouse.de/c1zz/globe-vite/dist>
    Options -Indexes +FollowSymLinks
    AllowOverride All
    Require all granted

    # Enable Gzip
    AddOutputFilterByType DEFLATE text/html text/css application/javascript

    # Cache static assets
    <FilesMatch "\.(js|css|png|jpg|jpeg|gif|webp|svg|woff|woff2)$">
        Header set Cache-Control "max-age=31536000, public"
    </FilesMatch>
</Directory>
```

## 🔄 Unterschiede zur PHP-Version

- ✅ Keine PHP mehr (statisches HTML)
- ✅ Keine Import Maps (ES6 Modules via npm)
- ✅ Automatisches Cache-Busting
- ✅ Optimierte Bundles (Three.js + GSAP getrennt)
- ✅ Service Worker für Offline-Support
- ✅ Kleiner Build-Output (~500 KB vs ~2 MB)

## 🎯 Browser Support

- Chrome/Edge 90+
- Firefox 88+
- Safari 15+

## 📝 Alte PHP-Version

Die alte PHP-Version läuft weiterhin parallel:
`/var/www/vhosts/grashouse.de/c1zz/globe/`
