import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { VERSION } from '../index.js'

// Since parseCliArgs() reads process.argv directly and may call process.exit(),
// we need to test the parsing logic more carefully.
// We'll test the help text content and manual flag parsing.

describe('CLI Args', () => {
  describe('HELP_TEXT', () => {
    // Import the help text directly
    let HELP_TEXT: string

    beforeEach(async () => {
      const module = await import('./args.js')
      HELP_TEXT = module.HELP_TEXT
    })

    it('includes version', () => {
      expect(HELP_TEXT).toContain(`v${VERSION}`)
    })

    it('includes all main commands', () => {
      expect(HELP_TEXT).toContain('analyze')
      expect(HELP_TEXT).toContain('preview')
      expect(HELP_TEXT).toContain('parse')
      expect(HELP_TEXT).toContain('extract')
      expect(HELP_TEXT).toContain('classify')
      expect(HELP_TEXT).toContain('geocode')
      expect(HELP_TEXT).toContain('export')
    })

    it('describes preview command', () => {
      expect(HELP_TEXT).toContain('preview')
      expect(HELP_TEXT).toContain('Quick preview')
      expect(HELP_TEXT).toContain('single AI call')
    })

    it('includes preview in examples', () => {
      expect(HELP_TEXT).toContain('chat-to-map preview')
    })

    it('includes all option flags', () => {
      expect(HELP_TEXT).toContain('--output-dir')
      expect(HELP_TEXT).toContain('--format')
      expect(HELP_TEXT).toContain('--region')
      expect(HELP_TEXT).toContain('--min-confidence')
      expect(HELP_TEXT).toContain('--activities-only')
      expect(HELP_TEXT).toContain('--skip-geocoding')
      expect(HELP_TEXT).toContain('--quiet')
      expect(HELP_TEXT).toContain('--verbose')
      expect(HELP_TEXT).toContain('--dry-run')
    })

    it('includes API key documentation', () => {
      expect(HELP_TEXT).toContain('OPENAI_API_KEY')
      expect(HELP_TEXT).toContain('ANTHROPIC_API_KEY')
      expect(HELP_TEXT).toContain('GOOGLE_MAPS_API_KEY')
    })
  })

  describe('parseCliArgs', () => {
    let originalArgv: string[]
    let mockExit: ReturnType<typeof vi.fn>

    beforeEach(() => {
      originalArgv = process.argv
      mockExit = vi.fn()
      vi.spyOn(process, 'exit').mockImplementation(mockExit as never)
    })

    afterEach(() => {
      process.argv = originalArgv
      vi.restoreAllMocks()
    })

    it('parses analyze command with input', async () => {
      process.argv = ['node', 'cli.js', 'analyze', 'chat.txt']

      const { parseCliArgs } = await import('./args.js')
      const args = parseCliArgs()

      expect(args.command).toBe('analyze')
      expect(args.input).toBe('chat.txt')
    })

    it('parses preview command with input', async () => {
      process.argv = ['node', 'cli.js', 'preview', 'chat.zip']

      // Need to reimport to get fresh parse
      vi.resetModules()
      const { parseCliArgs } = await import('./args.js')
      const args = parseCliArgs()

      expect(args.command).toBe('preview')
      expect(args.input).toBe('chat.zip')
    })

    it('parses output-dir option', async () => {
      process.argv = ['node', 'cli.js', 'analyze', 'chat.txt', '--output-dir', './results']

      vi.resetModules()
      const { parseCliArgs } = await import('./args.js')
      const args = parseCliArgs()

      expect(args.outputDir).toBe('./results')
    })

    it('parses short flags', async () => {
      process.argv = ['node', 'cli.js', 'analyze', 'chat.txt', '-o', './out', '-r', 'NZ', '-q']

      vi.resetModules()
      const { parseCliArgs } = await import('./args.js')
      const args = parseCliArgs()

      expect(args.outputDir).toBe('./out')
      expect(args.region).toBe('NZ')
      expect(args.quiet).toBe(true)
    })

    it('parses format option', async () => {
      process.argv = ['node', 'cli.js', 'analyze', 'chat.txt', '-f', 'csv,map']

      vi.resetModules()
      const { parseCliArgs } = await import('./args.js')
      const args = parseCliArgs()

      expect(args.formats).toEqual(['csv', 'map'])
    })

    it('parses boolean flags', async () => {
      process.argv = [
        'node',
        'cli.js',
        'analyze',
        'chat.txt',
        '--activities-only',
        '--skip-geocoding',
        '--dry-run',
        '--verbose'
      ]

      vi.resetModules()
      const { parseCliArgs } = await import('./args.js')
      const args = parseCliArgs()

      expect(args.activitiesOnly).toBe(true)
      expect(args.skipGeocoding).toBe(true)
      expect(args.dryRun).toBe(true)
      expect(args.verbose).toBe(true)
    })

    it('uses default values when options not provided', async () => {
      process.argv = ['node', 'cli.js', 'analyze', 'chat.txt']

      vi.resetModules()
      const { parseCliArgs } = await import('./args.js')
      const args = parseCliArgs()

      expect(args.outputDir).toBe('./output')
      expect(args.formats).toEqual(['csv', 'excel', 'json', 'map', 'pdf'])
      expect(args.minConfidence).toBe(0.5)
      expect(args.activitiesOnly).toBe(false)
      expect(args.skipGeocoding).toBe(false)
      expect(args.quiet).toBe(false)
      expect(args.verbose).toBe(false)
      expect(args.dryRun).toBe(false)
    })

    it('parses min-confidence option', async () => {
      process.argv = ['node', 'cli.js', 'analyze', 'chat.txt', '--min-confidence', '0.75']

      vi.resetModules()
      const { parseCliArgs } = await import('./args.js')
      const args = parseCliArgs()

      expect(args.minConfidence).toBe(0.75)
    })
  })
})
