/**
 * ChatProcessor Interface and Implementation
 *
 * Defines the contract for chat processing that both the real implementation
 * and any mock implementations (in consuming apps) must follow.
 */

import { classifyMessages } from './classifier/index'
import { extractCandidates as extractCandidatesImpl } from './extraction/index'
import { parseChatWithStats } from './parser/index'
import { lookupActivityPlaces } from './place-lookup/index'
import type {
  CandidateMessage,
  ClassifiedActivity,
  ClassifierConfig,
  GeocodedActivity,
  ParsedMessage,
  PlaceLookupConfig
} from './types'
import { isMappable } from './types/classifier'

/**
 * Result of parsing a chat export (processor stage)
 */
export interface ProcessorParseResult {
  messages: readonly ParsedMessage[]
  messageCount: number
}

/**
 * Result of extracting candidates from messages (processor stage)
 */
export interface ProcessorCandidateResult {
  candidates: readonly CandidateMessage[]
  candidateCount: number
}

/**
 * Result of classifying candidates into activities (processor stage)
 */
export interface ProcessorClassifyResult {
  activities: readonly ClassifiedActivity[]
  costCents: number
}

/**
 * Result of geocoding activities (processor stage)
 */
export interface ProcessorGeocodeResult {
  activities: readonly GeocodedActivity[]
  geocodedCount: number
  costCents: number
}

/**
 * Complete processing results from all stages
 */
export interface ProcessingStageResults {
  parse: ProcessorParseResult
  extract: ProcessorCandidateResult
  classify: ProcessorClassifyResult
  geocode: ProcessorGeocodeResult
}

/**
 * Configuration for the processor
 */
export interface ProcessorConfig {
  anthropicApiKey?: string
  openaiApiKey?: string
  googleMapsApiKey?: string
  homeCountry?: string
}

/**
 * Chat processor interface.
 * Both real and mock implementations must conform to this contract.
 */
export interface ChatProcessor {
  /**
   * Parse chat content from a string
   */
  parse(content: string): Promise<ProcessorParseResult>

  /**
   * Extract candidate messages that might contain activities
   */
  extractCandidates(messages: readonly ParsedMessage[]): Promise<ProcessorCandidateResult>

  /**
   * Classify candidates using AI to identify activities
   */
  classify(
    candidates: readonly CandidateMessage[],
    config: ProcessorConfig
  ): Promise<ProcessorClassifyResult>

  /**
   * Geocode activities to get coordinates
   */
  geocode(
    activities: readonly ClassifiedActivity[],
    config: ProcessorConfig
  ): Promise<ProcessorGeocodeResult>

  /**
   * Run the full processing pipeline
   */
  processAll(content: string, config: ProcessorConfig): Promise<ProcessingStageResults>
}

/**
 * Cost estimates for API calls (in cents)
 */
const COST_ESTIMATES = {
  // Claude Haiku: ~$0.0008 per message
  classificationPerMessage: 0.08,
  // Google Places geocoding: $5/1000 requests
  geocodingPerRequest: 0.5
}

/**
 * Real ChatProcessor implementation using the chat-to-map library functions
 */
export class RealChatProcessor implements ChatProcessor {
  async parse(content: string): Promise<ProcessorParseResult> {
    const result = parseChatWithStats(content)
    return {
      messages: result.messages,
      messageCount: result.messageCount
    }
  }

  async extractCandidates(messages: readonly ParsedMessage[]): Promise<ProcessorCandidateResult> {
    const result = await extractCandidatesImpl(messages)

    if (!result.ok) {
      throw new Error(`Candidate extraction failed: ${result.error.message}`)
    }

    return {
      candidates: result.value.candidates,
      candidateCount: result.value.candidates.length
    }
  }

  async classify(
    candidates: readonly CandidateMessage[],
    config: ProcessorConfig
  ): Promise<ProcessorClassifyResult> {
    if (!config.anthropicApiKey) {
      return { activities: [], costCents: 0 }
    }

    if (candidates.length === 0) {
      return { activities: [], costCents: 0 }
    }

    const classifierConfig: ClassifierConfig = {
      provider: 'anthropic',
      apiKey: config.anthropicApiKey,
      homeCountry: config.homeCountry ?? 'United States'
    }

    const result = await classifyMessages(candidates, classifierConfig)

    if (!result.ok) {
      throw new Error(`Classification failed: ${result.error.message}`)
    }

    const costCents = candidates.length * COST_ESTIMATES.classificationPerMessage

    return {
      activities: result.value.activities,
      costCents
    }
  }

  async geocode(
    activities: readonly ClassifiedActivity[],
    config: ProcessorConfig
  ): Promise<ProcessorGeocodeResult> {
    if (!config.googleMapsApiKey) {
      return {
        activities: activities as readonly GeocodedActivity[],
        geocodedCount: 0,
        costCents: 0
      }
    }

    const mappable = activities.filter((a) => isMappable(a))

    if (mappable.length === 0) {
      return {
        activities: activities as readonly GeocodedActivity[],
        geocodedCount: 0,
        costCents: 0
      }
    }

    const placeLookupConfig: PlaceLookupConfig = {
      apiKey: config.googleMapsApiKey
    }

    const geocodeResult = await lookupActivityPlaces(mappable, placeLookupConfig)

    const geocodedCount = geocodeResult.activities.filter(
      (a: GeocodedActivity) => a.latitude !== undefined
    ).length
    const costCents = geocodedCount * COST_ESTIMATES.geocodingPerRequest

    // Merge geocoded results back with non-mappable activities
    const geocodedMap = new Map(geocodeResult.activities.map((g) => [g.activityId, g]))
    const result = activities.map((a) => geocodedMap.get(a.activityId) ?? (a as GeocodedActivity))

    return {
      activities: result,
      geocodedCount,
      costCents
    }
  }

  async processAll(content: string, config: ProcessorConfig): Promise<ProcessingStageResults> {
    const parse = await this.parse(content)
    const extract = await this.extractCandidates(parse.messages)
    const classify = await this.classify(extract.candidates, config)
    const geocode = await this.geocode(classify.activities, config)

    return { parse, extract, classify, geocode }
  }
}
