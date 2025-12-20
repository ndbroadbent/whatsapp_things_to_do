/**
 * HTTP Utilities
 *
 * Helper types and functions for HTTP requests that work
 * around Bun's type system conflicts with globalThis.Response.
 */

import type { Result } from './types.js'

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
 * Check if running tests in CI - this combination must not make real HTTP requests.
 */
function isTestInCI(): boolean {
  return isCI() && isTestMode()
}

/**
 * Error thrown when an uncached HTTP request is made during tests in CI.
 */
export class UncachedHttpRequestError extends Error {
  constructor(url: string) {
    super(
      `Uncached HTTP request to ${url} during tests in CI. ` +
        'All HTTP requests must be cached or mocked when running tests in CI. ' +
        'Use FixtureCache or HttpRecorder to cache this response.'
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
 * @throws UncachedHttpRequestError when running tests in CI - all requests must be cached/mocked
 */
export async function httpFetch(url: string, init?: RequestInit): Promise<HttpResponse> {
  if (isTestInCI()) {
    throw new UncachedHttpRequestError(url)
  }
  const response = await fetch(url, init)
  return response as unknown as HttpResponse
}

/**
 * Guarded fetch for scrapers - throws in CI test mode if not mocked.
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
  if (isTestInCI()) {
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
