import { mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  cacheExtraction,
  getCachedExtraction,
  getChatOutputDir,
  getInputMetadata,
  readInputFileWithCache
} from './input.js'

const TEST_DIR = './tmp/test-input'
const TEST_CACHE_DIR = './tmp/test-input-cache'

describe('getInputMetadata', () => {
  beforeEach(async () => {
    await mkdir(TEST_DIR, { recursive: true })
  })

  afterEach(async () => {
    await rm(TEST_DIR, { recursive: true, force: true })
  })

  it('extracts metadata from a file', async () => {
    const filePath = join(TEST_DIR, 'my-chat.zip')
    await writeFile(filePath, 'test content')

    const metadata = await getInputMetadata(filePath)

    expect(metadata.path).toBe(filePath)
    expect(metadata.baseName).toBe('my-chat')
    expect(metadata.mtime).toBeGreaterThan(0)
    expect(metadata.hash).toMatch(/^[a-f0-9]{8}$/)
    expect(metadata.outputDirName).toBe(`my-chat-${metadata.hash}`)
  })

  it('sanitizes filename for directory', async () => {
    const filePath = join(TEST_DIR, 'WhatsApp Chat with John & Jane (2024).zip')
    await writeFile(filePath, 'test')

    const metadata = await getInputMetadata(filePath)

    // Trailing underscore is removed by sanitization
    expect(metadata.baseName).toBe('WhatsApp_Chat_with_John_Jane_2024')
  })

  it('removes .txt extension', async () => {
    const filePath = join(TEST_DIR, 'chat.txt')
    await writeFile(filePath, 'test')

    const metadata = await getInputMetadata(filePath)

    expect(metadata.baseName).toBe('chat')
  })

  it('generates different hash for different mtimes', async () => {
    const filePath = join(TEST_DIR, 'chat.txt')
    await writeFile(filePath, 'test')

    const metadata1 = await getInputMetadata(filePath)

    // Wait and rewrite to change mtime
    await new Promise((resolve) => setTimeout(resolve, 10))
    await writeFile(filePath, 'different content')

    const metadata2 = await getInputMetadata(filePath)

    expect(metadata1.hash).not.toBe(metadata2.hash)
  })
})

describe('getChatOutputDir', () => {
  it('uses default output dir when not specified', () => {
    const metadata = {
      path: '/path/to/chat.zip',
      baseName: 'chat',
      mtime: 12345,
      hash: 'abcd1234',
      outputDirName: 'chat-abcd1234'
    }

    const outputDir = getChatOutputDir(metadata)

    // path.join normalizes and removes ./
    expect(outputDir).toBe('chat-to-map/output/chat-abcd1234')
  })

  it('uses custom output dir when specified', () => {
    const metadata = {
      path: '/path/to/chat.zip',
      baseName: 'chat',
      mtime: 12345,
      hash: 'abcd1234',
      outputDirName: 'chat-abcd1234'
    }

    const outputDir = getChatOutputDir(metadata, './custom/output')

    // path.join normalizes and removes ./
    expect(outputDir).toBe('custom/output/chat-abcd1234')
  })
})

describe('extraction cache', () => {
  beforeEach(async () => {
    await mkdir(TEST_CACHE_DIR, { recursive: true })
  })

  afterEach(async () => {
    await rm(TEST_CACHE_DIR, { recursive: true, force: true })
  })

  it('returns null for uncached content', () => {
    const metadata = {
      path: '/path/to/chat.zip',
      baseName: 'chat',
      mtime: 12345,
      hash: 'abcd1234',
      outputDirName: 'chat-abcd1234'
    }

    const cached = getCachedExtraction(metadata, TEST_CACHE_DIR)

    expect(cached).toBeNull()
  })

  it('caches and retrieves content', () => {
    const metadata = {
      path: '/path/to/chat.zip',
      baseName: 'chat',
      mtime: 12345,
      hash: 'abcd1234',
      outputDirName: 'chat-abcd1234'
    }
    const content = 'Hello, this is chat content!'

    cacheExtraction(metadata, content, TEST_CACHE_DIR)
    const cached = getCachedExtraction(metadata, TEST_CACHE_DIR)

    expect(cached).toBe(content)
  })

  it('invalidates cache when mtime changes', () => {
    const metadata1 = {
      path: '/path/to/chat.zip',
      baseName: 'chat',
      mtime: 12345,
      hash: 'abcd1234',
      outputDirName: 'chat-abcd1234'
    }
    const metadata2 = {
      ...metadata1,
      mtime: 67890,
      hash: 'efgh5678',
      outputDirName: 'chat-efgh5678'
    }

    cacheExtraction(metadata1, 'cached content', TEST_CACHE_DIR)

    // Same cache path but different mtime
    const cached = getCachedExtraction(metadata2, TEST_CACHE_DIR)

    expect(cached).toBeNull()
  })
})

