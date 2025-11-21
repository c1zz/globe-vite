// Vite Entry Point
import '../css/style.css'
import './app.js'

// Lazy load scene after initial render (Performance optimization)
// This defers loading of Three.js (~130 KB) + textures (~639 KB) until after FCP
let sceneLoaded = false

function loadScene() {
  if (!sceneLoaded) {
    sceneLoaded = true
    import('./scene.js')
  }
}

// Detect connection speed to optimize loading strategy
function getConnectionDelay() {
  // Check Network Information API
  const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection

  if (connection) {
    const effectiveType = connection.effectiveType

    // Fast connections (4G, 5G): Load immediately
    if (effectiveType === '4g' || effectiveType === '5g') {
      return 0
    }

    // Slow connections (2G, 3G, slow-2g): Delay to prioritize critical content
    if (effectiveType === '2g' || effectiveType === 'slow-2g' || effectiveType === '3g') {
      return 1200
    }
  }

  // Unknown connection or no API support: Load quickly (optimistic)
  return 200
}

// Load scene after user interaction OR after connection-based delay
const loadOnInteraction = () => {
  loadScene()
  // Remove listeners after first trigger
  window.removeEventListener('scroll', loadOnInteraction)
  window.removeEventListener('mousemove', loadOnInteraction)
  window.removeEventListener('touchstart', loadOnInteraction)
}

window.addEventListener('scroll', loadOnInteraction, { passive: true })
window.addEventListener('mousemove', loadOnInteraction, { passive: true })
window.addEventListener('touchstart', loadOnInteraction, { passive: true })

// Fallback: Load based on connection speed
const delay = getConnectionDelay()
setTimeout(loadScene, delay)
