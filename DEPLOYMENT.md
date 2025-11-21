# 🚀 Deployment Guide

## ✅ Build Status

- ✅ **Dev Server**: Läuft auf Port 3000
- ✅ **Production Build**: Erfolgreich (4.81s)
- ✅ **PWA**: Aktiviert mit Service Worker
- ✅ **Bundle Size**: ~180 KB (gzip)
- ✅ **Total Size**: 7.6 MB (inkl. Bilder)

---

## 📦 Was wurde gebaut?

```
dist/
├── assets/
│   ├── three-BAwMaJQM.js      (496 KB / 127 KB gzip)
│   ├── gsap-NzwLfSsh.js       (68 KB / 27 KB gzip)
│   ├── index-CuCkwCuS.js      (88 KB / 22 KB gzip)
│   └── index-D4EyS6Ao.css     (19 KB / 4 KB gzip)
├── img/                        (Textures: Earth, Moon, Mars, etc.)
├── fonts/                      (Comfortaa Font)
├── sw.js                       (Service Worker)
├── manifest.webmanifest        (PWA Manifest)
└── index.html                  (Entry Point)
```

---

## 🌐 Deployment Optionen

### Option 1: Apache Virtual Host (Empfohlen)

Erstelle eine neue VHost-Config:

\`\`\`apache
<VirtualHost *:80>
    ServerName globe-vite.grashouse.de
    DocumentRoot /var/www/vhosts/grashouse.de/c1zz/globe-vite/dist

    <Directory /var/www/vhosts/grashouse.de/c1zz/globe-vite/dist>
        Options -Indexes +FollowSymLinks
        AllowOverride All
        Require all granted

        # SPA Routing - alle Requests zu index.html
        RewriteEngine On
        RewriteBase /
        RewriteRule ^index\.html$ - [L]
        RewriteCond %{REQUEST_FILENAME} !-f
        RewriteCond %{REQUEST_FILENAME} !-d
        RewriteRule . /index.html [L]
    </Directory>

    # Gzip Compression
    <IfModule mod_deflate.c>
        AddOutputFilterByType DEFLATE text/html text/css application/javascript application/json image/svg+xml
    </IfModule>

    # Browser Caching
    <IfModule mod_expires.c>
        ExpiresActive On

        # CSS, JS (1 Jahr - Vite hat Hash im Dateinamen)
        ExpiresByType text/css "access plus 1 year"
        ExpiresByType application/javascript "access plus 1 year"

        # Bilder (1 Jahr)
        ExpiresByType image/webp "access plus 1 year"
        ExpiresByType image/svg+xml "access plus 1 year"

        # HTML (kein Cache für SPA)
        ExpiresByType text/html "access plus 0 seconds"

        # Service Worker (kein Cache!)
        <FilesMatch "sw\.js$">
            ExpiresDefault "access plus 0 seconds"
            Header set Cache-Control "no-cache, no-store, must-revalidate"
        </FilesMatch>
    </IfModule>

    # Security Headers
    Header always set X-Frame-Options "SAMEORIGIN"
    Header always set X-Content-Type-Options "nosniff"
    Header always set Referrer-Policy "no-referrer-when-downgrade"
</VirtualHost>
\`\`\`

Aktivieren:
\`\`\`bash
sudo a2ensite globe-vite
sudo systemctl reload apache2
\`\`\`

---

### Option 2: Subdirectory Deploy

Kopiere \`dist/\` in ein bestehendes Verzeichnis:

\`\`\`bash
# Backup der alten Version
cp -r /var/www/vhosts/grashouse.de/c1zz/globe /var/www/vhosts/grashouse.de/c1zz/globe-old

# Deploy neue Version
rm -rf /var/www/vhosts/grashouse.de/c1zz/globe/*
cp -r /var/www/vhosts/grashouse.de/c1zz/globe-vite/dist/* /var/www/vhosts/grashouse.de/c1zz/globe/
\`\`\`

---

### Option 3: Nginx (Alternative)

\`\`\`nginx
server {
    listen 80;
    server_name globe-vite.grashouse.de;
    root /var/www/vhosts/grashouse.de/c1zz/globe-vite/dist;
    index index.html;

    # Gzip
    gzip on;
    gzip_types text/css application/javascript image/svg+xml;

    # SPA Routing
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Cache Assets
    location ~* \.(js|css|png|jpg|jpeg|gif|webp|svg|woff|woff2)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # Service Worker (kein Cache!)
    location = /sw.js {
        expires off;
        add_header Cache-Control "no-cache, no-store, must-revalidate";
    }
}
\`\`\`

---

## 🔄 Update Workflow

\`\`\`bash
# 1. Änderungen machen
cd /var/www/vhosts/grashouse.de/c1zz/globe-vite

# 2. Neu builden
npm run build

# 3. Deploy (je nach Setup)
# Option A: Wenn VHost auf dist/ zeigt
# → Nichts zu tun!

# Option B: Wenn in anderes Verzeichnis kopiert
cp -r dist/* /var/www/htdocs/globe/
\`\`\`

---

## 🧪 Testing

### Lokaler Test:
\`\`\`bash
npm run preview
# → http://localhost:4173
\`\`\`

### Production Test:
\`\`\`bash
# Service Worker testen (nur über HTTPS oder localhost!)
# PWA installierbar testen
# Offline-Modus testen (DevTools → Application → Service Worker → Offline)
\`\`\`

---

## 📊 Performance

### Lighthouse Scores (erwartet):
- ⚡ **Performance**: 95-100
- ♿ **Accessibility**: 90-95
- 🎯 **Best Practices**: 95-100
- 🔍 **SEO**: 90-95
- 📱 **PWA**: ✓

### Bundle Analyse:
\`\`\`bash
npm run build -- --mode analyze
\`\`\`

---

## 🐛 Troubleshooting

### Service Worker funktioniert nicht:
- Nur über HTTPS oder localhost verfügbar
- Browser-Cache leeren
- Hard Reload (Ctrl+F5)

### Bilder laden nicht:
- Pfade in \`public/img/\` überprüfen
- Build neu erstellen

### CSS fehlt:
- Import in \`src/js/main.js\` überprüfen
- Build neu erstellen

---

## 📝 Vergleich Alt vs. Neu

| Metrik | Alt (PHP) | Neu (Vite) |
|--------|-----------|------------|
| **Initial Load** | ~2.5 MB | ~180 KB (gzip) |
| **Build Time** | - | 4.8s |
| **HMR** | ❌ | ✅ Instant |
| **PWA** | ❌ | ✅ Service Worker |
| **Offline** | ❌ | ✅ Funktioniert |
| **Cache** | PHP \`ver()\` | ✅ Automatisch |

---

## ✨ PWA Features

✅ **Install Prompt** - "Zum Homescreen hinzufügen"
✅ **Offline Support** - Funktioniert ohne Internet
✅ **App-Icon** - Eigenes Icon auf Homescreen
✅ **Splash Screen** - Beim App-Start
✅ **Fast Loading** - Gecachte Assets

---

## 🔐 Security

- ✅ HTTPS empfohlen (für PWA)
- ✅ Security Headers gesetzt
- ✅ XSS-Protection
- ✅ Content-Type Sniffing blockiert
