import * as THREE from 'three'
import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'

const bodyGeo = new THREE.CapsuleGeometry(0.26, 0.35, 4, 16)
const headGeo = new THREE.SphereGeometry(0.25, 16, 16)
const limbGeo = new THREE.CapsuleGeometry(0.085, 0.32, 4, 12)
const eyeGeo = new THREE.CapsuleGeometry(0.04, 0.08, 4, 8)
eyeGeo.rotateZ(Math.PI / 2)

export default function AvatarMesh({ color, moving, sitting, waving, run }) {
  const bobRef = useRef()
  const armLRef = useRef()
  const armRRef = useRef()
  const legLRef = useRef()
  const legRRef = useRef()
  const bodyRef = useRef()

  const bodyMat = useMemo(() => new THREE.MeshStandardMaterial({ color, roughness: 0.7 }), [color])
  const headMat = useMemo(() => new THREE.MeshStandardMaterial({ color: new THREE.Color(color).lerp(new THREE.Color('#fff'), 0.2), roughness: 0.6 }), [color])
  const eyeMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#1a1a1a', roughness: 0.3 }), [])

  useFrame(({ clock }, dt) => {
    const t = clock.elapsedTime
    const step = Math.min(dt, 0.1)
    const k = 1 - Math.exp(-8 * step)

    if (sitting) {
      // Settle down
      bobRef.current.position.y = THREE.MathUtils.lerp(bobRef.current.position.y, -0.34, k)
      bodyRef.current.rotation.x = THREE.MathUtils.lerp(bodyRef.current.rotation.x, -0.15, k)
      
      // Legs bend forward to sit
      legLRef.current.rotation.x = THREE.MathUtils.lerp(legLRef.current.rotation.x, -1.4, k)
      legRRef.current.rotation.x = THREE.MathUtils.lerp(legRRef.current.rotation.x, -1.4, k)
      
      // Arms rest
      armLRef.current.rotation.x = THREE.MathUtils.lerp(armLRef.current.rotation.x, 0.2, k)
      armRRef.current.rotation.x = THREE.MathUtils.lerp(armRRef.current.rotation.x, 0.2, k)
      armLRef.current.rotation.z = THREE.MathUtils.lerp(armLRef.current.rotation.z, -0.1, k)
      armRRef.current.rotation.z = THREE.MathUtils.lerp(armRRef.current.rotation.z, 0.1, k)
      
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
        <mesh position={[0, 0.55, 0]} material={bodyMat} castShadow>
          <primitive object={bodyGeo} />
        </mesh>
        
        {/* Head */}
        <group position={[0, 1.05, 0]}>
          <mesh material={headMat} castShadow>
            <primitive object={headGeo} />
          </mesh>
          {/* Eyes (visor) */}
          <mesh position={[0, 0.02, 0.23]} material={eyeMat}>
            <primitive object={eyeGeo} />
          </mesh>
        </group>
        
        {/* Arms (hinge at shoulder) */}
        <group ref={armRRef} position={[0.32, 0.82, 0]}>
          <mesh position={[0, -0.18, 0]} material={bodyMat} castShadow>
            <primitive object={limbGeo} />
          </mesh>
        </group>
        <group ref={armLRef} position={[-0.32, 0.82, 0]}>
          <mesh position={[0, -0.18, 0]} material={bodyMat} castShadow>
            <primitive object={limbGeo} />
          </mesh>
        </group>
      </group>
      
      {/* Legs (hinge at hip, independent of body tilt) */}
      <group ref={legRRef} position={[0.14, 0.35, 0]}>
        <mesh position={[0, -0.18, 0]} material={bodyMat} castShadow>
          <primitive object={limbGeo} />
        </mesh>
      </group>
      <group ref={legLRef} position={[-0.14, 0.35, 0]}>
        <mesh position={[0, -0.18, 0]} material={bodyMat} castShadow>
          <primitive object={limbGeo} />
        </mesh>
      </group>
    </group>
  )
}
