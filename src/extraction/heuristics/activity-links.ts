/**
 * Activity Links Extractor
 *
 * Extracts social media and web links from chat messages,
 * analyzes context for intent signals, and classifies them
 * as potential places, activities, or events.
 */

import type {
  ActivityLink,
  ActivityLinkContext,
  ActivityLinkResult,
  ActivityLinkType,
  IntentSignals,
  ParsedMessage,
  SocialPlatform,
  UrlType
} from '../../types.js'
import { classifyUrl } from './url-classifier.js'

// ============================================================================
// Intent Detection Constants
// ============================================================================

/**
 * Exclamation keywords - single-word positive reactions.
 * These are risky for false positives but high signal when near a URL.
 */
export const EXCLAMATION_KEYWORDS: readonly string[] = [
  'amazing',
  'awesome',
  'beautiful',
  'delicious',
  'incredible'
]

/**
 * Agreement keywords - positive reactions indicating interest in shared content.
 * All phrases are 2+ words to avoid false positives.
 */
export const AGREEMENT_KEYWORDS: readonly string[] = [
  'looks fun',
  'looks good',
  'looks great',
  'looks cool',
  'looks nice',
  'sounds fun',
  'sounds good',
  'sounds great',
  'so good',
  'so cool',
  "i'm keen",
  "i'm down",
  "let's book",
  "let's do it"
]

/**
 * Suggestion keywords - indicate intent to do an activity.
 * All phrases are 2+ words to avoid false positives.
 */
export const SUGGESTION_KEYWORDS: readonly string[] = [
  'we should',
  'should we',
  "let's go",
  "let's try",
  "let's visit",
  "let's check",
  'want to go',
  'want to try',
  'want to visit',
  'wanna go',
  'wanna try',
  'wanna visit',
  'have to go',
  'have to try',
  'have to visit',
  'need to go',
  'need to try',
  'gotta try',
  'gotta go',
  'must visit',
  'must try',
  'check this out',
  'check it out',
  'this place',
  'this spot',
  'next time',
  'bucket list',
  'on my list',
  'adding to list'
]

/** All high-signal keywords (exclamation + agreement + suggestion). */
export const HIGH_SIGNAL_KEYWORDS: readonly string[] = [
  ...EXCLAMATION_KEYWORDS,
  ...AGREEMENT_KEYWORDS,
  ...SUGGESTION_KEYWORDS
]

/**
 * Agreement emojis - positive reactions indicating interest in shared content.
 * These are typically responses to someone sharing a link or suggestion.
 */
const AGREEMENT_EMOJIS: readonly string[] = [
  '\u{1F525}', // fire 🔥
  '\u{1F60D}', // heart eyes 😍
  '\u{1F929}', // star eyes 🤩
  '\u{1F924}', // drooling 🤤
  '\u{1F4AF}', // 100 💯
  '\u{1F64C}', // raised hands 🙌
  '\u{1F44D}', // thumbs up 👍
  '\u{2764}\uFE0F', // red heart ❤️
  '\u{1F499}', // blue heart 💙
  '\u{1F49C}', // purple heart 💜
  '\u{2728}', // sparkles ✨
  '\u{1F31F}' // glowing star 🌟
]

/**
 * Suggestion emojis - indicate activity type being discussed.
 * These suggest what kind of place, activity, or event is being shared.
 */
const SUGGESTION_EMOJIS: readonly string[] = [
  '\u{1F3C3}', // running 🏃
  '\u{2708}\uFE0F', // airplane ✈️
  '\u{1F389}', // party popper 🎉
  '\u{1F3D6}\uFE0F', // beach 🏖️
  '\u{26F7}\uFE0F', // skier ⛷️
  '\u{1F30D}', // globe 🌍
  '\u{1F30E}', // globe americas 🌎
  '\u{1F30F}', // globe asia 🌏
  '\u{1F3DE}\uFE0F', // national park 🏞️
  '\u{26F0}\uFE0F', // mountain ⛰️
  '\u{1F3D4}\uFE0F', // snow mountain 🏔️
  '\u{1F334}', // palm tree 🌴
  '\u{1F4CD}', // pin 📍
  '\u{1F4CC}', // pushpin 📌
  '\u{1F37D}\uFE0F', // fork and knife 🍽️
  '\u{1F374}', // fork and knife 2 🍴
  '\u{2615}', // coffee ☕
  '\u{1F37A}', // beer 🍺
  '\u{1F377}' // wine 🍷
]

