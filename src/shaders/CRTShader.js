/**
 * CRT/Scanline Shader
 * Simulates a retro CRT monitor effect with scanlines and screen curvature
 */

const CRTShader = {
  uniforms: {
    'tDiffuse': { value: null },
    'time': { value: 0.0 },
    'scanlineIntensity': { value: 0.3 },
    'scanlineCount': { value: 400.0 },
    'distortion': { value: 0.15 },
    'brightness': { value: 1.05 },
    'vignetteIntensity': { value: 0.3 }
  },

  vertexShader: /* glsl */`
    varying vec2 vUv;

    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,

  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform float time;
    uniform float scanlineIntensity;
    uniform float scanlineCount;
    uniform float distortion;
    uniform float brightness;
    uniform float vignetteIntensity;

    varying vec2 vUv;

    // Barrel distortion function for CRT screen curvature
    vec2 barrelDistortion(vec2 coord, float amount) {
      vec2 cc = coord - 0.5;
      float dist = dot(cc, cc) * amount;
      return coord + cc * (1.0 + dist) * dist;
    }

    // Scanline effect
    float scanline(vec2 uv, float count) {
      return sin(uv.y * count * 3.14159) * 0.5 + 0.5;
    }

    // Vignette effect
    float vignette(vec2 uv, float intensity) {
      vec2 center = uv - 0.5;
      float dist = length(center);
      return 1.0 - smoothstep(0.4, 0.8, dist) * intensity;
    }

    // Flicker effect
    float flicker(float time) {
      return sin(time * 60.0) * 0.01 + 0.99;
    }

    void main() {
      // Sample texture directly without distortion
      vec4 color = texture2D(tDiffuse, vUv);

      // Apply scanlines
      float scanlineMask = scanline(vUv, scanlineCount);
      float scanlineEffect = mix(1.0 - scanlineIntensity, 1.0, scanlineMask);
      color.rgb *= scanlineEffect;

      // Apply subtle flicker
      color.rgb *= flicker(time);

      // Apply brightness boost
      color.rgb *= brightness;

      // Apply vignette
      float vig = vignette(vUv, vignetteIntensity);
      color.rgb *= vig;

      // Slight color shift for CRT phosphor look
      color.rgb = pow(color.rgb, vec3(1.05));

      gl_FragColor = color;
    }
  `
}

export { CRTShader }
