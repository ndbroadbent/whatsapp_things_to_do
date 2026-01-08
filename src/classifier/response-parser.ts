/**
 * Response Parser
 *
 * Parses AI classification responses from JSON into typed objects.
 */

/**
 * Image hints for the banner image pipeline.
 * Non-location image hints only (locations are top-level).
 */
export interface ParsedImageHints {
  /** Stock photo query string - ALWAYS required (e.g., "hot air balloon cappadocia sunrise") */
  stock: string
  /** Media library key (e.g., "hot air balloon", "restaurant", "concert") */
  mediaKey: string | null
  /** When true: prefer stock photo, use mediaKey as fallback. When false: try mediaKey first. */
  preferStock: boolean
}

/**
 * Link hints for resolving media entities to canonical URLs.
 */
export interface ParsedLinkHints {
  /** Link type: movie, book, board_game, place, event, other */
  type: string | null
  /** Canonical title/name to search for (e.g., "The Matrix", "Blood on the Clocktower") */
  query: string | null
}

export interface ParsedClassification {
  msg: number
  /** Message offset - 0 for suggestions, negative for agreements pointing to earlier messages */
  off: number
  title: string | null
  /** How fun/enjoyable is this activity? 0.0-5.0 scale */
  fun: number
  /** How interesting/unique is this activity? 0.0-5.0 scale */
  int: number
  cat: string

  // ===== Location fields (top-level, for geocoding + sometimes images) =====
  /** Wikipedia topic name for "things" (bands, board games, concepts) */
  wikiName: string | null
  /** Canonical named place (valid Wikipedia title, e.g., "Waiheke Island", "Mount Fuji") */
  placeName: string | null
  /** Business/POI disambiguation string (Google Places only, e.g., "Dice Goblin Auckland") */
  placeQuery: string | null
  /** City name */
  city: string | null
  /** Region name (state, province) */
  region: string | null
  /** Country name */
  country: string | null

  // ===== Image hints (non-location) =====
  image: ParsedImageHints

  // ===== Link hints =====
  link: ParsedLinkHints | null
}

function extractJsonFromResponse(response: string): string {
  // Try to extract JSON from response (might be wrapped in ```json```)
  const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/)
  if (jsonMatch?.[1]) {
    return jsonMatch[1]
  }
  // Try to find JSON array directly
  const arrayMatch = response.match(/\[[\s\S]*\]/)
  if (!arrayMatch) {
    throw new Error('Could not find JSON array in response')
  }
  return arrayMatch[0]
}

function parseString(val: unknown): string | null {
  return typeof val === 'string' && val.trim() ? val : null
}

/** Round to N decimal places */
function roundTo(n: number, decimals: number): number {
  const factor = 10 ** decimals
  return Math.round(n * factor) / factor
}

function parseNumber(val: unknown, fallback: number, max = 1, roundDecimals?: number): number {
  let result = fallback
  if (typeof val === 'number') {
    result = Math.max(0, Math.min(max, val))
  } else if (typeof val === 'string') {
    const parsed = Number.parseFloat(val)
    if (!Number.isNaN(parsed)) {
      result = Math.max(0, Math.min(max, parsed))
    }
  }
  return roundDecimals !== undefined ? roundTo(result, roundDecimals) : result
}

function parseBoolean(val: unknown, fallback: boolean): boolean {
  if (typeof val === 'boolean') return val
  if (typeof val === 'string') {
    if (val.toLowerCase() === 'true') return true
    if (val.toLowerCase() === 'false') return false
  }
  return fallback
}

/**
 * Parse the image hints object from AI response.
 */
function parseImageHints(obj: unknown): ParsedImageHints {
  if (typeof obj !== 'object' || obj === null) {
    return { stock: '', mediaKey: null, preferStock: false }
  }
  const imageObj = obj as Record<string, unknown>
  return {
    stock: parseString(imageObj.stock) ?? '',
    mediaKey: parseString(imageObj.mediaKey),
    preferStock: parseBoolean(imageObj.preferStock, false)
  }
}

/**
 * Parse the link hints object from AI response.
 */
function parseLinkHints(obj: unknown): ParsedLinkHints | null {
  if (typeof obj !== 'object' || obj === null) {
    return null
  }
  const linkObj = obj as Record<string, unknown>
  const type = parseString(linkObj.type)
  const query = parseString(linkObj.query)
  // Only return link if at least type or query is present
  if (!type && !query) {
    return null
  }
  return {
    type,
    query
  }
}

function parseItem(obj: Record<string, unknown>): ParsedClassification {
  return {
    msg: parseNumber(obj.msg, 0, Number.MAX_VALUE), // msg is an ID, not clamped
    off: parseNumber(obj.off, 0, Number.MAX_VALUE), // offset, not clamped (usually 0 or negative)
    title: parseString(obj.title),
    fun: parseNumber(obj.fun, 2.5, 5, 1), // 0-5 scale, 1 decimal
    int: parseNumber(obj.int, 2.5, 5, 1), // 0-5 scale, 1 decimal
    cat: typeof obj.cat === 'string' ? obj.cat : 'other',
    // Location fields (top-level)
    wikiName: parseString(obj.wikiName),
    placeName: parseString(obj.placeName),
    placeQuery: parseString(obj.placeQuery),
    city: parseString(obj.city),
    region: parseString(obj.region),
    country: parseString(obj.country),
    // Image hints (nested object)
    image: parseImageHints(obj.image),
    // Link hints (nested object)
    link: parseLinkHints(obj.link)
  }
}

/**
 * Parse the classification response from the AI.
 * @param response Raw AI response text
 * @param expectedIds Optional array of message IDs - at least one must match
 */
export function parseClassificationResponse(
  response: string,
  expectedIds?: readonly number[]
): ParsedClassification[] {
  const jsonStr = extractJsonFromResponse(response)
  const parsed = JSON.parse(jsonStr) as unknown

  if (!Array.isArray(parsed)) {
    throw new Error('Response is not an array')
  }

  // Empty array is valid - means no activities found
  if (parsed.length === 0) {
    return []
  }

  const results = parsed.map((item: unknown) => {
    if (typeof item !== 'object' || item === null) {
      throw new Error('Array item is not an object')
    }
    return parseItem(item as Record<string, unknown>)
  })

  // Validate at least one msg matches expected
  if (expectedIds && expectedIds.length > 0) {
    const expectedSet = new Set(expectedIds)
    const hasMatch = results.some((r) => expectedSet.has(r.msg))
    if (!hasMatch) {
      throw new Error(
        `AI response contains no matching message IDs. Expected: [${expectedIds.join(', ')}], got: [${results.map((r) => r.msg).join(', ')}]`
      )
    }
  }

  return results
}
