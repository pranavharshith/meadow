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

const wizardHatGeo = new THREE.ConeGeometry(0.3, 0.6, 16)
const topHatGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.4, 16)
const topHatBrimGeo = new THREE.CylinderGeometry(0.35, 0.35, 0.05, 16)
const crownGeo = new THREE.CylinderGeometry(0.2, 0.25, 0.2, 8)

export default function AvatarMesh({ color, headColor, bodyColor, legColor, hatId, state }) {
  const bobRef = useRef()
  const armLRef = useRef()
  const armRRef = useRef()
  const legLRef = useRef()
  const legRRef = useRef()
  const bodyRef = useRef()

  const matBody = useMemo(() => new THREE.MeshStandardMaterial({ color: bodyColor || color, roughness: 0.6, metalness: 0.1 }), [color, bodyColor])
  const matHead = useMemo(() => new THREE.MeshStandardMaterial({ color: headColor || color, roughness: 0.5, metalness: 0.2 }), [color, headColor])
  const matLegs = useMemo(() => new THREE.MeshStandardMaterial({ color: legColor || color, roughness: 0.7 }), [color, legColor])
  const matHatDark = useMemo(() => new THREE.MeshStandardMaterial({ color: '#111', roughness: 0.7, metalness: 0.2 }), [])
  const matHatBlue = useMemo(() => new THREE.MeshStandardMaterial({ color: '#103060', roughness: 0.8, metalness: 0.1 }), [])
  const matHatGold = useMemo(() => new THREE.MeshStandardMaterial({ color: '#ffea00', roughness: 0.1, metalness: 1.0, emissive: '#ffaa00', emissiveIntensity: 0.2 }), [])
  const jointMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#222222', roughness: 0.8 }), [])
  const eyeMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#050505', roughness: 0.1, metalness: 0.8 }), [])
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
      armRRef.current.rotation.z = 2.5 + Math.sin(t * 15) * 0.3
      // Left arm slightly outwards
      armLRef.current.rotation.x = THREE.MathUtils.lerp(armLRef.current.rotation.x, 0, k)
      armLRef.current.rotation.z = THREE.MathUtils.lerp(armLRef.current.rotation.z, -0.2, k)
    }
  })

  return (
    <group ref={bobRef}>
      {/* Body container (tilts when walking) */}
      <group ref={bodyRef}>
        <mesh position={[0, 0.7, 0]} geometry={bodyGeo} material={matBody} castShadow>

        </mesh>
        
        {/* Head */}
        <group position={[0, 1.15, 0]}>
          <mesh geometry={headGeo} material={matHead} castShadow>

          </mesh>
          
          {/* Hat */}
          {hatId === 'wizard' && (
            <mesh position={[0, 0.45, -0.05]} rotation={[-0.1, 0, 0]} geometry={wizardHatGeo} material={matHatBlue} castShadow>

            </mesh>
          )}
          {hatId === 'tophat' && (
            <group position={[0, 0.4, 0]}>
              <mesh position={[0, 0, 0]} geometry={topHatGeo} material={matHatDark} castShadow>
              </mesh>
              <mesh position={[0, -0.18, 0]} geometry={topHatBrimGeo} material={matHatDark} castShadow>

              </mesh>
            </group>
          )}
          {hatId === 'crown' && (
            <mesh position={[0, 0.3, 0]} geometry={crownGeo} material={matHatGold} castShadow>

            </mesh>
          )}
          {/* Eyes */}
          <mesh position={[0.1, 0.05, 0.21]} geometry={eyeGeo} material={eyeMat}>
            <mesh position={[0, 0, 0.03]} geometry={pupilGeo} material={pupilMat}>

            </mesh>
          </mesh>
          <mesh position={[-0.1, 0.05, 0.21]} geometry={eyeGeo} material={eyeMat}>
            <mesh position={[0, 0, 0.03]} geometry={pupilGeo} material={pupilMat}>

            </mesh>
          </mesh>
        </group>
        
        {/* Arms (hinge at shoulder joint) */}
        <mesh position={[0.3, 0.9, 0]} geometry={jointGeo} material={jointMat} castShadow>
          <mesh ref={armRRef} geometry={limbGeo} material={matBody} castShadow>
          </mesh>
        </mesh>
        <mesh position={[-0.3, 0.9, 0]} geometry={jointGeo} material={jointMat} castShadow>
          <mesh ref={armLRef} geometry={limbGeo} material={matBody} castShadow>

          </mesh>
        </mesh>
      </group>
      
      {/* Pelvis */}
      <mesh position={[0, 0.35, 0]} geometry={pelvisGeo} material={jointMat} castShadow>

      </mesh>

      {/* Legs (hinge at hip joint) */}
      <mesh position={[0.14, 0.35, 0]} geometry={jointGeo} material={jointMat} castShadow>
        <mesh ref={legRRef} geometry={limbGeo} material={matLegs} castShadow>
        </mesh>
      </mesh>
      <mesh position={[-0.14, 0.35, 0]} geometry={jointGeo} material={jointMat} castShadow>
        <mesh ref={legLRef} geometry={limbGeo} material={matLegs} castShadow>

        </mesh>
      </mesh>
    </group>
  )
}
