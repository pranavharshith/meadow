import { useLayoutEffect, useRef } from 'react'

/** Draws a deterministic, immutable set of transforms in one GPU batch. */
export default function StaticInstanceBatch({
  geometry,
  material,
  instances,
  castShadow = false,
  receiveShadow = false,
  name,
}) {
  const ref = useRef()
  const capacity = Math.max(instances.length, 1)

  useLayoutEffect(() => {
    const mesh = ref.current
    if (!mesh) return

    for (let i = 0; i < instances.length; i++) {
      const instance = instances[i]
      mesh.setMatrixAt(i, instance.matrix)
      if (instance.color) mesh.setColorAt(i, instance.color)
    }
    mesh.count = instances.length
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    mesh.computeBoundingBox()
    mesh.computeBoundingSphere()
  }, [instances])

  return (
    <instancedMesh
      ref={ref}
      name={name}
      args={[geometry, material, capacity]}
      castShadow={castShadow}
      receiveShadow={receiveShadow}
    />
  )
}
