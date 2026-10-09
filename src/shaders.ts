/** Source sampling/transfer fragment owned here; no shader device is created. */
export const CUBE_VECTOR_WGSL = /* wgsl */ `
fn panoramaCubeVector(image: vec3<f32>) -> vec3<f32> {
  return vec3<f32>(image.x, image.z, image.y);
}
`;
export const CUBE_VECTOR_GLSL = /* glsl */ `
vec3 panoramaCubeVector(vec3 imageDirection) {
  return vec3(imageDirection.x, imageDirection.z, imageDirection.y);
}
`;
