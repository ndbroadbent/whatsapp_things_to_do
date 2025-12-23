/**
 * HTTP Utilities
 *
 * Helper types and functions for HTTP requests that work
 * around Bun's type system conflicts with globalThis.Response.
 */

import type { Result } from './types'

/**
 * Check if running in CI environment.
 */
function isCI(): boolean {
  return process.env.CI === 'true'
}

/**
 * Check if running tests.
 */
function isTestMode(): boolean {
  return process.env.NODE_ENV === 'test' || process.env.VITEST === 'true'
}

/**
 * Check if E2E cache is locked (no real HTTP requests allowed).
 * Set by E2E test harness when cache fixture exists.
 */
function isE2ECacheLocked(): boolean {
  return process.env.E2E_CACHE_LOCKED === 'true'
}

/**
 * Check if HTTP requests should be blocked.
 * True when:
 * - Running tests in CI (CI=true + test mode)
 * - E2E cache is locked (E2E_CACHE_LOCKED=true)
 */
function shouldBlockHttpRequests(): boolean {
  return (isCI() && isTestMode()) || isE2ECacheLocked()
}

/**
 * Error thrown when an uncached HTTP request is made in locked mode.
 */
class UncachedHttpRequestError extends Error {
  constructor(url: string) {
    const reason = isE2ECacheLocked()
      ? 'E2E cache is locked (E2E_CACHE_LOCKED=true)'
      : 'running tests in CI'
    super(
      `Uncached HTTP request to ${url} blocked: ${reason}. ` +
        'All HTTP requests must be cached. ' +
        'For E2E tests, set UPDATE_E2E_CACHE=true to allow API calls.'
    )
    this.name = 'UncachedHttpRequestError'
  }
}

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
 *
 * @throws UncachedHttpRequestError when HTTP requests are blocked (CI tests or E2E locked mode)
 */
export async function httpFetch(url: string, init?: RequestInit): Promise<HttpResponse> {
  if (shouldBlockHttpRequests()) {
    throw new UncachedHttpRequestError(url)
  }
  const response = await fetch(url, init)
  return response as unknown as HttpResponse
}

/**
 * Guarded fetch for scrapers - throws when HTTP requests are blocked.
 * Use this as the default instead of global fetch.
 * Type assertion needed to match FetchFn = typeof fetch.
 */
export const guardedFetch = ((input: string | URL | Request, init?: RequestInit) => {
  let url: string
  if (typeof input === 'string') {
    url = input
  } else if (input instanceof URL) {
    url = input.href
  } else {
    // Request object - use String() to get URL
    url = String(input)
  }
  if (shouldBlockHttpRequests()) {
    throw new UncachedHttpRequestError(url)
  }
  return fetch(input, init)
}) as typeof fetch

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
