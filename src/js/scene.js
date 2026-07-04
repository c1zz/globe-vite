import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { Lensflare, LensflareElement } from 'three/examples/jsm/objects/Lensflare.js'
import gsap from 'gsap'
import { EffectComposer } from './EffectComposer.js'
import { RenderPass } from './RenderPass.js'
import { ShaderPass } from './ShaderPass.js'
import { FXAAShader } from './FXAAShader.js'
import { GlitchPass } from './GlitchPass.js'
import { VignetteShader } from '../shaders/VignetteShader.js'
import { FilmGrainShader } from '../shaders/FilmGrainShader.js'
import { ChromaticAberrationShader } from '../shaders/ChromaticAberrationShader.js'
import { CRTShader } from '../shaders/CRTShader.js'

const tl = gsap.timeline()

const vertexShader = `
  varying vec2 vertexUV;
  varying vec3 vertexNormal;
  varying vec3 vertexPosition;

  void main() {
    vertexUV = uv;
    vertexNormal = normalize(normalMatrix * normal);
    vertexPosition = (modelMatrix * vec4(position, 1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const fragmentShader = `
  uniform sampler2D globeTexture;
  uniform vec3 sunPosition;
  varying vec2 vertexUV;
  varying vec3 vertexNormal;
  varying vec3 vertexPosition;

  void main() {
    // Beleuchtung von der Sonne - feste Richtung wie DirectionalLight
    vec3 lightDir = normalize(vec3(-1.0, 0.25, -1.5));
    float diffuse = max(dot(vertexNormal, lightDir), 0.0);

    // Atmosphären-Effekt nur auf beleuchteter Seite
    float intensity = 1.05 - dot(vertexNormal, vec3(0.0, 0.0, 1.0));
    vec3 atmosphere = vec3(0.3, 0.6, 1.0) * pow(intensity, 1.5) * 0.3 * diffuse;

    // Textur mit Beleuchtung kombinieren - hellere beleuchtete Seite
    vec3 textureColor = texture2D(globeTexture, vertexUV).xyz;
    vec3 litColor = textureColor * (diffuse * 5.0 + 0.15);

    gl_FragColor = vec4(atmosphere + litColor, 1.0);
  }
`

const atmosphereVertex = `
  varying vec3 vertexNormal;
  varying vec3 vertexPosition;
  varying vec3 vViewPosition;

  void main() {
    vertexNormal = normalize(normalMatrix * normal);
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    vertexPosition = (modelMatrix * vec4(position, 1.0)).xyz;
    vViewPosition = -mvPosition.xyz;

    gl_Position = projectionMatrix * mvPosition;
  }
`

const atmosphereFragment = `
  uniform vec3 sunPosition;
  uniform vec3 atmosphereColor;
  varying vec3 vertexNormal;
  varying vec3 vertexPosition;
  varying vec3 vViewPosition;

  void main() {
    vec3 viewDir = normalize(vViewPosition);
    vec3 normal = normalize(vertexNormal);

    // Korrekter Fresnel-Effekt: stärker am Rand, schwächer in der Mitte
    float fresnel = 1.0 - max(dot(viewDir, normal), 0.0);
    fresnel = pow(fresnel, 3.5);  // Exponent für schärferen Randeffekt

    // Beleuchtung von der Sonne
    vec3 lightDir = normalize(sunPosition - vertexPosition);
    float sunDot = max(dot(normal, lightDir), 0.0);

    // Atmosphäre nur auf sonnenbeschienener Seite
    float atmosphereGlow = fresnel * sunDot;

    // Subtilerer Alpha-Wert
    float alpha = atmosphereGlow * 0.6;

    gl_FragColor = vec4(atmosphereColor, alpha);
  }
