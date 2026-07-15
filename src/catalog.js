export const TREE_ITEMS = [
  {
    id: 'broadleaf',
    name: 'Broadleaf Oak',
    shape: 0,
    cost: 0,
    emoji: '🌳',
    desc: 'Classic rounded canopy',
    color: '#5c8a3a',
  },
  {
    id: 'pine',
    name: 'Pine',
    shape: 1,
    cost: 5,
    emoji: '🌲',
    desc: 'Tall pointed conifer',
    color: '#2d5a3a',
  },
  {
    id: 'bushy',
    name: 'Bushy Shrub',
    shape: 2,
    cost: 5,
    emoji: '🫧',
    desc: 'Low, dense canopy',
    color: '#7a9a3a',
  },
  {
    id: 'willow',
    name: 'Weeping Willow',
    shape: 3,
    cost: 75,
    emoji: '🌿',
    desc: 'Large Banyan-style drooping boughs',
    color: '#6a9a70',
  },
  {
    id: 'cherry_blossom',
    name: 'Cherry Blossom',
    shape: 4,
    cost: 50,
    emoji: '🌸',
    desc: 'Sheds beautiful pink petals',
    color: '#ffa3cc',
  },
  {
    id: 'mushroom',
    name: 'Bioluminescent Mushroom',
    shape: 5,
    cost: 100,
    emoji: '🍄',
    desc: 'Glows softly in the dark',
    color: '#8af0ff',
  },
]

/**
 * Tree leaf dyes (ActionPill / dye_tree RPC). Nature-themed names.
 * Hex values must match server whitelist in dye_tree.
 */
export const TREE_DYES = [
  { id: 'autumn',    name: 'Autumn Leaves',   color: '#d46a2a', cost: 50,  emoji: '🍂', desc: 'Warm fall canopy' },
  { id: 'sunset',    name: 'Sunset Canopy',   color: '#c44030', cost: 50,  emoji: '🌅', desc: 'Deep evening red' },
  { id: 'golden',    name: 'Sunflower Gold',  color: '#e8b830', cost: 50,  emoji: '🌻', desc: 'Bright golden leaves' },
  { id: 'sky',       name: 'Skyleaf Blue',    color: '#5098d0', cost: 100, emoji: '💧', desc: 'Cool blue foliage' },
  { id: 'lavender',  name: 'Lilac Bloom',     color: '#b080d0', cost: 100, emoji: '🔮', desc: 'Soft purple leaves' },
  { id: 'blush',     name: 'Blossom Pink',    color: '#e878a0', cost: 100, emoji: '🌸', desc: 'Petal-pink canopy' },
  { id: 'teal',      name: 'Poolside Teal',   color: '#308a78', cost: 150, emoji: '🌊', desc: 'Deep woodland teal' },
  { id: 'moonlight', name: 'Silverleaf',      color: '#c8d8d0', cost: 150, emoji: '✨', desc: 'Pale moonlit leaves' },
  { id: 'onyx',      name: 'Midnight Leaf',   color: '#222222', cost: 200, emoji: '🦇', desc: 'Near-black foliage' },
  { id: 'emerald',   name: 'Jewel Emerald',   color: '#2e8b57', cost: 150, emoji: '🍀', desc: 'Vibrant gem green' },
]

/**
 * Avatar body paints (Create → Style). Same hex catalog / costs as tree dyes
 * (server buy_cosmetic), but copy is about cloth & skin — not leaves (E3).
 */
export const AVATAR_COLORS = [
  { id: 'autumn',    name: 'Clay Orange',     color: '#d46a2a', cost: 50,  emoji: '🟠', desc: 'Warm clay tone' },
  { id: 'sunset',    name: 'Coral Red',       color: '#c44030', cost: 50,  emoji: '🔴', desc: 'Soft coral cloth' },
  { id: 'golden',    name: 'Honey Gold',      color: '#e8b830', cost: 50,  emoji: '🟡', desc: 'Sunny honey hue' },
  { id: 'sky',       name: 'Sky Cloth',       color: '#5098d0', cost: 100, emoji: '🔵', desc: 'Clear sky blue' },
  { id: 'lavender',  name: 'Lilac Cloth',     color: '#b080d0', cost: 100, emoji: '🟣', desc: 'Gentle lilac' },
  { id: 'blush',     name: 'Rose Blush',      color: '#e878a0', cost: 100, emoji: '🩷', desc: 'Soft rose pink' },
  { id: 'teal',      name: 'Seafoam Teal',    color: '#308a78', cost: 150, emoji: '🩵', desc: 'Cool seafoam' },
  { id: 'moonlight', name: 'Mist White',      color: '#c8d8d0', cost: 150, emoji: '⚪', desc: 'Pale mist' },
  { id: 'onyx',      name: 'Charcoal',        color: '#222222', cost: 200, emoji: '⚫', desc: 'Deep charcoal' },
  { id: 'emerald',   name: 'Meadow Green',    color: '#2e8b57', cost: 150, emoji: '🟢', desc: 'Fresh meadow' },
]

/** @deprecated use TREE_DYES or AVATAR_COLORS — kept for older imports */
export const DYE_ITEMS = TREE_DYES

export const HAT_ITEMS = [
  { id: 'none',      name: 'No Hat',         cost: 0,   emoji: '👤', desc: 'Remove your hat' },
  { id: 'wizard',    name: 'Wizard Hat',     cost: 150, emoji: '🧙‍♂️', desc: 'A pointed, magical hat' },
  { id: 'tophat',    name: 'Top Hat',        cost: 200, emoji: '🎩', desc: 'Dapper and tall cylinder' },
  { id: 'crown',     name: 'Gold Crown',     cost: 500, emoji: '👑', desc: 'Fit for royalty' },
]

export const EXOTIC_TREE_ITEMS = [
  {
    id: 'golden_tree',
    name: 'Golden Tree',
    shape: 10,
    cost: 500,
    emoji: '💰',
    desc: 'Leaves that shimmer like gold',
    color: '#ffcc00',
  },
  {
    id: 'star_tree',
    name: 'Star Tree',
    shape: 11,
    cost: 1000,
    emoji: '⭐',
    desc: 'Glows with celestial light',
    color: '#aaddff',
  }
]


export const ROCK_ITEMS = [
  {
    id: 'round',
    name: 'Round Rock',
    rockShape: 2,
    cost: 5,
    emoji: '🪨',
    desc: 'Classic mossy stone',
    color: '#9a9488',
  },
  {
    id: 'boulder',
    name: 'Flat Boulder',
    rockShape: 0,
    cost: 8,
    emoji: '🗿',
    desc: 'Wide compressed slab',
    color: '#8d8b83',
  },
  {
    id: 'standing',
    name: 'Standing Stone',
    rockShape: 1,
    cost: 8,
    emoji: '🏛',
    desc: 'Tall upright monolith',
    color: '#7a7870',
  },
]

export const PLOT_ITEM = {
  id: 'plot',
  name: 'Personal Plot',
  type: 'plot',
  /** Catalog sticker only — real price is area-based (circle min ~60g). */
  cost: 60,
  emoji: '📌',
  desc: 'Claim land · price by size (from ~60g)',
  color: '#5ba8d8',
}
