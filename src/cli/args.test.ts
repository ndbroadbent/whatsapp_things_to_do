import { describe, expect, it } from 'vitest'
import { VERSION } from '../index.js'
import { HELP_TEXT, parseArgs } from './args.js'

describe('CLI Args', () => {
  describe('HELP_TEXT', () => {
    it('includes version', () => {
      expect(HELP_TEXT).toContain(`v${VERSION}`)
    })

    it('includes all main commands', () => {
      expect(HELP_TEXT).toContain('analyze')
      expect(HELP_TEXT).toContain('preview')
      expect(HELP_TEXT).toContain('scan')
      expect(HELP_TEXT).toContain('candidates')
      expect(HELP_TEXT).toContain('list')
      expect(HELP_TEXT).toContain('parse')
      expect(HELP_TEXT).toContain('classify')
      expect(HELP_TEXT).toContain('geocode')
      expect(HELP_TEXT).toContain('export')
    })

    it('describes candidates command', () => {
      expect(HELP_TEXT).toContain('candidates')
      expect(HELP_TEXT).toContain('Debug candidate extraction')
    })

    it('describes list command', () => {
      expect(HELP_TEXT).toContain('list')
      expect(HELP_TEXT).toContain('Show previously processed chats')
    })

    it('describes preview command', () => {
      expect(HELP_TEXT).toContain('preview')
      expect(HELP_TEXT).toContain('AI-powered preview')
      expect(HELP_TEXT).toContain('requires API key')
    })

    it('describes scan command', () => {
      expect(HELP_TEXT).toContain('scan')
      expect(HELP_TEXT).toContain('Heuristic scan')
      expect(HELP_TEXT).toContain('no API key needed')
    })

    it('includes scan and preview in examples', () => {
      expect(HELP_TEXT).toContain('chat-to-map scan')
      expect(HELP_TEXT).toContain('chat-to-map preview')
    })

    it('includes all option flags', () => {
      expect(HELP_TEXT).toContain('--output-dir')
      expect(HELP_TEXT).toContain('--format')
      expect(HELP_TEXT).toContain('--region')
      expect(HELP_TEXT).toContain('--max-results')
      expect(HELP_TEXT).toContain('--max-messages')
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

  describe('parseArgs', () => {
    it('parses analyze command with input', () => {
      const args = parseArgs(['analyze', 'chat.txt'], false)
      expect(args.command).toBe('analyze')
      expect(args.input).toBe('chat.txt')
    })

    it('parses preview command with input', () => {
      const args = parseArgs(['preview', 'chat.zip'], false)
      expect(args.command).toBe('preview')
      expect(args.input).toBe('chat.zip')
    })

    it('parses scan command with input', () => {
      const args = parseArgs(['scan', 'chat.zip'], false)
      expect(args.command).toBe('scan')
      expect(args.input).toBe('chat.zip')
    })

    it('parses output-dir option', () => {
      const args = parseArgs(['analyze', 'chat.txt', '--output-dir', './results'], false)
      expect(args.outputDir).toBe('./results')
    })

    it('parses short flags', () => {
      const args = parseArgs(['analyze', 'chat.txt', '-o', './out', '-r', 'NZ', '-q'], false)
      expect(args.outputDir).toBe('./out')
      expect(args.region).toBe('NZ')
      expect(args.quiet).toBe(true)
    })

    it('parses format option', () => {
      const args = parseArgs(['analyze', 'chat.txt', '-f', 'csv,map'], false)
      expect(args.formats).toEqual(['csv', 'map'])
    })

    it('parses boolean flags', () => {
      const args = parseArgs(
        ['analyze', 'chat.txt', '--activities-only', '--skip-geocoding', '--dry-run', '--verbose'],
        false
      )
      expect(args.activitiesOnly).toBe(true)
      expect(args.skipGeocoding).toBe(true)
      expect(args.dryRun).toBe(true)
      expect(args.verbose).toBe(true)
    })

    it('uses default values when options not provided', () => {
      const args = parseArgs(['analyze', 'chat.txt'], false)
      expect(args.outputDir).toBe('./chat-to-map/output')
      expect(args.formats).toEqual(['csv', 'excel', 'json', 'map', 'pdf'])
      expect(args.minConfidence).toBe(0.5)
      expect(args.maxResults).toBe(10)
      expect(args.maxMessages).toBeUndefined()
      expect(args.activitiesOnly).toBe(false)
      expect(args.skipGeocoding).toBe(false)
      expect(args.quiet).toBe(false)
      expect(args.verbose).toBe(false)
      expect(args.dryRun).toBe(false)
    })

    it('parses max-results option with --max-results', () => {
      const args = parseArgs(['preview', 'chat.txt', '--max-results', '5'], false)
      expect(args.maxResults).toBe(5)
    })

    it('parses max-results option with -n short flag', () => {
      const args = parseArgs(['scan', 'chat.txt', '-n', '20'], false)
      expect(args.maxResults).toBe(20)
    })

    it('parses max-messages option with --max-messages', () => {
      const args = parseArgs(['analyze', 'chat.txt', '--max-messages', '100'], false)
      expect(args.maxMessages).toBe(100)
    })

    it('parses max-messages option with -m short flag', () => {
      const args = parseArgs(['preview', 'chat.txt', '-m', '50'], false)
      expect(args.maxMessages).toBe(50)
    })

    it('parses min-confidence option', () => {
      const args = parseArgs(['analyze', 'chat.txt', '--min-confidence', '0.75'], false)
      expect(args.minConfidence).toBe(0.75)
    })

    it('parses candidates command with input', () => {
      const args = parseArgs(['candidates', 'chat.txt'], false)
      expect(args.command).toBe('candidates')
      expect(args.input).toBe('chat.txt')
    })

    it('parses --method option with valid values', () => {
      expect(parseArgs(['candidates', 'chat.txt', '--method', 'heuristics'], false).method).toBe(
        'heuristics'
      )
      expect(parseArgs(['candidates', 'chat.txt', '--method', 'embeddings'], false).method).toBe(
        'embeddings'
      )
      expect(parseArgs(['candidates', 'chat.txt', '--method', 'both'], false).method).toBe('both')
    })

    it('defaults --method to "both"', () => {
      const args = parseArgs(['candidates', 'chat.txt'], false)
      expect(args.method).toBe('both')
    })

    it('falls back to "both" for invalid --method values', () => {
      const args = parseArgs(['candidates', 'chat.txt', '--method', 'invalid'], false)
      expect(args.method).toBe('both')
    })

    it('parses --json option', () => {
      const args = parseArgs(['candidates', 'chat.txt', '--json', 'output.json'], false)
      expect(args.jsonOutput).toBe('output.json')
    })

    it('defaults --json to undefined', () => {
      const args = parseArgs(['candidates', 'chat.txt'], false)
      expect(args.jsonOutput).toBeUndefined()
    })
  })
})
