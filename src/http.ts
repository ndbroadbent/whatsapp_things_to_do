/**
 * HTTP Utilities
 *
 * Helper types and functions for HTTP requests that work
 * around Bun's type system conflicts with globalThis.Response.
 */

import type { Result } from './types.js'

/**
 * Standard HTTP response interface for API calls.
 * This avoids conflicts with Bun's Response type overrides.
 */
export interface HttpResponse {
  ok: boolean
  status: number
  headers: {
    get(name: string): string | null
  }
  text(): Promise<string>
  json(): Promise<unknown>
}

/**
 * Perform a fetch request and return a typed response.
 */
export async function httpFetch(url: string, init?: RequestInit): Promise<HttpResponse> {
  const response = await fetch(url, init)
  return response as unknown as HttpResponse
}

/**
 * Handle HTTP error responses uniformly across all API modules.
 */
export async function handleHttpError(response: HttpResponse): Promise<Result<never>> {
  const errorText = await response.text()

  if (response.status === 429) {
    const retryAfter = response.headers.get('retry-after')
    return {
      ok: false,
      error: {
        type: 'rate_limit',
        message: `Rate limited: ${errorText}`,
        retryAfter: retryAfter ? Number.parseInt(retryAfter, 10) : undefined
      }
    }
  }

  if (response.status === 401) {
    return { ok: false, error: { type: 'auth', message: `Authentication failed: ${errorText}` } }
  }

  return {
    ok: false,
    error: { type: 'network', message: `API error ${response.status}: ${errorText}` }
  }
}

/**
 * Handle network errors uniformly across all API modules.
 */
export function handleNetworkError(error: unknown): Result<never> {
  const message = error instanceof Error ? error.message : String(error)
  return { ok: false, error: { type: 'network', message: `Network error: ${message}` } }
}

/**
 * Create an error result for empty API responses.
 */
export function emptyResponseError(): Result<never> {
  return { ok: false, error: { type: 'invalid_response', message: 'Empty response from API' } }
}
