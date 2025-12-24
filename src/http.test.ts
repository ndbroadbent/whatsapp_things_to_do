import { describe, expect, it } from 'vitest'
import type { HttpResponse } from './http'
import { emptyResponseError, handleHttpError, handleNetworkError } from './http'
import type { ApiError } from './types'

// Helper to assert error result and get error
function assertError(result: { ok: boolean; error?: ApiError }): ApiError {
  expect(result.ok).toBe(false)
  if (!result.ok && result.error) return result.error
  throw new Error('Expected error result')
}

function createMockResponse(
  status: number,
  body: string,
  headers: Record<string, string> = {}
): HttpResponse {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get: (name: string) => headers[name.toLowerCase()] ?? null
    },
    text: async () => body,
    json: async () => JSON.parse(body),
    arrayBuffer: async () => new TextEncoder().encode(body).buffer as ArrayBuffer
  }
}

describe('HTTP Utilities', () => {
  describe('handleHttpError', () => {
    it('handles 429 rate limit error', async () => {
      const response = createMockResponse(429, 'Too many requests')

      const result = await handleHttpError(response)
      const error = assertError(result)

      expect(error.type).toBe('rate_limit')
      expect(error.message).toContain('Rate limited')
    })

    it('includes retry-after header when present', async () => {
      const response = createMockResponse(429, 'Too many requests', {
        'retry-after': '60'
      })

      const result = await handleHttpError(response)
      const error = assertError(result)

      expect(error.retryAfter).toBe(60)
    })

    it('handles 401 auth error', async () => {
      const response = createMockResponse(401, 'Invalid API key')

      const result = await handleHttpError(response)
      const error = assertError(result)

      expect(error.type).toBe('auth')
      expect(error.message).toContain('Authentication failed')
    })

    it('handles generic HTTP errors', async () => {
      const response = createMockResponse(500, 'Internal server error')

      const result = await handleHttpError(response)
      const error = assertError(result)

      expect(error.type).toBe('network')
      expect(error.message).toContain('500')
    })

    it('handles 400 bad request', async () => {
      const response = createMockResponse(400, 'Bad request')

      const result = await handleHttpError(response)
      const error = assertError(result)

      expect(error.type).toBe('network')
      expect(error.message).toContain('400')
    })

    it('handles 403 forbidden', async () => {
      const response = createMockResponse(403, 'Forbidden')

      const result = await handleHttpError(response)
      const error = assertError(result)

      expect(error.type).toBe('network')
      expect(error.message).toContain('403')
    })

    it('handles 404 not found', async () => {
      const response = createMockResponse(404, 'Not found')

      const result = await handleHttpError(response)
      const error = assertError(result)

      expect(error.type).toBe('network')
      expect(error.message).toContain('404')
    })

    it('includes error body in message', async () => {
      const response = createMockResponse(500, 'Detailed error message here')

      const result = await handleHttpError(response)
      const error = assertError(result)

      expect(error.message).toContain('Detailed error message here')
    })
  })

  describe('handleNetworkError', () => {
    it('handles Error objects', () => {
      const error = new Error('Connection refused')

      const result = handleNetworkError(error)
      const apiError = assertError(result)

      expect(apiError.type).toBe('network')
      expect(apiError.message).toContain('Connection refused')
    })

    it('handles string errors', () => {
      const result = handleNetworkError('Something went wrong')
      const error = assertError(result)

      expect(error.type).toBe('network')
      expect(error.message).toContain('Something went wrong')
    })

    it('handles unknown error types', () => {
      const result = handleNetworkError({ code: 'ECONNREFUSED' })
      const error = assertError(result)

      expect(error.type).toBe('network')
      expect(error.message).toContain('Network error')
    })

    it('handles null error', () => {
      const result = handleNetworkError(null)
      const error = assertError(result)

      expect(error.type).toBe('network')
    })

    it('handles undefined error', () => {
      const result = handleNetworkError(undefined)
      const error = assertError(result)

      expect(error.type).toBe('network')
    })
  })

  describe('emptyResponseError', () => {
    it('returns invalid_response error type', () => {
      const result = emptyResponseError()
      const error = assertError(result)

      expect(error.type).toBe('invalid_response')
    })

    it('includes descriptive message', () => {
      const result = emptyResponseError()
      const error = assertError(result)

      expect(error.message).toContain('Empty response')
    })
  })
})
