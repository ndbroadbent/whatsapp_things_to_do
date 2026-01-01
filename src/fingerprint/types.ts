/**
 * Fingerprint Types
 *
 * Types for monthly chunk fingerprinting used for deduplication.
 */

/**
 * A monthly chunk of messages with its fingerprint.
 * Used for deduplication: if two chunks have the same fingerprint,
 * they contain the same messages and can be skipped on re-upload.
 */
export interface MonthlyChunk {
  /** First day of the month (UTC, time set to 00:00:00) */
  readonly monthStart: Date

  /** ISO string format: "2024-01" for easier serialization */
  readonly monthKey: string

  /** Total number of messages in this month */
  readonly messageCount: number

  /** SHA-256 fingerprint of the chunk */
  readonly fingerprint: string

  /** Timestamp of the first message in this month */
  readonly firstMessageAt: Date

  /** Timestamp of the last message in this month */
  readonly lastMessageAt: Date

  /** The actual messages (only present during processing, not persisted) */
  readonly messages?: readonly import('../types/parser').ParsedMessage[]
}

/**
 * Result of analyzing an upload for deduplication.
 */
export interface DeduplicationPlan {
  /** Total number of monthly chunks in the upload */
  readonly totalChunks: number

  /** Number of new chunks to process */
  readonly newChunks: number

  /** Number of chunks already processed (duplicates) */
  readonly duplicateChunks: number

  /** Total messages to process (from new chunks) */
  readonly messagesToProcess: number

  /** Total messages skipped (from duplicate chunks) */
  readonly messagesSkipped: number

  /** The new chunks that need processing */
  readonly chunksToProcess: readonly MonthlyChunk[]

  /** The fingerprints of duplicate chunks (for logging/debugging) */
  readonly duplicateFingerprints: readonly string[]
}

/**
 * Configuration for fingerprint generation.
 */
export interface FingerprintConfig {
  /**
   * Number of messages to sample from the start of each month.
   * Default: 10
   */
  readonly sampleSize?: number

  /**
   * Whether to include message count in fingerprint.
   * Default: true (recommended for detecting partial exports)
   */
  readonly includeCount?: boolean
}