/** All high-signal emojis (agreement + suggestion). */
const HIGH_SIGNAL_EMOJIS: readonly string[] = [...AGREEMENT_EMOJIS, ...SUGGESTION_EMOJIS]

/**
 * Emoji patterns for regex matching (some emojis have multiple representations).
 */
const EMOJI_PATTERN =
  /[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{1F600}-\u{1F64F}]/gu

// ============================================================================
// Platform Mapping
// ============================================================================

/**
 * Map UrlType to SocialPlatform.
 */
function urlTypeToSocialPlatform(urlType: UrlType): SocialPlatform {
  switch (urlType) {
    case 'instagram':
      return 'instagram'
    case 'tiktok':
      return 'tiktok'
    case 'youtube':
      return 'youtube'
    case 'x':
      return 'x'
    case 'facebook':
      return 'facebook'
    case 'google_maps':
      return 'google_maps'
    default:
      return 'other'
  }
}

// ============================================================================
// Context Extraction
// ============================================================================

/**
 * Extract context (±2 messages) around a message containing a link.
 */
function extractContext(messages: readonly ParsedMessage[], index: number): ActivityLinkContext {
  const message = messages[index]
  if (!message) {
    throw new Error(`Invalid message index: ${index}`)
  }

  const before: string[] = []
  const after: string[] = []

  // Get 2 messages before
  for (let i = index - 2; i < index; i++) {
    if (i >= 0) {
      const msg = messages[i]
      if (msg) {
        before.push(`${msg.sender}: ${msg.content}`)
      }
    }
  }

  // Get 2 messages after
  for (let i = index + 1; i <= index + 2; i++) {
    if (i < messages.length) {
      const msg = messages[i]
      if (msg) {
        after.push(`${msg.sender}: ${msg.content}`)
      }
    }
  }

  return {
    before,
    after,
    sender: message.sender,
    timestamp: message.timestamp,
    messageContent: message.content
  }
}

// ============================================================================
// Intent Scoring
// ============================================================================

/**
 * Find high-signal keywords in text.
 */
function findKeywords(text: string): string[] {
  const textLower = text.toLowerCase()
  return HIGH_SIGNAL_KEYWORDS.filter((keyword) => textLower.includes(keyword.toLowerCase()))
}

/**
 * Find high-signal emojis in text.
 */
function findEmojis(text: string): string[] {
  const found: string[] = []
  const matches = text.match(EMOJI_PATTERN)

  if (matches) {
    for (const match of matches) {
      if (HIGH_SIGNAL_EMOJIS.includes(match)) {
        found.push(match)
      }
    }
  }

  return found
}

/**
 * Calculate intent score based on keywords and emojis.
 */
function calculateIntentScore(keywords: readonly string[], emojis: readonly string[]): number {
  // Base score from keywords (max 0.6 from keywords alone)
  const keywordScore = Math.min(keywords.length * 0.15, 0.6)

  // Emoji boost (max 0.3 from emojis alone)
  const emojiScore = Math.min(emojis.length * 0.1, 0.3)

  // Combined, capped at 1.0
  return Math.min(keywordScore + emojiScore, 1.0)
}

/**
 * Analyze intent signals from context.
 */
function analyzeIntent(context: ActivityLinkContext): IntentSignals {
  // Combine all context text for analysis
  const allText = [...context.before, context.messageContent, ...context.after].join(' ')

  const keywords = findKeywords(allText)
  const emojis = findEmojis(allText)
  const score = calculateIntentScore(keywords, emojis)

  return { keywords, emojis, score }
}

// ============================================================================
// Type Inference
// ============================================================================

/**
 * Infer the type of activity based on platform and context.
 */
