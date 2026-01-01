/**
 * Fingerprint Module
 *
 * Monthly chunk fingerprinting for chat deduplication.
 * Used by both CLI (to inform users about duplicate uploads) and SaaS (for billing).
 *
 * @example
 * ```typescript
 * import { generateMonthlyChunks, createDeduplicationPlan } from 'chat-to-map/fingerprint'
 *
 * // Generate chunks from parsed messages
 * const chunks = generateMonthlyChunks(messages)
 *
 * // Check against previously processed fingerprints
 * const knownFingerprints = new Set(['abc123...', 'def456...'])
 * const plan = createDeduplicationPlan(chunks, knownFingerprints)
 *
 * console.log(`Processing ${plan.messagesToProcess} new messages`)
 * console.log(`Skipping ${plan.messagesSkipped} duplicate messages`)
 * ```
 *
 * @module
 */

// Function exports
export {
  createDeduplicationPlan,
  generateChunkFingerprint,
  generateMonthlyChunks,
  getMonthKey,
  getMonthStart,
  groupMessagesByMonth,
  roundToMinute
} from './chunker'
// Type exports
export type { DeduplicationPlan, FingerprintConfig, MonthlyChunk } from './types'
