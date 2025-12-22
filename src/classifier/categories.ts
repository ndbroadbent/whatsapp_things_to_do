/**
 * Activity Categories
 *
 * Source of truth for valid categories and their emoji.
 */

export const VALID_CATEGORIES = [
  'restaurant',
  'cafe',
  'bar',
  'hike',
  'nature',
  'beach',
  'trip',
  'hotel',
  'event',
  'concert',
  'museum',
  'entertainment',
  'adventure',
  'sports',
  'gaming',
  'art',
  'skills',
  'experiences',
  'hobbies',
  'family',
  'social',
  'shopping',
  'fitness',
  'health',
  'food',
  'home',
  'pets',
  'work',
  'other'
] as const

export type ActivityCategory = (typeof VALID_CATEGORIES)[number]

/** Emoji for each activity category */
export const CATEGORY_EMOJI: Record<ActivityCategory, string> = {
  restaurant: '🍽️',
  cafe: '☕',
  bar: '🍺',
  hike: '🥾',
  nature: '🌲',
  beach: '🏖️',
  trip: '✈️',
  hotel: '🏨',
  event: '🎉',
  concert: '🎵',
  museum: '🏛️',
  entertainment: '🎬',
  adventure: '🎢',
  sports: '⚽',
  gaming: '🎮',
  art: '🎨',
  skills: '🔧',
  experiences: '✨',
  hobbies: '🎯',
  family: '👨‍👩‍👧',
  social: '👥',
  shopping: '🛍️',
  fitness: '💪',
  health: '🏥',
  food: '🍕',
  home: '🏠',
  pets: '🐾',
  work: '💼',
  other: '📍'
}
