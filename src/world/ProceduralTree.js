import * as THREE from 'three'

class RNG {
  constructor(seed) {
    let a = 0x6d2b79f5
    if (typeof seed === 'string') {
      for (let i = 0; i < seed.length; i++) {
        a = (a * 31 + seed.charCodeAt(i)) | 0
      }
    } else {
      a = seed | 0
    }
    this.a = a
  }
  random(min = 0, max = 1) {
    this.a |= 0
    this.a = (this.a + 0x6d2b79f5) | 0
    let t = Math.imul(this.a ^ (this.a >>> 15), 1 | this.a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    const r = ((t ^ (t >>> 14)) >>> 0) / 4294967296
    return min + r * (max - min)
  }
}

class Branch {
  constructor(origin, orientation, length, radius, level, sectionCount, segmentCount) {
    this.origin = origin
    this.orientation = orientation
    this.length = length
    this.radius = radius
    this.level = level
    this.sectionCount = sectionCount
    this.segmentCount = segmentCount
  }
}

const DEFAULT_OPTIONS = {
  branch: {
    levels: 3, // Trunk -> Branches -> Leaves
    sections: [6, 4, 3], // Low poly sections
    segments: [5, 4, 3], // Low poly circumference
    length: [3.2, 2.0, 1.2],
    radius: [0.28, 0.15, 0.05],
    taper: [0.5, 0.7, 0.8],
    gnarliness: [0.15, 0.25, 0.3],
    twist: [0.1, 0.2, 0.2],
    children: [0, 3, 2], // Branches per parent
    start: [0, 0.4, 0.5],
    angle: [0, 50, 55],
    force: { direction: new THREE.Vector3(0, 1, 0), strength: 0.015 }
  }
}

// Pre-compute the base leaf geometry to append for each leaf.
// Using a simple Icosahedron for the low-poly aesthetic.
const baseLeafGeo = new THREE.IcosahedronGeometry(1.0, 0)
baseLeafGeo.computeVertexNormals()

export function generateTreeGeometries(seedStr, options = DEFAULT_OPTIONS) {
  const rng = new RNG(seedStr)
  
  const branches = {
    verts: [],
    normals: [],
    uvs: [],
    indices: []
  }
  
  const leaves = {
    verts: [],
    normals: [],
    uvs: [],
    indices: []
  }
  
  let branchVertexCount = 0
  let leafVertexCount = 0
  
  const branchQueue = []
  
  // Trunk
  branchQueue.push(
    new Branch(
      new THREE.Vector3(),
      new THREE.Euler(),
      options.branch.length[0] * rng.random(0.8, 1.2),
      options.branch.radius[0] * rng.random(0.9, 1.1),
      0,
      options.branch.sections[0],
      options.branch.segments[0]
    )
  )
  
  const yAxis = new THREE.Vector3(0, 1, 0)
  const xAxis = new THREE.Vector3(1, 0, 0)
  
  while (branchQueue.length > 0) {
    const branch = branchQueue.shift()
    
    let sectionOrigin = branch.origin.clone()
    let sectionOrientation = branch.orientation.clone()
    let sectionLength = branch.length / branch.sectionCount
    
    const sectionsData = []
    
    // Build Branch Geometry
    for (let i = 0; i <= branch.sectionCount; i++) {
      let sectionRadius = branch.radius
      if (i === branch.sectionCount) {
        sectionRadius = 0.01 // effectively zero
      } else {
        sectionRadius *= 1.0 - options.branch.taper[branch.level] * (i / branch.sectionCount)
      }
      
      const startV = branchVertexCount
      
      // Create vertices for this section
      for (let j = 0; j <= branch.segmentCount; j++) {
        // Wrap around for UVs and seam
        const jWrap = j === branch.segmentCount ? 0 : j
        let angle = (2.0 * Math.PI * jWrap) / branch.segmentCount
        
        const pt = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle))
        const normal = pt.clone().normalize()
        
        pt.multiplyScalar(sectionRadius).applyEuler(sectionOrientation).add(sectionOrigin)
        normal.applyEuler(sectionOrientation).normalize()
        
        const uv = new THREE.Vector2(j / branch.segmentCount, i / branch.sectionCount)
        
        branches.verts.push(pt.x, pt.y, pt.z)
        branches.normals.push(normal.x, normal.y, normal.z)
        branches.uvs.push(uv.x, uv.y)
        branchVertexCount++
      }
      
      // Connect to previous section
      if (i > 0) {
        const prevStart = startV - (branch.segmentCount + 1)
        for (let j = 0; j < branch.segmentCount; j++) {
          const v0 = prevStart + j
          const v1 = prevStart + j + 1
          const v2 = startV + j
          const v3 = startV + j + 1
          
          branches.indices.push(v0, v2, v1)
          branches.indices.push(v1, v2, v3)
        }
      }
      
      sectionsData.push({
        origin: sectionOrigin.clone(),
        orientation: sectionOrientation.clone(),
        radius: sectionRadius
      })
      
      if (i < branch.sectionCount) {
        // Advance to next section
        const advance = new THREE.Vector3(0, sectionLength, 0).applyEuler(sectionOrientation)
        sectionOrigin.add(advance)
        
        const gnarliness = Math.max(1, 1 / Math.sqrt(Math.max(0.01, sectionRadius))) * options.branch.gnarliness[branch.level]
        
        sectionOrientation.x += rng.random(-gnarliness, gnarliness)
        sectionOrientation.z += rng.random(-gnarliness, gnarliness)
        
        const qSection = new THREE.Quaternion().setFromEuler(sectionOrientation)
        const qTwist = new THREE.Quaternion().setFromAxisAngle(yAxis, options.branch.twist[branch.level])
        const qForce = new THREE.Quaternion().setFromUnitVectors(yAxis, options.branch.force.direction)
        
        qSection.multiply(qTwist)
        qSection.rotateTowards(qForce, options.branch.force.strength / Math.max(0.01, sectionRadius))
        
        sectionOrientation.setFromQuaternion(qSection)
      }
    }
    
