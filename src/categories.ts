/**
 * Activity Categories
 *
 * Source of truth for valid categories and their emoji/icons.
 * Used across classifier, images, exports, and UI.
 *
 * Note: For lightweight imports without lucide-static, use categories-core.ts
 */

import {
  Baby,
  BookOpen,
  Briefcase,
  Dumbbell,
  Film,
  Gamepad2,
  Heart,
  Home,
  Landmark,
  MapPin,
  Music,
  Palette,
  PartyPopper,
  PawPrint,
  Plane,
  Puzzle,
  ShoppingBag,
  Sparkles,
  Trees,
  Trophy,
  Users,
  Utensils,
  Wine
} from 'lucide-static'

// Re-export core definitions (no heavy dependencies)
export {
  type ActivityCategory,
  CATEGORY_COLORS,
  CATEGORY_EMOJI,
  VALID_CATEGORIES
} from './categories-core'

import type { ActivityCategory } from './categories-core'

/** Lucide SVG icon for each activity category */
export const CATEGORY_ICONS: Record<ActivityCategory, string> = {
  food: Utensils,
  nightlife: Wine,
  nature: Trees,
  arts: Palette,
  culture: Landmark,
  music: Music,
  entertainment: Film,
  events: PartyPopper,
  sports: Trophy,
  fitness: Dumbbell,
  wellness: Heart,
  shopping: ShoppingBag,
  travel: Plane,
  experiences: Sparkles,
  hobbies: Puzzle,
  gaming: Gamepad2,
  learning: BookOpen,
  home: Home,
  work: Briefcase,
  social: Users,
  family: Baby,
  pets: PawPrint,
  other: MapPin
}
