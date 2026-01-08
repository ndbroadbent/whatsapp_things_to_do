/**
 * Wikidata API Integration
 *
 * Stage 1 of the entity resolution pipeline.
 * Queries Wikidata SPARQL endpoint by title and category type.
 */

import { generateCacheKey } from '../caching/key'
import type { ResponseCache } from '../caching/types'
import { type HttpResponse, httpFetch } from '../http'
import type { EntityType, ExternalIdType, WikidataResult } from './types'
import {
  DEFAULT_TIMEOUT,
  DEFAULT_USER_AGENT,
  LINK_PREVIEW_PRIORITY,
  WIKIDATA_PROPERTY_IDS,
  WIKIDATA_TYPE_QIDS
} from './types'

const SPARQL_ENDPOINT = 'https://query.wikidata.org/sparql'

/**
 * Fetch function type - compatible with both HttpResponse and standard Response.
 */
type FetchFn = (url: string, init?: RequestInit) => Promise<HttpResponse | Response>

/**
 * Configuration for Wikidata search.
 */
export interface WikidataSearchConfig {
  /** Response cache for API calls */
  cache?: ResponseCache | undefined
  /** User agent for API requests */
  userAgent?: string | undefined
  /** Request timeout in milliseconds */
  timeout?: number | undefined
  /** Custom fetch function (for testing) */
  customFetch?: FetchFn | undefined
}

/**
 * Convert external ID type to SPARQL variable name.
 * e.g., "spotify_album" -> "spotifyAlbumId"
 */
function toSparqlVar(idType: ExternalIdType): string {
  return `${idType.replace(/_([a-z])/g, (_, c) => c.toUpperCase())}Id`
}

/**
 * Build SPARQL query for entity search using text search.
 * Uses mwapi:search for fuzzy matching instead of exact rdfs:label match.
 * Dynamically includes all external IDs from LINK_PREVIEW_PRIORITY.
 */
function buildSparqlQuery(title: string, category: EntityType): string {
  // Escape quotes in title for SPARQL string
  const escapedTitle = title.replace(/"/g, '\\"').replace(/'/g, "\\'")

  // Build type filter if we have type QIDs for this category
  const typeQids = WIKIDATA_TYPE_QIDS[category]
  let typeClause = ''
  if (typeQids && typeQids.length > 0) {
    const typeFilter = `VALUES ?type { ${typeQids.map((q) => `wd:${q}`).join(' ')} }`
    typeClause = `${typeFilter} ?item wdt:P31/wdt:P279* ?type .`
  }

  // Build external ID SELECT and OPTIONAL clauses from LINK_PREVIEW_PRIORITY
  const externalIdVars = LINK_PREVIEW_PRIORITY.filter((id) => id !== 'official_website')
    .map((id) => `?${toSparqlVar(id)}`)
    .join(' ')

  const externalIdOptionals = LINK_PREVIEW_PRIORITY.filter((id) => id !== 'official_website')
    .map((id) => `OPTIONAL { ?item wdt:${WIKIDATA_PROPERTY_IDS[id]} ?${toSparqlVar(id)} . }`)
    .join('\n      ')

  // Use MediaWiki API search for fuzzy matching (handles variations like "3" vs "III")
  // Include sitelinks count for ranking (popularity signal)
  return `
    SELECT ?item ?itemLabel ?itemDescription ?image ?article ?sitelinks
           ${externalIdVars}
    WHERE {
      SERVICE wikibase:mwapi {
        bd:serviceParam wikibase:endpoint "www.wikidata.org";
                        wikibase:api "EntitySearch";
                        mwapi:search "${escapedTitle}";
                        mwapi:language "en".
        ?item wikibase:apiOutputItem mwapi:item.
      }
      ${typeClause}
      OPTIONAL { ?item wdt:P18 ?image . }
      OPTIONAL {
        ?article schema:about ?item ;
                 schema:isPartOf <https://en.wikipedia.org/> .
      }
      OPTIONAL { ?item wikibase:sitelinks ?sitelinks . }
      ${externalIdOptionals}
      SERVICE wikibase:label { bd:serviceParam wikibase:language "en" . }
    }
    LIMIT 5
  `
}

/**
 * SPARQL binding result type.
 * External IDs are dynamically added based on LINK_PREVIEW_PRIORITY.
 */
interface SparqlBinding {
  item: { value: string }
  itemLabel?: { value: string }
  itemDescription?: { value: string }
  image?: { value: string }
  article?: { value: string }
  sitelinks?: { value: string }
  // Dynamic external IDs (any field ending in "Id")
  [key: string]: { value: string } | undefined
}

/**
 * Extract external IDs from a SPARQL binding.
 * Dynamically extracts all IDs from LINK_PREVIEW_PRIORITY.
 */
function extractExternalIds(binding: SparqlBinding): WikidataResult['externalIds'] {
  const externalIds: NonNullable<WikidataResult['externalIds']> = {}

  for (const idType of LINK_PREVIEW_PRIORITY) {
    if (idType === 'official_website') continue
    const varName = toSparqlVar(idType)
    const value = binding[varName]?.value
    if (value) {
      externalIds[idType] = value
    }
  }

  return Object.keys(externalIds).length > 0 ? externalIds : undefined
}

/**
 * Extract label from binding, with fallback to Wikipedia title.
 * The wikibase:label service sometimes returns QID instead of actual label.
 */
