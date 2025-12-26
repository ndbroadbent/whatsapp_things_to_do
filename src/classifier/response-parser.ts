/**
 * Response Parser
 *
 * Parses AI classification responses from JSON into typed objects.
 */

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
  conf: number
  com: boolean
  act: string | null
  act_orig: string | null
  obj: string | null
  obj_orig: string | null
  venue: string | null
  city: string | null
  region: string | null
  country: string | null
  /** 3 keywords for stock photo search (different from act/obj/venue) */
  kw: string[]
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

function parseStringArray(val: unknown): string[] {
  if (!Array.isArray(val)) return []
  return val.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
}

function parseItem(obj: Record<string, unknown>): ParsedClassification {
  return {
    msg: parseNumber(obj.msg, 0, Number.MAX_VALUE), // msg is an ID, not clamped
    off: parseNumber(obj.off, 0, Number.MAX_VALUE), // offset, not clamped (usually 0 or negative)
    title: parseString(obj.title),
    fun: parseNumber(obj.fun, 2.5, 5, 1), // 0-5 scale, 1 decimal
    int: parseNumber(obj.int, 2.5, 5, 1), // 0-5 scale, 1 decimal
    cat: typeof obj.cat === 'string' ? obj.cat : 'other',
    conf: parseNumber(obj.conf, 0.5, 1, 2), // 0-1 scale, 2 decimals (percentage)
    com: parseBoolean(obj.com, true),
    act: parseString(obj.act),
    act_orig: parseString(obj.act_orig),
    obj: parseString(obj.obj),
    obj_orig: parseString(obj.obj_orig),
    venue: parseString(obj.venue),
    city: parseString(obj.city),
    region: parseString(obj.region),
    country: parseString(obj.country),
    kw: parseStringArray(obj.kw)
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
