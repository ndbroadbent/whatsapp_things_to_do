/**
 * Candidate Extractor Module
 *
 * Find messages likely to contain "things to do" activities using cheap heuristics.
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
  ACTIVITY_PATTERNS,
  EXCLUSION_PATTERNS,
  URL_CONFIDENCE_MAP
} from './patterns.js'
import { classifyUrl, isActivityUrl, isSocialUrl } from './url-classifier.js'

export { type ActivityLinkOptions, extractActivityLinks } from './activity-links.js'
export { ACTIVITY_KEYWORDS, ACTIVITY_PATTERNS, EXCLUSION_PATTERNS } from './patterns.js'
export {
  classifyUrl,
  extractGoogleMapsCoords,
  isActivityUrl,
  isSocialUrl
} from './url-classifier.js'

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
 * Check if content contains activity-like phrases (for URL boost).
 */
function hasActivityPhrase(content: string): boolean {
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

const MIN_CONTEXT_CHARS = 280
const MIN_CONTEXT_MESSAGES = 2
const MAX_MESSAGE_CHARS = 280
const TRUNCATION_MARKER = ' [truncated to 280 chars]'

interface MessageContext {
  before: string
  after: string
}

/**
 * Truncate a message line to max chars with marker.
 */
function truncateMessage(line: string): string {
  if (line.length <= MAX_MESSAGE_CHARS) return line
  return line.slice(0, MAX_MESSAGE_CHARS) + TRUNCATION_MARKER
}

/**
 * Get context around a message.
 *
 * Rules:
 * - Minimum 280 chars before and 280 chars after
 * - Minimum 2 messages on each side
 * - Each message truncated to max 280 chars with "[truncated to 280 chars]" suffix
 * - For prior context: snap to message boundaries, then truncate
 */
function getMessageContext(messages: readonly ParsedMessage[], index: number): MessageContext {
  const beforeMessages: string[] = []
  const afterMessages: string[] = []
  let beforeChars = 0
  let afterChars = 0

  // Get messages before: minimum 2 messages OR 280 chars (whichever comes later)
  for (let i = index - 1; i >= 0; i--) {
    const msg = messages[i]
    if (!msg) continue
    const rawLine = `${msg.sender}: ${msg.content}`
    const line = truncateMessage(rawLine)

    beforeMessages.unshift(line)
    beforeChars += line.length

    // Stop when we have both minimums met
    if (beforeMessages.length >= MIN_CONTEXT_MESSAGES && beforeChars >= MIN_CONTEXT_CHARS) {
      break
    }
  }

  // Get messages after: minimum 2 messages OR 280 chars (whichever comes later)
  for (let i = index + 1; i < messages.length; i++) {
    const msg = messages[i]
    if (!msg) continue
    const rawLine = `${msg.sender}: ${msg.content}`
    const line = truncateMessage(rawLine)

    afterMessages.push(line)
    afterChars += line.length

    // Stop when we have both minimums met
    if (afterMessages.length >= MIN_CONTEXT_MESSAGES && afterChars >= MIN_CONTEXT_CHARS) {
      break
    }
  }

  return {
    before: beforeMessages.join('\n'),
    after: afterMessages.join('\n')
  }
}

/**
 * Build full context string: before + >>> target + after
 */
function buildContextString(msg: ParsedMessage, ctx: MessageContext): string {
  const parts: string[] = []
  if (ctx.before) parts.push(ctx.before)
  parts.push(`>>> ${msg.sender}: ${msg.content}`)
  if (ctx.after) parts.push(ctx.after)
  return parts.join('\n')
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
  for (const pattern of ACTIVITY_PATTERNS) {
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
 * Find activities using regex patterns.
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

    const ctx = getMessageContext(messages, i)
    const context = buildContextString(msg, ctx)

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

interface BestUrl {
  type: string
  confidence: number
}

function findBestUrl(urls: readonly string[]): BestUrl {
  let bestType = 'website'
  let bestConfidence = 0

  for (const url of urls) {
    const urlType = classifyUrl(url)
    const baseConfidence = URL_CONFIDENCE_MAP[urlType] ?? 0.3
    if (baseConfidence > bestConfidence) {
      bestConfidence = baseConfidence
      bestType = urlType
    }
  }

  return { type: bestType, confidence: bestConfidence }
}

function shouldIncludeUrl(firstUrl: string, content: string): boolean {
  // Skip social media URLs - they could be anything (memes, random videos)
  if (isSocialUrl(firstUrl)) return false
  // Include activity URLs or messages with activity phrases
  return isActivityUrl(firstUrl) || hasActivityPhrase(content)
}

function applyUrlBoosts(confidence: number, content: string): number {
  let result = confidence
  if (hasActivityPhrase(content)) {
    result = Math.min(1.0, result + URL_SUGGESTION_BOOST)
  }
  if (hasActivityKeyword(content)) {
    result = Math.min(1.0, result + 0.1)
  }
  return result
}

/**
 * Find activities based on activity-related URLs.
 */
function findUrlMatches(
  messages: readonly ParsedMessage[],
  options?: ExtractorOptions
): UrlMatch[] {
  if (options?.includeUrlBased === false) {
    return []
  }

  const matches: UrlMatch[] = []
  const minConfidence = options?.minConfidence ?? DEFAULT_MIN_CONFIDENCE

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i]
    if (!msg || !msg.urls || msg.urls.length === 0) continue

    const firstUrl = msg.urls[0] ?? ''
    if (!shouldIncludeUrl(firstUrl, msg.content)) continue

    const best = findBestUrl(msg.urls)
    const confidence = applyUrlBoosts(best.confidence, msg.content)

    if (confidence >= minConfidence) {
      const ctx = getMessageContext(messages, i)
      matches.push({
        messageId: msg.id,
        content: msg.content,
        sender: msg.sender,
        timestamp: msg.timestamp,
        confidence,
        urlType: best.type,
        urls: msg.urls,
        context: buildContextString(msg, ctx)
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
 * "things to do" activities. This is a cheap heuristic pass before expensive
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
