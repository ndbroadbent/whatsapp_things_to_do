/**
 * ChatToMap Core Library
 *
 * Transform chat exports into geocoded activity suggestions.
 *
 * Design principle: Pure functions only. No IO, no progress reporting, no orchestration.
 * The library is stateless and side-effect-free (except for API calls to external services).
 *
 * @license AGPL-3.0
 */

export type { CachedResponse, CacheKeyComponents, ResponseCache } from './cache/index.js'
// Cache module
export {
  DEFAULT_CACHE_TTL_SECONDS,
  FilesystemCache,
  generateCacheKey,
  generateClassifierCacheKey,
  generateEmbeddingCacheKey,
  generateGeocodeCacheKey
} from './cache/index.js'
// Classifier module
export {
  buildClassificationPrompt,
  classifyMessages,
  createSmartBatches,
  filterActivities,
  groupByCategory,
  groupCandidatesByProximity,
  parseClassificationResponse
} from './classifier/index.js'
// Embeddings module
export {
  cosineSimilarity,
  DEFAULT_ACTIVITY_QUERIES,
  embedMessages,
  embedQueries,
  findSemanticCandidates,
  findTopK,
  semanticSearch
} from './embeddings/index.js'
// Export module
export {
  exportToCSV,
  exportToExcel,
  exportToJSON,
  exportToMapHTML,
  exportToPDF,
  parseJSON
} from './export/index.js'
// Extractor module
export {
  ACTIVITY_KEYWORDS,
  classifyUrl,
  EXCLUSION_PATTERNS,
  extractCandidates,
  extractGoogleMapsCoords,
  isActivityUrl,
  SUGGESTION_PATTERNS
} from './extractor/index.js'
// Geocoder module
export {
  calculateCenter,
  countGeocoded,
  filterGeocoded,
  geocodeLocation,
  geocodeSuggestions
} from './geocoder/index.js'
// Parser module
export {
  detectChatSource,
  detectFormat,
  parseChat,
  parseChatStream,
  parseChatWithStats,
  parseIMessageChat,
  parseIMessageChatStream,
  parseWhatsAppChat,
  parseWhatsAppChatStream
} from './parser/index.js'
// Scanner module (zero API cost heuristic scanning)
export type { QuickScanOptions, QuickScanResult } from './scanner/index.js'
export { quickScan, quickScanMessages } from './scanner/index.js'
// Types
export type {
  // Classifier types
  ActivityCategory,
  // Aggregation types
  AggregatedSuggestion,
  ApiError,
  // Result types
  ApiErrorType,
  CandidateMessage,
  // Extractor types
  CandidateSource,
  // Chat sources
  ChatSource,
  // CLI types
  CLIOptions,
  ClassifiedSuggestion,
  ClassifierConfig,
  ClassifierResponse,
  EmbeddedMessage,
  // Embeddings types
  EmbeddingConfig,
  ExportMetadata,
  ExtractorOptions,
  ExtractorResult,
  GeocodedSuggestion,
  GeocodeResult,
  GeocoderConfig,
  // Geocoder types
  GeocodeSource,
  // Export types
  MapConfig,
  // Parser types
  MediaType,
  ParsedMessage,
  ParseResult,
  ParserOptions,
  PDFConfig,
  ProcessingStats,
  Result,
  SemanticSearchConfig,
  SourceMessage,
  UrlType,
  WhatsAppFormat
} from './types.js'

/**
 * Library version.
 */
export const VERSION = '0.1.0'
