/**
 * ChatToMap Shared Types & Utilities
 *
 * Lightweight exports for use in web workers and other environments where
 * heavy dependencies (pdfkit, exceljs) should not be bundled.
 *
 * This module exports ONLY:
 * - Type definitions
 * - Pure utility functions with zero external dependencies
 *
 * @license AGPL-3.0
 */

// === Types ===

// Categories (from lightweight core - no lucide-static)
export type { ActivityCategory } from '../categories-core'
export { CATEGORY_COLORS, CATEGORY_EMOJI, VALID_CATEGORIES } from '../categories-core'
// Image types (lightweight - just interfaces)
export type { ImageMeta, ImageMetadata, ImageResult, ImageSource } from '../images/types'
// Scraper types (lightweight - just interfaces)
export type { ScrapedMetadata, ScrapeOutcome } from '../scraper/types'
// Entity resolution types
export type { EntityType, ExternalIdType, ResolvedEntity } from '../search/types'
// Core activity types
// Message types
// Config types
// Result types
export type {
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
  ClassifiedImageHints,
  ClassifiedLinkHints,
  ClassifierConfig,
  ClassifierProvider,
  EmbeddedMessage,
  EmbeddingConfig,
  ExportMetadata,
  ExtractorOptions,
  ExtractorResult,
  GeocodedActivity,
  IntentSignals,
  MapConfig,
  MapStyle,
  MediaType,
  ParsedMessage,
  ParseResult,
  ParserOptions,
  PDFConfig,
  PlaceLookupConfig,
  PlaceLookupResult,
  PlaceLookupSource,
  ProcessingStats,
  ProviderConfig,
  Result,
  SemanticSearchConfig,
  SocialPlatform,
  UrlType,
  WhatsAppFormat
} from '../types'

// === Pure Utility Functions ===

// Activity helpers (zero dependencies)
// Score calculation (zero dependencies)
export { calculateCombinedScore, formatLocation, isMappable } from '../types/classifier'

/**
 * Library version.
 */
export const VERSION = '0.1.0'