function extractLabel(binding: SparqlBinding): string {
  const rawLabel = binding.itemLabel?.value ?? ''

  // Check if label looks like a QID (e.g., "Q64441774")
  if (/^Q\d+$/.test(rawLabel)) {
    // Try to extract label from Wikipedia article URL
    // e.g., "https://en.wikipedia.org/wiki/Baldur%27s_Gate_3" -> "Baldur's Gate 3"
    const wikiUrl = binding.article?.value
    if (wikiUrl) {
      const match = wikiUrl.match(/\/wiki\/([^/]+)$/)
      if (match?.[1]) {
        return decodeURIComponent(match[1]).replace(/_/g, ' ')
      }
    }
    // Return empty string if we can't extract a proper label
    return ''
  }

  return rawLabel
}

/**
 * Score how well a label matches the search title.
 * Higher score = better match.
 */
function scoreMatch(label: string, searchTitle: string): number {
  const normalizedLabel = label.toLowerCase().trim()
  const normalizedSearch = searchTitle.toLowerCase().trim()

  // Exact match (best)
  if (normalizedLabel === normalizedSearch) return 100

  // Label starts with search (e.g., "Oppenheimer (2023 film)" for "Oppenheimer")
  if (normalizedLabel.startsWith(normalizedSearch)) return 80

  // Search starts with label (e.g., searching "The Matrix Reloaded" matches "The Matrix")
  if (normalizedSearch.startsWith(normalizedLabel)) return 60

  // Label contains search
  if (normalizedLabel.includes(normalizedSearch)) return 40

  // No match
  return 0
}

/**
 * Convert a SPARQL binding to a WikidataResult with sitelinks count.
 */
function bindingToResult(
  binding: SparqlBinding
): { result: WikidataResult; sitelinks: number } | null {
  const label = extractLabel(binding)
  if (!label) return null

  const sitelinks = binding.sitelinks?.value ? parseInt(binding.sitelinks.value, 10) : 0

  return {
    result: {
      qid: binding.item.value.split('/').pop() ?? '',
      label,
      description: binding.itemDescription?.value,
      imageUrl: binding.image?.value,
      wikipediaUrl: binding.article?.value,
      externalIds: extractExternalIds(binding)
    },
    sitelinks
  }
}

/**
 * Parse SPARQL query results into WikidataResult.
 * Ranks by: title match quality (high weight) + sitelinks count (medium weight).
 * External IDs have NO influence on ranking - they're just a bonus after finding the right entity.
 */
function parseResults(bindings: SparqlBinding[], searchTitle: string): WikidataResult | null {
  if (!bindings || bindings.length === 0) {
    return null
  }

  // Convert all bindings to results with scores
  const scoredResults: {
    result: WikidataResult
    titleScore: number
    sitelinks: number
  }[] = []

  for (const binding of bindings) {
    const parsed = bindingToResult(binding)
    if (!parsed) continue

    const titleScore = scoreMatch(parsed.result.label, searchTitle)
    scoredResults.push({
      result: parsed.result,
      titleScore,
      sitelinks: parsed.sitelinks
    })
  }

  if (scoredResults.length === 0) return null

  // Sort by: title match (high weight) + sitelinks (medium weight)
  // Title match: 0-100, Sitelinks: typically 0-200
  // Entities with 0 sitelinks get heavy penalty - they're not notable
  scoredResults.sort((a, b) => {
    const aSitelinksBonus = a.sitelinks === 0 ? -500 : Math.min(a.sitelinks, 100)
    const bSitelinksBonus = b.sitelinks === 0 ? -500 : Math.min(b.sitelinks, 100)
    const aScore = a.titleScore * 10 + aSitelinksBonus
    const bScore = b.titleScore * 10 + bSitelinksBonus
    return bScore - aScore
  })

  return scoredResults[0]?.result ?? null
}

/**
 * Execute SPARQL query against Wikidata.
 */
async function executeSparql(
  query: string,
  searchTitle: string,
  config: WikidataSearchConfig
): Promise<WikidataResult | null> {
  const fetchFn: FetchFn = config.customFetch ?? httpFetch
  const userAgent = config.userAgent ?? DEFAULT_USER_AGENT
  const timeout = config.timeout ?? DEFAULT_TIMEOUT

  const url = `${SPARQL_ENDPOINT}?${new URLSearchParams({
    query,
    format: 'json'
  }).toString()}`

  try {
    const response = await fetchFn(url, {
      headers: { 'User-Agent': userAgent },
      signal: AbortSignal.timeout(timeout)
    })

    if (!response.ok) {
      return null
    }

    const data = (await response.json()) as {
      results?: {
        bindings?: SparqlBinding[]
      }
    }

    return parseResults(data.results?.bindings ?? [], searchTitle)
  } catch {
    return null
  }
}

/**
 * Search Wikidata for an entity by title and category.
 *
 * @param title - Entity title to search for
 * @param category - Entity category for type filtering
 * @param config - Search configuration
 * @returns WikidataResult if found, null otherwise
 */
export async function searchWikidata(
  title: string,
  category: EntityType,
  config: WikidataSearchConfig = {}
): Promise<WikidataResult | null> {
  const query = buildSparqlQuery(title, category)

  // Check cache first - key on actual SPARQL query so cache invalidates when query changes
  if (config.cache) {
    const cacheKey = generateCacheKey({
      service: 'wikidata',
      model: 'sparql',
      payload: { query }
    })

    const cached = await config.cache.get<WikidataResult | null>(cacheKey)
    if (cached) {
      return cached.data
    }

    // Execute query and cache result
    const result = await executeSparql(query, title, config)
    await config.cache.set(cacheKey, { data: result, cachedAt: Date.now() })
    return result
  }

  return executeSparql(query, title, config)
}
