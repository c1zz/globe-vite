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
// Maßgeblich ist clientWidth/Height, NICHT innerWidth/Height: letztere schließen die
// Scrollbar mit ein. Das Canvas würde damit immer ein Stück breiter gesetzt als der
// Inhaltsbereich, erzeugte dadurch selbst eine Scrollbar und hielte die Seite auf.
function viewportSize() {
  const el = document.documentElement
  return { w: el.clientWidth || window.innerWidth, h: el.clientHeight || window.innerHeight }
}

let renderer
try {
  renderer = new THREE.WebGLRenderer({
    antialias: false,
    canvas: document.querySelector('canvas'),
    powerPreference: 'high-performance',
    alpha: true
  })

  const vp0 = viewportSize()
  renderer.setSize(vp0.w, vp0.h)
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

// Basis-Globus: SSS-Daymap 4k (Downscale der 8k-Quelle) - gleiche Bildfamilie wie der
// Europa-Crop, damit der HD-Patch beim Anflug versatzfrei aufliegt.
// Fallback auf die alte Textur (earth_opt.webp), falls die Datei fehlt/nicht lädt.
const earthTexture = textureLoader.load(
  '/img/earth_4k.webp',
  undefined,
  undefined,
  () => {
    textureLoader.load('/img/earth_opt.webp', (tex) => {
      tex.anisotropy = renderer.capabilities.getMaxAnisotropy()
      tex.minFilter = THREE.LinearMipmapLinearFilter
      tex.magFilter = THREE.LinearFilter
      sphere.material.map = tex
      sphere.material.needsUpdate = true
    })
  }
)
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

// ── Europa/Franken HD-Patch (Etappe 2) ────────────────────────────────────
// Kugelkappe mit dem HD-Crop, exakt über der Basistextur. Gleiche Bildfamilie
// (SSS-Daymap) + gleiche Rotation wie die Erde => kein Versatz. Blendet
// distanzabhängig ein ("durch die Wolken stoßen").
const DEG = Math.PI / 180
const REGION = {
  // Geo-Abdeckung des Crops regions/europe.webp (muss zum Bild passen!)
  lonWest: -2, lonEast: 24, latNorth: 56, latSouth: 42,
  // Fade-Fenster über Kamera-Distanz zum Erdmittelpunkt
  fadeStart: 7.5, fadeEnd: 5.8,
  // Unter dem Tiefflug-Radius (5.005) minus near-Plane (0.0025): so bleibt der Patch
  // auch im Tiefflug vor der Kamera und muss nicht ausgeblendet werden. Sonst wäre der
  // Nachbar der Zwischentextur-Kante der nackte Basisglobus mit 9.8 km/px statt 600 m/px.
  radius: 5.0015
}

// ── Regio-Texturen: Upload steuern + weich einblenden ─────────────────────
// Ohne das hier passiert der GPU-Upload (inkl. Mipmaps, zweistellige MB) erst,
// wenn die Textur zum ersten Mal gerendert wird - also mitten im Tiefflug: Ruckler.
// initTexture() zieht ihn vor, und die Queue verteilt die Uploads auf je einen
// pro Frame, damit sie sich nicht zu einem Hänger addieren.
// readyAt (statt eines bool) gibt zusätzlich eine Einblendrampe: kommt eine Textur
// spät, während ihr Distanz-Fade schon auf 1 steht, blendet sie trotzdem weich
// ein statt aufzuploppen.
const uploadQueue = []
function loadRegionTexture(url, onReady) {
  const tex = textureLoader.load(url, () => uploadQueue.push({ tex, onReady }))
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy()
  tex.colorSpace = earthTexture.colorSpace // identische Behandlung wie Basistextur
  tex.minFilter = THREE.LinearMipmapLinearFilter
  tex.magFilter = THREE.LinearFilter
  return tex
}
function pumpUploadQueue() {
  const job = uploadQueue.shift()
  if (!job) return
  renderer.initTexture(job.tex) // einmaliger Upload - hier statt im Flug
  job.onReady()
}
const APPEAR_MS = 700
function appearRamp(readyAt) {
  return readyAt ? Math.min(1, (performance.now() - readyAt) / APPEAR_MS) : 0
}

let europeReadyAt = 0
const europeTexture = loadRegionTexture('/img/regions/europe.webp', () => { europeReadyAt = performance.now() })

const europePatch = new THREE.Mesh(
  new THREE.SphereGeometry(
    REGION.radius, 96, 96,
    (REGION.lonWest + 180) * DEG, (REGION.lonEast - REGION.lonWest) * DEG,
    (90 - REGION.latNorth) * DEG, (REGION.latNorth - REGION.latSouth) * DEG
  ),
  new THREE.MeshStandardMaterial({
    map: europeTexture,
    // Wird im Tiefflug synchron mit der Zwischentextur entlichtet (siehe delitFactor),
    // damit an deren Kante kein Helligkeitssprung steht.
    emissive: 0xffffff,
    emissiveMap: europeTexture,
    emissiveIntensity: 0,
    metalness: 0.0,
    roughness: 1.0,
    transparent: true,
    opacity: 0,
    depthWrite: false
  })
)
europePatch.rotation.copy(sphere.rotation) // identische Ausrichtung wie die Erde
europePatch.visible = false
scene.add(europePatch) // an scene, nicht group -> nicht im Sonnen-Occlusion-Raycast

// Die neuen SSS-Texturen sind heller/kräftiger als die alte Erde -> per Tint dämpfen.
// Getrennt regelbar: Orbit-Globus etwas heller als der Nah-Patch. (0xffffff = keine Änderung)
// Der Basisglobus braucht ZWEI Helligkeiten, keine Konstante: aus dem Orbit darf die
// Textur kräftig sein, im Anflug wird dieselbe Textur formatfüllend und derselbe Wert
// ist dann zu hell. Also über die Distanz überblenden - fertig, bevor ab R 7.5 der
// Europa-Patch einblendet.
const earthTintOrbit = 0.95 // = 0xf2f2f2
const earthTintNear = 0.50  // = 0x808080
const TINT_R_ORBIT = 10.0 // darüber voll earthTintOrbit
const TINT_R_NEAR = 7.5   // darunter voll earthTintNear
function updateEarthTint() {
  const k = THREE.MathUtils.clamp(
    (TINT_R_ORBIT - camera.position.length()) / (TINT_R_ORBIT - TINT_R_NEAR), 0, 1
  )
  sphere.material.color.setScalar(earthTintOrbit + (earthTintNear - earthTintOrbit) * k)
}
updateEarthTint()

const EARTH_TINT_PATCH = 0xffffff // Nah-Patch (GIBS/Blue Marble ist schon natürlich dunkel -> kein Tint)
europePatch.material.color.setHex(EARTH_TINT_PATCH)

// Weicher Alpha-Rand am Patch, damit die rechteckige Textur-Kante verläuft statt als
// harte Linie sichtbar zu sein (unabhängig von der Kamera-Distanz).
function makeEdgeAlpha(feather = 0.18) {
  const size = 128
  const c = document.createElement('canvas')
  c.width = c.height = size
  const ctx = c.getContext('2d')
  const img = ctx.createImageData(size, size)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / (size - 1), v = y / (size - 1)
      const d = Math.min(u, 1 - u, v, 1 - v) // Abstand zum nächsten Rand (0=Rand, 0.5=Mitte)
      const a = Math.max(0, Math.min(1, d / feather))
      const i = (y * size + x) * 4
      img.data[i] = img.data[i + 1] = img.data[i + 2] = Math.round(a * 255)
      img.data[i + 3] = 255
    }
  }
  ctx.putImageData(img, 0, 0)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.NoColorSpace
  return tex
}
europePatch.material.alphaMap = makeEdgeAlpha(0.18)
europePatch.material.needsUpdate = true

