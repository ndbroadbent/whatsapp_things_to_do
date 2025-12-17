/**
 * Candidate Extractor Module
 *
 * Find messages likely to contain "things to do" suggestions using cheap heuristics.
 * No AI cost - pure regex and URL pattern matching.
 */

import type {
  CandidateMessage,
  CandidateSource,
  ExtractorOptions,
  ExtractorResult,
  ParsedMessage
} from '../types.js'
import {
  ACTIVITY_KEYWORDS,
  EXCLUSION_PATTERNS,
  SUGGESTION_PATTERNS,
  URL_CONFIDENCE_MAP
} from './patterns.js'
import { classifyUrl, isActivityUrl } from './url-classifier.js'

export { ACTIVITY_KEYWORDS, EXCLUSION_PATTERNS, SUGGESTION_PATTERNS } from './patterns.js'
export { classifyUrl, extractGoogleMapsCoords, isActivityUrl } from './url-classifier.js'

const DEFAULT_MIN_CONFIDENCE = 0.5
const ACTIVITY_KEYWORD_BOOST = 0.15
const URL_SUGGESTION_BOOST = 0.25

/**
 * Check if content contains activity-related keywords.
 */
function hasActivityKeyword(content: string): boolean {
  return ACTIVITY_KEYWORDS.some((pattern) => pattern.test(content))
}

/**
 * Check if content matches exclusion patterns.
 */
function shouldExclude(content: string, additionalExclusions?: readonly RegExp[]): boolean {
  if (EXCLUSION_PATTERNS.some((pattern) => pattern.test(content))) {
    return true
  }

  if (additionalExclusions?.some((pattern) => pattern.test(content))) {
    return true
  }

  return false
}

/**
 * Check if content contains suggestion-like phrases (for URL boost).
 */
function hasSuggestionPhrase(content: string): boolean {
  const phrases = [
    "let's go",
    'we should',
    'wanna go',
    'want to go',
    'should we',
    'check this out',
    'look at this',
    'this looks',
    'bucket list'
  ]
  const contentLower = content.toLowerCase()
  return phrases.some((phrase) => contentLower.includes(phrase))
}

/**
 * Get context around a message (surrounding characters).
 */
function getMessageContext(
  messages: readonly ParsedMessage[],
  index: number,
  contextChars: number
): string {
  const contextMessages: string[] = []
  let totalChars = 0

  // Get messages before
  for (let i = index - 1; i >= 0 && totalChars < contextChars / 2; i--) {
    const msg = messages[i]
    if (msg) {
      contextMessages.unshift(`${msg.sender}: ${msg.content}`)
      totalChars += msg.content.length
    }
  }

  // Get messages after
  for (let i = index + 1; i < messages.length && totalChars < contextChars; i++) {
    const msg = messages[i]
    if (msg) {
      contextMessages.push(`${msg.sender}: ${msg.content}`)
      totalChars += msg.content.length
    }
  }

  return contextMessages.join('\n')
}

interface RegexMatch {
  messageId: number
  content: string
  sender: string
  timestamp: Date
  confidence: number
  patternName: string
  urls: readonly string[] | undefined
  context: string
}

function applyActivityBoost(baseConfidence: number, content: string): number {
  if (hasActivityKeyword(content)) {
    return Math.min(1.0, baseConfidence + ACTIVITY_KEYWORD_BOOST)
  }
  return baseConfidence
}

function createRegexMatch(
  msg: ParsedMessage,
  confidence: number,
  patternName: string,
  context: string
): RegexMatch {
  return {
    messageId: msg.id,
    content: msg.content,
    sender: msg.sender,
    timestamp: msg.timestamp,
    confidence,
    patternName,
    urls: msg.urls,
    context
  }
}

function checkBuiltInPatterns(
  msg: ParsedMessage,
  context: string,
  minConfidence: number
): RegexMatch | null {
  for (const pattern of SUGGESTION_PATTERNS) {
    if (pattern.pattern.test(msg.content)) {
      const confidence = applyActivityBoost(pattern.confidence, msg.content)
      if (confidence >= minConfidence) {
        return createRegexMatch(msg, confidence, pattern.name, context)
      }
      break
    }
  }
  return null
}

function checkAdditionalPatterns(
  msg: ParsedMessage,
  patterns: readonly RegExp[],
  context: string,
  minConfidence: number
): RegexMatch | null {
  for (const pattern of patterns) {
    if (pattern.test(msg.content)) {
      const confidence = applyActivityBoost(0.7, msg.content)
      if (confidence >= minConfidence) {
        return createRegexMatch(msg, confidence, `custom:${pattern.source}`, context)
      }
      break
    }
  }
  return null
}

/**
 * Find suggestions using regex patterns.
 */