describe('readInputFileWithCache', () => {
  beforeEach(async () => {
    await mkdir(TEST_DIR, { recursive: true })
    await mkdir(TEST_CACHE_DIR, { recursive: true })
  })

  afterEach(async () => {
    await rm(TEST_DIR, { recursive: true, force: true })
    await rm(TEST_CACHE_DIR, { recursive: true, force: true })
  })

  it('reads plain text files', async () => {
    const filePath = join(TEST_DIR, 'chat.txt')
    await writeFile(filePath, 'Hello World')

    const result = await readInputFileWithCache(filePath, { cacheDir: TEST_CACHE_DIR })

    expect(result.content).toBe('Hello World')
    expect(result.fromCache).toBe(false)
    expect(result.metadata.baseName).toBe('chat')
  })

  it('reads and caches zip files', async () => {
    const JSZip = await import('jszip')
    const zip = new JSZip.default()
    zip.file('_chat.txt', 'Zip content here')

    const zipContent = await zip.generateAsync({ type: 'uint8array' })
    const filePath = join(TEST_DIR, 'chat.zip')
    await writeFile(filePath, zipContent)

    // First read - should not be cached
    const result1 = await readInputFileWithCache(filePath, { cacheDir: TEST_CACHE_DIR })
    expect(result1.content).toBe('Zip content here')
    expect(result1.fromCache).toBe(false)

    // Second read - should be cached
    const result2 = await readInputFileWithCache(filePath, { cacheDir: TEST_CACHE_DIR })
    expect(result2.content).toBe('Zip content here')
    expect(result2.fromCache).toBe(true)
  })

  it('skips cache when requested', async () => {
    const filePath = join(TEST_DIR, 'chat.txt')
    await writeFile(filePath, 'Content')

    // Pre-cache some content
    const metadata = await getInputMetadata(filePath)
    cacheExtraction(metadata, 'Old cached content', TEST_CACHE_DIR)

    // Read with skipCache - should get actual file content
    const result = await readInputFileWithCache(filePath, {
      cacheDir: TEST_CACHE_DIR,
      skipCache: true
    })

    expect(result.content).toBe('Content')
    expect(result.fromCache).toBe(false)
  })

  it('throws on zip without chat file', async () => {
    const JSZip = await import('jszip')
    const zip = new JSZip.default()
    zip.file('readme.md', 'Not a chat file')

    const zipContent = await zip.generateAsync({ type: 'uint8array' })
    const filePath = join(TEST_DIR, 'bad.zip')
    await writeFile(filePath, zipContent)

    await expect(readInputFileWithCache(filePath, { cacheDir: TEST_CACHE_DIR })).rejects.toThrow(
      'No chat file found'
    )
  })

  it('finds .txt files in zip', async () => {
    const JSZip = await import('jszip')
    const zip = new JSZip.default()
    zip.file('WhatsApp Chat.txt', 'Chat content')

    const zipContent = await zip.generateAsync({ type: 'uint8array' })
    const filePath = join(TEST_DIR, 'whatsapp.zip')
    await writeFile(filePath, zipContent)

    const result = await readInputFileWithCache(filePath, { cacheDir: TEST_CACHE_DIR })
    expect(result.content).toBe('Chat content')
  })
})
