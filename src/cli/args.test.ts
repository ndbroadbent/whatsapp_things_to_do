import { describe, expect, it } from 'vitest'
import { parseArgs } from './args'

describe('CLI Args', () => {
  describe('parseArgs', () => {
    it('parses analyze command with input', () => {
      const args = parseArgs(['analyze', 'chat.txt', '-c', 'NZ'], false)
      expect(args.command).toBe('analyze')
      expect(args.input).toBe('chat.txt')
    })

    it('parses preview command with input', () => {
      const args = parseArgs(['preview', 'chat.zip', '-c', 'NZ'], false)
      expect(args.command).toBe('preview')
      expect(args.input).toBe('chat.zip')
    })

    it('parses scan command with input', () => {
      const args = parseArgs(['scan', 'chat.zip'], false)
      expect(args.command).toBe('scan')
      expect(args.input).toBe('chat.zip')
    })

    it('parses output-dir option for analyze', () => {
      const args = parseArgs(
        ['analyze', 'chat.txt', '-c', 'NZ', '--output-dir', './results'],
        false
      )
      expect(args.outputDir).toBe('./results')
    })

    it('parses short flags for analyze', () => {
      const args = parseArgs(['analyze', 'chat.txt', '-c', 'NZ', '-o', './out', '-q'], false)
      expect(args.outputDir).toBe('./out')
      expect(args.quiet).toBe(true)
    })

    it('parses format option for analyze', () => {
      const args = parseArgs(['analyze', 'chat.txt', '-c', 'NZ', '-f', 'csv,map'], false)
      expect(args.formats).toEqual(['csv', 'map'])
    })

    it('parses boolean flags for analyze', () => {
      const args = parseArgs(
        ['analyze', 'chat.txt', '-c', 'NZ', '--skip-place-lookup', '--dry-run', '--verbose'],
        false
      )
      expect(args.skipPlaceLookup).toBe(true)
      expect(args.dryRun).toBe(true)
      expect(args.verbose).toBe(true)
    })

    it('uses default values when options not provided', () => {
      const args = parseArgs(['analyze', 'chat.txt', '-c', 'NZ'], false)
      expect(args.outputDir).toBe('./chat-to-map/output')
      expect(args.formats).toEqual(['csv', 'excel', 'json', 'map', 'pdf'])
      expect(args.minConfidence).toBe(0.5)
      expect(args.maxResults).toBe(10)
      expect(args.maxMessages).toBeUndefined()
      expect(args.skipPlaceLookup).toBe(false)
      expect(args.quiet).toBe(false)
      expect(args.verbose).toBe(false)
      expect(args.dryRun).toBe(false)
    })

    it('parses max-results option with --max-results', () => {
      const args = parseArgs(['preview', 'chat.txt', '-c', 'NZ', '--max-results', '5'], false)
      expect(args.maxResults).toBe(5)
    })

    it('parses max-results option with -n short flag', () => {
      const args = parseArgs(['scan', 'chat.txt', '-n', '20'], false)
      expect(args.maxResults).toBe(20)
    })

    it('parses max-messages option with --max-messages', () => {
      const args = parseArgs(['analyze', 'chat.txt', '-c', 'NZ', '--max-messages', '100'], false)
      expect(args.maxMessages).toBe(100)
    })

    it('parses max-messages option with -m short flag', () => {
      const args = parseArgs(['preview', 'chat.txt', '-c', 'NZ', '-m', '50'], false)
      expect(args.maxMessages).toBe(50)
    })

    it('parses min-confidence option for analyze', () => {
      const args = parseArgs(['analyze', 'chat.txt', '-c', 'NZ', '--min-confidence', '0.75'], false)
      expect(args.minConfidence).toBe(0.75)
    })

    it('parses filter command with input', () => {
      const args = parseArgs(['filter', 'chat.txt'], false)
      expect(args.command).toBe('filter')
      expect(args.input).toBe('chat.txt')
    })

    it('parses --method option with valid values', () => {
      expect(parseArgs(['filter', 'chat.txt', '--method', 'heuristics'], false).method).toBe(
        'heuristics'
      )
      expect(parseArgs(['filter', 'chat.txt', '--method', 'embeddings'], false).method).toBe(
        'embeddings'
      )
      expect(parseArgs(['filter', 'chat.txt', '--method', 'both'], false).method).toBe('both')
    })

    it('defaults --method to "both"', () => {
      const args = parseArgs(['filter', 'chat.txt'], false)
      expect(args.method).toBe('both')
    })

    it('falls back to "both" for invalid --method values', () => {
      const args = parseArgs(['filter', 'chat.txt', '--method', 'invalid'], false)
      expect(args.method).toBe('both')
    })

    it('parses --json option', () => {
      const args = parseArgs(['filter', 'chat.txt', '--json', 'output.json'], false)
      expect(args.jsonOutput).toBe('output.json')
    })

    it('defaults --json to undefined', () => {
      const args = parseArgs(['filter', 'chat.txt'], false)
      expect(args.jsonOutput).toBeUndefined()
    })

    it('parses --home-country option', () => {
      const args = parseArgs(['preview', 'chat.txt', '-c', 'New Zealand'], false)
      expect(args.homeCountry).toBe('New Zealand')
    })

    it('parses --timezone option', () => {
      const args = parseArgs(
        ['preview', 'chat.txt', '-c', 'NZ', '--timezone', 'Pacific/Auckland'],
        false
      )
      expect(args.timezone).toBe('Pacific/Auckland')
    })

    it('leaves timezone undefined when not provided', () => {
      const args = parseArgs(['preview', 'chat.txt', '-c', 'NZ'], false)
      expect(args.timezone).toBeUndefined()
    })

    it('parses parse command with input', () => {
      const args = parseArgs(['parse', 'chat.zip'], false)
      expect(args.command).toBe('parse')
      expect(args.input).toBe('chat.zip')
    })

    it('parses parse command with directory input', () => {
      const args = parseArgs(['parse', './imessage-export/'], false)
      expect(args.command).toBe('parse')
      expect(args.input).toBe('./imessage-export/')
    })

    it('parses parse command with verbose flag', () => {
      const args = parseArgs(['parse', 'chat.zip', '-v'], false)
      expect(args.command).toBe('parse')
      expect(args.verbose).toBe(true)
    })

    it('parses parse command with quiet flag', () => {
      const args = parseArgs(['parse', 'chat.zip', '-q'], false)
      expect(args.command).toBe('parse')
      expect(args.quiet).toBe(true)
    })
  })
})
