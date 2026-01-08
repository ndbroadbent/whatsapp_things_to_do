/**
 * Tests for CLI Configuration
 */

import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  formatConfigValue,
  getConfigPath,
  getValidConfigKeys,
  isValidConfigKey,
  loadConfig,
  migrateFromUserSettings,
  parseConfigValue,
  saveConfig,
  setConfigValue,
  unsetConfigValue
} from './config'

describe('config', () => {
  let tempDir: string
  let configPath: string
  let originalEnv: string | undefined

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'chat-to-map-config-test-'))
    configPath = join(tempDir, 'config.json')
    originalEnv = process.env.CHAT_TO_MAP_CONFIG
    delete process.env.CHAT_TO_MAP_CONFIG
  })

  afterEach(() => {
    if (tempDir && existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true })
    }
    if (originalEnv !== undefined) {
      process.env.CHAT_TO_MAP_CONFIG = originalEnv
    } else {
      delete process.env.CHAT_TO_MAP_CONFIG
    }
  })

  describe('getConfigPath', () => {
    it('returns explicit config file path when provided', () => {
      expect(getConfigPath('/custom/path/config.json')).toBe('/custom/path/config.json')
    })

    it('returns env var path when set', () => {
      process.env.CHAT_TO_MAP_CONFIG = '/env/config.json'
      expect(getConfigPath()).toBe('/env/config.json')
    })

    it('returns default XDG path when no override', () => {
      const path = getConfigPath()
      expect(path).toContain('.config/chat-to-map/config.json')
    })

    it('explicit path takes precedence over env var', () => {
      process.env.CHAT_TO_MAP_CONFIG = '/env/config.json'
      expect(getConfigPath('/explicit/config.json')).toBe('/explicit/config.json')
    })
  })

  describe('loadConfig', () => {
    it('returns null for non-existent file', async () => {
      const config = await loadConfig(configPath)
      expect(config).toBeNull()
    })

    it('loads valid config file', async () => {
      await writeFile(configPath, JSON.stringify({ homeCountry: 'New Zealand' }))
      const config = await loadConfig(configPath)
      expect(config).toEqual({ homeCountry: 'New Zealand' })
    })

    it('returns null for invalid JSON', async () => {
      await writeFile(configPath, 'not valid json')
      const config = await loadConfig(configPath)
      expect(config).toBeNull()
    })

    it('loads all config fields', async () => {
      const fullConfig = {
        homeCountry: 'New Zealand',
        timezone: 'Pacific/Auckland',
        fetchImages: true,
        cacheDir: '/custom/cache',
        outputDir: './output',
        formats: ['csv', 'map'],
        updatedAt: '2025-01-01T00:00:00.000Z'
      }
      await writeFile(configPath, JSON.stringify(fullConfig))
      const config = await loadConfig(configPath)
      expect(config).toEqual(fullConfig)
    })
  })

  describe('saveConfig', () => {
    it('saves config to file', async () => {
      await saveConfig({ homeCountry: 'New Zealand' }, configPath)
      const content = await readFile(configPath, 'utf-8')
      const saved = JSON.parse(content)
      expect(saved.homeCountry).toBe('New Zealand')
      expect(saved.updatedAt).toBeDefined()
    })

    it('creates parent directories', async () => {
      const nestedPath = join(tempDir, 'nested', 'dir', 'config.json')
      await saveConfig({ timezone: 'UTC' }, nestedPath)
      expect(existsSync(nestedPath)).toBe(true)
    })

    it('preserves existing fields when saving', async () => {
      await saveConfig({ homeCountry: 'NZ', timezone: 'Pacific/Auckland' }, configPath)
      const config = await loadConfig(configPath)
      expect(config?.homeCountry).toBe('NZ')
      expect(config?.timezone).toBe('Pacific/Auckland')
    })
  })

  describe('setConfigValue', () => {
    it('sets a new value in empty config', async () => {
      await setConfigValue('homeCountry', 'Australia', configPath)
      const config = await loadConfig(configPath)
      expect(config?.homeCountry).toBe('Australia')
    })

    it('updates an existing value', async () => {
      await saveConfig({ homeCountry: 'NZ' }, configPath)
      await setConfigValue('homeCountry', 'Australia', configPath)
      const config = await loadConfig(configPath)
      expect(config?.homeCountry).toBe('Australia')
    })

    it('preserves other values when setting', async () => {
      await saveConfig({ homeCountry: 'NZ', timezone: 'Pacific/Auckland' }, configPath)
      await setConfigValue('cacheDir', '/new/cache', configPath)
      const config = await loadConfig(configPath)
      expect(config?.homeCountry).toBe('NZ')
      expect(config?.timezone).toBe('Pacific/Auckland')
      expect(config?.cacheDir).toBe('/new/cache')
    })

    it('handles boolean values', async () => {
      await setConfigValue('fetchImages', true, configPath)
      const config = await loadConfig(configPath)
      expect(config?.fetchImages).toBe(true)
    })

    it('handles array values', async () => {
      await setConfigValue('formats', ['csv', 'json', 'map'], configPath)
      const config = await loadConfig(configPath)
      expect(config?.formats).toEqual(['csv', 'json', 'map'])
    })
  })

  describe('unsetConfigValue', () => {
    it('removes a value from config', async () => {
      await saveConfig({ homeCountry: 'NZ', timezone: 'Pacific/Auckland' }, configPath)
      await unsetConfigValue('homeCountry', configPath)
      const config = await loadConfig(configPath)
      expect(config?.homeCountry).toBeUndefined()
      expect(config?.timezone).toBe('Pacific/Auckland')
    })

    it('handles unsetting non-existent key', async () => {
      await saveConfig({ homeCountry: 'NZ' }, configPath)
      await unsetConfigValue('cacheDir', configPath)
      const config = await loadConfig(configPath)
      expect(config?.homeCountry).toBe('NZ')
    })

    it('creates config file if it does not exist', async () => {
      await unsetConfigValue('homeCountry', configPath)
      expect(existsSync(configPath)).toBe(true)
    })
  })

  describe('parseConfigValue', () => {
    it('parses string values', () => {
      expect(parseConfigValue('homeCountry', 'New Zealand')).toBe('New Zealand')
      expect(parseConfigValue('timezone', 'Pacific/Auckland')).toBe('Pacific/Auckland')
      expect(parseConfigValue('cacheDir', '/custom/cache')).toBe('/custom/cache')
      expect(parseConfigValue('outputDir', './output')).toBe('./output')
    })

    it('parses boolean values', () => {
      expect(parseConfigValue('fetchImages', 'true')).toBe(true)
      expect(parseConfigValue('fetchImages', '1')).toBe(true)
      expect(parseConfigValue('fetchImages', 'yes')).toBe(true)
      expect(parseConfigValue('fetchImages', 'false')).toBe(false)
      expect(parseConfigValue('fetchImages', '0')).toBe(false)
      expect(parseConfigValue('fetchImages', 'no')).toBe(false)
    })

    it('parses array values', () => {
      expect(parseConfigValue('formats', 'csv,json,map')).toEqual(['csv', 'json', 'map'])
      expect(parseConfigValue('formats', 'csv, json, map')).toEqual(['csv', 'json', 'map'])
      expect(parseConfigValue('formats', 'pdf')).toEqual(['pdf'])
    })
  })

  describe('formatConfigValue', () => {
    it('formats string values', () => {
      expect(formatConfigValue('New Zealand')).toBe('New Zealand')
    })

    it('formats boolean values', () => {
      expect(formatConfigValue(true)).toBe('true')
      expect(formatConfigValue(false)).toBe('false')
    })

    it('formats array values', () => {
      expect(formatConfigValue(['csv', 'json', 'map'])).toBe('csv,json,map')
    })
  })

  describe('isValidConfigKey', () => {
    it('returns true for valid keys', () => {
      expect(isValidConfigKey('homeCountry')).toBe(true)
      expect(isValidConfigKey('timezone')).toBe(true)
      expect(isValidConfigKey('cacheDir')).toBe(true)
      expect(isValidConfigKey('fetchImages')).toBe(true)
      expect(isValidConfigKey('outputDir')).toBe(true)
      expect(isValidConfigKey('formats')).toBe(true)
    })

    it('returns false for invalid keys', () => {
      expect(isValidConfigKey('invalid')).toBe(false)
      expect(isValidConfigKey('updatedAt')).toBe(false)
      expect(isValidConfigKey('')).toBe(false)
    })
  })

  describe('getValidConfigKeys', () => {
    it('returns all valid config keys', () => {
      const keys = getValidConfigKeys()
      expect(keys).toContain('homeCountry')
      expect(keys).toContain('timezone')
      expect(keys).toContain('cacheDir')
      expect(keys).toContain('fetchImages')
      expect(keys).toContain('outputDir')
      expect(keys).toContain('formats')
      expect(keys).not.toContain('updatedAt')
    })
  })

  describe('migrateFromUserSettings', () => {
    it('returns false when old settings file does not exist', async () => {
      const result = await migrateFromUserSettings(tempDir, configPath)
      expect(result).toBe(false)
    })

    it('migrates homeCountry from old settings', async () => {
      const oldPath = join(tempDir, 'user-settings.json')
      await writeFile(oldPath, JSON.stringify({ homeCountry: 'New Zealand' }))

      const result = await migrateFromUserSettings(tempDir, configPath)
      expect(result).toBe(true)

      const config = await loadConfig(configPath)
      expect(config?.homeCountry).toBe('New Zealand')
    })

    it('migrates timezone from old settings', async () => {
      const oldPath = join(tempDir, 'user-settings.json')
      await writeFile(oldPath, JSON.stringify({ timezone: 'Pacific/Auckland' }))

      const result = await migrateFromUserSettings(tempDir, configPath)
      expect(result).toBe(true)

      const config = await loadConfig(configPath)
      expect(config?.timezone).toBe('Pacific/Auckland')
    })

    it('migrates both homeCountry and timezone', async () => {
      const oldPath = join(tempDir, 'user-settings.json')
      await writeFile(
        oldPath,
        JSON.stringify({
          homeCountry: 'Australia',
          timezone: 'Australia/Sydney'
        })
      )

      const result = await migrateFromUserSettings(tempDir, configPath)
      expect(result).toBe(true)

      const config = await loadConfig(configPath)
      expect(config?.homeCountry).toBe('Australia')
      expect(config?.timezone).toBe('Australia/Sydney')
    })

    it('does not overwrite existing config values', async () => {
      const oldPath = join(tempDir, 'user-settings.json')
      await writeFile(
        oldPath,
        JSON.stringify({
          homeCountry: 'Old Country',
          timezone: 'Old/Timezone'
        })
      )
      await saveConfig({ homeCountry: 'New Country' }, configPath)

      const result = await migrateFromUserSettings(tempDir, configPath)
      expect(result).toBe(true) // timezone was migrated

      const config = await loadConfig(configPath)
      expect(config?.homeCountry).toBe('New Country') // preserved
      expect(config?.timezone).toBe('Old/Timezone') // migrated
    })

    it('returns false when nothing to migrate', async () => {
      const oldPath = join(tempDir, 'user-settings.json')
      await writeFile(oldPath, JSON.stringify({ homeCountry: 'NZ', timezone: 'Pacific/Auckland' }))
      await saveConfig({ homeCountry: 'NZ', timezone: 'Pacific/Auckland' }, configPath)

      const result = await migrateFromUserSettings(tempDir, configPath)
      expect(result).toBe(false)
    })

    it('handles invalid JSON in old settings', async () => {
      const oldPath = join(tempDir, 'user-settings.json')
      await writeFile(oldPath, 'not valid json')

      const result = await migrateFromUserSettings(tempDir, configPath)
      expect(result).toBe(false)
    })
  })
})
