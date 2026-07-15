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
      vec3 shade = vec3(0.16, 0.34, 0.08);
      vec3 healthy = vec3(0.31, 0.56, 0.13);
      vec3 sunlit = vec3(0.50, 0.72, 0.20);
      vec3 meadow = mix(shade, healthy, smoothstep(0.24, 0.78, macro));
      meadow = mix(meadow, sunlit, smoothstep(0.58, 0.88, patch) * 0.42);
      return meadow * (0.92 + fine * 0.14);
    }
  ` + shader.fragmentShader

  shader.fragmentShader = shader.fragmentShader.replace(
    '#include <color_fragment>',
    `#include <color_fragment>
     vec3 woodlandNormal = normalize(vWoodlandWorldNormal);
     float slope = 1.0 - clamp(abs(woodlandNormal.y), 0.0, 1.0);
     float rock = smoothstep(0.30, 0.66, slope);
     float damp = smoothstep(0.62, 0.86, grasslandFbm(vWoodlandWorldPosition.xz * 0.014 + 9.0)) * (1.0 - rock);
     float dry = smoothstep(0.72, 0.95, grasslandFbm(vWoodlandWorldPosition.xz * 0.009 - 37.0)) * (1.0 - damp - rock);

     vec3 meadow = grasslandMeadowColor(vWoodlandWorldPosition.xz);
     vec3 moss = vec3(0.20, 0.42, 0.12);
     vec3 soil = vec3(0.34, 0.28, 0.12);
     vec3 stone = vec3(0.43, 0.46, 0.39);
     vec3 grassCover = mix(meadow, moss, damp * 0.16);
     grassCover = mix(grassCover, soil, dry * 0.08);
     grassCover = mix(grassCover, stone, rock * 0.74);

     // The shader remains the far-field meadow carpet whenever mesh grass is
     // reduced by distance or quality settings.
     diffuseColor.rgb = mix(diffuseColor.rgb, grassCover, 0.90);`,
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
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
  })
  material.onBeforeCompile = applyWoodlandShader
  material.customProgramCacheKey = () => 'lush-grassland-terrain-v1'
  return material
}
