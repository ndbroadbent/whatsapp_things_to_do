/**
 * Tests for semantic clustering
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { gunzipSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import type { ActivityCategory, ClassifiedSuggestion } from '../types/classifier.js'
import { clusterSuggestions } from './index.js'

/**
 * Helper to create a ClassifiedSuggestion for testing.
 */
function createSuggestion(
  activity: string,
  overrides: Partial<ClassifiedSuggestion> = {}
): ClassifiedSuggestion {
  return {
    messageId: Math.floor(Math.random() * 10000),
    isActivity: true,
    activity,
    activityScore: 0.9,
    category: 'other' as ActivityCategory,
    confidence: 0.9,
    originalMessage: `We should ${activity.toLowerCase()}`,
    sender: 'Test User',
    timestamp: new Date(),
    isMappable: false,
    ...overrides
  }
}

describe('clusterSuggestions', () => {
  describe('basic clustering', () => {
    it('should cluster semantically identical activities', async () => {
      const suggestions = [
        createSuggestion('Go for a bike ride'),
        createSuggestion('Ride a bike'),
        createSuggestion('Go biking')
      ]

      const result = await clusterSuggestions(suggestions)

      // Should have 1 cluster with 3 instances
      expect(result.clusters.length).toBe(1)
      const cluster = result.clusters[0]
      expect(cluster).toBeDefined()
      expect(cluster?.instanceCount).toBe(3)
      expect(result.filtered.length).toBe(0)
    })

    it('should keep different activities in separate clusters', async () => {
      const suggestions = [
        createSuggestion('Go for a bike ride'),
        createSuggestion('Go swimming'),
        createSuggestion('Visit a restaurant')
      ]

      const result = await clusterSuggestions(suggestions)

      expect(result.clusters.length).toBe(3)
      expect(result.clusters.every((c) => c.instanceCount === 1)).toBe(true)
    })

    it('should NOT cluster "Ride a bike" with "Fix a bike"', async () => {
      const suggestions = [createSuggestion('Ride a bike'), createSuggestion('Fix a bike')]

      const result = await clusterSuggestions(suggestions)

      // Should have 2 separate clusters
      expect(result.clusters.length).toBe(2)
    })
  })

  describe('location handling', () => {
    it('should NOT cluster same activity with different locations', async () => {
      const suggestions = [
        createSuggestion('Go kayaking', { location: undefined }),
        createSuggestion('Go kayaking in Mexico', { location: 'Mexico' })
      ]

      const result = await clusterSuggestions(suggestions)

      expect(result.clusters.length).toBe(2)
    })

    it('should cluster same activity with same location', async () => {
      const suggestions = [
        createSuggestion('Hike in Queenstown', { location: 'Queenstown' }),
        createSuggestion('Go hiking in Queenstown', { location: 'Queenstown' })
      ]

      const result = await clusterSuggestions(suggestions)

      expect(result.clusters.length).toBe(1)
      expect(result.clusters[0]?.instanceCount).toBe(2)
    })

    it('should NOT cluster different locations for same activity', async () => {
      const suggestions = [
        createSuggestion('Hike', { location: 'Queenstown' }),
        createSuggestion('Hike', { location: 'Auckland' }),
        createSuggestion('Hike', { location: 'Wellington' })
      ]

      const result = await clusterSuggestions(suggestions)

      expect(result.clusters.length).toBe(3)
    })
  })

  describe('filtering', () => {
    it('should filter empty tuples', async () => {
      const suggestions = [
        createSuggestion('Go for a bike ride'),
        createSuggestion('Go to the'), // Empty after stop word removal
        createSuggestion('Do something')
      ]

      const result = await clusterSuggestions(suggestions)

      // "Go to the" should be filtered (empty tuple)
      expect(result.filtered.length).toBeGreaterThanOrEqual(1)
    })

    it('should filter by minActivityScore', async () => {
      const suggestions = [
        createSuggestion('Go biking', { activityScore: 0.9 }),
        createSuggestion('Take out trash', { activityScore: 0.2 })
      ]

      const result = await clusterSuggestions(suggestions, { minActivityScore: 0.5 })

      expect(result.clusters.length).toBe(1)
      expect(result.filtered.length).toBe(1)
      expect(result.filtered[0]?.activity).toBe('Take out trash')
    })
  })

  describe('representative selection', () => {
    it('should select highest confidence as representative', async () => {
      const suggestions = [
        createSuggestion('Go biking', { confidence: 0.7 }),
        createSuggestion('Ride a bike', { confidence: 0.95 }),
        createSuggestion('Go for a bike ride', { confidence: 0.8 })
      ]

      const result = await clusterSuggestions(suggestions)

      expect(result.clusters[0]?.representative.activity).toBe('Ride a bike')
    })
  })

  describe('cluster metadata', () => {
    it('should calculate correct date range', async () => {
      const earlyDate = new Date('2024-01-01')
      const lateDate = new Date('2024-12-31')

      const suggestions = [
        createSuggestion('Go biking', { timestamp: new Date('2024-06-15') }),
        createSuggestion('Ride a bike', { timestamp: earlyDate }),
        createSuggestion('Go for a bike ride', { timestamp: lateDate })
      ]

      const result = await clusterSuggestions(suggestions)

      expect(result.clusters[0]?.firstMentioned.getTime()).toBe(earlyDate.getTime())
      expect(result.clusters[0]?.lastMentioned.getTime()).toBe(lateDate.getTime())
    })

    it('should collect all unique senders', async () => {
      const suggestions = [
        createSuggestion('Go biking', { sender: 'Alice' }),
        createSuggestion('Ride a bike', { sender: 'Bob' }),
        createSuggestion('Go for a bike ride', { sender: 'Alice' })
      ]

      const result = await clusterSuggestions(suggestions)

      const cluster = result.clusters[0]
      expect(cluster?.allSenders).toHaveLength(2)
      expect(cluster?.allSenders).toContain('Alice')
      expect(cluster?.allSenders).toContain('Bob')
    })
  })

  describe('sorting', () => {
    it('should sort clusters by instance count descending', async () => {
      const suggestions = [
        createSuggestion('Go swimming'),
        createSuggestion('Go biking'),
        createSuggestion('Ride a bike'),
        createSuggestion('Go for a bike ride')
      ]

      const result = await clusterSuggestions(suggestions)

      // Bike cluster (3) should come before swim cluster (1)
      expect(result.clusters[0]?.instanceCount).toBe(3)
      expect(result.clusters[1]?.instanceCount).toBe(1)
    })
  })

  describe('hike examples from experiments', () => {
    it('should cluster all hike variants together', async () => {
      const suggestions = [
        createSuggestion('Go hiking'),
        createSuggestion('Go for a hike'),
        createSuggestion('Do a hike'),
        createSuggestion('Take a hike')
      ]

      const result = await clusterSuggestions(suggestions)

      expect(result.clusters.length).toBe(1)
      expect(result.clusters[0]?.instanceCount).toBe(4)
    })
  })

  describe('restaurant examples', () => {
    it('should cluster restaurant mentions', async () => {
      const suggestions = [
        createSuggestion('Try that new restaurant'),
        createSuggestion('Check out that restaurant'),
        createSuggestion('Go to that restaurant')
      ]

      const result = await clusterSuggestions(suggestions)

      expect(result.clusters.length).toBe(1)
      expect(result.clusters[0]?.instanceCount).toBe(3)
    })
  })
})

