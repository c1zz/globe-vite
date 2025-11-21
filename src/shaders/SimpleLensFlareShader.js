/**
 * Simple Lens Flare Shader
 * Creates subtle lens flare spots along the sun position
 */

const SimpleLensFlareShader = {

  name: 'SimpleLensFlareShader',

  uniforms: {
    'tDiffuse': { value: null },
    'sunPosition': { value: { x: 0.5, y: 0.5 } },
    'intensity': { value: 0.5 }
  },

  vertexShader: /* glsl */`
    varying vec2 vUv;

    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
    }`,

  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform vec2 sunPosition;
    uniform float intensity;
    varying vec2 vUv;

    vec3 lensflare(vec2 uv, vec2 pos) {
      vec2 main = uv - pos;
      vec2 uvd = uv * (length(uv));

      float ang = atan(main.y, main.x);
      float dist = length(main);
      dist = pow(dist, 0.1);

      // Mehrere Flare-Spots entlang der Achse
      float f1 = max(0.01 - pow(length(uv + pos * 0.5), 2.0), 0.0) * 7.0;
      float f2 = max(0.01 - pow(length(uv + pos * 0.4), 2.0), 0.0) * 5.0;
      float f3 = max(0.01 - pow(length(uv + pos * 0.1), 2.0), 0.0) * 3.0;
      float f4 = max(0.01 - pow(length(uv - pos * 0.02), 2.0), 0.0) * 6.0;
      float f5 = max(0.01 - pow(length(uv - pos * 0.2), 2.0), 0.0) * 2.0;
      float f6 = max(0.01 - pow(length(uv - pos * 0.4), 2.0), 0.0) * 2.0;

      // Zusätzliche subtile Regenbogen-Flares
      float f7 = max(0.008 - pow(length(uv + pos * 0.3), 2.0), 0.0) * 4.0;
      float f8 = max(0.008 - pow(length(uv - pos * 0.15), 2.0), 0.0) * 3.0;
      float f9 = max(0.008 - pow(length(uv - pos * 0.35), 2.0), 0.0) * 2.5;

      vec3 c = vec3(0.0);

      // Farbige Flare-Spots mit verstärkten Farben
      c += vec3(f2 * 1.2, f2 * 0.4, f2 * 0.2);        // intensiveres Rot
      c += vec3(f3 * 0.3, f3 * 1.2, f3 * 0.4);        // intensiveres Grün
      c += vec3(f4 * 0.6, f4 * 0.7, f4 * 1.3);        // intensiveres Blau
      c += vec3(f5 * 1.3, f5 * 0.5, f5 * 0.1);        // intensiveres Orange
      c += vec3(f6 * 1.0, f6 * 1.0, f6 * 0.5);        // intensiveres Gelb

      // Regenbogen-Flares (subtil)
      c += vec3(f7 * 0.9, f7 * 0.2, f7 * 0.9);        // Magenta/Violett
      c += vec3(f8 * 0.2, f8 * 0.9, f8 * 0.9);        // Cyan
      c += vec3(f9 * 0.4, f9 * 0.8, f9 * 0.3);        // Gelbgrün

      return c;
    }

    void main() {
      vec4 texel = texture2D(tDiffuse, vUv);

      // Nur Lens Flare hinzufügen, wenn die Sonne im sichtbaren Bereich ist
      if (sunPosition.x > 0.0 && sunPosition.x < 1.0 &&
          sunPosition.y > 0.0 && sunPosition.y < 1.0) {
        vec3 flare = lensflare(vUv - 0.5, (sunPosition - 0.5)) * intensity;
        texel.rgb += flare;
      }

      gl_FragColor = texel;
    }
  `

};

export { SimpleLensFlareShader };
