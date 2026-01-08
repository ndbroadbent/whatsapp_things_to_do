/**
 * Simple HTTP recorder for integration tests.
 *
 * Records real HTTP responses to gzipped fixture files on first run,
 * replays from fixtures on subsequent runs.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { gunzipSync, gzipSync } from 'node:zlib'
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

    // Check for gzipped fixture first
    if (existsSync(fixturePath)) {
      return this.replay(fixturePath, true)
    }
    // Check legacy uncompressed (no hash)
    const legacyPath = fixturePath.replace(/\.gz$/, '')
    if (existsSync(legacyPath)) {
      return this.replay(legacyPath, false)
    }
    // Check legacy gzipped (without hash suffix)
    const legacyGzPath = this.getLegacyFixturePath(method, url)
    if (existsSync(legacyGzPath)) {
      return this.replay(legacyGzPath, true)
    }
    // Check legacy uncompressed (without hash suffix)
    const legacyUncompressedPath = legacyGzPath.replace(/\.gz$/, '')
    if (existsSync(legacyUncompressedPath)) {
      return this.replay(legacyUncompressedPath, false)
    }

    return this.record(url, method, input, init, fixturePath)
  }

  private replay(fixturePath: string, gzipped: boolean): Response {
    const raw = readFileSync(fixturePath)
    const json = gzipped
      ? new TextDecoder().decode(new Uint8Array(gunzipSync(new Uint8Array(raw))))
      : raw.toString('utf-8')
    const fixture: RecordedFixture = JSON.parse(json)
    const response = new Response(fixture.body, {
      status: fixture.status,
      headers: new Headers(fixture.headers)
    })
    // Set the final URL after redirects (Response.url is read-only, so we use Object.defineProperty)
    Object.defineProperty(response, 'url', {
      value: fixture.finalUrl ?? fixture.url
    })
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

    const jsonBytes = new TextEncoder().encode(JSON.stringify(fixture, null, 2))
    const compressed = gzipSync(jsonBytes)
    writeFileSync(fixturePath, new Uint8Array(compressed))

    const result = new Response(body, {
      status: response.status,
      headers: new Headers(headers)
    })
    Object.defineProperty(result, 'url', { value: fixture.finalUrl })
    return result
  }

  private getFixturePath(method: string, url: string): string {
    // Use hash for uniqueness when URLs are long (e.g., SPARQL queries)
    const hash = this.hashString(url).slice(0, 16)
    const safeUrl = url
      .replace(/^https?:\/\//, '')
      .replace(/[^a-zA-Z0-9.-]/g, '_')
      .slice(0, 60)
    const filename = `${method.toLowerCase()}_${safeUrl}_${hash}.json.gz`
    return join(this.fixturesDir, filename)
  }

  private getLegacyFixturePath(method: string, url: string): string {
    // Old format: no hash, 100 char limit
    const safeUrl = url
      .replace(/^https?:\/\//, '')
      .replace(/[^a-zA-Z0-9.-]/g, '_')
      .slice(0, 100)
    const filename = `${method.toLowerCase()}_${safeUrl}.json.gz`
    return join(this.fixturesDir, filename)
  }

  private hashString(str: string): string {
    // Simple hash function for fixture naming (not cryptographic)
    let hash = 0
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i)
      hash = ((hash << 5) - hash + char) | 0
    }
    return Math.abs(hash).toString(16).padStart(8, '0')
  }
}
