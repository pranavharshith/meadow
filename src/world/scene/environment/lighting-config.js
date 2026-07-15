import * as THREE from 'three'

export const LIGHTING = Object.freeze({
  sunElevation: 10,
  sunAzimuth: 158,
  sunDistance: 115,
  sunIntensity: 2.55,
  shadowExtent: 58,
  shadowFar: 260,
})

export function createSunDirection() {
  const phi = THREE.MathUtils.degToRad(90 - LIGHTING.sunElevation)
  const theta = THREE.MathUtils.degToRad(LIGHTING.sunAzimuth)
  return new THREE.Vector3().setFromSphericalCoords(1, phi, theta)
}
