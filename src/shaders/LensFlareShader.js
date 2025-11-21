const LensFlareShader = {
  uniforms: {
    'tDiffuse': { value: null },
    'screenPosition': { value: { x: 0.5, y: 0.5 } },
    'intensity': { value: 1.0 }
  },

  vertexShader: `
    varying vec2 vUv;

    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,

  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform vec2 screenPosition;
    uniform float intensity;
    varying vec2 vUv;

    vec3 lensflare(vec2 uv, vec2 pos) {
      vec2 main = uv - pos;
      vec2 uvd = uv * (length(uv));

      float ang = atan(main.y, main.x);
      float dist = length(main);
      dist = pow(dist, 0.1);

      // Hauptflare
      float f0 = 1.0 / (1.0 + 32.0 * pow(length(uv - pos), 2.0));

      // Sekundäre Flares entlang der Achse
      float f1 = max(0.01 - pow(length(uv - pos + 0.5 * (pos - 0.5)), 2.0), 0.0) * 7.0;
      float f2 = max(0.01 - pow(length(uv - pos + 0.4 * (pos - 0.5)), 2.0), 0.0) * 5.0;
      float f3 = max(0.01 - pow(length(uv - pos + 0.3 * (pos - 0.5)), 2.0), 0.0) * 3.0;
      float f4 = max(0.01 - pow(length(uv - pos + 0.2 * (pos - 0.5)), 2.0), 0.0) * 2.0;

      // Hexagonale Flares
      float f5 = max(0.01 - pow(length(uv - pos - 0.3 * (pos - 0.5)), 2.0), 0.0) * 3.0;
      float f6 = max(0.01 - pow(length(uv - pos - 0.5 * (pos - 0.5)), 2.0), 0.0) * 2.0;

      vec3 c = vec3(0.0);

      // Hauptflare: leicht gelblich-weiß
      c += vec3(f0 * 1.5, f0 * 1.3, f0);

      // Sekundäre Flares mit Farbverschiebung
      c += vec3(f1 * 0.3, f1 * 0.5, f1);        // bläulich
      c += vec3(f2, f2 * 0.5, f2 * 0.3);        // rötlich
      c += vec3(f3 * 0.5, f3, f3 * 0.5);        // grünlich
      c += vec3(f4, f4 * 0.8, f4 * 0.5);        // gelb-orange
      c += vec3(f5 * 0.4, f5 * 0.4, f5);        // lila
      c += vec3(f6 * 0.5, f6 * 0.6, f6);        // cyan

      return c;
    }

    void main() {
      vec4 texel = texture2D(tDiffuse, vUv);

      // Nur Lens Flare hinzufügen, wenn die Sonne im sichtbaren Bereich ist
      if (screenPosition.x > 0.0 && screenPosition.x < 1.0 &&
          screenPosition.y > 0.0 && screenPosition.y < 1.0) {
        vec3 flare = lensflare(vUv, screenPosition) * intensity;
        texel.rgb += flare;
      }

      gl_FragColor = texel;
    }
  `
}

export { LensFlareShader }
