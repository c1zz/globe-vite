varying vec3 vertexNormal;

void main() {
  float intensity = pow(0.45 - dot(vertexNormal, vec3(0, 0, 1.0)), 2.5);
  gl_FragColor = vec4(0.7, 0.3, 0.3, 1.0) * intensity;
}