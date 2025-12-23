/**
 * Simple HTTP recorder for integration tests.
 *
 * Records real HTTP responses to fixture files on first run,
 * replays from fixtures on subsequent runs.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { FetchFn } from '../types'

/**
 * Minimal response interface to work around Bun's Response type conflicts.
 */
interface FetchResponse {
  url: string
  status: number
  headers: { forEach(callback: (value: string, key: string) => void): void }
  text(): Promise<string>
}

interface RecordedFixture {
  url: string
  finalUrl: string
  method: string
  status: number
  headers: Record<string, string>
  body: string
  recordedAt: string
}

/**
 * Request input type that works with both string URLs and Request objects.
 */
type FetchInput = string | URL | { url: string }

export class HttpRecorder {
  private fixturesDir: string

  constructor(fixturesDir: string) {
    this.fixturesDir = fixturesDir
    if (!existsSync(fixturesDir)) {
      mkdirSync(fixturesDir, { recursive: true })
    }
  }

  /**
   * Get a fetch function that records/replays HTTP requests.
   */
  get fetch(): FetchFn {
    return this.handleRequest.bind(this) as FetchFn
  }

  private async handleRequest(input: FetchInput, init?: RequestInit): Promise<Response> {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const method = init?.method ?? 'GET'
    const fixturePath = this.getFixturePath(method, url)

    if (existsSync(fixturePath)) {
      return this.replay(fixturePath)
    }

    return this.record(url, method, input, init, fixturePath)
  }

  private replay(fixturePath: string): Response {
    const fixture: RecordedFixture = JSON.parse(readFileSync(fixturePath, 'utf-8'))
    const response = new Response(fixture.body, {
      status: fixture.status,
      headers: new Headers(fixture.headers)
    })
    // Set the final URL after redirects (Response.url is read-only, so we use Object.defineProperty)
    Object.defineProperty(response, 'url', { value: fixture.finalUrl ?? fixture.url })
    return response
  }

  private async record(
    url: string,
    method: string,
    input: FetchInput,
    init: RequestInit | undefined,
    fixturePath: string
  ): Promise<Response> {
    const rawResponse = await fetch(input as Parameters<typeof fetch>[0], init)
    const response = rawResponse as unknown as FetchResponse
    const body = await response.text()

    const headers: Record<string, string> = {}
    response.headers.forEach((value: string, key: string) => {
      headers[key] = value
    })

    const fixture: RecordedFixture = {
      url,
      finalUrl: response.url || url,
      method,
      status: response.status,
      headers,
      body,
      recordedAt: new Date().toISOString()
    }

    writeFileSync(fixturePath, JSON.stringify(fixture, null, 2))

    const result = new Response(body, {
      status: response.status,
      headers: new Headers(headers)
    })
    Object.defineProperty(result, 'url', { value: fixture.finalUrl })
    return result
  }

  private getFixturePath(method: string, url: string): string {
    const safeUrl = url
      .replace(/^https?:\/\//, '')
      .replace(/[^a-zA-Z0-9.-]/g, '_')
      .slice(0, 100)
    const filename = `${method.toLowerCase()}_${safeUrl}.json`
    return join(this.fixturesDir, filename)
  }
}
