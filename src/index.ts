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
export type { CachedResponse, CacheKeyComponents, ResponseCache } from './caching/index'
export {
  FilesystemCache,
  generateCacheKey,
  generateClassifierCacheKey,
  generateEmbeddingCacheKey,
  generateGeocodeCacheKey
} from './caching/index'
// Categories and default activities
export { VALID_CATEGORIES } from './categories'
// Classifier module
export type { ResolvedModel } from './classifier/index'
export {
  buildClassificationPrompt,
  type ClassificationContext,
  classifyBatch,
  classifyMessages,
  createSmartBatches,
  DEFAULT_MODEL_ID,
  filterActivities,
  getRequiredApiKeyEnvVar,
  getValidModelIds,
  groupByCategory,
  groupCandidatesByProximity,
  parseClassificationResponse,
  resolveModel,
  sortActivitiesByScore
} from './classifier/index'
// Export module
export {
  exportToCSV,
  exportToExcel,
  exportToJSON,
  exportToMapHTML,
  exportToPDF,
  type FilterOptions,
  filterActivities as filterActivitiesForExport,
  matchesSender,
  normalizeCountry,
  parseJSON,
  type SortOrder
} from './export/index'
// Extraction module (heuristics + embeddings)
export type { ExtractCandidatesConfig, ExtractCandidatesResult } from './extraction/index'
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
} from './extraction/index'
// Geocoder module
export {
  calculateCenter,
  countGeocoded,
  filterGeocoded,
  geocodeActivities,
  geocodeActivity,
  geocodeLocation
} from './geocoder/index'
// Images module
export type {
  ImageFetchConfig,
  ImageMetadata,
  ImageResult,
  ImageSize,
  ImageSource,
  LicenseCheckResult,
  MediaIndexOptions,
  PixabayImageCandidate,
  PixabayImageMatch,
  WikipediaImageCandidate,
  WikipediaImageMatch
} from './images/index'
export {
  buildImageUrl,
  fetchGooglePlacesPhoto,
  fetchImageForActivity,
  fetchImagesForActivities,
  fetchPixabayImage,
  fetchWikipediaImage,
  filterPixabayImages,
  filterWikipediaImages,
  findActionFallbackImage,
  findCategoryFallbackImage,
  findObjectImage,
  hasAllowedLicense,
  IMAGE_SIZES,
  isLicenseAllowed,
  loadMediaIndex
} from './images/index'
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
} from './parser/index'
// Processor module - interface and real implementation
export type {
  ChatProcessor,
  ProcessingStageResults,
  ProcessorCandidateResult,
  ProcessorClassifyResult,
  ProcessorConfig,
  ProcessorGeocodeResult,
  ProcessorParseResult
} from './processor'
export { RealChatProcessor } from './processor'
// Scanner module (zero API cost heuristic scanning)
export type { QuickScanOptions, QuickScanResult } from './scanner/index'
export { quickScan, quickScanMessages } from './scanner/index'
// Scraper module (social media metadata extraction)
export type { ScrapedMetadata, ScrapeOutcome, ScraperConfig } from './scraper/index'
export {
  buildYouTubeUrl,
  detectPlatform,
  extractRedditPostId,
  extractTikTokVideoId,
  extractYouTubeVideoId,
  isRedditUrl,
  resolveTikTokUrl,
  scrapeActivityLinks,
  scrapeReddit,
  scrapeTikTok,
  scrapeUrl,
  scrapeUrls,
  scrapeYouTube
} from './scraper/index'
// Types (type-only exports)
export type {
  ActivityCategory,
  ActivityLink,
  ActivityLinkContext,
  ActivityLinkMetadata,
  ActivityLinkResult,
  ActivityLinkType,
  ActivityMessage,
  ApiError,
  ApiErrorType,
  CandidateMessage,
  CandidateSource,
  ChatSource,
  CLIOptions,
  ClassifiedActivity,
  ClassifierConfig,
  ClassifierProvider,
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
  MapStyle,
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
  UrlType,
  WhatsAppFormat
} from './types'
// Type helper functions (value exports)
export { CATEGORY_EMOJI, formatLocation, isMappable } from './types/classifier'

/**
 * Library version.
 */
export const VERSION = '0.1.0'
