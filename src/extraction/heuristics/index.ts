/**
 * Candidate Extractor Module
 *
 * Find messages likely to contain "things to do" activities using cheap heuristics.
 * No AI cost - pure regex and URL pattern matching.
 */

import type {
  CandidateMessage,
  CandidateSource,
  ContextMessage,
  ExtractorOptions,
  ExtractorResult,
  ParsedMessage,
  QueryType
} from '../../types'
import { deduplicateAgreements, getMessageContext, type MessageContext } from '../context-window'
import { HIGH_SIGNAL_KEYWORDS } from './activity-links'
import {
  ACTIVITY_KEYWORDS,
  ACTIVITY_PATTERNS,
  EXCLUSION_PATTERNS,
  URL_CONFIDENCE_MAP
} from './patterns'
import { classifyUrl, isActivityUrl, isSocialUrl } from './url-classifier'

export {
  type ActivityLinkOptions,
  AGREEMENT_KEYWORDS,
  EXCLAMATION_KEYWORDS,
  extractActivityLinks,
  HIGH_SIGNAL_KEYWORDS,
  SUGGESTION_KEYWORDS
} from './activity-links'
export {
  ACTIVITY_KEYWORDS,
  ACTIVITY_PATTERNS,
  EXCLUSION_PATTERNS
} from './patterns'
export {
  classifyUrl,
  extractGoogleMapsCoords,
  isActivityUrl,
  isSocialUrl
} from './url-classifier'

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
 * Uses the shared HIGH_SIGNAL_KEYWORDS from activity-links.ts.
 */
function hasActivityPhrase(content: string): boolean {
  const contentLower = content.toLowerCase()
  return HIGH_SIGNAL_KEYWORDS.some((phrase) => contentLower.includes(phrase))
}

interface RegexMatch {
  messageId: number
  content: string
  sender: string
  timestamp: Date
  confidence: number
  patternName: string
  candidateType: QueryType
  urls: readonly string[] | undefined
  contextBefore: readonly ContextMessage[]
  contextAfter: readonly ContextMessage[]
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
  candidateType: QueryType,
  ctx: MessageContext
): RegexMatch {
  return {
    messageId: msg.id,
    content: msg.content,
    sender: msg.sender,
    timestamp: msg.timestamp,
    confidence,
    patternName,
    candidateType,
    urls: msg.urls,
    contextBefore: ctx.before,
    contextAfter: ctx.after
  }
}

function checkBuiltInPatterns(
  msg: ParsedMessage,
  ctx: MessageContext,
  minConfidence: number
): RegexMatch | null {
  for (const pattern of ACTIVITY_PATTERNS) {
    if (pattern.pattern.test(msg.content)) {
      const confidence = applyActivityBoost(pattern.confidence, msg.content)
      if (confidence >= minConfidence) {
        return createRegexMatch(msg, confidence, pattern.name, pattern.candidateType, ctx)
      }
      break
    }
  }
  return null
}

function checkAdditionalPatterns(
  msg: ParsedMessage,
  patterns: readonly RegExp[],
  ctx: MessageContext,
  minConfidence: number
): RegexMatch | null {
  for (const pattern of patterns) {
    if (pattern.test(msg.content)) {
      const confidence = applyActivityBoost(0.7, msg.content)
      if (confidence >= minConfidence) {
        // Custom patterns are assumed to be suggestions
        return createRegexMatch(msg, confidence, `custom:${pattern.source}`, 'suggestion', ctx)
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

    const builtInMatch = checkBuiltInPatterns(msg, ctx, minConfidence)
    if (builtInMatch) {
      matches.push(builtInMatch)
      continue
    }

    const customMatch = checkAdditionalPatterns(msg, additionalPatterns, ctx, minConfidence)
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
  candidateType: QueryType
  urls: readonly string[]
  contextBefore: readonly ContextMessage[]
  contextAfter: readonly ContextMessage[]
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
        candidateType: 'suggestion', // Sharing a URL = suggesting
        urls: msg.urls,
        contextBefore: ctx.before,
        contextAfter: ctx.after
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
  candidateType: QueryType
  urls: readonly string[] | undefined
  contextBefore: readonly ContextMessage[]
  contextAfter: readonly ContextMessage[]
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
    candidateType: match.candidateType,
    contextBefore: match.contextBefore,
    contextAfter: match.contextAfter,
    urls: match.urls
  }

  const existing = candidateMap.get(match.messageId)
  if (!existing || match.confidence > existing.confidence) {
    candidateMap.set(match.messageId, candidate)
  }
}

/**
 * Extract candidate messages using cheap heuristics (regex + URL patterns).
 *
 * This is a fast, zero-cost pass before expensive AI classification.
 * For semantic search, use extractCandidatesByEmbeddings().
 * For both combined, use extractCandidates().
 */
export function extractCandidatesByHeuristics(
  messages: readonly ParsedMessage[],
  options?: ExtractorOptions
): ExtractorResult {
  const regexMatches = findRegexMatches(messages, options)
  const urlMatches = findUrlMatches(messages, options)

  // Deduplicate by message ID, keeping highest confidence
  const candidateMap = new Map<number, CandidateMessage>()

  for (const match of regexMatches) {
    upsertCandidate(candidateMap, match, {
      type: 'regex',
      pattern: match.patternName
    })
  }

  for (const match of urlMatches) {
    const source: CandidateSource = {
      type: 'url',
      urlType: match.urlType as CandidateSource & { type: 'url' } extends {
        urlType: infer T
      }
        ? T
        : never
    }
    upsertCandidate(candidateMap, match, source)
  }

  // Sort by confidence descending
  let candidates = [...candidateMap.values()].sort((a, b) => b.confidence - a.confidence)

  // Deduplicate agreements within suggestion context windows (unless skipped)
  let agreementsRemoved = 0
  if (!options?.skipAgreementDeduplication) {
    const result = deduplicateAgreements(candidates, messages)
    candidates = result.candidates
    agreementsRemoved = result.removedCount
  }

  return {
    candidates,
    regexMatches: regexMatches.length,
    urlMatches: urlMatches.length,
    totalUnique: candidates.length,
    agreementsRemoved
  }
}
