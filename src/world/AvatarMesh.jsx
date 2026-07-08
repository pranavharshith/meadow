import * as THREE from 'three'
import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'

const headGeo = new THREE.SphereGeometry(0.25, 16, 16)
const bodyGeo = new THREE.CylinderGeometry(0.24, 0.14, 0.65, 16)
const pelvisGeo = new THREE.SphereGeometry(0.18, 16, 16)
const jointGeo = new THREE.SphereGeometry(0.1, 16, 16)
const limbGeo = new THREE.CylinderGeometry(0.07, 0.07, 0.38, 12)
// Shift limb origin to the top so it hinges correctly from the joint without a nested group translation
limbGeo.translate(0, -0.19, 0)
const eyeGeo = new THREE.SphereGeometry(0.04, 12, 12)
const pupilGeo = new THREE.SphereGeometry(0.015, 8, 8)

export default function AvatarMesh({ color, state }) {
  const bobRef = useRef()
  const armLRef = useRef()
  const armRRef = useRef()
  const legLRef = useRef()
  const legRRef = useRef()
  const bodyRef = useRef()

  const bodyMat = useMemo(() => new THREE.MeshStandardMaterial({ color, roughness: 0.7 }), [color])
  const jointMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#333333', roughness: 0.8 }), [])
  const eyeMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#111111', roughness: 0.3 }), [])
  const pupilMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.1 }), [])

  useFrame(({ clock }, dt) => {
    const t = clock.elapsedTime
    const step = Math.min(dt, 0.1)
    const k = 1 - Math.exp(-8 * step)

    const moving = state.moving
    const sitting = state.emote === 'sit'
    const waving = state.emote === 'wave'
    const run = state.running

    if (sitting) {
      // Settle down to kneel
      bobRef.current.position.y = THREE.MathUtils.lerp(bobRef.current.position.y, -0.25, k)
      bodyRef.current.rotation.x = THREE.MathUtils.lerp(bodyRef.current.rotation.x, -0.1, k)
      
      // Legs fold backwards to kneel
      legLRef.current.rotation.x = THREE.MathUtils.lerp(legLRef.current.rotation.x, 1.5, k)
      legRRef.current.rotation.x = THREE.MathUtils.lerp(legRRef.current.rotation.x, 1.5, k)
      
      // Arms rest
      armLRef.current.rotation.x = THREE.MathUtils.lerp(armLRef.current.rotation.x, 0.1, k)
      armRRef.current.rotation.x = THREE.MathUtils.lerp(armRRef.current.rotation.x, 0.1, k)
      armLRef.current.rotation.z = THREE.MathUtils.lerp(armLRef.current.rotation.z, -0.15, k)
      armRRef.current.rotation.z = THREE.MathUtils.lerp(armRRef.current.rotation.z, 0.15, k)
      
    } else {
      // Stand up
      bodyRef.current.rotation.x = THREE.MathUtils.lerp(bodyRef.current.rotation.x, moving ? 0.15 : 0, k) // lean forward if moving
      
      // Walk cycle or Idle breathing
      if (moving) {
        const speed = run ? 14 : 9
        const bounce = Math.abs(Math.sin(t * speed)) * 0.08
        bobRef.current.position.y = THREE.MathUtils.lerp(bobRef.current.position.y, bounce, k * 2)
        
        // Opposing limbs on X axis (forward/back)
        const stride = run ? 0.6 : 0.4
        legLRef.current.rotation.x = Math.sin(t * speed) * stride
        legRRef.current.rotation.x = -Math.sin(t * speed) * stride
        
        if (!waving) {
          armLRef.current.rotation.x = -Math.sin(t * speed) * stride
          armRRef.current.rotation.x = Math.sin(t * speed) * stride
          armLRef.current.rotation.z = THREE.MathUtils.lerp(armLRef.current.rotation.z, -0.1, k)
          armRRef.current.rotation.z = THREE.MathUtils.lerp(armRRef.current.rotation.z, 0.1, k)
        }
      } else {
        // Idle breathing
        const breath = Math.sin(t * 2) * 0.015
        bobRef.current.position.y = THREE.MathUtils.lerp(bobRef.current.position.y, breath, k)
        
        legLRef.current.rotation.x = THREE.MathUtils.lerp(legLRef.current.rotation.x, 0, k)
        legRRef.current.rotation.x = THREE.MathUtils.lerp(legRRef.current.rotation.x, 0, k)
        
        if (!waving) {
          armLRef.current.rotation.x = THREE.MathUtils.lerp(armLRef.current.rotation.x, 0, k)
          armRRef.current.rotation.x = THREE.MathUtils.lerp(armRRef.current.rotation.x, 0, k)
          armLRef.current.rotation.z = THREE.MathUtils.lerp(armLRef.current.rotation.z, -0.1 - breath*3, k)
          armRRef.current.rotation.z = THREE.MathUtils.lerp(armRRef.current.rotation.z, 0.1 + breath*3, k)
        }
      }
    }

    if (waving) {
      // Enthusiastic wave on right arm
      armRRef.current.rotation.x = THREE.MathUtils.lerp(armRRef.current.rotation.x, 0, k)
      armRRef.current.rotation.z = -2.2 + Math.sin(t * 15) * 0.4
      // Left arm slightly raised
      armLRef.current.rotation.x = THREE.MathUtils.lerp(armLRef.current.rotation.x, 0, k)
      armLRef.current.rotation.z = THREE.MathUtils.lerp(armLRef.current.rotation.z, 0.5, k)
    }
  })

  return (
    <group ref={bobRef}>
      {/* Body container (tilts when walking) */}
      <group ref={bodyRef}>
        <mesh position={[0, 0.7, 0]} material={bodyMat} castShadow>
          <primitive object={bodyGeo} />
        </mesh>
        
        {/* Head */}
        <group position={[0, 1.15, 0]}>
          <mesh material={bodyMat} castShadow>
            <primitive object={headGeo} />
          </mesh>
          {/* Eyes */}
          <mesh position={[0.1, 0.05, 0.21]} material={eyeMat}>
            <primitive object={eyeGeo} />
            <mesh position={[0, 0, 0.03]} material={pupilMat}>
              <primitive object={pupilGeo} />
            </mesh>
          </mesh>
          <mesh position={[-0.1, 0.05, 0.21]} material={eyeMat}>
            <primitive object={eyeGeo} />
            <mesh position={[0, 0, 0.03]} material={pupilMat}>
              <primitive object={pupilGeo} />
            </mesh>
          </mesh>
        </group>
        
        {/* Arms (hinge at shoulder joint) */}
        <mesh position={[0.3, 0.9, 0]} material={jointMat} castShadow>
          <primitive object={jointGeo} />
          <mesh ref={armRRef} material={bodyMat} castShadow>
            <primitive object={limbGeo} />
          </mesh>
        </mesh>
        <mesh position={[-0.3, 0.9, 0]} material={jointMat} castShadow>
          <primitive object={jointGeo} />
          <mesh ref={armLRef} material={bodyMat} castShadow>
            <primitive object={limbGeo} />
          </mesh>
        </mesh>
      </group>
      
      {/* Pelvis */}
      <mesh position={[0, 0.35, 0]} material={jointMat} castShadow>
        <primitive object={pelvisGeo} />
      </mesh>

      {/* Legs (hinge at hip joint) */}
      <mesh position={[0.14, 0.35, 0]} material={jointMat} castShadow>
        <primitive object={jointGeo} />
        <mesh ref={legRRef} material={bodyMat} castShadow>
          <primitive object={limbGeo} />
        </mesh>
      </mesh>
      <mesh position={[-0.14, 0.35, 0]} material={jointMat} castShadow>
        <primitive object={jointGeo} />
        <mesh ref={legLRef} material={bodyMat} castShadow>
          <primitive object={limbGeo} />
        </mesh>
      </mesh>
    </group>
  )
}
