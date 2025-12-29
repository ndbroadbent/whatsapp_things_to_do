import { mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { hashFileBytes, PipelineCache } from '../caching/pipeline'
import { getInputMetadata, readInputFileWithMetadata } from './steps/read'

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

describe('readInputFileWithMetadata', () => {
  beforeEach(async () => {
    await mkdir(TEST_DIR, { recursive: true })
  })

  afterEach(async () => {
    await rm(TEST_DIR, { recursive: true, force: true })
  })

  it('reads plain text files', async () => {
    const filePath = join(TEST_DIR, 'chat.txt')
    await writeFile(filePath, 'Hello World')

    const result = await readInputFileWithMetadata(filePath)

    expect(result.content).toBe('Hello World')
    expect(result.metadata.baseName).toBe('chat')
  })

  it('reads zip files', async () => {
    const JSZip = await import('jszip')
    const zip = new JSZip.default()
    zip.file('_chat.txt', 'Zip content here')

    const zipContent = await zip.generateAsync({ type: 'uint8array' })
    const filePath = join(TEST_DIR, 'chat.zip')
    await writeFile(filePath, zipContent)

    const result = await readInputFileWithMetadata(filePath)
    expect(result.content).toBe('Zip content here')
  })

  it('throws on zip without chat file', async () => {
    const JSZip = await import('jszip')
    const zip = new JSZip.default()
    zip.file('readme.md', 'Not a chat file')

    const zipContent = await zip.generateAsync({ type: 'uint8array' })
    const filePath = join(TEST_DIR, 'bad.zip')
    await writeFile(filePath, zipContent)

    await expect(readInputFileWithMetadata(filePath)).rejects.toThrow('No chat file found')
  })

  it('finds .txt files in zip', async () => {
    const JSZip = await import('jszip')
    const zip = new JSZip.default()
    zip.file('WhatsApp Chat.txt', 'Chat content')

    const zipContent = await zip.generateAsync({ type: 'uint8array' })
    const filePath = join(TEST_DIR, 'whatsapp.zip')
    await writeFile(filePath, zipContent)

    const result = await readInputFileWithMetadata(filePath)
    expect(result.content).toBe('Chat content')
  })
})

describe('PipelineCache chat content caching', () => {
  beforeEach(async () => {
    await mkdir(TEST_DIR, { recursive: true })
    await mkdir(TEST_CACHE_DIR, { recursive: true })
  })

  afterEach(async () => {
    await rm(TEST_DIR, { recursive: true, force: true })
    await rm(TEST_CACHE_DIR, { recursive: true, force: true })
  })

  it('returns null for uncached content', async () => {
    const filePath = join(TEST_DIR, 'chat.zip')
    await writeFile(filePath, 'test zip content')

    const cache = new PipelineCache(TEST_CACHE_DIR)
    const fileHash = hashFileBytes(filePath)
    const run = cache.findLatestRun(filePath, fileHash)

    expect(run).toBeNull()
  })

  it('caches and retrieves chat.txt content', async () => {
    const filePath = join(TEST_DIR, 'chat.zip')
    await writeFile(filePath, 'test zip content')

    const cache = new PipelineCache(TEST_CACHE_DIR)
    const fileHash = hashFileBytes(filePath)
    const content = 'Hello, this is chat content!'

    // Initialize run and save chat.txt
    cache.initRun(filePath, fileHash)
    cache.setStage('chat', content)

    // Retrieve from cache with new instance
    const cache2 = new PipelineCache(TEST_CACHE_DIR)
    const run = cache2.findLatestRun(filePath, fileHash)

    expect(run).not.toBeNull()
    expect(cache2.hasStage('chat')).toBe(true)
    expect(cache2.getStage<string>('chat')).toBe(content)
  })

  it('invalidates cache when file content changes', async () => {
    const filePath = join(TEST_DIR, 'chat.zip')
    await writeFile(filePath, 'original zip content')

    const cache = new PipelineCache(TEST_CACHE_DIR)
    const originalHash = hashFileBytes(filePath)

    // Cache with original content
    cache.initRun(filePath, originalHash)
    cache.setStage('chat', 'cached chat content')

    // Modify the file (different bytes = different hash)
    await writeFile(filePath, 'modified zip content')
    const newHash = hashFileBytes(filePath)

    // Should not find cache since file hash changed
    const cache2 = new PipelineCache(TEST_CACHE_DIR)
    const run = cache2.findLatestRun(filePath, newHash)

    expect(run).toBeNull()
  })
})
