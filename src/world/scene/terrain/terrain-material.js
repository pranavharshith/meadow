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
      return woodlandNoise(point) * 0.52
        + woodlandNoise(point * 2.03 + 13.7) * 0.29
        + woodlandNoise(point * 4.11 - 8.2) * 0.19;
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
     float woodlandMacro = woodlandTriplanar(vWoodlandWorldPosition, woodlandNormal, 0.013);
     float woodlandPatch = woodlandTriplanar(vWoodlandWorldPosition + 29.0, woodlandNormal, 0.052);
     float woodlandFine = woodlandTriplanar(vWoodlandWorldPosition - 17.0, woodlandNormal, 0.34);
     float woodlandGrain = woodlandTriplanar(vWoodlandWorldPosition + 7.0, woodlandNormal, 1.42);
     float woodlandSlope = 1.0 - clamp(abs(woodlandNormal.y), 0.0, 1.0);
     float woodlandRock = smoothstep(0.20, 0.58, woodlandSlope);
     float woodlandDamp = smoothstep(0.56, 0.80, woodlandMacro) * (1.0 - woodlandRock);
     float woodlandDry = smoothstep(0.20, 0.55, 1.0 - woodlandMacro) * (1.0 - woodlandDamp);

     vec3 meadow = mix(vec3(0.30, 0.42, 0.16), vec3(0.53, 0.58, 0.22), woodlandPatch);
     vec3 moss = mix(vec3(0.20, 0.31, 0.13), vec3(0.34, 0.43, 0.18), woodlandFine);
     vec3 soil = mix(vec3(0.25, 0.18, 0.10), vec3(0.43, 0.32, 0.16), woodlandFine);
     vec3 stone = mix(vec3(0.35, 0.36, 0.30), vec3(0.50, 0.49, 0.39), woodlandFine);
     vec3 woodlandColor = meadow;
     woodlandColor = mix(woodlandColor, moss, woodlandDamp * 0.58);
     woodlandColor = mix(woodlandColor, soil, woodlandDry * 0.44);
     woodlandColor = mix(woodlandColor, stone, woodlandRock * (0.74 + woodlandFine * 0.18));
     woodlandColor *= 0.88 + woodlandGrain * 0.20;

     // Biome vertex color retains broad ecology; triplanar detail supplies the
     // patchwork and slope readability without requiring texture assets.
     diffuseColor.rgb = mix(woodlandColor, diffuseColor.rgb, 0.52);`,
  )

  shader.fragmentShader = shader.fragmentShader.replace(
    '#include <normal_fragment_maps>',
    `#include <normal_fragment_maps>
     float woodlandB0 = woodlandTriplanar(vWoodlandWorldPosition, vWoodlandWorldNormal, 0.7);
     float woodlandBx = woodlandTriplanar(vWoodlandWorldPosition + vec3(0.06, 0.0, 0.0), vWoodlandWorldNormal, 0.7);
     float woodlandBz = woodlandTriplanar(vWoodlandWorldPosition + vec3(0.0, 0.0, 0.06), vWoodlandWorldNormal, 0.7);
     vec3 woodlandBump = normalize(vec3((woodlandB0 - woodlandBx) * 3.0, 1.0, (woodlandB0 - woodlandBz) * 3.0));
     normal = normalize(mix(normal, normalize(mat3(viewMatrix) * woodlandBump), 0.12));`,
  )

  shader.fragmentShader = shader.fragmentShader.replace(
    '#include <roughnessmap_fragment>',
    `#include <roughnessmap_fragment>
     roughnessFactor = mix(0.99, 0.84, woodlandRock);`,
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
  material.customProgramCacheKey = () => 'woodland-terrain-v1'
  return material
}