function findRegexMatches(
  messages: readonly ParsedMessage[],
  options?: ExtractorOptions
): RegexMatch[] {
  const matches: RegexMatch[] = []
  const additionalPatterns = options?.additionalPatterns ?? []
  const minConfidence = options?.minConfidence ?? DEFAULT_MIN_CONFIDENCE

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i]
    if (!msg || !msg.content) continue
    if (shouldExclude(msg.content, options?.additionalExclusions)) continue

    const context = getMessageContext(messages, i, 1000)

    const builtInMatch = checkBuiltInPatterns(msg, context, minConfidence)
    if (builtInMatch) {
      matches.push(builtInMatch)
      continue
    }

    const customMatch = checkAdditionalPatterns(msg, additionalPatterns, context, minConfidence)
    if (customMatch) {
      matches.push(customMatch)
    }
  }

  return matches
}

interface UrlMatch {
  messageId: number
  content: string
  sender: string
  timestamp: Date
  confidence: number
  urlType: string
  urls: readonly string[]
  context: string
}

/**
 * Find suggestions based on activity-related URLs.
 */
function findUrlMatches(
  messages: readonly ParsedMessage[],
  options?: ExtractorOptions
): UrlMatch[] {
  if (options?.includeUrlBased === false) {
    return []
  }

  const matches: UrlMatch[] = []

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i]
    if (!msg || !msg.urls || msg.urls.length === 0) continue

    // Find the highest confidence URL in the message
    let bestUrlType = 'website'
    let bestConfidence = 0

    for (const url of msg.urls) {
      const urlType = classifyUrl(url)
      const baseConfidence = URL_CONFIDENCE_MAP[urlType] ?? 0.3

      if (baseConfidence > bestConfidence) {
        bestConfidence = baseConfidence
        bestUrlType = urlType
      }
    }

    // Only include if it's an activity-related URL or has suggestion phrases
    if (!isActivityUrl(msg.urls[0] ?? '')) {
      // For non-activity URLs, require suggestion phrases
      if (!hasSuggestionPhrase(msg.content)) {
        continue
      }
    }

    // Boost if message text indicates suggestion
    if (hasSuggestionPhrase(msg.content)) {
      bestConfidence = Math.min(1.0, bestConfidence + URL_SUGGESTION_BOOST)
    }

    // Boost for activity keywords
    if (hasActivityKeyword(msg.content)) {
      bestConfidence = Math.min(1.0, bestConfidence + 0.1)
    }

    if (bestConfidence >= (options?.minConfidence ?? DEFAULT_MIN_CONFIDENCE)) {
      matches.push({
        messageId: msg.id,
        content: msg.content,
        sender: msg.sender,
        timestamp: msg.timestamp,
        confidence: bestConfidence,
        urlType: bestUrlType,
        urls: msg.urls,
        context: getMessageContext(messages, i, 1000)
      })
    }
  }

  return matches
}

interface BaseMatch {
  messageId: number
  content: string
  sender: string
  timestamp: Date
  confidence: number
  urls: readonly string[] | undefined
  context: string
}

/**
 * Add or update a candidate in the map if it has higher confidence.
 */
function upsertCandidate(
  candidateMap: Map<number, CandidateMessage>,
  match: BaseMatch,
  source: CandidateSource
): void {
  const candidate: CandidateMessage = {
    messageId: match.messageId,
    content: match.content,
    sender: match.sender,
    timestamp: match.timestamp,
    source,
    confidence: match.confidence,
    context: match.context,
    urls: match.urls
  }

  const existing = candidateMap.get(match.messageId)
  if (!existing || match.confidence > existing.confidence) {
    candidateMap.set(match.messageId, candidate)
  }
}

/**
 * Extract candidate messages from parsed messages.
 *
 * Uses regex patterns and URL detection to find messages likely to contain
 * "things to do" suggestions. This is a cheap heuristic pass before expensive
 * AI classification.
 */
export function extractCandidates(
  messages: readonly ParsedMessage[],
  options?: ExtractorOptions
): ExtractorResult {
  const regexMatches = findRegexMatches(messages, options)
  const urlMatches = findUrlMatches(messages, options)

  // Deduplicate by message ID, keeping highest confidence
  const candidateMap = new Map<number, CandidateMessage>()

  for (const match of regexMatches) {
    upsertCandidate(candidateMap, match, { type: 'regex', pattern: match.patternName })
  }

  for (const match of urlMatches) {
    const source: CandidateSource = {
      type: 'url',
      urlType: match.urlType as CandidateSource & { type: 'url' } extends { urlType: infer T }
        ? T
        : never
    }
    upsertCandidate(candidateMap, match, source)
  }

  // Sort by confidence descending
  const candidates = [...candidateMap.values()].sort((a, b) => b.confidence - a.confidence)

  return {
    candidates,
    regexMatches: regexMatches.length,
    urlMatches: urlMatches.length,
    totalUnique: candidates.length
  }
}