// Distanzabhängiges Ein-/Ausblenden (wird in animate() aufgerufen)
function updateEuropePatch() {
  const d = camera.position.length()
  let t = (REGION.fadeStart - d) / (REGION.fadeStart - REGION.fadeEnd)
  t = Math.max(0, Math.min(1, t))

  // Retro-Effekte (Chromatic, Film-Grain, Glitch, CRT/Scanline) in der Nah-/Oberflächen-
  // Ansicht ausschalten, beim Rückflug in den Orbit wieder an. Vignette + FXAA bleiben.
  const surfaceView = t > 0.5
  chromaticPass.enabled = !surfaceView
  filmGrainPass.enabled = !surfaceView
  glitchPass.enabled = !surfaceView
  crtPass.enabled = !surfaceView

  europePatch.material.opacity = t * appearRamp(europeReadyAt)
  europePatch.visible = europePatch.material.opacity > 0.001
  clouds.material.opacity = 0.7 * (1 - t) // lokal die Wolken auflösen

  // Synchron mit der Zwischentextur entlichten. Europa bleibt im Tiefflug liegen und
  // füllt alles außerhalb der Zwischentextur - deren Kante hat dadurch immer einen
  // gleich hellen Nachbarn, und es bleibt nur der Auflösungswechsel.
  const u = delitFactor(d)
  europePatch.material.color.setScalar(1 - u)
  europePatch.material.emissiveIntensity = u
}

// ── Oberfranken Mittel-Patch (LOD-Zwischenstufe) ──────────────────────────
// Schließt die Lücke zwischen Europa (~600 m/px, beleuchtet) und den Stadt-
// Luftbildern (~8 m/px, unbeleuchtet). Sentinel-2 cloudless (EOX, CC BY 4.0),
// ~30 m/px, nahtlos und wolkenfrei.
//
// Der Patch überbrückt BEIDE Sprünge:
//   Auflösung - er liegt geometrisch zwischen den anderen beiden Stufen.
//   Helligkeit - oben rendert er beleuchtet (MeshStandard, wie der Europa-Patch),
//   beim Sinken wird er kontinuierlich "entlichtet": Diffuse-Farbe -> schwarz,
//   Emissive -> Textur. Unten ist er damit exakt das unbeleuchtete Bild und
//   passt nahtlos zu den MeshBasic-Stationen. Nötig, weil sunLight auf 11 steht
//   und beleuchtete Luftbilder sonst ausbrennen.
const MID = {
  lonWest: 10.2, lonEast: 12.2, latNorth: 50.7, latSouth: 49.4,
  fadeStart: 5.7, fadeEnd: 5.3,   // Einblenden (voll da, bevor enterLowAlt Europa entfernt)
  delitStart: 5.3, delitEnd: 5.08, // Entlichten bis auf Stations-Niveau
  radius: 5.002 // < Tiefflug-Radius 5.005 minus near-Plane 0.0025, sonst clippt der Patch weg
}

let midReadyAt = 0
const midTexture = loadRegionTexture('/img/regions/franken/oberfranken.webp', () => { midReadyAt = performance.now() })

const midPatch = new THREE.Mesh(
  new THREE.SphereGeometry(
    MID.radius, 96, 96,
    (MID.lonWest + 180) * DEG, (MID.lonEast - MID.lonWest) * DEG,
    (90 - MID.latNorth) * DEG, (MID.latNorth - MID.latSouth) * DEG
  ),
  new THREE.MeshStandardMaterial({
    map: midTexture,
    emissive: 0xffffff,
    emissiveMap: midTexture,
    emissiveIntensity: 0, // wird beim Sinken auf 1 gefahren
    metalness: 0.0,
    roughness: 1.0,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    alphaMap: makeEdgeAlpha(0.16)
  })
)
midPatch.rotation.copy(sphere.rotation)
midPatch.visible = false
scene.add(midPatch)

