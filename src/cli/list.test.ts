import { mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { displayProcessedChats, listProcessedChats } from './list.js'
import type { Logger } from './logger.js'

/**
 * Create a mock logger for testing.
 */
function createMockLogger(): Logger & { logs: string[] } {
  const logs: string[] = []
  return {
    logs,
    log: vi.fn((msg: string) => logs.push(msg)),
    success: vi.fn((msg: string) => logs.push(`✅ ${msg}`)),
    error: vi.fn((msg: string) => logs.push(`❌ ${msg}`)),
    verbose: vi.fn(),
    progress: vi.fn()
  }
}

describe('listProcessedChats', () => {
  const testDir = './tmp/test-list-output'

  beforeEach(async () => {
    // Clean up before each test
    try {
      await rm(testDir, { recursive: true })
    } catch {
      // Ignore if doesn't exist
    }
  })

  afterEach(async () => {
    // Clean up after each test
    try {
      await rm(testDir, { recursive: true })
    } catch {
      // Ignore if doesn't exist
    }
  })

  it('returns empty array when directory does not exist', async () => {
    const logger = createMockLogger()

    const chats = await listProcessedChats('./nonexistent-dir', logger)

    expect(chats).toHaveLength(0)
  })

  it('returns empty array when directory is empty', async () => {
    const logger = createMockLogger()
    await mkdir(testDir, { recursive: true })

    const chats = await listProcessedChats(testDir, logger)

    expect(chats).toHaveLength(0)
  })

  it('finds processed chats with valid suggestions.json', async () => {
    const logger = createMockLogger()
    const chatDir = join(testDir, 'my-chat')
    await mkdir(chatDir, { recursive: true })

    const metadata = {
      metadata: {
        generatedAt: '2024-03-15T10:00:00Z',
        suggestionCount: 42,
        geocodedCount: 30
      },
      suggestions: []
    }
    await writeFile(join(chatDir, 'suggestions.json'), JSON.stringify(metadata))

    const chats = await listProcessedChats(testDir, logger)

    expect(chats).toHaveLength(1)
    expect(chats[0]?.name).toBe('my-chat')
    expect(chats[0]?.suggestionCount).toBe(42)
    expect(chats[0]?.geocodedCount).toBe(30)
  })

  it('falls back to suggestions array length when no metadata', async () => {
    const logger = createMockLogger()
    const chatDir = join(testDir, 'my-chat')
    await mkdir(chatDir, { recursive: true })

    const data = {
      suggestions: [{ id: 1 }, { id: 2 }, { id: 3 }]
    }
    await writeFile(join(chatDir, 'suggestions.json'), JSON.stringify(data))

    const chats = await listProcessedChats(testDir, logger)

    expect(chats).toHaveLength(1)
    expect(chats[0]?.suggestionCount).toBe(3)
  })

  it('ignores directories without valid suggestions.json', async () => {
    const logger = createMockLogger()

    // Create a directory with valid suggestions.json
    const validDir = join(testDir, 'valid-chat')
    await mkdir(validDir, { recursive: true })
    await writeFile(
      join(validDir, 'suggestions.json'),
      JSON.stringify({ suggestions: [{ id: 1 }] })
    )

    // Create a directory without suggestions.json
    const invalidDir = join(testDir, 'invalid-chat')
    await mkdir(invalidDir, { recursive: true })

    const chats = await listProcessedChats(testDir, logger)

    expect(chats).toHaveLength(1)
    expect(chats[0]?.name).toBe('valid-chat')
  })

  it('sorts chats by processed date descending', async () => {
    const logger = createMockLogger()

    // Create older chat
    const olderDir = join(testDir, 'older-chat')
    await mkdir(olderDir, { recursive: true })
    await writeFile(
      join(olderDir, 'suggestions.json'),
      JSON.stringify({
        metadata: { generatedAt: '2024-01-01T00:00:00Z' },
        suggestions: []
      })
    )

    // Create newer chat
    const newerDir = join(testDir, 'newer-chat')
    await mkdir(newerDir, { recursive: true })
    await writeFile(
      join(newerDir, 'suggestions.json'),
      JSON.stringify({
        metadata: { generatedAt: '2024-06-01T00:00:00Z' },
        suggestions: []
      })
    )

    const chats = await listProcessedChats(testDir, logger)

    expect(chats).toHaveLength(2)
    expect(chats[0]?.name).toBe('newer-chat')
    expect(chats[1]?.name).toBe('older-chat')
  })
})

describe('displayProcessedChats', () => {
  it('shows message when no chats found', () => {
    const logger = createMockLogger()

    displayProcessedChats([], logger)

    expect(logger.logs.some((l) => l.includes('No processed chats found'))).toBe(true)
  })

  it('displays table with chat info', () => {
    const logger = createMockLogger()
    const chats = [
      {
        name: 'test-chat',
        processedAt: new Date('2024-03-15T10:00:00Z'),
        suggestionCount: 42,
        geocodedCount: 30,
        path: './test/test-chat'
      }
    ]

    displayProcessedChats(chats, logger)

    // Should have header, separator, data row, and total
    expect(logger.logs.some((l) => l.includes('Name'))).toBe(true)
    expect(logger.logs.some((l) => l.includes('test-chat'))).toBe(true)
    expect(logger.logs.some((l) => l.includes('42'))).toBe(true)
    expect(logger.logs.some((l) => l.includes('30'))).toBe(true)
    expect(logger.logs.some((l) => l.includes('Total: 1'))).toBe(true)
  })

  it('shows correct plural for multiple chats', () => {
    const logger = createMockLogger()
    const chats = [
      {
        name: 'chat-1',
        processedAt: new Date(),
        suggestionCount: 10,
        geocodedCount: 5,
        path: './test/chat-1'
      },
      {
        name: 'chat-2',
        processedAt: new Date(),
        suggestionCount: 20,
        geocodedCount: 15,
        path: './test/chat-2'
      }
    ]

    displayProcessedChats(chats, logger)

    expect(logger.logs.some((l) => l.includes('Total: 2 processed chats'))).toBe(true)
  })
})
