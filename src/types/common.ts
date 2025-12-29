/**
 * Common Types
 *
 * Shared types used across multiple modules: Result, Cache, Embeddings, CLI.
 */

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

// Embeddings Types
interface EmbeddingProgressInfo {
  readonly phase: 'messages' | 'queries'
  readonly batchIndex: number
  readonly totalBatches: number
  readonly itemsInBatch: number
  readonly totalItems: number
  readonly cacheHit: boolean
}

export interface EmbeddingConfig {
  readonly apiKey: string
  readonly model?: string
  readonly batchSize?: number
  readonly concurrency?: number
  readonly onBatchStart?: (info: EmbeddingProgressInfo) => void
  readonly onBatchComplete?: (info: EmbeddingProgressInfo & { durationMs: number }) => void
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
  readonly skipEmbeddings?: boolean | undefined
  readonly skipPlaceLookup?: boolean | undefined
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
