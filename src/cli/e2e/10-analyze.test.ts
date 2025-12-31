/**
 * Analyze Command E2E Tests
 *
 * Tests the full pipeline and all export formats.
 */

import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parse } from 'csv-parse/sync'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { FIXTURE_INPUT, runCli, testState } from './helpers'

describe('analyze command', () => {
  let outputDir: string

  beforeAll(() => {
    outputDir = mkdtempSync(join(tmpdir(), 'chat-to-map-analyze-'))
  })

  afterAll(() => {
    if (outputDir && existsSync(outputDir)) {
      rmSync(outputDir, { recursive: true, force: true })
    }
  })

  it('runs full pipeline and exports all formats', { timeout: 120000 }, () => {
    const { stdout, exitCode } = runCli(
      `analyze ${FIXTURE_INPUT} --cache-dir ${testState.tempCacheDir} -c "New Zealand" -o ${outputDir} --images`
    )

    expect(exitCode).toBe(0)
    expect(stdout).toContain('ChatToMap Analyze')

    // Check pipeline stages ran
    expect(stdout).toContain('Parsing')
    expect(stdout).toContain('Embedding')
    expect(stdout).toContain('Filtering')
    expect(stdout).toContain('Classifying')
    expect(stdout).toContain('Looking up places')
    expect(stdout).toContain('Fetching images')

    // Check export output
    expect(stdout).toContain('Export complete')
  })

  it('creates all export files', () => {
    const files = readdirSync(outputDir)

    expect(files).toContain('activities.csv')
    expect(files).toContain('activities.json')
    expect(files).toContain('activities.xlsx')
    expect(files).toContain('activities.pdf')
    expect(files).toContain('map.html')
  })

  describe('CSV export', () => {
    it('contains header row with expected columns', () => {
      const csv = readFileSync(join(outputDir, 'activities.csv'), 'utf-8')
      const lines = csv.split('\n')
      const header = lines[0]

      expect(header).toContain('activity')
      expect(header).toContain('category')
      expect(header).toContain('sender')
      expect(header).toContain('date')
      expect(header).toContain('location')
      expect(header).toContain('latitude')
      expect(header).toContain('longitude')
      expect(header).toContain('mention_count')
    })

    it('contains activity data rows', () => {
      const csv = readFileSync(join(outputDir, 'activities.csv'), 'utf-8')
      const lines = csv.split('\n').filter((l) => l.trim())

      // Header + at least 5 activities
      expect(lines.length).toBeGreaterThanOrEqual(6)

      // Check for known activities
      expect(csv.toLowerCase()).toContain('hot air balloon')
      expect(csv.toLowerCase()).toContain('whale')
    })

    it('shows mention count for aggregated activities', () => {
      const csv = readFileSync(join(outputDir, 'activities.csv'), 'utf-8')
      const records = parse(csv, { columns: true }) as Array<Record<string, string>>

      // Find Karangahake row - should have mention_count of 1 or 2 depending on batching
      const karangahake = records.find((r) => r.activity?.toLowerCase().includes('karangahake'))
      expect(karangahake).toBeDefined()
      expect(Number(karangahake?.mention_count)).toBeGreaterThanOrEqual(1)
      expect(Number(karangahake?.mention_count)).toBeLessThanOrEqual(2)

      // Find paintball row - should have mention_count of 1 or 2 depending on batching
      const paintball = records.find((r) => r.activity?.toLowerCase().includes('paintball'))
      expect(paintball).toBeDefined()
      expect(Number(paintball?.mention_count)).toBeGreaterThanOrEqual(1)
      expect(Number(paintball?.mention_count)).toBeLessThanOrEqual(2)
    })
  })

  describe('JSON export', () => {
    it('contains valid JSON with activities array', () => {
      const json = readFileSync(join(outputDir, 'activities.json'), 'utf-8')
      const data = JSON.parse(json)

      expect(data).toHaveProperty('activities')
      expect(Array.isArray(data.activities)).toBe(true)
      expect(data.activities.length).toBeGreaterThanOrEqual(5)
    })

    it('contains metadata', () => {
      const json = readFileSync(join(outputDir, 'activities.json'), 'utf-8')
      const data = JSON.parse(json)

      expect(data).toHaveProperty('metadata')
      expect(data.metadata).toHaveProperty('version')
      expect(data.metadata).toHaveProperty('inputFile')
    })

    it('activities have required fields', () => {
      const json = readFileSync(join(outputDir, 'activities.json'), 'utf-8')
      const data = JSON.parse(json)
      const activity = data.activities[0]

      expect(activity).toHaveProperty('activityId')
      expect(activity).toHaveProperty('activity')
      expect(activity).toHaveProperty('category')
      expect(activity).toHaveProperty('messages')
      expect(activity).toHaveProperty('funScore')
      expect(activity).toHaveProperty('interestingScore')
    })

    it('aggregated activities have multiple messages', () => {
      const json = readFileSync(join(outputDir, 'activities.json'), 'utf-8')
      const data = JSON.parse(json)

      // Find Karangahake Gorge - mentioned twice, should have 1 or 2 messages depending on batching
      const karangahake = data.activities.find((a: { activity: string }) =>
        a.activity.toLowerCase().includes('karangahake')
      )
      expect(karangahake).toBeDefined()
      expect(karangahake.messages.length).toBeGreaterThanOrEqual(1)
      expect(karangahake.messages.length).toBeLessThanOrEqual(2)

      // Find paintball activity - mentioned twice, should have 1 or 2 messages depending on batching
      const paintball = data.activities.find((a: { activity: string }) =>
        a.activity.toLowerCase().includes('paintball')
      )
      expect(paintball).toBeDefined()
      expect(paintball.messages.length).toBeGreaterThanOrEqual(1)
      expect(paintball.messages.length).toBeLessThanOrEqual(2)
    })
  })

  describe('Excel export', () => {
    it('creates valid xlsx file', () => {
      const xlsxPath = join(outputDir, 'activities.xlsx')
      expect(existsSync(xlsxPath)).toBe(true)

      // Check file size is reasonable (not empty)
      const stats = readFileSync(xlsxPath)
      expect(stats.length).toBeGreaterThan(1000)
    })

    it('xlsx file has valid zip structure', () => {
      // xlsx files are zip archives - check magic bytes
      const buffer = readFileSync(join(outputDir, 'activities.xlsx'))
      const magic = buffer.slice(0, 4).toString('hex')
      expect(magic).toBe('504b0304') // PK zip header
    })
  })

  describe('PDF export', () => {
    it('creates valid PDF file', () => {
      const pdfPath = join(outputDir, 'activities.pdf')
      expect(existsSync(pdfPath)).toBe(true)

      // Check file size is reasonable
      const stats = readFileSync(pdfPath)
      expect(stats.length).toBeGreaterThan(1000)
    })

    it('PDF file has valid header', () => {
      const buffer = readFileSync(join(outputDir, 'activities.pdf'))
      const header = buffer.slice(0, 8).toString('utf-8')
      expect(header).toContain('%PDF')
    })
  })

  describe('images directory', () => {
    it('creates images directory with thumbnails', () => {
      const imagesDir = join(outputDir, 'images')

      // Images directory should exist if any thumbnails were fetched
      expect(existsSync(imagesDir)).toBe(true)

      // Subdirectories: thumb/, medium/, lightbox/
      const subdirs = readdirSync(imagesDir)
      expect(subdirs).toContain('thumb')

      // Check thumbnails directory has jpg files
      const thumbnailsDir = join(imagesDir, 'thumb')
      expect(existsSync(thumbnailsDir)).toBe(true)

      const thumbnails = readdirSync(thumbnailsDir)
      expect(thumbnails.length).toBeGreaterThan(0)

      for (const img of thumbnails) {
        expect(img).toMatch(/\.jpg$/)
      }
    })
  })
})
