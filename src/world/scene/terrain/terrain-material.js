import * as THREE from 'three'

function applyWoodlandShader(shader) {
  shader.vertexShader = `
    varying vec3 vWoodlandWorldPosition;
    varying vec3 vWoodlandWorldNormal;
  ` + shader.vertexShader

  shader.vertexShader = shader.vertexShader.replace(
    '#include <worldpos_vertex>',
    `#include <worldpos_vertex>
     vWoodlandWorldPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;
     vWoodlandWorldNormal = normalize(mat3(modelMatrix) * objectNormal);`,
  )

  shader.fragmentShader = `
    varying vec3 vWoodlandWorldPosition;
    varying vec3 vWoodlandWorldNormal;

    float woodlandHash(vec2 point) {
      point = fract(point * vec2(123.34, 456.21));
      point += dot(point, point + 45.32);
      return fract(point.x * point.y);
    }

    float woodlandNoise(vec2 point) {
      vec2 cell = floor(point);
      vec2 local = fract(point);
      local = local * local * (3.0 - 2.0 * local);
      return mix(
        mix(woodlandHash(cell), woodlandHash(cell + vec2(1.0, 0.0)), local.x),
        mix(woodlandHash(cell + vec2(0.0, 1.0)), woodlandHash(cell + vec2(1.0)), local.x),
        local.y
      );
    }

    float woodlandFbm(vec2 point) {
      return woodlandNoise(point) * 0.66
        + woodlandNoise(point * 2.07 + 13.7) * 0.34;
    }

    float woodlandTriplanar(vec3 position, vec3 normal, float scale) {
      vec3 weights = pow(abs(normal), vec3(4.0));
      weights /= max(dot(weights, vec3(1.0)), 0.0001);
      return woodlandFbm(position.yz * scale) * weights.x
        + woodlandFbm(position.xz * scale) * weights.y
        + woodlandFbm(position.xy * scale) * weights.z;
    }
  ` + shader.fragmentShader

  shader.fragmentShader = shader.fragmentShader.replace(
    '#include <color_fragment>',
    `#include <color_fragment>
     vec3 woodlandNormal = normalize(vWoodlandWorldNormal);
     float woodlandMacro = woodlandFbm(vWoodlandWorldPosition.xz * 0.012);
     float woodlandPatch = woodlandTriplanar(vWoodlandWorldPosition + 29.0, woodlandNormal, 0.046);
     float woodlandFine = woodlandTriplanar(vWoodlandWorldPosition - 17.0, woodlandNormal, 0.26);
     float woodlandSlope = 1.0 - clamp(abs(woodlandNormal.y), 0.0, 1.0);
     float woodlandRock = smoothstep(0.22, 0.6, woodlandSlope);
     float woodlandDamp = smoothstep(0.58, 0.82, woodlandMacro) * (1.0 - woodlandRock);
     float woodlandDry = smoothstep(0.22, 0.58, 1.0 - woodlandMacro) * (1.0 - woodlandDamp);

     vec3 meadow = mix(vec3(0.38, 0.49, 0.19), vec3(0.57, 0.62, 0.28), woodlandPatch);
     vec3 moss = mix(vec3(0.27, 0.39, 0.2), vec3(0.39, 0.5, 0.25), woodlandFine);
     vec3 soil = mix(vec3(0.35, 0.26, 0.16), vec3(0.49, 0.38, 0.23), woodlandFine);
     vec3 stone = mix(vec3(0.43, 0.44, 0.39), vec3(0.57, 0.56, 0.48), woodlandFine);
     vec3 woodlandColor = meadow;
     woodlandColor = mix(woodlandColor, moss, woodlandDamp * 0.42);
     woodlandColor = mix(woodlandColor, soil, woodlandDry * 0.3);
     woodlandColor = mix(woodlandColor, stone, woodlandRock * 0.76);
     woodlandColor *= 0.94 + woodlandFine * 0.11;

     diffuseColor.rgb = mix(woodlandColor, diffuseColor.rgb, 0.62);`,
  )

  shader.fragmentShader = shader.fragmentShader.replace(
    '#include <roughnessmap_fragment>',
    `#include <roughnessmap_fragment>
     roughnessFactor = mix(0.98, 0.86, woodlandRock);`,
  )
}

export function createTerrainMaterial() {
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.96,
    metalness: 0,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
  })
  material.onBeforeCompile = applyWoodlandShader
  material.customProgramCacheKey = () => 'woodland-terrain-v2'
  return material
}
