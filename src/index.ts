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

// Cache module
export type { CachedResponse, CacheKeyComponents, ResponseCache } from './cache/index.js'
export {
  DEFAULT_CACHE_TTL_SECONDS,
  FilesystemCache,
  generateCacheKey,
  generateClassifierCacheKey,
  generateEmbeddingCacheKey,
  generateGeocodeCacheKey
} from './cache/index.js'

// Classifier module
export type { ResolvedModel } from './classifier/index.js'
export {
  buildClassificationPrompt,
  type ClassificationContext,
  classifyMessages,
  createSmartBatches,
  filterActivities,
  getRequiredApiKeyEnvVar,
  getValidModelIds,
  groupByCategory,
  groupCandidatesByProximity,
  parseClassificationResponse,
  resolveModel
} from './classifier/index.js'
// Export module
export {
  exportToCSV,
  exportToExcel,
  exportToJSON,
  exportToMapHTML,
  exportToPDF,
  parseJSON
} from './export/index.js'
// Extraction module (heuristics + embeddings)
export type { ExtractCandidatesConfig, ExtractCandidatesResult } from './extraction/index.js'
export {
  ACTIVITY_KEYWORDS,
  ACTIVITY_PATTERNS,
  ACTIVITY_TYPE_QUERIES,
  type ActivityLinkOptions,
  AGREEMENT_QUERIES,
  classifyUrl,
  cosineSimilarity,
  DEFAULT_ACTIVITY_QUERIES,
  EXCLUSION_PATTERNS,
  embedMessages,
  embedQueries,
  extractActivityLinks,
  extractCandidates,
  extractCandidatesByEmbeddings,
  extractCandidatesByHeuristics,
  extractGoogleMapsCoords,
  findSemanticCandidates,
  findTopK,
  getAllQueryEmbeddings,
  getDefaultQueryEmbeddings,
  getQueryEmbedding,
  getQueryEmbeddingsDimensions,
  getQueryEmbeddingsModel,
  getQueryType,
  isActivityUrl,
  isSocialUrl,
  loadQueryEmbeddings,
  SUGGESTION_QUERIES
} from './extraction/index.js'

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
  ActivityCategory,
  ActivityLink,
  ActivityLinkContext,
  ActivityLinkMetadata,
  ActivityLinkResult,
  ActivityLinkType,
  AggregatedActivity,
  ApiError,
  ApiErrorType,
  CandidateMessage,
  CandidateSource,
  ChatSource,
  CLIOptions,
  ClassifiedActivity,
  ClassifierConfig,
  ClassifierProvider,
  ClassifierResponse,
  EmbeddedMessage,
  EmbeddingConfig,
  ExportMetadata,
  ExtractorOptions,
  ExtractorResult,
  GeocodedActivity,
  GeocodeResult,
  GeocoderConfig,
  GeocodeSource,
  IntentSignals,
  MapConfig,
  MediaType,
  ParsedMessage,
  ParseResult,
  ParserOptions,
  PDFConfig,
  ProcessingStats,
  ProviderConfig,
  Result,
  SemanticSearchConfig,
  SocialPlatform,
  SourceMessage,
  UrlType,
  WhatsAppFormat
} from './types.js'

/**
 * Library version.
 */
export const VERSION = '0.1.0'
