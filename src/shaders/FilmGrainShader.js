/**
 * Film grain shader
 * Adds cinematic noise
 */

const FilmGrainShader = {

	name: 'FilmGrainShader',

	uniforms: {
		'tDiffuse': { value: null },
		'time': { value: 0.0 },
		'intensity': { value: 0.035 }
	},

	vertexShader: /* glsl */`
		varying vec2 vUv;

		void main() {
			vUv = uv;
			gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
		}`,

	fragmentShader: /* glsl */`
		uniform sampler2D tDiffuse;
		uniform float time;
		uniform float intensity;

		varying vec2 vUv;

		float random( vec2 p ) {
			vec2 k1 = vec2(
				23.14069263277926, // e^pi (Gelfond's constant)
				2.665144142690225 // 2^sqrt(2) (Gelfond–Schneider constant)
			);
			return fract(
				cos( dot(p, k1) ) * 12345.6789
			);
		}

		void main() {
			vec4 texel = texture2D( tDiffuse, vUv );
			// Mehr Variation durch größeren Multiplikator und UV-Offset
			float noise = (random( vUv * 10.0 + vec2(time * 100.0) ) - 0.5) * intensity * 2.5;
			gl_FragColor = vec4( texel.rgb + noise, texel.a );
		}`

};

export { FilmGrainShader };
