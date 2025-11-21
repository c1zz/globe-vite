/**
 * God Rays / Volumetric Light Shader
 * Creates radial light rays from a light source
 */

const GodRaysShader = {

  name: 'GodRaysShader',

  uniforms: {
    'tDiffuse': { value: null },
    'lightPosition': { value: { x: 0.5, y: 0.5 } },
    'exposure': { value: 0.3 },
    'decay': { value: 0.95 },
    'density': { value: 0.8 },
    'weight': { value: 0.4 },
    'samples': { value: 50 }
  },

  vertexShader: /* glsl */`
    varying vec2 vUv;

    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
    }`,

  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform vec2 lightPosition;
    uniform float exposure;
    uniform float decay;
    uniform float density;
    uniform float weight;
    uniform int samples;

    varying vec2 vUv;

    void main() {
      vec2 texCoord = vUv;

      // Calculate vector from pixel to light source
      vec2 deltaTextCoord = texCoord - lightPosition;

      // Divide by number of samples and scale by density
      deltaTextCoord *= 1.0 / float(samples) * density;

      // Store initial sample
      vec4 color = texture2D(tDiffuse, texCoord);

      // Set up illumination decay factor
      float illuminationDecay = 1.0;

      // Evaluate summation from Equation 3 NUM_SAMPLES iterations
      for(int i = 0; i < 100; i++) {
        if(i >= samples) break;

        // Step sample location along ray
        texCoord -= deltaTextCoord;

        // Retrieve sample at new location
        vec4 sampleColor = texture2D(tDiffuse, texCoord);

        // Apply sample attenuation scale/decay factors
        sampleColor *= illuminationDecay * weight;

        // Accumulate combined color
        color += sampleColor;

        // Update exponential decay factor
        illuminationDecay *= decay;
      }

      // Output final color with a further scale control factor
      gl_FragColor = color * exposure;
    }`

};

export { GodRaysShader };
