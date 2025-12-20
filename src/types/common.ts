/**
 * Common Types
 *
 * Shared types used across multiple modules: Result, Cache, Embeddings, CLI.
 */

import type { ActivityCategory } from './classifier.js'

// Result Types
export type ApiErrorType =
  | 'rate_limit'
  | 'auth'
  | 'quota'
  | 'network'
  | 'invalid_response'
  | 'invalid_request'

export interface ApiError {
  readonly type: ApiErrorType
  readonly message: string
  readonly retryAfter?: number | undefined
}

export type Result<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: ApiError }

// Cache Types
/** Cached response wrapper with metadata */
export interface CachedResponse<T = unknown> {
  readonly data: T
  readonly cachedAt: number
}

/** Pluggable cache interface for API responses. */
export interface ResponseCache {
  get<T = unknown>(hash: string): Promise<CachedResponse<T> | null>
  set<T = unknown>(hash: string, response: CachedResponse<T>, ttlSeconds: number): Promise<void>
}

// Embeddings Types
export interface EmbeddingConfig {
  readonly apiKey: string
  readonly model?: string
  readonly batchSize?: number
}

export interface EmbeddedMessage {
  readonly messageId: number
  readonly content: string
  readonly embedding: Float32Array
}

export interface SemanticSearchConfig {
  readonly queries?: readonly string[]
  readonly topK?: number
  readonly minSimilarity?: number
}

// CLI Types
export interface CLIOptions {
  readonly outputDir?: string | undefined
  readonly format?: readonly string[] | undefined
  readonly region?: string | undefined
  readonly parallel?: number | undefined
  readonly minConfidence?: number | undefined
  readonly activitiesOnly?: boolean | undefined
  readonly category?: ActivityCategory | undefined
  readonly skipEmbeddings?: boolean | undefined
  readonly skipGeocoding?: boolean | undefined
  readonly quiet?: boolean | undefined
  readonly verbose?: boolean | undefined
  readonly dryRun?: boolean | undefined
  readonly openaiKey?: string | undefined
  readonly anthropicKey?: string | undefined
  readonly openrouterKey?: string | undefined
  readonly googleMapsKey?: string | undefined
}

export interface ProcessingStats {
  readonly messageCount: number
  readonly candidateCount: number
  readonly semanticCandidateCount: number
  readonly activityCount: number
  readonly errandCount: number
  readonly geocodedCount: number
  readonly costs: {
    readonly embeddings: number
    readonly classification: number
    readonly geocoding: number
    readonly total: number
  }
}