// Keiner der Patches schreibt Tiefe -> die Zeichenreihenfolge entscheidet,
// welcher oben liegt (nicht der Radius).
europePatch.renderOrder = 1
midPatch.renderOrder = 2

// Entlichtungs-Grad: 0 = voll von der Sonne beleuchtet (Orbit), 1 = rohes Bild (Boden).
// Europa- und Zwischentextur teilen sich die Kurve, damit sie an ihrer gemeinsamen
// Kante nie unterschiedlich hell sind.
function delitFactor(d) {
  return THREE.MathUtils.clamp((MID.delitStart - d) / (MID.delitStart - MID.delitEnd), 0, 1)
}

function updateMidPatch() {
  const d = camera.position.length()
  const t = THREE.MathUtils.clamp((MID.fadeStart - d) / (MID.fadeStart - MID.fadeEnd), 0, 1)
  midPatch.material.opacity = t * appearRamp(midReadyAt)
  midPatch.visible = midPatch.material.opacity > 0.001

  const u = delitFactor(d)
  midPatch.material.color.setScalar(1 - u) // Sonnen-Diffuse ausblenden
  midPatch.material.emissiveIntensity = u  // Textur unbeleuchtet einblenden
}

// Geo-Koordinate (lon/lat) -> Weltposition auf der Erdkugel. Nutzt dieselbe Rotation
// wie die Basistextur, damit der Franken-Punkt zum sichtbaren Europa passt.
function lonLatToWorld(lon, lat, r) {
  const phi = (lon + 180) * DEG
  const theta = (90 - lat) * DEG
  return new THREE.Vector3(
    -r * Math.cos(phi) * Math.sin(theta),
    r * Math.cos(theta),
    r * Math.sin(phi) * Math.sin(theta)
  ).applyEuler(sphere.rotation)
}

// ── Franken-Stationen (Etappe 4) ────────────────────────────────────────────
// Mit-entwickelt von Claude (Opus 4.8, Anthropic) & c1zz. 🌍🏰
// Wegpunkte des Tiefflugs über Oberfranken - die Bilddaten liefert der Routen-Patch
// weiter unten. Für die bildfüllenden Tiefflüge wird die Kamera-Near-Plane
// verkleinert und Wolken/Atmosphäre ausgeblendet (Maßstab!).
// Speist das Infofeld unten. Einwohner sind gerundete Näherungen - sie sollen den Ort
// einordnen, nicht ein Melderegister ersetzen.
const FRANKEN_STATIONS = [
  { name: 'Bamberg',  file: 'bamberg',  lon: 10.887, lat: 49.891,
    pop: 79000, area: 54.6, ele: 262, first: 902,
    status: { de: 'Kreisfreie Stadt', en: 'Independent city' },
    landmark: { de: 'Bamberger Dom', en: 'Bamberg Cathedral' },
    unesco: { de: 'Altstadt, seit 1993', en: 'Old Town, since 1993' } },
  { name: 'Bayreuth', file: 'bayreuth', lon: 11.578, lat: 49.945,
    pop: 75000, area: 66.9, ele: 340, first: 1194,
    status: { de: 'Kreisfreie Stadt', en: 'Independent city' },
    landmark: { de: 'Markgräfliches Opernhaus', en: 'Margravial Opera House' },
    unesco: { de: 'Opernhaus, seit 2012', en: 'Opera House, since 2012' } },
  { name: 'Kulmbach', file: 'kulmbach', lon: 11.451, lat: 50.105,
    pop: 26000, area: 92.8, ele: 306, first: 1035,
    status: { de: 'Große Kreisstadt', en: 'Major district town' },
    landmark: { de: 'Plassenburg', en: 'Plassenburg Castle' } },
  { name: 'Coburg',   file: 'coburg',   lon: 10.963, lat: 50.258,
    pop: 41000, area: 48.3, ele: 292, first: 1056,
    status: { de: 'Kreisfreie Stadt', en: 'Independent city' },
    landmark: { de: 'Veste Coburg', en: 'Coburg Fortress' } },
  // Kronach liegt ~5 km südlich der Landesgrenze: in dessen Luftbild ist die
  // Nordwest-Ecke kein DOP40 (Thüringen), sondern gamma-angeglichenes Sentinel-2.
  { name: 'Kronach',  file: 'kronach',  lon: 11.331, lat: 50.241,
    pop: 17000, area: 67.4, ele: 325, first: 1003,
    status: { de: 'Große Kreisstadt', en: 'Major district town' },
    landmark: { de: 'Festung Rosenberg', en: 'Rosenberg Fortress' } }
]
const STATION_HALF_LON = 0.20 // groß genug, dass die Patch-Ränder beim Tiefflug außerhalb des Bildes liegen
const STATION_HALF_LAT = 0.11
const STATION_PATCH_RADIUS = 5.001
const stationEdgeAlpha = makeEdgeAlpha(0.14)
const STATION_DIVE_RADIUS = 5.005 // Kamera-Distanz beim Tiefflug (über allen Patches)

