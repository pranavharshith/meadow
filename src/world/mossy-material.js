import * as THREE from 'three'

// Mossy stone material. Rocks get a green tint on upward-facing surfaces.
//
// Why the custom varying instead of `vNormal`:
//   - `vNormal` in three's fragment shader is view-space and only declared
//     when the material has `FLAT_SHADED` off. Some drivers/setups (e.g.
//     certain integrated GPU shader compilers) fold it inconsistently at
//     the `color_fragment` slot, producing:
//       "cannot convert from 'const highp float' to 'vec3'" / program not valid.
//   - We declare our own `vWorldNormal` (world space, always vec3) so
//     `smoothstep(0.4, 0.85, worldNorm.y)` genuinely means "how upward-
//     facing is this fragment in world space" — which is what "moss on top"
//     actually needs. This is what was broken before.
export function makeMossyMaterial({ base = '#8d8b83', moss = 'vec3(0.38, 0.52, 0.28)', mossStrength = 0.55 } = {}) {
  const mat = new THREE.MeshStandardMaterial({
    color: base,
    roughness: 1,
    metalness: 0,
  })

  mat.onBeforeCompile = (shader) => {
    // ── vertex: compute a world-space normal we can rely on ──────────────
    shader.vertexShader = shader.vertexShader.replace(
      '#include <common>',
      `#include <common>
       varying vec3 vWorldNormal_moss;`
    )
    shader.vertexShader = shader.vertexShader.replace(
      '#include <beginnormal_vertex>',
      `#include <beginnormal_vertex>
       // objectNormal is defined by beginnormal_vertex; transform to world.
       // mat3(modelMatrix) is fine here — rocks may be non-uniformly scaled
       // but we only need the sign of .y for moss placement, not lighting.
       vWorldNormal_moss = normalize(mat3(modelMatrix) * objectNormal);`
    )

    // ── fragment: use it to tint top-facing surfaces ────────────────────
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <common>',
      `#include <common>
       varying vec3 vWorldNormal_moss;`
    )
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <color_fragment>',
      `#include <color_fragment>
       float mossTop = smoothstep(0.4, 0.85, vWorldNormal_moss.y);
       diffuseColor.rgb = mix(diffuseColor.rgb, ${moss}, mossTop * ${mossStrength.toFixed(3)});`
    )
  }
  return mat
}
