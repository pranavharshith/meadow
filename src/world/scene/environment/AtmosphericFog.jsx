import { useStore } from '../../../store'

/** Cool-neutral distance haze separates woodland layers without washing them out. */
export default function AtmosphericFog() {
  const viewMode = useStore((state) => state.viewMode)
  const topDown = viewMode === 'top' || viewMode === 'drone'
  return (
    <fog
      attach="fog"
      color="#c4c5aa"
      near={topDown ? 260 : 105}
      far={topDown ? 620 : 350}
    />
  )
}
