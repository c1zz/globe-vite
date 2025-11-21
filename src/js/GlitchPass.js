import {
	DataTexture,
	FloatType,
	MathUtils,
	RGBAFormat,
	ShaderMaterial,
	UniformsUtils
} from 'three';
import { Pass, FullScreenQuad } from './Pass.js';
import { DigitalGlitch } from '../shaders/DigitalGlitch.js';

/**
 * Pass for creating a glitch effect.
 * This version uses r158 behavior with r181 imports.
 *
 * @augments Pass
 */
class GlitchPass extends Pass {

	/**
	 * Constructs a new glitch pass.
	 *
	 * @param {number} [dt_size=64] - The size of the displacement texture
	 * for digital glitch squares.
	 */
	constructor( dt_size = 64 ) {

		super();

		const shader = DigitalGlitch;

		this.uniforms = UniformsUtils.clone( shader.uniforms );

		this.uniforms[ 'tDisp' ].value = this.generateHeightmap( dt_size );

		this.material = new ShaderMaterial( {
			uniforms: this.uniforms,
			vertexShader: shader.vertexShader,
			fragmentShader: shader.fragmentShader
		} );

		this.fsQuad = new FullScreenQuad( this.material );

		/**
		 * Whether to noticeably increase the effect intensity or not.
		 *
		 * @type {boolean}
		 * @default false
		 */
		this.goWild = false;

		/**
		 * Indicates if the pass is currently glitching.
		 *
		 * @type {boolean}
		 * @default false
		 */
		this.isGlitching = false;

		/**
		 * Duration of the current glitch in frames.
		 *
		 * @type {number}
		 * @default 0
		 */
		this.glitchDuration = 0;

		/**
		 * Intensity of the current glitch (0.8 - 1.5).
		 *
		 * @type {number}
		 * @default 1.0
		 */
		this.glitchIntensity = 1.0;

		// internals
		this.curF = 0;
		this.randX = 0;
		this.generateTrigger();

	}

	/**
	 * Performs the glitch pass.
	 *
	 * @param {WebGLRenderer} renderer - The renderer.
	 * @param {WebGLRenderTarget} writeBuffer - The write buffer.
	 * @param {WebGLRenderTarget} readBuffer - The read buffer.
	 */
	render( renderer, writeBuffer, readBuffer /*, deltaTime, maskActive */ ) {

		this.uniforms[ 'tDiffuse' ].value = readBuffer.texture;
		this.uniforms[ 'seed' ].value = Math.random(); // default seeding
		this.uniforms[ 'byp' ].value = 0;

		if ( this.curF % this.randX === 0 || this.goWild === true ) {

			this.isGlitching = true;
			// Zufällige Glitch-Dauer zwischen 8 und 30 Frames
			this.glitchDuration = MathUtils.randInt( 8, 30 );
			// Zufällige Intensität für Film Grain
			this.glitchIntensity = MathUtils.randFloat( 0.8, 1.5 );

			this.uniforms[ 'amount' ].value = Math.random() / 30;
			this.uniforms[ 'angle' ].value = MathUtils.randFloat( - Math.PI, Math.PI );
			this.uniforms[ 'seed_x' ].value = MathUtils.randFloat( - 1, 1 );
			this.uniforms[ 'seed_y' ].value = MathUtils.randFloat( - 1, 1 );
			this.uniforms[ 'distortion_x' ].value = MathUtils.randFloat( 0, 1 );
			this.uniforms[ 'distortion_y' ].value = MathUtils.randFloat( 0, 1 );
			this.curF = 0;
			this.generateTrigger();

		} else if ( this.curF % this.randX < this.glitchDuration ) {

			this.isGlitching = true;
			this.uniforms[ 'amount' ].value = Math.random() / 90;
			this.uniforms[ 'angle' ].value = MathUtils.randFloat( - Math.PI, Math.PI );
			this.uniforms[ 'distortion_x' ].value = MathUtils.randFloat( 0, 1 );
			this.uniforms[ 'distortion_y' ].value = MathUtils.randFloat( 0, 1 );
			this.uniforms[ 'seed_x' ].value = MathUtils.randFloat( - 0.3, 0.3 );
			this.uniforms[ 'seed_y' ].value = MathUtils.randFloat( - 0.3, 0.3 );

		} else if ( this.goWild === false ) {

			this.isGlitching = false;
			this.uniforms[ 'byp' ].value = 1;

		}

		this.curF ++;

		if ( this.renderToScreen ) {

			renderer.setRenderTarget( null );
			this.fsQuad.render( renderer );

		} else {

			renderer.setRenderTarget( writeBuffer );
			if ( this.clear ) renderer.clear();
			this.fsQuad.render( renderer );

		}

	}

	/**
	 * Generates a random trigger interval for glitches.
	 * Automatic glitches are disabled - only manual triggering via goWild.
	 */
	generateTrigger() {

		// Automatische Glitches deaktiviert - nur manuell über goWild
		this.randX = Infinity;

	}

	/**
	 * Generates the heightmap texture for glitch displacement.
	 *
	 * @param {number} dt_size - The texture size.
	 * @returns {DataTexture} The generated heightmap.
	 */
	generateHeightmap( dt_size ) {

		const data_arr = new Float32Array( dt_size * dt_size * 4 );
		const length = dt_size * dt_size;

		for ( let i = 0; i < length; i ++ ) {

			const val = MathUtils.randFloat( 0, 1 );
			data_arr[ i * 4 + 0 ] = val;
			data_arr[ i * 4 + 1 ] = val;
			data_arr[ i * 4 + 2 ] = val;
			data_arr[ i * 4 + 3 ] = val;

		}

		return new DataTexture( data_arr, dt_size, dt_size, RGBAFormat, FloatType );

	}

	/**
	 * Frees the GPU-related resources allocated by this instance.
	 */
	dispose() {

		this.material.dispose();

		this.uniforms[ 'tDisp' ].value.dispose();

		this.fsQuad.dispose();

	}

}

export { GlitchPass };