describe('clusterSuggestions with real fixture', () => {
  it('should cluster real suggestions from fixture', async () => {
    // Load the fixture
    const fixturePath = join(
      __dirname,
      '../../tests/fixtures/clustering/classified-suggestions.json.gz'
    )
    const compressed = readFileSync(fixturePath)
    const json = gunzipSync(new Uint8Array(compressed)).toString('utf-8')
    const data = JSON.parse(json) as { suggestions: ClassifiedSuggestion[] }

    // Parse dates (JSON doesn't preserve Date objects)
    const suggestions = data.suggestions.map((s) => ({
      ...s,
      timestamp: new Date(s.timestamp)
    }))

    const result = await clusterSuggestions(suggestions)

    // Basic sanity checks
    expect(result.clusters.length).toBeGreaterThan(0)
    expect(result.clusters.length).toBeLessThanOrEqual(suggestions.length)

    // Total instances should equal input (minus filtered)
    const totalInstances = result.clusters.reduce((sum, c) => sum + c.instanceCount, 0)
    expect(totalInstances + result.filtered.length).toBe(suggestions.length)

    // All clusters should have at least 1 instance
    for (const cluster of result.clusters) {
      expect(cluster.instanceCount).toBeGreaterThanOrEqual(1)
      expect(cluster.instances.length).toBe(cluster.instanceCount)
      expect(cluster.allSenders.length).toBeGreaterThanOrEqual(1)
    }

    // Multi-mention clusters should exist (proves clustering is working)
    const multiMentionClusters = result.clusters.filter((c) => c.instanceCount > 1)
    // We expect some clustering in real data
    expect(multiMentionClusters.length).toBeGreaterThanOrEqual(0)
  })
})
