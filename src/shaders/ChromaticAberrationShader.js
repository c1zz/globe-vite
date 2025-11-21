/**
 * Chromatic Aberration shader
 * Color separation at edges for sci-fi look
 */

const ChromaticAberrationShader = {

	name: 'ChromaticAberrationShader',

	uniforms: {
		'tDiffuse': { value: null },
		'amount': { value: 0.002 }
	},

	vertexShader: /* glsl */`
		varying vec2 vUv;

		void main() {
			vUv = uv;
			gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
		}`,

	fragmentShader: /* glsl */`
		uniform sampler2D tDiffuse;
		uniform float amount;

		varying vec2 vUv;

		void main() {
			vec2 offset = amount * ( vUv - 0.5 );

			float r = texture2D( tDiffuse, vUv + offset ).r;
			float g = texture2D( tDiffuse, vUv ).g;
			float b = texture2D( tDiffuse, vUv - offset ).b;

			gl_FragColor = vec4( r, g, b, 1.0 );
		}`

};

export { ChromaticAberrationShader };
