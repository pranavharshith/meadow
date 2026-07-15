import {
  biomeSample,
  isBadPropSpot,
  mulberry32,
  terrainHeight,
  terrainSlope,
} from '../../noise'
import { CHUNK, seedFor } from '../../chunk'
import { isInsideAnyPlot } from '../contracts/placement-mask'

// Harvestable trees carry the server-validated id "{cx},{cz}_{idx}_tree" with
// idx < n. Purely decorative trees use a non-matching "_deco" key so they never
// collide with a harvest id and are never sent to the cut RPC.
export function proceduralTreeId(tree) {
  return tree.harvestable
    ? `${tree.chunkKey}_${tree.localId}_tree`
    : `${tree.chunkKey}_d${tree.candidateId}_deco`
}

export function treeRegistryEntry(tree) {
  return {
    x: tree.x,
    z: tree.z,
    r: Math.max(0.55, tree.scale * tree.width * 0.34),
    placementR: 0.65 + tree.scale * tree.width * 0.5,
    mature: true,
    chunkKey: tree.chunkKey,
    _source: 'decorative',
    idStr: proceduralTreeId(tree),
  }
}

// The server's cut_procedural_resource derives the cuttable count per chunk as
// n = 3 + floor(rand * 3) from mulberry32(seedFor ^ 0x7) and rejects any index
// >= n. We mirror that exactly so harvest ids validate server-side.
function serverHarvestCount(cx, cz) {
  const rand = mulberry32(seedFor(cx, cz) ^ 0x7)()
  return 3 + Math.floor(rand * 3)
}

/** Deterministic grove generation with a small server-matching harvestable set. */
export function generateTreeChunk(cx, cz, plots) {
  const chunkKey = `${cx},${cz}`
  const trees = []
  const random = mulberry32(seedFor(cx, cz) ^ 0x7)
  const candidateCount = 76 + Math.floor(random() * 23)

  for (let candidateId = 0; candidateId < candidateCount; candidateId++) {
    const x = cx * CHUNK + random() * CHUNK
    const z = cz * CHUNK + random() * CHUNK
    const ageRoll = random()
    const rotation = random() * Math.PI * 2
    const variant = (random() * 7) | 0
    const speciesRoll = random()
    const width = 0.72 + random() * 0.58
    const height = 0.8 + random() * 0.42
    const leanX = (random() - 0.5) * 0.11
    const leanZ = (random() - 0.5) * 0.11
    const acceptanceRoll = random()

    if (isBadPropSpot(x, z) || isInsideAnyPlot(plots, x, z) || Math.hypot(x, z) < 21) continue

    const y = terrainHeight(x, z)
    const slope = terrainSlope(x, z)
    const biome = biomeSample(x, z, slope, y)
    const loneMeadowTree = biome.forest < 0.22 && speciesRoll > 0.985
    const acceptance = 0.025 + Math.pow(biome.forest, 0.72) * 0.94
    if (slope > 0.72 || (!loneMeadowTree && acceptanceRoll > acceptance)) continue

    const scale = 0.68 + Math.pow(ageRoll, 0.64) * 2.05
    const woodlandSpacing = 1.65 + scale * width * 0.52
    const meadowSpacing = 3.8 + scale * 0.45
    const spacing = biome.forest > 0.42 ? woodlandSpacing : meadowSpacing
    if (trees.some((other) => Math.hypot(x - other.x, z - other.z) < spacing + other.scale * 0.36)) continue

    let shape = 0
    if (biome.moisture > 0.7 && speciesRoll < 0.28) shape = 3
    else if ((biome.dryness > 0.48 || y > 2.2) && speciesRoll < 0.5) shape = 1
    else if (speciesRoll < 0.68) shape = 2
    else if (biome.warmth > 0.62 && speciesRoll > 0.955) shape = 4

    trees.push({
      candidateId, chunkKey, x, y, z, shape, variant,
      scale, rotation, width, height, leanX, leanZ,
      forest: biome.forest,
      moisture: biome.moisture,
      harvestable: false,
      localId: -1,
    })
  }

  // Promote the largest trees (up to the server count) to harvestable so the
  // obvious, prominent trees are the choppable ones and their idx stays < n.
  const harvestCount = serverHarvestCount(cx, cz)
  const harvestable = [...trees].sort((a, b) => b.scale - a.scale).slice(0, harvestCount)
  harvestable.forEach((tree, index) => {
    tree.harvestable = true
    tree.localId = index
  })

  return trees
}
