/**
 * ChatToMap - Core Library
 *
 * Pure functions for transforming chat exports into geocoded activity suggestions.
 *
 * @license AGPL-3.0
 */

// Classifier
export { classifyMessages } from './classifier/index.js'
// Embeddings
export { cosineSimilarity, embedMessages, findSemanticCandidates } from './embeddings/index.js'
// Export
export {
  exportToCSV,
  exportToExcel,
  exportToJSON,
  exportToMapHTML,
  exportToPDF
} from './export/index.js'
// Extractor
export { extractCandidates } from './extractor/index.js'
// Geocoder
export { extractGoogleMapsCoords, geocodeLocation, geocodeSuggestions } from './geocoder/index.js'
// Parser
export { parseWhatsAppChat, parseWhatsAppChatStream } from './parser/index.js'
// Types
export type {
  // Classifier
  ActivityCategory,
  ApiError,
  // Results
  ApiErrorType,
  CandidateMessage,
  // Extractor
  CandidateSource,
  ClassifiedSuggestion,
  ClassifierConfig,
  EmbeddedMessage,
  // Embeddings
  EmbeddingConfig,
  ExtractorOptions,
  GeocodedSuggestion,
  GeocodeResult,
  GeocoderConfig,
  // Geocoder
  GeocodeSource,
  // Export
  MapConfig,
  // Parser
  MediaType,
  ParsedMessage,
  ParserOptions,
  PDFConfig,
  Result,
  SemanticSearchConfig,
  UrlType
} from './types.js'
