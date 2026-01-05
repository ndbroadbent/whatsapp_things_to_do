/**
 * Wikidata API Integration
 *
 * Stage 1 of the entity resolution pipeline.
 * Queries Wikidata SPARQL endpoint by title and category type.
 */

import { generateCacheKey } from '../caching/key'
import type { ResponseCache } from '../caching/types'
import { type HttpResponse, httpFetch } from '../http'
import type { EntityType, WikidataResult } from './types'
import { DEFAULT_TIMEOUT, DEFAULT_USER_AGENT, WIKIDATA_TYPE_QIDS } from './types'

const SPARQL_ENDPOINT = 'https://query.wikidata.org/sparql'

/**
 * Fetch function type that returns HttpResponse.
 */
type FetchFn = (url: string, init?: RequestInit) => Promise<HttpResponse>

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
 * Build SPARQL query for entity search.
 */
function buildSparqlQuery(title: string, category: EntityType): string {
  // Escape quotes in title
  const escapedTitle = title.replace(/"/g, '\\"').replace(/'/g, "\\'")

  // Build type filter if we have type QIDs for this category
  const typeQids = WIKIDATA_TYPE_QIDS[category]
  let typeClause = ''
  if (typeQids && typeQids.length > 0) {
    const typeFilter = `VALUES ?type { ${typeQids.map((q) => `wd:${q}`).join(' ')} }`
    typeClause = `${typeFilter} ?item wdt:P31/wdt:P279* ?type .`
  }

  return `
    SELECT ?item ?itemLabel ?itemDescription ?image ?article WHERE {
      ?item rdfs:label "${escapedTitle}"@en .
      ${typeClause}
      OPTIONAL { ?item wdt:P18 ?image . }
      OPTIONAL {
        ?article schema:about ?item ;
                 schema:isPartOf <https://en.wikipedia.org/> .
      }
      SERVICE wikibase:label { bd:serviceParam wikibase:language "en" . }
    }
    LIMIT 5
  `
}

/**
 * SPARQL binding result type.
 */
interface SparqlBinding {
  item: { value: string }
  itemLabel?: { value: string }
  itemDescription?: { value: string }
  image?: { value: string }
  article?: { value: string }
}

/**
 * Parse SPARQL query results into WikidataResult.
 */
function parseResults(bindings: SparqlBinding[]): WikidataResult | null {
  if (!bindings || bindings.length === 0) {
    return null
  }

  // Prefer results with image or Wikipedia article
  for (const binding of bindings) {
    const qid = binding.item.value.split('/').pop() ?? ''
    const label = binding.itemLabel?.value ?? ''
    const description = binding.itemDescription?.value
    const imageUrl = binding.image?.value
    const wikipediaUrl = binding.article?.value

    if (imageUrl || wikipediaUrl) {
      return { qid, label, description, imageUrl, wikipediaUrl }
    }
  }

  // Return first result even without image/wiki
  const firstBinding = bindings[0]
  if (!firstBinding) {
    return null
  }

  return {
    qid: firstBinding.item.value.split('/').pop() ?? '',
    label: firstBinding.itemLabel?.value ?? '',
    description: firstBinding.itemDescription?.value,
    imageUrl: firstBinding.image?.value,
    wikipediaUrl: firstBinding.article?.value
  }
}

/**
 * Execute SPARQL query against Wikidata.
 */
async function executeSparql(
  query: string,
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

    return parseResults(data.results?.bindings ?? [])
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

  // Check cache first
  if (config.cache) {
    const cacheKey = generateCacheKey({
      service: 'wikidata',
      model: category,
      payload: { title }
    })

    const cached = await config.cache.get<WikidataResult | null>(cacheKey)
    if (cached) {
      return cached.data
    }

    // Execute query and cache result
    const result = await executeSparql(query, config)
    await config.cache.set(cacheKey, { data: result, cachedAt: Date.now() })
    return result
  }

  return executeSparql(query, config)
}