// DOP40-Luftbilder (Bayerische Vermessungsverwaltung, CC BY 4.0) über den Städten.
// Sie liegen ÜBER dem Routen-Patch: der deckt die Strecke dazwischen ab, aber bei
// 6 km Flughöhe ist Sentinel-2 über einer Stadt nur Matsch - 10 m ist das native
// Sensor-Limit, effektiv liegen eher 25-30 m an. DOP40 kommt aus 40-cm-Daten und hat
// bei 8 m/px noch vollen Kontrast: einzelne Häuser statt brauner Fläche.
FRANKEN_STATIONS.forEach((st) => {
  st.readyAt = 0
  const tex = loadRegionTexture('/img/regions/franken/' + st.file + '.webp', () => { st.readyAt = performance.now() })
  const w = st.lon - STATION_HALF_LON, e = st.lon + STATION_HALF_LON
  const n = st.lat + STATION_HALF_LAT, s = st.lat - STATION_HALF_LAT
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(
      STATION_PATCH_RADIUS, 48, 48,
      (w + 180) * DEG, (e - w) * DEG,
      (90 - n) * DEG, (n - s) * DEG
    ),
    // MeshBasicMaterial: unbeleuchtet -> Luftbild in Echtfarbe, keine Überbelichtung
    new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true, opacity: 0, depthWrite: false,
      alphaMap: stationEdgeAlpha
    })
  )
  mesh.rotation.copy(sphere.rotation)
  mesh.visible = false
  mesh.renderOrder = 4 // über Europa-, Mittel- und Routen-Patch
  scene.add(mesh)
  st.mesh = mesh
  st.surf = lonLatToWorld(st.lon, st.lat, 5) // Oberflächenpunkt
  st.axis = st.surf.clone().normalize()       // Richtung nach außen (für Kamera-Position)
})

// ── Routen-Patch ──────────────────────────────────────────────────────────
// Deckt die ganze Runde mit ~10.7 m/px ab. Bei 6 km Flughöhe entspricht ein
// Bildschirmpixel etwa 9 m Boden - die Route ist damit durchgehend nativ scharf.
//
// Ersetzt die fünf einzelnen DOP40-Stadtbilder. Die waren mit 8 m/px zwar minimal
// feiner, aber eben nur über den Städten; dazwischen stand die Zwischentextur mit
// 36 m/px, also ~4 Bildpunkte pro Texel. Ein Bild statt fünf spart zudem ~75 MB VRAM.
//
// Bewusst Sentinel-2 und nicht DOP40: DOP40 ist über Befliegungen hinweg nicht
// farbabgeglichen - auf 64 km Breite stehen ganze Kacheln als andersfarbige Blöcke
// im Bild, und an der Landesgrenze fehlen Daten. Nebeneffekt der gleichen Quelle wie
// beim Mittel-Patch: der Übergang dorthin ist ein reiner Auflösungswechsel, ohne
// Helligkeitssprung - auch an den Patch-Rändern, wo beide dasselbe Bild zeigen.
const ROUTE = {
  lonWest: 10.79, lonEast: 11.69, latNorth: 50.34, latSouth: 49.80,
  fadeStart: 5.06, fadeEnd: 5.03, // erst unterhalb 5.08, wo der Mittel-Patch fertig entlichtet ist
  radius: 5.001
}
let routeReadyAt = 0
const routeTexture = loadRegionTexture('/img/regions/franken/route.webp', () => { routeReadyAt = performance.now() })
const routePatch = new THREE.Mesh(
  new THREE.SphereGeometry(
    ROUTE.radius, 96, 96,
    (ROUTE.lonWest + 180) * DEG, (ROUTE.lonEast - ROUTE.lonWest) * DEG,
    (90 - ROUTE.latNorth) * DEG, (ROUTE.latNorth - ROUTE.latSouth) * DEG
  ),
  // Unbeleuchtet - passt damit zum fertig entlichteten Mittel-Patch darunter.
  new THREE.MeshBasicMaterial({
    map: routeTexture,
    transparent: true, opacity: 0, depthWrite: false,
    alphaMap: makeEdgeAlpha(0.08)
  })
)
routePatch.rotation.copy(sphere.rotation)
routePatch.visible = false
routePatch.renderOrder = 3 // über Europa- und Mittel-Patch
scene.add(routePatch)

function updateRoutePatch() {
  const d = camera.position.length()
  const t = THREE.MathUtils.clamp((ROUTE.fadeStart - d) / (ROUTE.fadeStart - ROUTE.fadeEnd), 0, 1)
  routePatch.material.opacity = t * appearRamp(routeReadyAt)
  routePatch.visible = routePatch.material.opacity > 0.001
}

// ── Franken-Stationen: Tiefflug (durchgehende Kamerafahrt) ──────────────────
let lowAltMode = false
const STATION_DIVE_LOOK = new THREE.Vector3(0, 0, 0) // mitgeführtes Blickziel (kein Ruck)

// Harte Umschaltungen. Früher lag darüber ein Farb-Schleier, der sie verdecken sollte;
// seit der Europa-Patch im Tiefflug liegen bleibt und synchron entlichtet wird, sind
// sie von sich aus unsichtbar - die Near-Plane sieht man ohnehin nicht, und die Wolken
// stehen auf dieser Höhe längst bei Opacity 0.
function enterLowAlt() {
  lowAltMode = true
  camera.near = 0.0025; camera.far = 40; camera.updateProjectionMatrix()
  clouds.visible = false; atmosphere.visible = false
  // Europa-Patch bleibt bewusst stehen (Radius 5.0015 liegt unter der Kamera) - er ist
  // der Untergrund, an dem die Kante der Zwischentextur nicht mehr auffällt.
}
function exitLowAlt() {
  lowAltMode = false
  camera.near = 0.075; camera.far = 5000; camera.updateProjectionMatrix()
  clouds.visible = true; atmosphere.visible = true
}

function updateFrankenStations() {
  // Sicherheitsnetz: sind wir wieder hoch (z.B. nach Tour-Start), Tiefflug-Modus verlassen.
  if (lowAltMode && camera.position.length() > 6) exitLowAlt()

  // Stadt-Luftbilder nach Nähe einblenden (nur die Stadt direkt drunter)
  for (const st of FRANKEN_STATIONS) {
    let a = 0
    if (lowAltMode) {
      const d = camera.position.distanceTo(st.surf)
      a = 1 - Math.min(1, Math.max(0, (d - 0.006) / 0.008)) // eng: voll <0.006, aus >0.014
      a *= appearRamp(st.readyAt)
    }
    st.mesh.material.opacity = a
    st.mesh.visible = a > 0.001
  }
}

