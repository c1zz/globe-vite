# .htaccess Konfiguration

Die `.htaccess` Datei wird automatisch von Vite verarbeitet:

```
public/.htaccess  →  (npm run build)  →  dist/.htaccess
```

---

## 📋 Features

### ✅ SPA Routing
```apache
# Alle Requests zu index.html (außer existierende Dateien)
RewriteRule . /index.html [L]
```

**Warum wichtig?**
- Ermöglicht Client-Side Routing
- URL-Pfade wie `/about`, `/projects` funktionieren

---

### ✅ GZIP Compression
```apache
AddOutputFilterByType DEFLATE text/html text/css application/javascript
```

**Performance-Gewinn:**
- ~70-80% kleinere Dateien
- Schnellerer Download
- Weniger Bandbreite

**Beispiel:**
- `index.js`: 500 KB → 127 KB (gzip)
- `style.css`: 19 KB → 4 KB (gzip)

---

### ✅ Browser Caching

#### Vite Assets (mit Hash)
```apache
# CSS/JS mit Hash im Dateinamen
ExpiresByType text/css "access plus 1 year"
ExpiresByType application/javascript "access plus 1 year"
Header set Cache-Control "public, max-age=31536000, immutable"
```

**Dateien:**
- `index-CbuR5CMF.js` ← Hash ändert sich bei Code-Änderung
- `three-BAwMaJQM.js`
- `index-Xyz123Ab.css`

**Vorteil:**
- ✅ 1 Jahr Cache = Instant Loading bei Wiederbesuch
- ✅ Bei Code-Änderung ändert sich Hash → Neue Datei wird geladen
- ✅ Kein manuelles Cache-Busting nötig!

#### HTML (kein Cache)
```apache
ExpiresByType text/html "access plus 0 seconds"
Header set Cache-Control "no-cache, no-store, must-revalidate"
```

**Warum?**
- `index.html` muss immer aktuell sein
- Enthält Referenzen zu neuen Hash-Dateien

#### Service Worker (NIEMALS cachen!)
```apache
<FilesMatch "sw\.js$">
  Header set Cache-Control "no-cache, no-store, must-revalidate, max-age=0"
</FilesMatch>
```

**WICHTIG für PWA:**
- Service Worker muss immer aktuell sein
- Sonst funktionieren Updates nicht!

---

### ✅ Security Headers

```apache
X-Frame-Options: SAMEORIGIN           # Clickjacking Protection
X-XSS-Protection: 1; mode=block       # XSS Protection
X-Content-Type-Options: nosniff       # MIME-Type Sniffing verhindern
Referrer-Policy: no-referrer-when-downgrade
```

---

## 🧪 Testen

### Cache Headers prüfen:
```bash
curl -I https://three.grashouse.de/assets/index-CbuR5CMF.js

# Erwartet:
# Cache-Control: public, max-age=31536000, immutable
# Content-Encoding: gzip
```

### GZIP prüfen:
```bash
curl -H "Accept-Encoding: gzip" -I https://three.grashouse.de/assets/three-BAwMaJQM.js

# Erwartet:
# Content-Encoding: gzip
```

### Service Worker Cache prüfen:
```bash
curl -I https://three.grashouse.de/sw.js

# Erwartet:
# Cache-Control: no-cache, no-store, must-revalidate
```

---

## 🔄 Workflow

### Development:
```bash
npm run dev
# → Vite Dev Server (eigene Cache-Regeln)
# → .htaccess wird NICHT verwendet
```

### Production:
```bash
npm run build
# → public/.htaccess wird nach dist/.htaccess kopiert
# → dist/ auf Server deployen
# → Apache liest dist/.htaccess
```

---

## 📊 Performance-Vergleich

### Ohne .htaccess:
```
index.html:     10 KB  (ungecacht, ungezippt)
index.js:      500 KB  (ungecacht, ungezippt)
three.js:      506 KB  (ungecacht, ungezippt)
style.css:      19 KB  (ungecacht, ungezippt)
-----------------------------------
GESAMT:      ~1035 KB bei JEDEM Besuch
```

### Mit .htaccess:
```
Erster Besuch:
  index.html:    10 KB  (ungezippt, kein Cache)
  index.js:     127 KB  (gzip)
  three.js:     127 KB  (gzip)
  style.css:      4 KB  (gzip)
  -----------------------------------
  GESAMT:      ~268 KB

Wiederbesuch (gecacht):
  index.html:    10 KB  (ungezippt, kein Cache)
  index.js:       0 KB  (Browser Cache!)
  three.js:       0 KB  (Browser Cache!)
  style.css:      0 KB  (Browser Cache!)
  -----------------------------------
  GESAMT:       ~10 KB 🚀
```

**Ergebnis:**
- ✅ 74% kleiner beim ersten Besuch
- ✅ 99% kleiner bei Wiederbesuchen
- ✅ Instant Loading!

---

## ⚙️ Apache Module erforderlich

Stelle sicher, dass diese Module aktiviert sind:

```bash
sudo a2enmod rewrite
sudo a2enmod deflate
sudo a2enmod expires
sudo a2enmod headers
sudo systemctl restart apache2
```

Prüfen:
```bash
apache2ctl -M | grep -E "rewrite|deflate|expires|headers"
```

---

## 🔧 Anpassungen

### HTTPS aktivieren:
```apache
# In .htaccess auskommentieren:
RewriteCond %{HTTPS} off
RewriteRule ^(.*)$ https://%{HTTP_HOST}/$1 [R=301,L]
```

### Cache-Dauer ändern:
```apache
# Statt 1 Jahr:
ExpiresByType text/css "access plus 1 year"

# Nur 1 Monat:
ExpiresByType text/css "access plus 1 month"
```

### Custom Error Pages:
```apache
ErrorDocument 404 /index.html
ErrorDocument 500 /index.html
```

---

## 📝 Hinweis

**Wichtig:**
- ✅ Die `.htaccess` ist automatisch in `dist/` enthalten
- ✅ Keine manuelle Konfiguration nötig
- ✅ Bei jedem Build wird sie neu kopiert
- ✅ Änderungen in `public/.htaccess` machen, dann neu builden
