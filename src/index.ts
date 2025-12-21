/**
 * ChatToMap Core Library
 *
 * Transform chat exports into geocoded activities.
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
  ACTIVITY_TYPE_QUERIES,
  cosineSimilarity,
  DEFAULT_ACTIVITY_QUERIES,
  DIRECT_SUGGESTION_QUERIES,
  embedMessages,
  embedQueries,
  findSemanticCandidates,
  findTopK,
  getAllQueryEmbeddings,
  getDefaultQueryEmbeddings,
  getQueryEmbedding,
  getQueryEmbeddingsDimensions,
  getQueryEmbeddingsModel,
  loadQueryEmbeddings,
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
  ACTIVITY_PATTERNS,
  type ActivityLinkOptions,
  classifyUrl,
  EXCLUSION_PATTERNS,
  extractActivityLinks,
  extractCandidates,
  extractGoogleMapsCoords,
  isActivityUrl
} from './extractor/index.js'
// Geocoder module
export {
  calculateCenter,
  countGeocoded,
  filterGeocoded,
  geocodeActivities,
  geocodeLocation
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
// Scraper module (social media metadata extraction)
export type { ScrapedMetadata, ScrapeOutcome, ScraperConfig } from './scraper/index.js'
export {
  buildYouTubeUrl,
  detectPlatform,
  extractTikTokVideoId,
  extractYouTubeVideoId,
  resolveTikTokUrl,
  scrapeActivityLinks,
  scrapeTikTok,
  scrapeUrl,
  scrapeUrls,
  scrapeYouTube
} from './scraper/index.js'
// Types
export type {
  // Classifier types
  ActivityCategory,
  // Activity Link types
  ActivityLink,
  ActivityLinkContext,
  ActivityLinkMetadata,
  ActivityLinkResult,
  ActivityLinkType,
  // Aggregation types
  AggregatedActivity,
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
  ClassifiedActivity,
  ClassifierConfig,
  ClassifierProvider,
  ClassifierResponse,
  EmbeddedMessage,
  // Embeddings types
  EmbeddingConfig,
  ExportMetadata,
  ExtractorOptions,
  ExtractorResult,
  GeocodedActivity,
  GeocodeResult,
  GeocoderConfig,
  // Geocoder types
  GeocodeSource,
  // Intent signals
  IntentSignals,
  // Export types
  MapConfig,
  // Parser types
  MediaType,
  ParsedMessage,
  ParseResult,
  ParserOptions,
  PDFConfig,
  ProcessingStats,
  ProviderConfig,
  Result,
  SemanticSearchConfig,
  // Social platform
  SocialPlatform,
  SourceMessage,
  UrlType,
  WhatsAppFormat
} from './types.js'

/**
 * Library version.
 */
export const VERSION = '0.1.0'