// Slerp zwischen zwei Einheits-Richtungen (für eine saubere radiale Fahrt).
function slerpVec3(a, b, t) {
  const dot = THREE.MathUtils.clamp(a.dot(b), -1, 1)
  // Fast parallel: rel entartet zum Nullvektor, normalize() liefert Müll. Dann linear
  // interpolieren - bei so kleinen Winkeln ist das deckungsgleich mit Slerp.
  // NICHT einfach b zurückgeben: das ignoriert t. Die Franken-Stationen liegen nur
  // 26-50 km auseinander, auf 6371 km Erdradius also dot > 0.9999 - jeder Flug
  // zwischen ihnen wäre ein Sprung in Frame 1.
  if (dot > 0.999999) return a.clone().lerp(b, t).normalize()
  const th = Math.acos(dot) * t
  const rel = b.clone().addScaledVector(a, -dot).normalize()
  return a.clone().multiplyScalar(Math.cos(th)).addScaledVector(rel, Math.sin(th))
}

// Inverse von power2.inOut -> Fahrt-Fortschritt (0..1) bei gegebenem Ease-Wert.
function easeInOutInv(y) {
  y = Math.min(1, Math.max(0, y))
  return y < 0.5 ? Math.sqrt(y / 2) : 1 - Math.sqrt((1 - y) / 2)
}

// Radiale Fahrt (Richtung per Slerp, R monoton) + Umschaltungen in DERSELBEN Timeline.
// Jede Umschaltung hängt an einer ZIEL-HÖHE (atR), nicht an einem Zeitpunkt: wann die
// Kamera dort ist, rechnet die Ease-Kurve aus. Damit sitzt sie in beide Flugrichtungen
// und bei jeder Startdistanz auf derselben Höhe.
function flyDive(dirTo, Rto, lookTo, dur, swapSeq) {
  const posFrom = camera.position.clone()
  const dirFrom = posFrom.clone().normalize()
  const Rfrom = posFrom.length()
  const lookFrom = STATION_DIVE_LOOK.clone()
  const p = { k: 0 }
  const tl = gsap.timeline()
  tl.to(p, {
    k: 1, duration: dur, ease: 'power2.inOut',
    onUpdate: () => {
      const dir = slerpVec3(dirFrom, dirTo, p.k)
      camera.position.copy(dir).multiplyScalar(Rfrom + (Rto - Rfrom) * p.k)
      STATION_DIVE_LOOK.lerpVectors(lookFrom, lookTo, p.k)
      camera.lookAt(STATION_DIVE_LOOK)
    }
  }, 0)
  const lo = Math.min(Rfrom, Rto), hi = Math.max(Rfrom, Rto)
  for (const v of (swapSeq || [])) {
    // Höhe wird auf dieser Fahrt nie erreicht (der Anflug in der Tour startet schon bei
    // R 5.4): dann sofort schalten, sonst bliebe z.B. lowAltMode hängen.
    if (v.atR < lo || v.atR > hi) {
      tl.call(v.onPeak, null, 0)
      continue
    }
    const frac = (Rfrom - v.atR) / (Rfrom - Rto) // eased-Fortschritt bei Höhe atR
    tl.call(v.onPeak, null, easeInOutInv(frac) * dur)
  }
  return tl
}

// Höhe, auf der in den Tiefflug-Modus umgeschaltet wird (Near-Plane, Atmosphäre).
const LOW_ALT_R = 5.25

const ORBIT_RETURN = new THREE.Vector3(-3.76, 3.44, -9.56)

// Abstieg aus dem Orbit auf eine Station bzw. Rückflug.
function diveToStation(st, dur = 8) {
  return flyDive(st.axis.clone(), STATION_DIVE_RADIUS, st.surf.clone(), dur, [
    { atR: LOW_ALT_R, onPeak: enterLowAlt }
  ])
}
// Ziel ist frei wählbar: innerhalb der Tour liefert der Rückflug die Kamera exakt
// dort ab, wo die Tour pausiert hat - sonst gäbe es beim Fortsetzen einen Sprung.
function diveOutTo(target, look, dur = 7) {
  return flyDive(target.clone().normalize(), target.length(), look.clone(), dur, [
    { atR: LOW_ALT_R, onPeak: exitLowAlt }
  ])
}

// ── Franken-Rundflug (Etappe 4b) ──────────────────────────────────────────
// Seitlicher Flug von Station zu Station, durchgehend auf Tiefflug-Höhe. flyDive
// taugt dafür nicht: der steigt monoton auf oder ab. Hier bleibt der Radius konstant -
// die Runde ist ein einziger Tiefflug, kein Auf und Ab pro Etappe. Blick senkrecht
// nach unten, wie am Ende des Abstiegs.
function flyHop(stFrom, stTo, dur) {
  const dirFrom = stFrom.axis.clone(), dirTo = stTo.axis.clone()
  const p = { k: 0 }
  return gsap.timeline().to(p, {
    k: 1, duration: dur, ease: 'power1.inOut',
    onUpdate: () => {
      const dir = slerpVec3(dirFrom, dirTo, p.k)
      camera.position.copy(dir).multiplyScalar(STATION_DIVE_RADIUS)
      STATION_DIVE_LOOK.copy(dir).multiplyScalar(5) // Bodenpunkt direkt darunter
      camera.lookAt(STATION_DIVE_LOOK)
    }
  }, 0)
}

