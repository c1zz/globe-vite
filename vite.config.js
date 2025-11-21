import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'img/**/*'],
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
        manualChunks: (id) => {
          // Three.js separater Chunk
          if (id.includes('node_modules/three')) {
            return 'three';
          }
          // GSAP separater Chunk
          if (id.includes('node_modules/gsap')) {
            return 'gsap';
          }
          // Post-Processing in eigenen Chunk
          if (id.includes('EffectComposer') || id.includes('Pass') || id.includes('Shader')) {
            return 'postprocessing';
          }
          // App-Code
          if (id.includes('src/js/app')) {
            return 'app';
          }
          // Scene separat (größter Teil)
          if (id.includes('src/js/scene')) {
            return 'scene';
          }
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
