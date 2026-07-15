import { useLayoutEffect, useRef } from 'react'

/** Draws a deterministic, immutable set of transforms in one GPU batch. */
export default function StaticInstanceBatch({
  geometry,
  material,
  instances,
  boundingSphere,
  castShadow = false,
  receiveShadow = false,
  name,
}) {
  const ref = useRef()
  const capacity = Math.max(instances.length, 1)

  useLayoutEffect(() => {
    const mesh = ref.current
    if (!mesh) return

    for (let index = 0; index < instances.length; index++) {
      const instance = instances[index]
      mesh.setMatrixAt(index, instance.matrix)
      if (instance.color) mesh.setColorAt(index, instance.color)
    }
    mesh.count = instances.length
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true

    // Chunk bounds are known up front. Avoid scanning thousands of instance
    // matrices for every batch during mount, quality changes, and resize.
    if (boundingSphere) mesh.boundingSphere = boundingSphere
    else mesh.computeBoundingSphere()
  }, [instances, boundingSphere])

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