// Im Ring, ohne Kreuzung: Bayreuth (SO) -> Kulmbach (NO) -> Kronach (N) ->
// Coburg (NW) -> Bamberg (SW).
//
// Richtung ist bewusst so herum. Die Stadt-Luftbilder reichen ±14 km und sind ab
// ~17 km seitlich ganz weg - auf kurzen Etappen überlappen sich also die Bilder
// beider Städte und decken den Übergang gegenseitig ab. Andersherum geflogen käme
// Bayreuth -> Bamberg direkt dran: 50 km, davon 16.7 km ohne jedes Luftbild, und
// genau dort sieht man die Kante. So bleibt Bamberg (mit 41 km zur nächsten Stadt der
// Ausreißer) am Ende und wird über Coburg angeflogen - längste nackte Strecke 7.9 km.
const FRANKEN_ROUTE = [1, 2, 4, 3, 0]
const HOP_DUR = 10  // schön langsam
const HOLD_DUR = 4  // Standzeit über der Station (später Platz für die Texte)

// Etappen nacheinander abarbeiten. Wichtig: jede Etappe wird erst beim Start
// gebaut, nicht vorab - flyDive/flyHop lesen die Kameraposition im Moment der
// Konstruktion, eine vorab zusammengesetzte Timeline hätte überall die
// Startposition eingefroren.
let frankenTourRunning = false
let frankenLegTween = null // aktuell laufende Etappe - für den Abbruch
let frankenAbort = false

// Anzeige oben rechts: während einer Etappe der Stationsname, sonst die Phase.
// Als Station-Objekt gehalten (nicht als fertiger String), damit ein Sprachwechsel
// mitten im Flug über updateTourOrbitDisplay korrekt neu übersetzt.
let frankenLabelStation = null
// EN bewusst nachgestellt ("Bayreuth Approach"): so heißt im Flugfunk die Anflug-
// kontrolle, und es reiht sich neben "Earth Orbit"/"Moon Orbit" ein. Franken = Franconia.
function frankenLabelText(isGerman) {
  if (frankenLabelStation) {
    const n = frankenLabelStation.name
    return isGerman ? 'Anflug ' + n : n + ' Approach'
  }
  return isGerman ? 'Franken Anflug' : 'Franconia Approach'
}
function setFrankenLabel(st) {
  frankenLabelStation = st
  const camNumberElement = document.querySelector('.cam-number')
  if (camNumberElement) {
    camNumberElement.textContent = frankenLabelText(document.querySelector('#lang-de.active') !== null)
  }
  if (orbitTargetElement && st) {
    orbitTargetElement.textContent = st.name + ' (' + st.lat.toFixed(2) + 'N, ' + st.lon.toFixed(2) + 'E)'
  }
  renderFrankenInfo()
}

// Infofeld unten (links vom Stop-Button). Erscheint mit dem Anflug und nicht erst beim
// Ankommen: so bleiben ~14 s zum Lesen statt der 4 s Standzeit.
function renderFrankenInfo() {
  const info = document.getElementById('tourInfo')
  if (!info) return
  const st = frankenLabelStation
  if (!st) { info.style.opacity = '0'; return }

  const de = document.querySelector('#lang-de.active') !== null
  // Ab 560 px passt auch die längste Zeile ("Markgräfliches Opernhaus", ~270 px) neben
  // den Stop-Button (~113 px + 48 px Rand/Lücke). Darunter nur die Kern-Zeilen.
  const wide = window.innerWidth > 560
  const num = (n) => n.toLocaleString(de ? 'de-DE' : 'en-US')

  // core: läuft auch auf schmalen Viewports mit.
  const rows = [
    { k: de ? 'EINWOHNER' : 'POPULATION', v: num(st.pop), core: true },
    { k: de ? 'HÖHE' : 'ELEVATION', v: st.ele + ' m', core: true },
    { k: de ? 'ERSTERWÄHNT' : 'FIRST RECORDED', v: st.first, core: true },
    { k: de ? 'FLÄCHE' : 'AREA', v: num(st.area) + ' km²' },
    { k: de ? 'VERWALTUNG' : 'STATUS', v: de ? st.status.de : st.status.en },
    { k: de ? 'WAHRZEICHEN' : 'LANDMARK', v: de ? st.landmark.de : st.landmark.en }
  ]
  if (st.unesco) rows.push({ k: 'UNESCO', v: de ? st.unesco.de : st.unesco.en })

  info.querySelector('.tour-info-title').textContent = st.name.toUpperCase()
  info.querySelector('.tour-info-body').innerHTML = rows
    .filter((r) => wide || r.core)
    .map((r) => '<span class="k">' + r.k + '</span><span class="v">' + r.v + '</span>')
    .join('')
  info.style.display = 'block'

  // Buttonbreite steht erst nach dem Layout fest -> Position erst im nächsten Frame.
  // Gleiche Rechnung wie updateTargetButtonsPosition: Buttonbreite + Rand + Lücke.
  requestAnimationFrame(() => {
    const btn = document.getElementById('stopTourBtn')
    const rightOffset = window.innerWidth <= 768 ? 16 : 32
    info.style.right = btn && btn.offsetWidth
      ? (btn.offsetWidth + rightOffset + 16) + 'px'
      : rightOffset + 'px'
    info.style.opacity = '1'
  })
}

function runLegs(legs, done) {
  let i = 0
  const next = () => {
    if (frankenAbort) return          // abgebrochen: done NICHT aufrufen (setzt die Tour fort)
    if (i >= legs.length) return done && done()
    frankenLegTween = legs[i++](next)
  }
  next()
}