`

// Removed unused Mars shader code (vertexShaderMars, fragmentShaderMars, atmosphereVertexMars, atmosphereFragmentMars)
// Mars mesh uses MeshStandardMaterial instead

const scene = new THREE.Scene()
const camera = new THREE.PerspectiveCamera(
  75,
  innerWidth / innerHeight,
  0.1,
  15000
)

// WebGL Error-Handling
let renderer
try {
  renderer = new THREE.WebGLRenderer({
    antialias: false,
    canvas: document.querySelector('canvas'),
    powerPreference: 'high-performance',
    alpha: true
  })

  renderer.setSize(innerWidth, innerHeight)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
} catch (error) {
  console.error('WebGL initialization failed:', error)
  // Show user-friendly error message
  document.body.innerHTML = `
    <div style="display: flex; align-items: center; justify-content: center; height: 100vh; flex-direction: column; font-family: comfortaa, sans-serif; color: white; text-align: center; padding: 2rem;">
      <h1 style="color: #ff0000; margin-bottom: 1rem;">WebGL Not Supported</h1>
      <p>Your browser or device does not support WebGL, which is required to display this 3D experience.</p>
      <p>Please try:</p>
      <ul style="text-align: left; margin-top: 1rem;">
        <li>Updating your browser to the latest version</li>
        <li>Enabling hardware acceleration in your browser settings</li>
        <li>Using a different browser (Chrome, Firefox, Edge recommended)</li>
      </ul>
    </div>
  `
  throw error // Stop execution
}

// Debug Helpers (deaktiviert)
const axesHelper = new THREE.AxesHelper(100)
axesHelper.visible = false
scene.add(axesHelper)

// Grid at Earth
const gridHelper = new THREE.GridHelper(200, 20, 0x00ffff, 0x444444)
gridHelper.visible = false
scene.add(gridHelper)

// Grid at Moon
const gridHelperMoon = new THREE.GridHelper(50, 10, 0xffff00, 0x444444)
gridHelperMoon.position.set(50, 0, 0)
gridHelperMoon.visible = false
scene.add(gridHelperMoon)

// Grid at Mars
const gridHelperMars = new THREE.GridHelper(100, 20, 0xff0000, 0x444444)
gridHelperMars.position.set(500, 0, 500)
gridHelperMars.visible = false
scene.add(gridHelperMars)

// Cache DOM elements for animation loop (Performance)
const camPosElement = document.getElementById('cam-pos')
const camRotElement = document.getElementById('cam-rot')
const orbitTargetElement = document.getElementById('orbit-target')

const textureLoader = new THREE.TextureLoader()

const earthTexture = textureLoader.load('/img/earth_opt.webp')
earthTexture.anisotropy = renderer.capabilities.getMaxAnisotropy()
earthTexture.minFilter = THREE.LinearMipmapLinearFilter
earthTexture.magFilter = THREE.LinearFilter

const earthLightsTexture = textureLoader.load('/img/earth_lights.webp')
earthLightsTexture.anisotropy = renderer.capabilities.getMaxAnisotropy()
earthLightsTexture.minFilter = THREE.LinearMipmapLinearFilter
earthLightsTexture.magFilter = THREE.LinearFilter

const cloudsTexture = textureLoader.load('/img/clouds_opt.webp')
cloudsTexture.anisotropy = renderer.capabilities.getMaxAnisotropy()
cloudsTexture.minFilter = THREE.LinearMipmapLinearFilter
cloudsTexture.magFilter = THREE.LinearFilter

const moonTexture = textureLoader.load('/img/moon_opt.webp')
moonTexture.anisotropy = renderer.capabilities.getMaxAnisotropy()
moonTexture.minFilter = THREE.LinearMipmapLinearFilter
moonTexture.magFilter = THREE.LinearFilter

const marsTexture = textureLoader.load('/img/mars_opt.webp')
marsTexture.anisotropy = renderer.capabilities.getMaxAnisotropy()
marsTexture.minFilter = THREE.LinearMipmapLinearFilter
marsTexture.magFilter = THREE.LinearFilter

// Lensflare Texturen
const textureFlare0 = textureLoader.load('/img/lensflare_opt.png')
const textureFlare0Alpha = textureLoader.load('/img/lensflare0_alpha.png')
const textureFlare3 = textureLoader.load('/img/lensflare3.png')

const sphere = new THREE.Mesh(
  new THREE.SphereGeometry(5, 64, 64),
  new THREE.MeshStandardMaterial({
    map: earthTexture,
    metalness: 0.0,
    roughness: 1.0
  })
)
sphere.rotation.y = THREE.MathUtils.degToRad(115)
sphere.rotation.x = THREE.MathUtils.degToRad(-30)

// Night Lights Layer - nur auf dunkler Seite sichtbar
const nightLightsVertex = `
  varying vec2 vUv;
  varying vec3 vNormal;

  void main() {
    vUv = uv;
    // Transform normal to world space (not view space!)
    vNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const nightLightsFragment = `
  uniform sampler2D lightsMap;
  uniform vec3 sunDirection;
  varying vec2 vUv;
  varying vec3 vNormal;

  void main() {
    // Berechne wie dunkel diese Stelle ist (both in world space now)
    float sunDot = dot(vNormal, sunDirection);

    // Sanfterer Cut - discard erst bei mehr Tageslicht
    if (sunDot > 0.05) {
      discard;
    }

    // Weicher Übergang zur Nachtseite - größerer Bereich für sanfteren Fade
    float nightFactor = smoothstep(0.05, -0.15, sunDot);

    // Lade Night Lights Textur
    vec3 lights = texture2D(lightsMap, vUv).rgb;

    // Warmer gelber Farbton für die Lichter
    vec3 warmColor = vec3(1.0, 0.9, 0.6);

    // Zeige Lichter nur auf Nachtseite mit erhöhter Intensität
    vec3 finalColor = lights * warmColor * nightFactor * 1.5;

    gl_FragColor = vec4(finalColor, nightFactor);
  }
`

const nightLights = new THREE.Mesh(
  new THREE.SphereGeometry(5.005, 64, 64),
  new THREE.ShaderMaterial({
    vertexShader: nightLightsVertex,
    fragmentShader: nightLightsFragment,
    uniforms: {
      lightsMap: { value: earthLightsTexture },
      sunDirection: { value: new THREE.Vector3(-1.0, 0.25, -1.5).normalize() }
    },
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  })
)
nightLights.rotation.y = THREE.MathUtils.degToRad(115)
nightLights.rotation.x = THREE.MathUtils.degToRad(-30)

const clouds = new THREE.Mesh(
  new THREE.SphereGeometry(5.01, 64, 64),
  new THREE.MeshStandardMaterial({
    map: cloudsTexture,
    transparent: true,
    opacity: 0.7,
    alphaTest: 0.1,
    metalness: 0.0,
    roughness: 1.0
  })
)
clouds.rotation.y = THREE.MathUtils.degToRad(115)
clouds.rotation.x = THREE.MathUtils.degToRad(-30)

const atmosphere = new THREE.Mesh(
  new THREE.SphereGeometry(5.08, 64, 64),  // Größerer Radius für sichtbarere Atmosphäre
  new THREE.ShaderMaterial({
    vertexShader: atmosphereVertex,
    fragmentShader: atmosphereFragment,
    blending: THREE.AdditiveBlending,
    transparent: true,
    depthWrite: false,
    side: THREE.FrontSide,  // FrontSide statt BackSide
    uniforms: {
      sunPosition: {
        value: new THREE.Vector3(-2000, 500, -3000)
      },
      atmosphereColor: {
        value: new THREE.Vector3(0.3, 0.6, 1.0)
      }
    }
  })
)
atmosphere.rotation.y = THREE.MathUtils.degToRad(115)
atmosphere.rotation.x = THREE.MathUtils.degToRad(-30)
scene.add(atmosphere)

const moon = new THREE.Mesh(
  new THREE.SphereGeometry(1, 32, 32),
  new THREE.MeshStandardMaterial({
    map: moonTexture,
    roughness: 1.0,
    metalness: 0.0
  })
)
moon.position.set(50, 0, 0)

const mars = new THREE.Mesh(
  new THREE.SphereGeometry(4, 32, 32),
  new THREE.MeshStandardMaterial({
    map: marsTexture,
    metalness: 0.0,
    roughness: 1.0,
    emissive: 0xcc5533,  // Rötlich-orange Selbstleuchtung
    emissiveIntensity: 0.22,  // Leicht erhöhte Intensität
    emissiveMap: marsTexture  // Nutzt die Mars-Textur für emissive
  })
)
mars.position.set(500, 0, 500)

// Einfachere Mars-Atmosphäre ohne BackSide
const atmosphereMars = new THREE.Mesh(
  new THREE.SphereGeometry(4.15, 32, 32),
  new THREE.MeshBasicMaterial({
    color: 0xff6b4a,
    transparent: true,
    opacity: 0.15,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.FrontSide
  })
)
atmosphereMars.position.set(500, 0, 500)

const group = new THREE.Group()
group.add(sphere, nightLights, clouds, atmosphere, moon, mars)
scene.add(group)

// Removed unused functions: calcPosFromLatLongRad, homePoint object

const starGeometry = new THREE.BufferGeometry()
const starMaterial = new THREE.PointsMaterial({
  color: 0xffffff,
  size: 1,
  sizeAttenuation: true,
  transparent: true,
  opacity: 0.8
})

const starVerticies = []
const starSizes = []
const starTwinkleSpeed = []

for (let i = 0; i < 5000; i++) {
  const theta = Math.random() * Math.PI * 2
  const phi = Math.acos(2 * Math.random() - 1)
  const radius = Math.random() * 5000 + 5000

  const x = radius * Math.sin(phi) * Math.cos(theta)
  const y = radius * Math.sin(phi) * Math.sin(theta)
  const z = radius * Math.cos(phi)

  starVerticies.push(x, y, z)

  // Verschiedene Sterngrößen für mehr Variation
  starSizes.push(Math.random() * 2 + 0.5)

  // Zufällige Twinkle-Geschwindigkeit
  starTwinkleSpeed.push(Math.random() * 0.02 + 0.005)
}

starGeometry.setAttribute(
  'position',
  new THREE.Float32BufferAttribute(starVerticies, 3)
)

starGeometry.setAttribute(
  'size',
  new THREE.Float32BufferAttribute(starSizes, 1)
)

// Custom shader für funkelnde Sterne
const starVertexShader = `
  attribute float size;
  varying float vSize;

  void main() {
    vSize = size;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = size * (300.0 / -mvPosition.z);
    gl_Position = projectionMatrix * mvPosition;
  }
`

const starFragmentShader = `
  uniform float time;
  varying float vSize;

  void main() {
    vec2 center = gl_PointCoord - 0.5;
    float dist = length(center);

    if (dist > 0.5) discard;

    // Twinkle-Effekt basierend auf Position und Zeit
    float twinkle = sin(time * (vSize + 1.0) + vSize * 100.0) * 0.3 + 0.7;

    float alpha = (1.0 - dist * 2.0) * twinkle;
    // Hellere Sterne mit starkem Bloom-Push
    vec3 starColor = vec3(2.0, 2.0, 2.2); // Deutlich heller für Bloom
    gl_FragColor = vec4(starColor, alpha);
  }
`

const starShaderMaterial = new THREE.ShaderMaterial({
  uniforms: {
    time: { value: 0.0 }
  },
  vertexShader: starVertexShader,
  fragmentShader: starFragmentShader,
  transparent: true,
  blending: THREE.AdditiveBlending,
  depthWrite: false
})

const stars = new THREE.Points(starGeometry, starShaderMaterial)
scene.add(stars)

// Nebel/Galaxie im Hintergrund
const nebulaVertexShader = `
  varying vec2 vUv;
  varying vec3 vPosition;

  void main() {
    vUv = uv;
    vPosition = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const nebulaFragmentShader = `
  uniform float time;
  varying vec2 vUv;
  varying vec3 vPosition;

  // Simplex noise function
  vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec3 permute(vec3 x) { return mod289(((x*34.0)+1.0)*x); }

  float snoise(vec2 v) {
    const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
    vec2 i  = floor(v + dot(v, C.yy));
    vec2 x0 = v - i + dot(i, C.xx);
    vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
    vec4 x12 = x0.xyxy + C.xxzz;
    x12.xy -= i1;
    i = mod289(i);
    vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
    vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
    m = m*m;
    m = m*m;
    vec3 x = 2.0 * fract(p * C.www) - 1.0;
    vec3 h = abs(x) - 0.5;
    vec3 ox = floor(x + 0.5);
    vec3 a0 = x - ox;
    m *= 1.79284291400159 - 0.85373472095314 * (a0*a0 + h*h);
    vec3 g;
    g.x  = a0.x  * x0.x  + h.x  * x0.y;
    g.yz = a0.yz * x12.xz + h.yz * x12.yw;
    return 130.0 * dot(m, g);
  }

  void main() {
    vec2 uv = vUv * 3.0;

    // Multi-layered noise für Nebel-Effekt
    float n1 = snoise(uv * 0.5 + time * 0.01);
    float n2 = snoise(uv * 1.0 - time * 0.015);
    float n3 = snoise(uv * 2.0 + time * 0.02);

    float noise = (n1 + n2 * 0.5 + n3 * 0.25) / 1.75;

    // Nebel-Farben (Lila/Blau/Pink Galaxie)
    vec3 color1 = vec3(0.1, 0.05, 0.3);  // Dunkelblau
    vec3 color2 = vec3(0.4, 0.1, 0.5);   // Lila
    vec3 color3 = vec3(0.6, 0.2, 0.7);   // Pink

    vec3 finalColor = mix(color1, color2, noise * 0.5 + 0.5);
    finalColor = mix(finalColor, color3, noise * 0.3);

    // Fade zu den Rändern
    float vignette = 1.0 - length(vUv - 0.5) * 1.2;
    vignette = smoothstep(0.0, 1.0, vignette);

    float alpha = (noise * 0.3 + 0.1) * vignette * 0.4;

    gl_FragColor = vec4(finalColor, alpha);
  }
`

const nebulaMaterial = new THREE.ShaderMaterial({
  uniforms: {
    time: { value: 0.0 }
  },
  vertexShader: nebulaVertexShader,
  fragmentShader: nebulaFragmentShader,
  transparent: true,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
  side: THREE.BackSide
})

const nebulaGeometry = new THREE.SphereGeometry(9000, 24, 24)
const nebula = new THREE.Mesh(nebulaGeometry, nebulaMaterial)
scene.add(nebula)

// Sun Glow - Leuchtende Sonne (viel heller für Bloom)
const sunGeometry = new THREE.SphereGeometry(25, 64, 64)
const sunMaterial = new THREE.ShaderMaterial({
  uniforms: {
    time: { value: 0.0 }
  },
  vertexShader: `
    varying vec3 vNormal;
    varying vec3 vPosition;

    void main() {
      vNormal = normalize(normalMatrix * normal);
      vPosition = position;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform float time;
    varying vec3 vNormal;
    varying vec3 vPosition;

    // Noise function für Oberflächenstruktur
    float random(vec2 st) {
      return fract(sin(dot(st.xy, vec2(12.9898,78.233))) * 43758.5453123);
    }

    float noise(vec2 st) {
      vec2 i = floor(st);
      vec2 f = fract(st);
      float a = random(i);
      float b = random(i + vec2(1.0, 0.0));
      float c = random(i + vec2(0.0, 1.0));
      float d = random(i + vec2(1.0, 1.0));
      vec2 u = f * f * (3.0 - 2.0 * f);
      return mix(a, b, u.x) + (c - a)* u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
    }

    void main() {
      // Sphärische Koordinaten für Textur
      vec3 pos = normalize(vPosition);
      vec2 uv = vec2(atan(pos.x, pos.z), asin(pos.y)) * 3.0;

      // Sonnenoberfläche: Subtile granulare Struktur
      float surface = noise(uv * 4.0 + time * 0.03) * 0.15;
      surface += noise(uv * 8.0 + time * 0.05) * 0.08;

      // Zentrum heller als Rand (Limb Darkening)
      float radial = 1.0 - dot(normalize(vNormal), vec3(0.0, 0.0, 1.0));
      float limbDarkening = 1.0 - pow(radial, 2.0);

      // Zentrum: Fast weiß, Rand: Warm gelb-orange
      vec3 centerColor = vec3(1.0, 1.0, 0.9);
      vec3 edgeColor = vec3(1.0, 0.8, 0.4);
      vec3 sunColor = mix(edgeColor, centerColor, limbDarkening);

      // Pulsierende Aktivität
      float pulse = sin(time * 0.5) * 0.05 + 0.95;

      // Helligkeit
      float brightness = (0.9 + surface * 0.3) * pulse;
      vec3 finalColor = sunColor * brightness * 4.0;

      gl_FragColor = vec4(finalColor, 1.0);
    }
  `,
  side: THREE.FrontSide
})

const sun = new THREE.Mesh(sunGeometry, sunMaterial)
sun.position.set(-2000, 500, -3000) // Weit hinten links
scene.add(sun)

// Subtiler Glow nur für die Sonne (für realistische Überblendung)
const sunGlowGeometry = new THREE.SphereGeometry(95, 64, 64)
const sunGlowMaterial = new THREE.ShaderMaterial({
  uniforms: {
    time: { value: 0.0 }
  },
  vertexShader: `
    varying vec3 vNormal;
    varying vec3 vPosition;

    void main() {
      vNormal = normalize(normalMatrix * normal);
      vPosition = position;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform float time;
    varying vec3 vNormal;
    varying vec3 vPosition;

    void main() {
      vec3 viewDirection = vec3(0.0, 0.0, 1.0);

      // Sanfter radialer Gradient von innen nach außen
      float radialDist = length(vPosition) / 95.0;
      float gradient = 1.0 - smoothstep(0.75, 1.0, radialDist);

      // Fresnel für Rand-Effekt
      float fresnel = pow(0.6 - dot(vNormal, viewDirection), 1.5);

      float intensity = gradient * fresnel;
      float pulse = sin(time * 0.5) * 0.1 + 0.9;

      vec3 glowColor = vec3(1.0, 0.85, 0.6); // Warmes Gelb-Orange
      gl_FragColor = vec4(glowColor * intensity * pulse * 1.5, intensity * 0.3);
    }
  `,
  transparent: true,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
  side: THREE.BackSide
})

const sunGlow = new THREE.Mesh(sunGlowGeometry, sunGlowMaterial)
sunGlow.position.copy(sun.position)
scene.add(sunGlow)

// Volumetrische Sonnenstrahlen als 3D-Objekte
const sunRaysGroup = new THREE.Group()

// Innere Strahlen - hell, breit, weniger Strahlen
const innerRayCount = 8
const innerRayLength = 500
const innerRayWidth = 180

for (let i = 0; i < innerRayCount; i++) {
  // Leicht unregelmäßige Winkelverteilung
  const baseAngle = (i / innerRayCount) * Math.PI * 2
  const randomOffset = (Math.random() - 0.5) * 0.2
  const angle = baseAngle + randomOffset

  const rayGeometry = new THREE.PlaneGeometry(innerRayWidth, innerRayLength)
  const rayMaterial = new THREE.ShaderMaterial({
    uniforms: {
      time: { value: 0.0 },
      opacity: { value: 1.0 }
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float time;
      uniform float opacity;
      varying vec2 vUv;

      // HSV zu RGB Konvertierung für Regenbogenfarben
      vec3 hsv2rgb(vec3 c) {
        vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
        vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
        return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
      }

      void main() {
        // Radiale Gradient von innen nach außen
        float radialGradient = 1.0 - vUv.y;

        // Seitlicher Gradient für schmale Form
        float sideGradient = 1.0 - abs(vUv.x - 0.5) * 2.0;
        sideGradient = smoothstep(0.0, 0.6, sideGradient);

        // Kombiniere Gradienten
        float alpha = radialGradient * sideGradient;
        alpha = pow(alpha, 1.5); // Noch weicherer Falloff für mehr Intensität

        // Dramatischer Pulsierender Effekt
        float pulse = sin(time * 0.4 + vUv.y * 3.5) * 0.25 + 0.75;
        alpha *= pulse;

        // Regenbogen-Effekt entlang des Strahls
        float hue = vUv.y * 0.15 + time * 0.02; // Subtile Variation + Animation
        vec3 rainbowColor = hsv2rgb(vec3(hue, 0.6, 1.0));

        // Warme Sonnenfarbe
        vec3 warmColor = vec3(1.0, 0.95, 0.75);

        // Mische warme Farbe mit Regenbogen (70% warm, 30% Regenbogen)
        vec3 color = mix(warmColor, rainbowColor, 0.3);

        gl_FragColor = vec4(color, alpha * 0.85 * opacity); // Viel heller
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide
  })

  const ray = new THREE.Mesh(rayGeometry, rayMaterial)
  ray.position.y = innerRayLength / 2

  const rayGroup = new THREE.Group()
  rayGroup.add(ray)
  rayGroup.rotation.z = angle

  sunRaysGroup.add(rayGroup)
}

// Äußere Strahlen - dünner, länger, regelmäßig, dunkler
const outerRayCount = 20
const outerRayLength = 800
const outerRayWidth = 90

for (let i = 0; i < outerRayCount; i++) {
  // Regelmäßige Verteilung
  const angle = (i / outerRayCount) * Math.PI * 2

  const rayGeometry = new THREE.PlaneGeometry(outerRayWidth, outerRayLength)
  const rayMaterial = new THREE.ShaderMaterial({
    uniforms: {
      time: { value: 0.0 },
      opacity: { value: 1.0 }
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float time;
      uniform float opacity;
      varying vec2 vUv;

      // HSV zu RGB Konvertierung für Regenbogenfarben
      vec3 hsv2rgb(vec3 c) {
        vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
        vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
        return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
      }

      void main() {
        // Radiale Gradient von innen nach außen
        float radialGradient = 1.0 - vUv.y;

        // Seitlicher Gradient für schmale Form
        float sideGradient = 1.0 - abs(vUv.x - 0.5) * 2.0;
        sideGradient = smoothstep(0.0, 0.7, sideGradient);

        // Kombiniere Gradienten
        float alpha = radialGradient * sideGradient;
        alpha = pow(alpha, 2.2); // Weniger starker Falloff für mehr Sichtbarkeit

        // Dramatischer Pulsierender Effekt
        float pulse = sin(time * 0.35 + vUv.y * 3.0) * 0.2 + 0.8;
        alpha *= pulse;

        // Regenbogen-Effekt entlang des Strahls (leicht versetzt zu inneren Strahlen)
        float hue = vUv.y * 0.15 + time * 0.025; // Subtile Variation + etwas schnellere Animation
        vec3 rainbowColor = hsv2rgb(vec3(hue, 0.5, 1.0));

        // Warme Sonnenfarbe
        vec3 warmColor = vec3(1.0, 0.92, 0.72);

        // Mische warme Farbe mit Regenbogen (75% warm, 25% Regenbogen für äußere Strahlen)
        vec3 color = mix(warmColor, rainbowColor, 0.25);

        gl_FragColor = vec4(color, alpha * 0.5 * opacity); // Heller
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide
  })

  const ray = new THREE.Mesh(rayGeometry, rayMaterial)
  ray.position.y = outerRayLength / 2

  const rayGroup = new THREE.Group()
  rayGroup.add(ray)
  rayGroup.rotation.z = angle

  sunRaysGroup.add(rayGroup)
}

sunRaysGroup.position.copy(sun.position)
scene.add(sunRaysGroup)

// Target opacity für Sun Rays (für smooth fade)
let sunRaysTargetOpacity = 1.0
let sunRaysCurrentOpacity = 1.0

// Lensflare
const lensflare = new Lensflare()
//lensflare.addElement(new LensflareElement(textureFlare0, 500, 0))
//lensflare.addElement(new LensflareElement(textureFlare0, 600, 0, new THREE.Color(0.3, 0.3, 0.3)))
//lensflare.addElement(new LensflareElement(textureFlare0, 700, 0, new THREE.Color(0.15, 0.15, 0.15)))
//lensflare.addElement(new LensflareElement(textureFlare0Alpha, 500, 0, new THREE.Color(0.7, 0.7, 0.7)))
//lensflare.addElement(new LensflareElement(textureFlare0Alpha, 600, 0, new THREE.Color(0.3, 0.3, 0.3)))
//lensflare.addElement(new LensflareElement(textureFlare0Alpha, 700, 0, new THREE.Color(0.15, 0.15, 0.15)))
lensflare.addElement(new LensflareElement(textureFlare3, 60, 0.6))
lensflare.addElement(new LensflareElement(textureFlare3, 70, 0.7))
lensflare.addElement(new LensflareElement(textureFlare3, 120, 0.9))
lensflare.addElement(new LensflareElement(textureFlare3, 70, 1))
sun.add(lensflare)

// Sonnenlicht - Hauptlichtquelle
const sunLight = new THREE.DirectionalLight(0xffffff, 11.0)
sunLight.position.set(-1.0, 0.25, -1.5) // Richtung normalisiert
scene.add(sunLight)

// Minimales Ambient Light
const ambientLight = new THREE.AmbientLight(0x111122, 0.15)
scene.add(ambientLight)

// Postprocessing Setup
const composer = new EffectComposer(renderer)
const renderPass = new RenderPass(scene, camera)
composer.addPass(renderPass)

// Chromatic Aberration für Sci-Fi Look (subtil)
const chromaticPass = new ShaderPass(ChromaticAberrationShader)
composer.addPass(chromaticPass)

// Vignette für mehr Tiefe
const vignettePass = new ShaderPass(VignetteShader)
composer.addPass(vignettePass)

// Film Grain für cinematic Look
const filmGrainPass = new ShaderPass(FilmGrainShader)
composer.addPass(filmGrainPass)

// Glitch Pass für zufällige Bildstörungen
const glitchPass = new GlitchPass()
glitchPass.goWild = false
composer.addPass(glitchPass)

// CRT/Scanline Pass für retro Monitor-Effekt
const crtPass = new ShaderPass(CRTShader)
crtPass.uniforms['scanlineIntensity'].value = 0.5
composer.addPass(crtPass)

// FXAA Pass für glattere Kanten
const fxaaPass = new ShaderPass(FXAAShader)
const pixelRatio = renderer.getPixelRatio()
fxaaPass.material.uniforms['resolution'].value.x = 1 / (innerWidth * pixelRatio)
fxaaPass.material.uniforms['resolution'].value.y = 1 / (innerHeight * pixelRatio)
composer.addPass(fxaaPass)

// Connection Lost Overlay Management
let connectionLostActive = false

setInterval(() => {
  // Zufällig CONNECTION LOST triggern (alle 30-60 Sekunden im Durchschnitt)
  if (!connectionLostActive && Math.random() < 0.01) {
    connectionLostActive = true
    const overlay = document.getElementById('connectionLost')
    const spaceCam = document.getElementById('spaceCam')
    if (overlay) overlay.style.display = 'flex'
    if (spaceCam) spaceCam.classList.add('signal-lost')

    // Trigger schwächeren Glitch-Effekt
    glitchPass.goWild = true

    // Hide after random duration (1-3 seconds)
    const duration = Math.random() * 2000 + 1000
    setTimeout(() => {
      if (overlay) overlay.style.display = 'none'
      if (spaceCam) spaceCam.classList.remove('signal-lost')
      connectionLostActive = false
      glitchPass.goWild = false
    }, duration)
  }
}, 500) // Check every 500ms

// Subtle Random Glitches (ohne Overlay)
let subtleGlitchActive = false
setInterval(() => {
  // Zufällige subtile Glitches (alle 15-30 Sekunden im Durchschnitt)
  if (!subtleGlitchActive && !connectionLostActive && Math.random() < 0.03) {
    subtleGlitchActive = true

    // Trigger kurzen Glitch-Effekt
    glitchPass.goWild = true

    // Deaktiviere nach kurzer Dauer (200-400ms)
    const duration = Math.random() * 200 + 200
    setTimeout(() => {
      glitchPass.goWild = false
      subtleGlitchActive = false
    }, duration)
  }
}, 500) // Check every 500ms


camera.position.x = -3.76
camera.position.y = 3.44
camera.position.z = -9.56
camera.lookAt(0, 0, 0)
// Start-Position beim Laden

const controls = new OrbitControls(camera, renderer.domElement)
controls.minDistance = 5
controls.maxDistance = 750
controls.enablePan = true
controls.enableRotate = true
controls.enableZoom = true
controls.enableDamping = true
controls.dampingFactor = 0.05
controls.enabled = false // Deaktiviert

// Touch-specific settings for mobile
controls.touches = {
  ONE: THREE.TOUCH.ROTATE,
  TWO: THREE.TOUCH.DOLLY_PAN
}
controls.rotateSpeed = 1.0
controls.zoomSpeed = 1.0
controls.panSpeed = 0.8

// Removed unused code: raycaster, mouse, isMouseOverSphere, sphere.addEventListener, onMouseClick
// These were not functional (THREE.js meshes don't support DOM addEventListener)

const raycaster = new THREE.Raycaster()
const mouse = new THREE.Vector2()

function onMouseMove(event) {
  mouse.x = (event.clientX / window.innerWidth) * 2 - 1
  mouse.y = -(event.clientY / window.innerHeight) * 2 + 1
}

function navigateTo(targetPosition, content) {
  const main = document.getElementById('startContent')
  const threshold = 0.01

  if (camera.position.distanceTo(targetPosition) > threshold) {
    main.innerHTML = ''
    tl.clear()

    // Disable OrbitControls when switching cameras
    if (controlsEnabled) {
      toggleOrbitControls()
    }
    controls.enabled = false

    // Hide CONNECTION LOST if it's showing
    const connectionLostOverlay = document.getElementById('connectionLost')
    const spaceCam = document.getElementById('spaceCam')
    if (connectionLostOverlay) connectionLostOverlay.style.display = 'none'
    if (spaceCam) spaceCam.classList.remove('signal-lost')
    connectionLostActive = false

    // Trigger Glitch Effect (manual, not random)
    glitchPass.goWild = true
    setTimeout(() => {
      glitchPass.goWild = false
    }, 500)

    // Show "SWITCHING TO CAM X" overlay
    const camMapping = {
      start: '1',
      about: '2',
      projects: '3',
      contact: '4'
    }
    const targetCamNumber = camMapping[content]
    const switchingOverlay = document.getElementById('camSwitching')
    const targetCamElement = document.getElementById('targetCam')

    if (switchingOverlay && targetCamElement) {
      targetCamElement.textContent = targetCamNumber
      switchingOverlay.style.display = 'flex'

      setTimeout(() => {
        switchingOverlay.style.display = 'none'
      }, 500)
    }

    // OrbitControls bleiben deaktiviert

    // Berechne Ziel-Rotation
    const tempCamera = camera.clone()
    tempCamera.position.copy(targetPosition)
    tempCamera.lookAt(0, 0, 0)
    const targetQuat = tempCamera.quaternion.clone()

    // Instant camera switch - no animation
    camera.position.copy(targetPosition)
    camera.quaternion.copy(targetQuat)

    // Swap content immediately
    swapContent(content)
  }
}

function setActiveNavItem(activeId) {
  // Entferne active von allen Links
  document.querySelectorAll('#navbar ul li').forEach(li => {
    li.classList.remove('active')
  })
  // Setze active auf den aktuellen Link
  const activeElement = document.getElementById(activeId)
  if (activeElement) {
    activeElement.classList.add('active')
  }
}

// Track current navigation state for swipe gestures
let currentNavIndex = 0 // 0=start, 1=about, 2=projects, 3=contact

function getStart() {
  const targetPosition = new THREE.Vector3(-3.76, 3.44, -9.56)
  navigateTo(targetPosition, 'start')
  setActiveNavItem('startButton')
  currentNavIndex = 0
}

function getHome() {
  const targetPosition = new THREE.Vector3(15, 10, 0)
  navigateTo(targetPosition, 'about')
  setActiveNavItem('aboutButton')
  currentNavIndex = 1
}

function getMoon() {
  // Position zeigt auf Mond (bei 50,0,0) mit Sonne im Hintergrund
  const targetPosition = new THREE.Vector3(54.00, -1.49, -1.66)
  navigateTo(targetPosition, 'projects')
  setActiveNavItem('projectsButton')
  currentNavIndex = 2
}

function getMars() {
  const targetPosition = new THREE.Vector3(506.70, 0.00, 500.91)
  navigateTo(targetPosition, 'contact')
  setActiveNavItem('contactButton')
  currentNavIndex = 3
}

function animate() {
  // Update OrbitControls only if enabled
  if (controlsEnabled) {
    controls.update()
  }

  // Update Camera Debug Info (use cached elements for performance)
  if (camPosElement && camRotElement) {
    const camPos = camera.position
    const camRot = new THREE.Euler().setFromQuaternion(camera.quaternion, 'XYZ')
    camPosElement.textContent =
      `x: ${camPos.x.toFixed(2)}, y: ${camPos.y.toFixed(2)}, z: ${camPos.z.toFixed(2)}`
    camRotElement.textContent =
      `x: ${THREE.MathUtils.radToDeg(camRot.x).toFixed(1)}°, y: ${THREE.MathUtils.radToDeg(camRot.y).toFixed(1)}°, z: ${THREE.MathUtils.radToDeg(camRot.z).toFixed(1)}°`
  }

  // Update Film Grain time for animation
  filmGrainPass.uniforms['time'].value += 0.01

  // Erhöhe Film Grain Intensity während Glitches
  if (glitchPass.isGlitching) {
    filmGrainPass.uniforms['intensity'].value = 0.1 * glitchPass.glitchIntensity
  } else {
    filmGrainPass.uniforms['intensity'].value = 0.035
  }

  // Update CRT effect time for flicker animation
  crtPass.uniforms['time'].value += 0.01

  // Update Star Twinkle animation
  starShaderMaterial.uniforms.time.value += 0.01

  // Update Nebula animation
  nebulaMaterial.uniforms.time.value += 0.005

  // Tidally lock moon to always face Earth
  moon.lookAt(0, 0, 0)

  // Update Sun animation
  sunMaterial.uniforms.time.value += 0.01
  sunGlowMaterial.uniforms.time.value += 0.01

  // Check if sun is occluded by any object
  const directionToSun = new THREE.Vector3()
  directionToSun.subVectors(sun.position, camera.position).normalize()

  raycaster.set(camera.position, directionToSun)
  const distanceToSun = camera.position.distanceTo(sun.position)

  // Check intersections with all objects in the group (recursive)
  const intersects = raycaster.intersectObjects(group.children, true)

  // If an object is between camera and sun, fade out rays
  if (intersects.length > 0 && intersects[0].distance < distanceToSun) {
    sunRaysTargetOpacity = 0.0
  } else {
    sunRaysTargetOpacity = 1.0
  }

  // Smooth transition
  sunRaysCurrentOpacity += (sunRaysTargetOpacity - sunRaysCurrentOpacity) * 0.1

  // Update Sun Rays animation and opacity
  sunRaysGroup.children.forEach((rayGroup) => {
    const rayMaterial = rayGroup.children[0].material
    rayMaterial.uniforms.time.value += 0.01
    rayMaterial.uniforms.opacity.value = sunRaysCurrentOpacity
  })

  composer.render()
  requestAnimationFrame(animate)
  clouds.rotation.y += 0.000025
}

// Touch/Swipe gesture detection for mobile navigation
let touchStartX = 0
let touchStartY = 0
let touchEndX = 0
let touchEndY = 0
let isTransitioning = false // Prevent multiple swipes during transition

function handleTouchStart(e) {
  touchStartX = e.changedTouches[0].screenX
  touchStartY = e.changedTouches[0].screenY
}

function handleTouchEnd(e) {
  if (isTransitioning) return // Ignore swipes during transitions
  if (controlsEnabled) return // Ignore swipes when OrbitControls are active

  touchEndX = e.changedTouches[0].screenX
  touchEndY = e.changedTouches[0].screenY
  handleSwipe()
}

function handleSwipe() {
  const swipeThreshold = 50 // Minimum distance for swipe
  const swipeAngleThreshold = 30 // Maximum vertical angle in degrees

  const deltaX = touchEndX - touchStartX
  const deltaY = touchEndY - touchStartY
  const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY)

  // Check if swipe is long enough
  if (distance < swipeThreshold) return

  // Calculate swipe angle (prefer horizontal swipes)
  const angle = Math.abs(Math.atan2(Math.abs(deltaY), Math.abs(deltaX)) * (180 / Math.PI))

  // Only trigger if swipe is mostly horizontal
  if (angle > swipeAngleThreshold) return

  // Determine swipe direction
  if (Math.abs(deltaX) > Math.abs(deltaY)) {
    if (deltaX > 0) {
      // Swipe right - go to previous
      navigateToPrevious()
    } else {
      // Swipe left - go to next
      navigateToNext()
    }
  }
}

function navigateToNext() {
  if (isTransitioning) return

  isTransitioning = true
  setTimeout(() => { isTransitioning = false }, 600) // Reset after transition (slightly longer than 0.5s animation)

  const nextIndex = (currentNavIndex + 1) % 4

  switch(nextIndex) {
    case 0: getStart(); break
    case 1: getHome(); break
    case 2: getMoon(); break
    case 3: getMars(); break
  }
}

function navigateToPrevious() {
  if (isTransitioning) return

  isTransitioning = true
  setTimeout(() => { isTransitioning = false }, 600) // Reset after transition

  const prevIndex = (currentNavIndex - 1 + 4) % 4

  switch(prevIndex) {
    case 0: getStart(); break
    case 1: getHome(); break
    case 2: getMoon(); break
    case 3: getMars(); break
  }
}

window.addEventListener('mousemove', onMouseMove)
window.addEventListener('touchstart', handleTouchStart, { passive: true })
window.addEventListener('touchend', handleTouchEnd, { passive: true })

// Stop Tour Button Event Listener
const stopTourBtn = document.getElementById('stopTourBtn')
if (stopTourBtn) {
  stopTourBtn.addEventListener('click', stopTour)
}

// Stop Controls Button Event Listener
const stopControlsBtn = document.getElementById('stopControlsBtn')
if (stopControlsBtn) {
  stopControlsBtn.addEventListener('click', toggleOrbitControls)
}

// Target Button Event Listeners
const targetEarth = document.getElementById('targetEarth')
const targetMoon = document.getElementById('targetMoon')
const targetMars = document.getElementById('targetMars')

if (targetEarth) {
  targetEarth.addEventListener('click', () => setOrbitTarget('earth', true))
}
if (targetMoon) {
  targetMoon.addEventListener('click', () => setOrbitTarget('moon', true))
}
if (targetMars) {
  targetMars.addEventListener('click', () => setOrbitTarget('mars', true))
}

// Keyboard controls for orbit target switching
window.addEventListener('keydown', (e) => {
  if (!controlsEnabled) return // Only work when controls are active

  switch(e.key) {
    case '1':
      setOrbitTarget('earth', true)
      break
    case '2':
      setOrbitTarget('moon', true)
      break
    case '3':
      setOrbitTarget('mars', true)
      break
  }
})

// Tour with 360° rotation around each object
let isTourActive = false
let currentTourPhase = 0 // 0=Earth, 1=Moon, 2=Mars
window.isTourActive = false // Make it globally accessible for app.js
window.currentTourPhase = 0

// Function to update tour orbit display based on current phase and language
window.updateTourOrbitDisplay = function() {
  if (!isTourActive) return

  const camNumberElement = document.querySelector('.cam-number')
  if (!camNumberElement) return

  const isGerman = document.querySelector('#lang-de.active') !== null

  switch(currentTourPhase) {
    case 0:
      camNumberElement.textContent = isGerman ? 'Erde Orbit' : 'Earth Orbit'
      break
    case 1:
      camNumberElement.textContent = isGerman ? 'Mond Orbit' : 'Moon Orbit'
      break
    case 2:
      camNumberElement.textContent = 'Mars Orbit'
      break
  }
}

function endTour() {
  isTourActive = false
  window.isTourActive = false
  currentTourPhase = -1
  window.currentTourPhase = -1

  // Hide Stop Tour Button
  const stopTourBtn = document.getElementById('stopTourBtn')
  if (stopTourBtn) {
    stopTourBtn.style.display = 'none'
  }

  // OrbitControls bleiben deaktiviert
  controls.target.set(0, 0, 0)
  if (orbitTargetElement) orbitTargetElement.textContent = 'Earth (0, 0, 0)'

  // Reset display to "CAM 1"
  const camNumberElement = document.querySelector('.cam-number')
  const camLabelElement = document.querySelector('.cam-label')
  if (camNumberElement) camNumberElement.textContent = '1'
  if (camLabelElement) camLabelElement.style.display = 'block'

  // Trigger Glitch Effect für Rückkehr zur Startposition
  glitchPass.goWild = true
  setTimeout(() => {
    glitchPass.goWild = false
  }, 500)

  // Show "SWITCHING TO CAM 1" overlay
  const switchingOverlay = document.getElementById('camSwitching')
  const targetCamElement = document.getElementById('targetCam')
  if (switchingOverlay && targetCamElement) {
    targetCamElement.textContent = '1'
    switchingOverlay.style.display = 'flex'
    setTimeout(() => {
      switchingOverlay.style.display = 'none'
    }, 500)
  }

  getStart()
}

function stopTour() {
  if (!isTourActive) return

  // Kill current tour timeline
  if (window.currentTourTimeline) {
    window.currentTourTimeline.kill()
    window.currentTourTimeline = null
  }

  // Show UI again
  const startContent = document.getElementById('startContent')
  const collapsedPanel = document.getElementById('collapsedPanel')
  const breadcrumb = document.getElementById('breadcrumb')

  if (startContent) {
    gsap.to(startContent, { opacity: 1, duration: 0.5 })
  }
  if (collapsedPanel) {
    gsap.to(collapsedPanel, { opacity: 1, duration: 0.5, onComplete: () => {
      collapsedPanel.style.opacity = ''
    }})
  }
  if (breadcrumb) {
    gsap.to(breadcrumb, { opacity: 1, duration: 0.5 })
  }

  // End tour
  endTour()
}

function startSceneTour() {
  if (isTourActive) return

  isTourActive = true
  window.isTourActive = true
  currentTourPhase = 0
  window.currentTourPhase = 0

  // Kill any existing tour timeline to prevent memory leaks
  if (window.currentTourTimeline) {
    window.currentTourTimeline.kill()
    window.currentTourTimeline = null
  }

  // Disable OrbitControls during tour
  if (controlsEnabled) {
    toggleOrbitControls()
  }
  controls.enabled = false

  // Clear any existing animations
  tl.clear()

  // Show Stop Tour Button
  const stopTourBtn = document.getElementById('stopTourBtn')
  if (stopTourBtn) {
    stopTourBtn.style.display = 'block'
  }

  // Set display to "Earth Orbit" initially (hide "CAM" label)
  const camLabelElement = document.querySelector('.cam-label')
  window.updateTourOrbitDisplay()
  if (camLabelElement) camLabelElement.style.display = 'none'

  // Trigger Glitch Effect beim Tour-Start
  glitchPass.goWild = true
  setTimeout(() => {
    glitchPass.goWild = false
  }, 500)

  const tourTimeline = gsap.timeline({
    onComplete: () => {
      endTour()
    }
  })

  // Store timeline reference for stopping
  window.currentTourTimeline = tourTimeline

  // Hide UI during tour
  const startContent = document.getElementById('startContent')
  const collapsedPanel = document.getElementById('collapsedPanel')
  const breadcrumb = document.getElementById('breadcrumb')

  if (startContent) gsap.to(startContent, { opacity: 0, duration: 0.3 })
  if (collapsedPanel) gsap.to(collapsedPanel, { opacity: 0, duration: 0.3 })
  if (breadcrumb) gsap.to(breadcrumb, { opacity: 0, duration: 0.3 })

  // Define objects - Orbit-Radius proportional zur Objektgröße
  // Erde: radius 5, Mond: radius 1, Mars: radius 4
  const earthRadius = 15  // Erde (Objektgröße 5)
  const earthCenter = { x: 0, y: 0, z: 0 }
  const moonRadius = 3  // Mond (Objektgröße 1) - proportional angepasst
  const moonCenter = { x: 50, y: 0, z: 0 }
  const marsRadius = 12  // Mars (Objektgröße 4) - proportional angepasst
  const marsCenter = { x: 500, y: 0, z: 500 }

  // Track last phase to detect changes
  let lastPhase = -1

  // Instant jump to first orbit position
  const startAngle = 0
  const startX = earthCenter.x + earthRadius * Math.cos(startAngle)
  const startY = earthCenter.y + 5
  const startZ = earthCenter.z + earthRadius * Math.sin(startAngle)

  camera.position.set(startX, startY, startZ)
  camera.lookAt(earthCenter.x, earthCenter.y, earthCenter.z)

  // Single continuous animation for the entire tour (45 seconds - 15s pro Objekt)
  tourTimeline.to({}, {
    duration: 45,
    ease: "none",
    onUpdate: function() {
      const totalProgress = this.progress()

      let currentCenter, currentRadius, currentY
      let localProgress, angle
      let currentPhase

      if (totalProgress < 0.333) {
        currentPhase = 0
        // Phase 1: Earth (0-15s)
        if (lastPhase !== currentPhase) {
          controls.target.set(0, 0, 0)
          if (orbitTargetElement) orbitTargetElement.textContent = 'Earth (0, 0, 0)'

          // Update current tour phase and CAM display
          currentTourPhase = 0
          window.currentTourPhase = 0
          window.updateTourOrbitDisplay()

          // Trigger glitch effect on target change
          glitchPass.goWild = true
          setTimeout(() => {
            glitchPass.goWild = false
          }, 300)

          lastPhase = currentPhase
        }

        localProgress = totalProgress / 0.333
        angle = localProgress * Math.PI * 2
        currentCenter = earthCenter
        currentRadius = earthRadius
        currentY = 5

        camera.position.x = currentCenter.x + currentRadius * Math.cos(angle)
        camera.position.y = currentCenter.y + currentY
        camera.position.z = currentCenter.z + currentRadius * Math.sin(angle)
        camera.lookAt(currentCenter.x, currentCenter.y, currentCenter.z)

      } else if (totalProgress < 0.666) {
        // Phase 2: Moon rotation (15-30s)
        currentPhase = 1
        if (lastPhase !== currentPhase) {
          controls.target.set(50, 0, 0)
          if (orbitTargetElement) orbitTargetElement.textContent = 'Moon (50, 0, 0)'

          // Update current tour phase and CAM display
          currentTourPhase = 1
          window.currentTourPhase = 1
          window.updateTourOrbitDisplay()

          // Trigger glitch effect on target change
          glitchPass.goWild = true
          setTimeout(() => {
            glitchPass.goWild = false
          }, 300)

          lastPhase = currentPhase
        }

        const phaseProgress = (totalProgress - 0.333) / 0.333
        angle = -phaseProgress * Math.PI * 2  // Negativ für gegen Uhrzeigersinn

        camera.position.x = moonCenter.x + moonRadius * Math.cos(angle)
        camera.position.y = moonCenter.y + 0
        camera.position.z = moonCenter.z + moonRadius * Math.sin(angle)
        camera.lookAt(moonCenter.x, moonCenter.y, moonCenter.z)

      } else {
        // Phase 3: Mars rotation (30-45s)
        currentPhase = 2
        if (lastPhase !== currentPhase) {
          controls.target.set(500, 0, 500)
          if (orbitTargetElement) orbitTargetElement.textContent = 'Mars (500, 0, 500)'

          // Update current tour phase and CAM display
          currentTourPhase = 2
          window.currentTourPhase = 2
          window.updateTourOrbitDisplay()

          // Trigger glitch effect on target change
          glitchPass.goWild = true
          setTimeout(() => {
            glitchPass.goWild = false
          }, 300)

          lastPhase = currentPhase
        }

        const phaseProgress = (totalProgress - 0.666) / 0.334
        angle = phaseProgress * Math.PI * 2

        camera.position.x = marsCenter.x + marsRadius * Math.cos(angle)
        camera.position.y = marsCenter.y + 5
        camera.position.z = marsCenter.z + marsRadius * Math.sin(angle)
        camera.lookAt(marsCenter.x, marsCenter.y, marsCenter.z)
      }
    }
  })

  // Show UI again at end
  tourTimeline.call(() => {
    if (startContent) {
      gsap.to(startContent, { opacity: 1, duration: 0.5 })
    }
    // Reset collapsedPanel opacity - entferne inline style damit CSS Transitions wieder funktionieren
    if (collapsedPanel) {
      gsap.to(collapsedPanel, { opacity: 1, duration: 0.5, onComplete: () => {
        collapsedPanel.style.opacity = ''
      }})
    }
    if (breadcrumb) {
      gsap.to(breadcrumb, { opacity: 1, duration: 0.5 })
    }
  })
}

// Toggle OrbitControls
let controlsEnabled = false
window.controlsEnabled = false // Make globally accessible
let currentTarget = 'earth' // Track current orbit target
let savedCameraPosition = null // Save camera position before enabling controls
let savedCameraQuaternion = null // Save camera rotation before enabling controls
let savedContentSection = 'start' // Save current content section before enabling controls

function setOrbitTarget(target, withGlitch = false) {
  // Prevent spamming - if already on this target, do nothing
  if (currentTarget === target && withGlitch) {
    return
  }

  currentTarget = target

  // Glitch effect when switching targets via buttons
  if (withGlitch) {
    glitchPass.goWild = true
    setTimeout(() => {
      glitchPass.goWild = false
    }, 150)
  }

  // Remove active class from all buttons
  document.querySelectorAll('.target-btn').forEach(btn => btn.classList.remove('active'))

  const camLabel = document.querySelector('.cam-label')
  const camNumber = document.querySelector('.cam-number')

  // Check current language
  const isGerman = document.querySelector('#lang-de.active') !== null

  // Set target position and camera distance (proportional to object size)
  // Earth: radius 5, distance ~15 (3x), minDistance 8
  // Moon: radius 1, distance ~3 (3x), minDistance 2
  // Mars: radius 4, distance ~12 (3x), minDistance 6
  if (target === 'earth') {
    controls.target.set(0, 0, 0)
    controls.minDistance = 8
    camera.position.set(15, 5, 0)
    if (orbitTargetElement) orbitTargetElement.textContent = 'Earth (0, 0, 0)'
    if (camLabel) camLabel.textContent = isGerman ? 'Ziel' : 'Target'
    if (camNumber) camNumber.textContent = isGerman ? 'ERDE' : 'EARTH'
    document.getElementById('targetEarth')?.classList.add('active')
  } else if (target === 'moon') {
    controls.target.set(50, 0, 0)
    controls.minDistance = 2
    camera.position.set(53, 1, 0)
    if (orbitTargetElement) orbitTargetElement.textContent = 'Moon (50, 0, 0)'
    if (camLabel) camLabel.textContent = isGerman ? 'Ziel' : 'Target'
    if (camNumber) camNumber.textContent = isGerman ? 'MOND' : 'MOON'
    document.getElementById('targetMoon')?.classList.add('active')
  } else if (target === 'mars') {
    controls.target.set(500, 0, 500)
    controls.minDistance = 6
    camera.position.set(512, 4, 500)
    if (orbitTargetElement) orbitTargetElement.textContent = 'Mars (500, 0, 500)'
    if (camLabel) camLabel.textContent = isGerman ? 'Ziel' : 'Target'
    if (camNumber) camNumber.textContent = 'MARS'
    document.getElementById('targetMars')?.classList.add('active')
  }
}

function updateTargetButtonsPosition() {
  const stopControlsBtn = document.getElementById('stopControlsBtn')
  const targetButtons = document.getElementById('targetButtons')

  if (!stopControlsBtn || !targetButtons) return

  // Wait for next frame to ensure button is rendered with text
  requestAnimationFrame(() => {
    const stopControlsWidth = stopControlsBtn.offsetWidth
    const gap = 16 // 1rem gap in pixels (approximately)
    const rightOffset = window.innerWidth <= 768 ? 16 : 32 // 1rem or 2rem in pixels

    // Position target buttons to the left of stop controls button
    const targetButtonsRight = stopControlsWidth + rightOffset + gap
    targetButtons.style.right = targetButtonsRight + 'px'
  })
}

function toggleOrbitControls() {
  controlsEnabled = !controlsEnabled
  window.controlsEnabled = controlsEnabled
  controls.enabled = controlsEnabled

  const toggleButtonDe = document.getElementById('toggle-controls-de')
  const toggleButtonEn = document.getElementById('toggle-controls-en')
  const startContent = document.getElementById('startContent')
  const collapsedPanel = document.getElementById('collapsedPanel')
  const breadcrumb = document.getElementById('breadcrumb')
  const stopControlsBtn = document.getElementById('stopControlsBtn')
  const stopControlsText = document.getElementById('stopControlsText')
  const targetButtons = document.getElementById('targetButtons')
  const camLabel = document.querySelector('.cam-label')

  // Check current language
  const isGerman = document.querySelector('#lang-de.active') !== null

  if (controlsEnabled) {
    // Save current camera position and rotation before enabling controls
    savedCameraPosition = camera.position.clone()
    savedCameraQuaternion = camera.quaternion.clone()
    savedContentSection = window.getCurrentNavSection()

    if (toggleButtonDe) toggleButtonDe.textContent = '🎮 Controls deaktivieren'
    if (toggleButtonEn) toggleButtonEn.textContent = '🎮 Disable Controls'
    if (stopControlsBtn) stopControlsBtn.style.display = 'block'
    if (stopControlsText) stopControlsText.textContent = isGerman ? 'DEAKTIVIEREN' : 'DISABLE'
    if (targetButtons) targetButtons.style.display = 'flex'

    // Update position dynamically based on button width
    updateTargetButtonsPosition()

    // Set initial target to Earth (this will also update the CAM display)
    setOrbitTarget('earth')

    // Hide all UI elements
    if (startContent) startContent.style.display = 'none'
    if (collapsedPanel) collapsedPanel.style.display = 'none'
    if (breadcrumb) breadcrumb.style.display = 'none'
  } else {
    if (toggleButtonDe) toggleButtonDe.textContent = '🎮 Controls aktivieren'
    if (toggleButtonEn) toggleButtonEn.textContent = '🎮 Enable Controls'
    if (stopControlsBtn) stopControlsBtn.style.display = 'none'
    if (targetButtons) targetButtons.style.display = 'none'

    // Restore camera position and rotation
    if (savedCameraPosition && savedCameraQuaternion) {
      camera.position.copy(savedCameraPosition)
      camera.quaternion.copy(savedCameraQuaternion)
    }

    // Restore CAM display
    if (camLabel) camLabel.textContent = 'CAM'
    const currentNavSection = savedContentSection || window.getCurrentNavSection()
    updateSpaceCam(currentNavSection)

    // Show UI elements again
    if (startContent) startContent.style.display = ''
    if (collapsedPanel && collapsedPanel.classList.contains('visible')) collapsedPanel.style.display = 'flex'
    if (breadcrumb) breadcrumb.style.display = ''
  }
}

// Update controls language when language is changed
function updateControlsLanguage() {
  if (!controlsEnabled) return

  const isGerman = document.querySelector('#lang-de.active') !== null
  const stopControlsText = document.getElementById('stopControlsText')

  // Update button text
  if (stopControlsText) {
    stopControlsText.textContent = isGerman ? 'DEAKTIVIEREN' : 'DISABLE'
  }

  // Update position after text change
  updateTargetButtonsPosition()

  // Update target display
  setOrbitTarget(currentTarget)
}

// Make function globally accessible
window.updateControlsLanguage = updateControlsLanguage

// Make navigation functions globally available for breadcrumb
window.getStart = getStart
window.getHome = getHome
window.getMoon = getMoon
window.getMars = getMars
window.startSceneTour = startSceneTour
window.stopTour = stopTour
window.toggleOrbitControls = toggleOrbitControls

animate()

window.addEventListener("resize", onWindowResize, false);
function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);

  const pixelRatio = renderer.getPixelRatio();
  fxaaPass.material.uniforms['resolution'].value.x = 1 / (window.innerWidth * pixelRatio);
  fxaaPass.material.uniforms['resolution'].value.y = 1 / (window.innerHeight * pixelRatio);
}

THREE.DefaultLoadingManager.onLoad = () => {
  const loader = document.getElementById('loader')
  setTimeout(() => {
    loader.style.display = 'none'
    // Setze Start als aktiv beim Laden
    setActiveNavItem('startButton')
  }, 50)
}