    // Spawn Children or Leaves
    if (branch.level === options.branch.levels - 1) {
      // Spawn Leaves at the end of the branch
      const endSection = sectionsData[sectionsData.length - 1]
      
      const leafScale = rng.random(0.9, 1.4)
      const leafMatrix = new THREE.Matrix4().compose(
        endSection.origin,
        new THREE.Quaternion().setFromEuler(endSection.orientation),
        new THREE.Vector3(leafScale, leafScale, leafScale)
      )
      
      const posAttr = baseLeafGeo.getAttribute('position')
      const normAttr = baseLeafGeo.getAttribute('normal')
      const indexAttr = baseLeafGeo.getIndex()
      
      const startV = leafVertexCount
      
      const vTemp = new THREE.Vector3()
      const nTemp = new THREE.Vector3()
      
      for (let i = 0; i < posAttr.count; i++) {
        vTemp.fromBufferAttribute(posAttr, i)
        nTemp.fromBufferAttribute(normAttr, i)
        
        vTemp.applyMatrix4(leafMatrix)
        
        // Transform normal
        nTemp.transformDirection(leafMatrix).normalize()
        
        leaves.verts.push(vTemp.x, vTemp.y, vTemp.z)
        leaves.normals.push(nTemp.x, nTemp.y, nTemp.z)
        
        // Basic UV for leaves (used by wind shader for sway amplitude)
        leaves.uvs.push(0.5, Math.max(0, vTemp.y)) 
        leafVertexCount++
      }
      
      for (let i = 0; i < indexAttr.count; i++) {
        leaves.indices.push(startV + indexAttr.getX(i))
      }
      
    } else if (branch.level < options.branch.levels - 1) {
      const count = options.branch.children[branch.level + 1]
      
      for (let i = 0; i < count; i++) {
        const startOff = options.branch.start[branch.level + 1]
        let childStart = rng.random(startOff, 1.0)
        
        const sectionIndexF = childStart * (sectionsData.length - 1)
        const sectionIndex = Math.floor(sectionIndexF)
        const alpha = sectionIndexF - sectionIndex
        
        const secA = sectionsData[sectionIndex]
        const secB = sectionsData[Math.min(sectionIndex + 1, sectionsData.length - 1)]
        
        const childOrigin = new THREE.Vector3().lerpVectors(secA.origin, secB.origin, alpha)
        const childRadius = options.branch.radius[branch.level + 1] * ((1 - alpha) * secA.radius + alpha * secB.radius)
        
        const qA = new THREE.Quaternion().setFromEuler(secA.orientation)
        const qB = new THREE.Quaternion().setFromEuler(secB.orientation)
        const parentOrient = new THREE.Euler().setFromQuaternion(qA.slerp(qB, alpha))
        
        const radialOffset = rng.random()
        const radialAngle = 2.0 * Math.PI * (radialOffset + i / count)
        
        const q1 = new THREE.Quaternion().setFromAxisAngle(xAxis, options.branch.angle[branch.level + 1] * (Math.PI / 180))
        const q2 = new THREE.Quaternion().setFromAxisAngle(yAxis, radialAngle)
        const q3 = new THREE.Quaternion().setFromEuler(parentOrient)
        
        const childOrient = new THREE.Euler().setFromQuaternion(q3.multiply(q2.multiply(q1)))
        
        const childLength = options.branch.length[branch.level + 1] * rng.random(0.8, 1.2)
        
        branchQueue.push(
          new Branch(
            childOrigin,
            childOrient,
            childLength,
            childRadius,
            branch.level + 1,
            options.branch.sections[branch.level + 1],
            options.branch.segments[branch.level + 1]
          )
        )
      }
    }
  }
  
  const trunkGeo = new THREE.BufferGeometry()
  trunkGeo.setAttribute('position', new THREE.Float32BufferAttribute(branches.verts, 3))
  trunkGeo.setAttribute('normal', new THREE.Float32BufferAttribute(branches.normals, 3))
  trunkGeo.setAttribute('uv', new THREE.Float32BufferAttribute(branches.uvs, 2))
  trunkGeo.setIndex(branches.indices)
  trunkGeo.computeBoundingSphere()
  trunkGeo.computeBoundingBox()
  
  const leafGeo = new THREE.BufferGeometry()
  leafGeo.setAttribute('position', new THREE.Float32BufferAttribute(leaves.verts, 3))
  leafGeo.setAttribute('normal', new THREE.Float32BufferAttribute(leaves.normals, 3))
  leafGeo.setAttribute('uv', new THREE.Float32BufferAttribute(leaves.uvs, 2))
  leafGeo.setIndex(leaves.indices)
  leafGeo.computeBoundingSphere()
  leafGeo.computeBoundingBox()
  
  return { trunkGeo, leafGeo }
}
