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

    float grasslandHash(vec2 point) {
      point = fract(point * vec2(123.34, 456.21));
      point += dot(point, point + 45.32);
      return fract(point.x * point.y);
    }

    float grasslandNoise(vec2 point) {
      vec2 cell = floor(point);
      vec2 local = fract(point);
      local = local * local * (3.0 - 2.0 * local);
      return mix(
        mix(grasslandHash(cell), grasslandHash(cell + vec2(1.0, 0.0)), local.x),
        mix(grasslandHash(cell + vec2(0.0, 1.0)), grasslandHash(cell + vec2(1.0, 1.0)), local.x),
        local.y
      );
    }

    float grasslandFbm(vec2 point) {
      return grasslandNoise(point) * 0.62
        + grasslandNoise(point * 2.03 + 17.2) * 0.25
        + grasslandNoise(point * 4.11 - 9.7) * 0.13;
    }

    vec3 grasslandMeadowColor(vec2 worldPosition) {
      float macro = grasslandFbm(worldPosition * 0.011);
      float patch = grasslandFbm(worldPosition * 0.043 + 31.0);
      float fine = grasslandFbm(worldPosition * 0.19 - 14.0);
      vec3 shade = vec3(0.22, 0.45, 0.10);
      vec3 healthy = vec3(0.42, 0.70, 0.17);
      vec3 sunlit = vec3(0.68, 0.86, 0.30);
      vec3 meadow = mix(shade, healthy, smoothstep(0.20, 0.74, macro));
      meadow = mix(meadow, sunlit, smoothstep(0.54, 0.86, patch) * 0.45);
      return meadow * (0.98 + fine * 0.12);
    }
  ` + shader.fragmentShader

  shader.fragmentShader = shader.fragmentShader.replace(
    '#include <color_fragment>',
    `#include <color_fragment>
     vec3 woodlandNormal = normalize(vWoodlandWorldNormal);
     float slope = 1.0 - clamp(abs(woodlandNormal.y), 0.0, 1.0);
     float rock = smoothstep(0.36, 0.70, slope);
     float damp = smoothstep(0.64, 0.88, grasslandFbm(vWoodlandWorldPosition.xz * 0.014 + 9.0)) * (1.0 - rock);

     vec3 meadow = grasslandMeadowColor(vWoodlandWorldPosition.xz);
     vec3 moss = vec3(0.19, 0.45, 0.11);
     vec3 stone = vec3(0.43, 0.46, 0.39);
     vec3 grassCover = mix(meadow, moss, damp * 0.12);
     grassCover = mix(grassCover, stone, rock * 0.66);
     diffuseColor.rgb = mix(diffuseColor.rgb, grassCover, 0.96);`,
  )
  shader.fragmentShader = shader.fragmentShader.replace(
    '#include <roughnessmap_fragment>',
    `#include <roughnessmap_fragment>
     roughnessFactor = mix(0.98, 0.88, rock);`,
  )
}

export function createTerrainMaterial() {
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.96,
    metalness: 0,
    emissive: '#173707',
    emissiveIntensity: 0.16,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
  })
  material.onBeforeCompile = applyWoodlandShader
  material.customProgramCacheKey = () => 'lush-grassland-terrain-v2'
  return material
}
