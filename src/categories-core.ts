/**
 * Activity Categories - Core Definitions
 *
 * Lightweight category definitions without icon dependencies.
 * Used by shared/index.ts for tree-shaking.
 */

export const VALID_CATEGORIES = [
  'food',
  'nightlife',
  'nature',
  'arts',
  'culture',
  'music',
  'entertainment',
  'events',
  'sports',
  'fitness',
  'wellness',
  'shopping',
  'travel',
  'experiences',
  'hobbies',
  'gaming',
  'learning',
  'home',
  'work',
  'social',
  'family',
  'pets',
  'other'
] as const

export type ActivityCategory = (typeof VALID_CATEGORIES)[number]

/** Emoji for each activity category */
export const CATEGORY_EMOJI: Record<ActivityCategory, string> = {
  food: '🍽️',
  nightlife: '🍸',
  nature: '🌲',
  arts: '🎨',
  culture: '🏛️',
  music: '🎵',
  entertainment: '🎬',
  events: '🎉',
  sports: '⚽',
  fitness: '💪',
  wellness: '🧘',
  shopping: '🛍️',
  travel: '✈️',
  experiences: '✨',
  hobbies: '🎯',
  gaming: '🎮',
  learning: '📚',
  home: '🏠',
  work: '💼',
  social: '👥',
  family: '👨‍👩‍👧',
  pets: '🐾',
  other: '📍'
}

/** Background color for each activity category (Tailwind CSS 500-600 shades) */
export const CATEGORY_COLORS: Record<ActivityCategory, string> = {
  food: '#ef4444', // red-500
  nightlife: '#8b5cf6', // violet-500
  nature: '#22c55e', // green-500
  arts: '#f26b1f', // orange-550 (between 500 and 600)
  culture: '#6366f1', // indigo-500
  music: '#ec4899', // pink-500
  entertainment: '#ca8a04', // yellow-600
  events: '#14b8a6', // teal-500
  sports: '#3b82f6', // blue-500
  fitness: '#f43f5e', // rose-500
  wellness: '#d946ef', // fuchsia-500
  shopping: '#a855f7', // purple-500
  travel: '#0ea5e9', // sky-500
  experiences: '#d97706', // amber-600
  hobbies: '#65a30d', // lime-600
  gaming: '#7c3aed', // violet-600
  learning: '#0284c7', // sky-600
  home: '#78716c', // stone-500
  work: '#64748b', // slate-500
  social: '#06b6d4', // cyan-500
  family: '#fb7185', // rose-400
  pets: '#65a30d', // lime-600
  other: '#6b7280' // gray-500
}
