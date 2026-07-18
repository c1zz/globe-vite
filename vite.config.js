import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      // NICHT 'img/**/*' aufnehmen: includeAssets legt alles ins Precache-Manifest, das
      // dann bei jedem Besucher komplett im Hintergrund geladen wird - hier waren das
      // 20.5 MB. Das widerspricht globPatterns (nur js/css/html/svg/woff) und der
      // runtimeCaching-Regel weiter unten, die Bilder ausdrücklich on-demand cachen soll.
      // Die Build-Meldung "precache N entries (X KiB)" zählt includeAssets NICHT mit und
      // verschleiert das.
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'c1zz - Space Portfolio',
        short_name: 'c1zz',
        description: 'Fullstack Developer and Space Pirate from Franconia',
        theme_color: '#000000',
        background_color: '#000000',
        display: 'standalone',
        orientation: 'any',
        icons: [
          {
            src: '/favicon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any maskable'
          }
        ]
      },
      workbox: {
        // Only precache critical assets (HTML, CSS, JS, fonts, favicon)
        // Textures are loaded on-demand via runtime caching
        globPatterns: ['**/*.{js,css,html,svg,woff,woff2}'],
        runtimeCaching: [
          {
            // Google Fonts
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365 // 1 year
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          },
          {
            // Textures (webp, png, jpg) - Cache on-demand instead of precache
            urlPattern: /\.(?:png|jpg|jpeg|webp)$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'image-cache',
              expiration: {
                maxEntries: 20,
                maxAgeSeconds: 60 * 60 * 24 * 30 // 30 days
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          }
        ]
      }
    })
  ],
  build: {
    target: 'es2020',
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true
      }
    },
    cssCodeSplit: true,
    rollupOptions: {
      output: {
        // Vite 8 nutzt rolldown: manualChunks() wird ignoriert, stattdessen
        // advancedChunks.groups (in Reihenfolge geprüft, erster Treffer gewinnt).
        // Ziel wie zuvor: three und gsap als eigene, unabhängig cachebare Chunks.
        advancedChunks: {
          groups: [
            { name: 'three', test: /node_modules[\\/]three/ },
            { name: 'gsap', test: /node_modules[\\/]gsap/ },
            { name: 'postprocessing', test: /(EffectComposer|Pass|Shader)/ },
            { name: 'app', test: /src[\\/]js[\\/]app/ },
            { name: 'scene', test: /src[\\/]js[\\/]scene/ }
          ]
        },
        // Chunk-Namen optimieren
        chunkFileNames: 'assets/[name]-[hash].js',
        entryFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]'
      }
    }
  },
  server: {
    port: 3000,
    open: true
  }
})