// opts.backTo / opts.backLook: wohin der Rückflug die Kamera abliefert (Default Orbit).
// opts.onDone: läuft nur bei regulärem Ende, nicht beim Abbruch.
function startFrankenTour(opts = {}) {
  if (frankenTourRunning) return
  frankenTourRunning = true
  frankenAbort = false

  const back = opts.backTo || ORBIT_RETURN.clone()
  const backLook = opts.backLook || new THREE.Vector3(0, 0, 0)

  const legs = []
  const stationAt = (n) => FRANKEN_STATIONS[FRANKEN_ROUTE[n]]
  legs.push((cb) => { setFrankenLabel(stationAt(0)); return diveToStation(stationAt(0)).eventCallback('onComplete', cb) })
  legs.push((cb) => gsap.delayedCall(HOLD_DUR, cb))
  for (let n = 1; n < FRANKEN_ROUTE.length; n++) {
    const from = stationAt(n - 1), to = stationAt(n)
    legs.push((cb) => { setFrankenLabel(to); return flyHop(from, to, HOP_DUR).eventCallback('onComplete', cb) })
    legs.push((cb) => gsap.delayedCall(HOLD_DUR, cb))
  }
  legs.push((cb) => { setFrankenLabel(null); return diveOutTo(back, backLook).eventCallback('onComplete', cb) })

  runLegs(legs, () => {
    frankenTourRunning = false
    frankenLegTween = null
    opts.onDone && opts.onDone()
  })
}

// Abbruch (Stop-Tour-Button). Der Rundflug läuft in eigenen Timelines - die Tour-
// Timeline zu killen würde ihn nicht stoppen, die Kamera bliebe im Tiefflug hängen:
// near-Plane 0.0025 und ausgeblendete Atmosphäre.
function killFrankenTour() {
  if (!frankenTourRunning) return
  frankenAbort = true
  if (frankenLegTween) { frankenLegTween.kill(); frankenLegTween = null }
  if (lowAltMode) exitLowAlt()
  frankenLabelStation = null
  renderFrankenInfo()
  frankenTourRunning = false
}

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

  // Franken-Stationen (Tiefflug-Modus) + Europa/Franken HD-Patch
  pumpUploadQueue()
  updateEarthTint()
  updateFrankenStations()
  updateEuropePatch()
  updateMidPatch()
  updateRoutePatch()

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
    case 3:
      camNumberElement.textContent = frankenLabelText(isGerman)
      renderFrankenInfo() // app.js ruft das beim Sprachwechsel -> Datenblock mit übersetzen
      break
  }
}