function inferActivityType(
  platform: SocialPlatform,
  context: ActivityLinkContext,
  intent: IntentSignals
): ActivityLinkType {
  const allText = [...context.before, context.messageContent, ...context.after]
    .join(' ')
    .toLowerCase()

  // Google Maps is always a place
  if (platform === 'google_maps') {
    return 'place'
  }

  // Event indicators
  const eventKeywords = ['event', 'concert', 'show', 'festival', 'ticket', 'gig', 'performance']
  if (eventKeywords.some((kw) => allText.includes(kw))) {
    return 'event'
  }

  // Place indicators
  const placeKeywords = [
    'restaurant',
    'cafe',
    'bar',
    'hotel',
    'resort',
    'beach',
    'park',
    'this place',
    'location',
    'spot'
  ]
  if (placeKeywords.some((kw) => allText.includes(kw))) {
    return 'place'
  }

  // Activity indicators
  const activityKeywords = ['hike', 'trek', 'ski', 'surf', 'dive', 'climb', 'tour', 'trip']
  if (activityKeywords.some((kw) => allText.includes(kw))) {
    return 'activity'
  }

  // Idea indicators (vague future plans)
  const ideaKeywords = ['one day', 'someday', 'bucket list', 'dream', 'wish']
  if (ideaKeywords.some((kw) => allText.includes(kw))) {
    return 'idea'
  }

  // Default based on platform likelihood
  if (platform === 'instagram' || platform === 'tiktok') {
    // Reels/TikToks are often places or activities
    return intent.score > 0.3 ? 'place' : 'unknown'
  }

  return 'unknown'
}

// ============================================================================
// Confidence Calculation
// ============================================================================

/**
 * Platform-specific base confidence.
 */
const PLATFORM_CONFIDENCE: Record<SocialPlatform, number> = {
  google_maps: 0.9,
  airbnb: 0.9,
  booking: 0.9,
  tripadvisor: 0.85,
  eventbrite: 0.85,
  instagram: 0.5,
  tiktok: 0.5,
  youtube: 0.4,
  facebook: 0.45,
  x: 0.4,
  other: 0.3
}

/**
 * Calculate overall confidence for an activity link.
 */
function calculateConfidence(
  platform: SocialPlatform,
  intent: IntentSignals,
  inferredType: ActivityLinkType
): number {
  // Start with platform base confidence
  let confidence = PLATFORM_CONFIDENCE[platform]

  // Boost for intent signals
  confidence += intent.score * 0.3

  // Boost for known type
  if (inferredType !== 'unknown') {
    confidence += 0.1
  }

  return Math.min(confidence, 1.0)
}

// ============================================================================
// Main Export Function
// ============================================================================

/**
 * Options for activity link extraction.
 */
export interface ActivityLinkOptions {
  /** Minimum confidence threshold (default: 0.3) */
  readonly minConfidence?: number
  /** Include generic website links (default: false) */
  readonly includeGenericWebsites?: boolean
}

/**
 * Check if a URL should be processed as an activity link.
 */
function shouldProcessUrl(urlType: UrlType, options?: ActivityLinkOptions): boolean {
  // Always include social platforms and maps
  const activityPlatforms: UrlType[] = [
    'google_maps',
    'instagram',
    'tiktok',
    'youtube',
    'x',
    'facebook',
    'airbnb',
    'booking',
    'tripadvisor',
    'event'
  ]

  if (activityPlatforms.includes(urlType)) {
    return true
  }

  // Optionally include generic websites
  return options?.includeGenericWebsites === true
}

/**
 * Extract activity links from parsed messages.
 *
 * Identifies social media and web links, analyzes surrounding context
 * for intent signals, and classifies them as potential activities.
 */
export function extractActivityLinks(
  messages: readonly ParsedMessage[],
  options?: ActivityLinkOptions
): ActivityLinkResult {
  const links: ActivityLink[] = []
  let totalUrls = 0

  const minConfidence = options?.minConfidence ?? 0.3

  for (let i = 0; i < messages.length; i++) {
    const message = messages[i]
    if (!message?.urls || message.urls.length === 0) {
      continue
    }

    for (const url of message.urls) {
      totalUrls++

      const urlType = classifyUrl(url)

      // Skip if not an activity-related platform
      if (!shouldProcessUrl(urlType, options)) {
        continue
      }

      const platform = urlTypeToSocialPlatform(urlType)
      const context = extractContext(messages, i)
      const intent = analyzeIntent(context)
      const inferredType = inferActivityType(platform, context, intent)
      const confidence = calculateConfidence(platform, intent, inferredType)

      // Skip if below confidence threshold
      if (confidence < minConfidence) {
        continue
      }

      links.push({
        url,
        platform,
        confidence,
        inferredType,
        context,
        intent,
        messageId: message.id
      })
    }
  }

  // Sort by confidence descending
  const sortedLinks = [...links].sort((a, b) => b.confidence - a.confidence)

  return {
    links: sortedLinks,
    totalUrls,
    activityLinkCount: sortedLinks.length
  }
}
