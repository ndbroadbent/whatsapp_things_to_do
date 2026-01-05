/**
 * Lightweight Types Entry Point
 *
 * This entry point exports ONLY types and lightweight utilities.
 * It does NOT export heavy processing functions like classifyMessages,
 * parseChatWithStats, RealChatProcessor, or export functions (PDF, Excel).
 *
 * Use this entry point in web workers / SSR to avoid bundling heavy deps.
 * Use the main entry point in workflows where heavy processing is needed.
 *
 * @example
 * // In SSR/web worker code:
 * import { type GeocodedActivity, formatLocation, isMappable } from 'chat-to-map/types'
 *
 * // In workflow code:
 * import { classifyMessages, RealChatProcessor } from 'chat-to-map'
 */

// Valid categories constant
export { VALID_CATEGORIES } from './categories'

// Processor types (interface only, no implementation)
export type {
  ChatProcessor,
  ProcessingStageResults,
  ProcessorCandidateResult,
  ProcessorClassifyResult,
  ProcessorConfig,
  ProcessorGeocodeResult,
  ProcessorParseResult
} from './processor'

// All types from types/index.ts - re-export everything
export * from './types'

// Lightweight utilities from types/classifier.ts
export { CATEGORY_EMOJI, formatLocation, isMappable } from './types/classifier'