function endTour() {
  isTourActive = false
  window.isTourActive = false
  currentTourPhase = -1
  window.currentTourPhase = -1

  // Stationsdaten ausblenden (auch wenn die Tour regulär durchgelaufen ist)
  frankenLabelStation = null
  const tourInfo = document.getElementById('tourInfo')
  if (tourInfo) {
    tourInfo.style.opacity = '0'
    setTimeout(() => { tourInfo.style.display = 'none' }, 500) // nach der Fade-Transition
  }

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

  // Erst den Franken-Rundflug abbrechen: der läuft in eigenen Timelines und würde
  // sonst weiterfliegen, während endTour() die Kamera zurücksetzt.
  killFrankenTour()

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

  // (Tour-Start-Übergang: sanfter Kamera-Intro weiter unten statt hartem Sprung)

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

  // Sanfter Intro: von der aktuellen Kamera in die Orbit-Startposition gleiten,
  // Position UND Blick interpoliert -> kein Sprung/Versatz der Erde beim Tour-Start.
  const introFrom = camera.position.clone()
  const introTo = new THREE.Vector3(startX, startY, startZ)
  const introFwd = new THREE.Vector3(); camera.getWorldDirection(introFwd)
  const introLookFrom = camera.position.clone().add(introFwd.multiplyScalar(camera.position.length()))
  const introLookTo = new THREE.Vector3(earthCenter.x, earthCenter.y, earthCenter.z)
  const introLook = introLookFrom.clone()
  const introP = { k: 0 }
  tourTimeline.to(introP, {
    k: 1, duration: 2, ease: 'power2.inOut',
    onUpdate: () => {
      camera.position.lerpVectors(introFrom, introTo, introP.k)
      introLook.lerpVectors(introLookFrom, introLookTo, introP.k)
      camera.lookAt(introLook)
    }
  })

  // Franken-Anflug: Achse (senkrecht über Franken) + Helfer
  const frankenSurf = lonLatToWorld(11, 49.5, 5)
  const frankenAxis = frankenSurf.clone().normalize()
  const easeInOut = (x) => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2)
  const lerp = (a, b, t) => a + (b - a) * t
  const _lookTarget = new THREE.Vector3()
  // Kürzester-Bogen-Interpolation zwischen zwei Einheitsvektoren (für den nahtlosen Abstieg)
  const slerpDir = (a, b, t) => {
    const dot = THREE.MathUtils.clamp(a.dot(b), -1, 1)
    if (dot > 0.9995) return b.clone()
    const th = Math.acos(dot) * t
    const rel = b.clone().addScaledVector(a, -dot).normalize()
    return a.clone().multiplyScalar(Math.cos(th)).addScaledVector(rel, Math.sin(th))
  }

  // Helper: die immer gleichen Phasenwechsel-Nebeneffekte (Ziel, Anzeige, Glitch)
  function enterPhase(phase, targetVec, label, withGlitch = true) {
    if (lastPhase === phase) return
    controls.target.copy(targetVec)
    if (orbitTargetElement) orbitTargetElement.textContent = label
    currentTourPhase = phase
    window.currentTourPhase = phase
    window.updateTourOrbitDisplay()
    if (withGlitch) {
      glitchPass.goWild = true
      setTimeout(() => { glitchPass.goWild = false }, 300)
    }
    lastPhase = phase
  }

  // Phasen-Grenzen (Anteil der Gesamtdauer): Erde -> Franken-Anflug -> Mond -> Mars
  // Franken bekommt bewusst viel Zeit (~24s), damit der Anflug ruhig ausklingt.
  const P_EARTH = 0.17
  const P_FRANKEN = 0.50
  const P_MOON = 0.72

  let frankenDiveDone = false // pro Tour-Durchlauf: der Rundflug wird genau einmal eingeschoben

  // Eine durchgehende Animation über die gesamte Tour
  tourTimeline.to({}, {
    duration: 72,
    ease: "none",
    onUpdate: function() {
      const tp = this.progress()
      let angle

      if (tp < P_EARTH) {
        // Phase 1: Erd-Orbit (360°)
        enterPhase(0, new THREE.Vector3(0, 0, 0), 'Earth (0, 0, 0)')
        angle = (tp / P_EARTH) * Math.PI * 2
        camera.position.set(
          earthCenter.x + earthRadius * Math.cos(angle),
          earthCenter.y + 5,
          earthCenter.z + earthRadius * Math.sin(angle)
        )
        camera.lookAt(earthCenter.x, earthCenter.y, earthCenter.z)

      } else if (tp < P_FRANKEN) {
        // Phase 2: NAHTLOS aus dem Erd-Orbit heraus zu Franken absteigen und zurück.
        // Kein Glitch/Snap - die Orbit-Rotation läuft einfach weiter in den Abstieg.
        enterPhase(3, frankenSurf, 'Franken (49.5N, 11E)', false)
        const l = (tp - P_EARTH) / (P_FRANKEN - P_EARTH)
        // s: 0 (Orbit) -> 1 (über Franken) -> halten -> 0 (zurück in den Orbit)
        let s
        if (l < 0.45) s = 1 - (1 - l / 0.45) ** 2       // easeOut: trägt die Orbit-Rotation weiter
        else if (l < 0.60) s = 1                         // über Franken halten
        else s = easeInOut(1 - (l - 0.60) / 0.40)        // sanft zurück in den Orbit
        // Rotation läuft aus dem Erd-Orbit weiter (theta ab 2π = Orbit-Endpunkt (15,5,0))
        // Je eine halbe Umdrehung rein und raus -> ruhiger Bogen statt Wirbel.
        // turn läuft bewusst MONOTON 0 -> 1 -> 2 und nicht über s (das geht 0 -> 1 -> 0):
        // sonst spult der Aufstieg die Abstiegs-Rotation exakt rückwärts ab und sieht
        // aus wie ein Rückspulen. So dreht er in derselben Richtung weiter.
        const turn = (l < 0.60) ? s : 2 - s
        const theta = Math.PI * 2 + turn * Math.PI
        const orbitDir = new THREE.Vector3(
          earthRadius * Math.cos(theta), 5, earthRadius * Math.sin(theta)
        ).normalize()
        const dir = slerpDir(orbitDir, frankenAxis, s * s) // früh orbital, spät senkrecht über Franken
        const R = lerp(15.8114, 5.4, easeInOut(s))         // 15.8114 = |(15,5,0)| -> nahtloser Start; 5.4 = näher ran (Kante aus dem Bild)
        camera.position.copy(dir.multiplyScalar(R))
        _lookTarget.set(0, 0, 0).lerp(frankenSurf, s)      // Blick weich von Erdmittelpunkt -> Franken
        camera.lookAt(_lookTarget)

        // Am Tiefpunkt des Anflugs (s=1, R 5.4) einmalig den Oberfranken-Rundflug
        // einschieben. Die Tour rechnet ihre Kameraposition aus dem Fortschritt, der
        // Rundflug fliegt imperativ und liest die Position beim Bauen - beides gleich-
        // zeitig ginge nicht, also pausieren statt mischen. Der Rückflug liefert die
        // Kamera exakt hier wieder ab, danach läuft die Tour ohne Sprung weiter.
        if (!frankenDiveDone && l >= 0.45) {
          frankenDiveDone = true
          tourTimeline.pause()
          startFrankenTour({
            backTo: camera.position.clone(),
            backLook: _lookTarget.clone(),
            onDone: () => tourTimeline.resume()
          })
        }

      } else if (tp < P_MOON) {
        // Phase 3: Mond-Orbit (gegen Uhrzeigersinn)
        enterPhase(1, new THREE.Vector3(50, 0, 0), 'Moon (50, 0, 0)')
        const phaseProgress = (tp - P_FRANKEN) / (P_MOON - P_FRANKEN)
        angle = -phaseProgress * Math.PI * 2
        camera.position.set(
          moonCenter.x + moonRadius * Math.cos(angle),
          moonCenter.y,
          moonCenter.z + moonRadius * Math.sin(angle)
        )
        camera.lookAt(moonCenter.x, moonCenter.y, moonCenter.z)

      } else {
        // Phase 4: Mars-Orbit
        enterPhase(2, new THREE.Vector3(500, 0, 500), 'Mars (500, 0, 500)')
        const phaseProgress = (tp - P_MOON) / (1 - P_MOON)
        angle = phaseProgress * Math.PI * 2
        camera.position.set(
          marsCenter.x + marsRadius * Math.cos(angle),
          marsCenter.y + 5,
          marsCenter.z + marsRadius * Math.sin(angle)
        )
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
  const vp = viewportSize();

  camera.aspect = vp.w / vp.h;
  camera.updateProjectionMatrix();
  renderer.setSize(vp.w, vp.h);
  composer.setSize(vp.w, vp.h);

  // Beim Drehen des Handys wechselt die Breitenklasse: Zeilenzahl und Position neu.
  renderFrankenInfo();

  const pixelRatio = renderer.getPixelRatio();
  fxaaPass.material.uniforms['resolution'].value.x = 1 / (vp.w * pixelRatio);
  fxaaPass.material.uniforms['resolution'].value.y = 1 / (vp.h * pixelRatio);
}

THREE.DefaultLoadingManager.onLoad = () => {
  const loader = document.getElementById('loader')
  setTimeout(() => {
    loader.style.display = 'none'
    // Setze Start als aktiv beim Laden
    setActiveNavItem('startButton')
  }, 50)
}