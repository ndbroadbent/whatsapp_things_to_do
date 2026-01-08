/**
 * User Settings
 *
 * Resolves user context (home country, timezone) with automatic detection and caching.
 * Settings are stored in ~/.config/chat-to-map/config.json (XDG standard).
 */

import { existsSync, readlinkSync } from 'node:fs'
import { httpFetch } from '../http'
import { type Config, loadConfig, migrateFromUserSettings, saveConfig } from './config'
import type { Logger } from './logger'

interface GeoIpResponse {
  country_name?: string
}

interface ResolveOptions {
  /** CLI arg for home country */
  argsHomeCountry?: string | undefined
  /** CLI arg for timezone */
  argsTimezone?: string | undefined
  /** Custom config file path */
  configFile?: string | undefined
  /** Custom cache directory (for migration only) */
  cacheDir?: string | undefined
  /** Logger for output */
  logger?: Logger | undefined
}

interface ResolvedUserContext {
  homeCountry: string
  timezone: string
}

const GEOIP_APIS = [
  {
    url: 'https://ipapi.co/json/',
    parseCountry: (data: unknown) => (data as GeoIpResponse).country_name
  },
  {
    url: 'https://ipinfo.io/country',
    parseCountry: (data: unknown) => (data as string).trim()
  }
]
const LOCALTIME_PATH = '/etc/localtime'

/**
 * Get system timezone from /etc/localtime symlink.
 * Works on macOS and Linux.
 */
function getSystemTimezone(): string | undefined {
  try {
    if (!existsSync(LOCALTIME_PATH)) {
      return undefined
    }
    const target = readlinkSync(LOCALTIME_PATH)
    // Extract timezone from path like /var/db/timezone/zoneinfo/Pacific/Auckland
    // or /usr/share/zoneinfo/Pacific/Auckland
    const match = target.match(/zoneinfo\/(.+)$/)
    return match?.[1]
  } catch {
    return undefined
  }
}

/**
 * Fetch country from geoip APIs (tries multiple with fallback).
 */
async function fetchGeoIp(logger?: Logger): Promise<string | null> {
  logger?.log('\n🌐 Detecting location from IP...')

  for (const api of GEOIP_APIS) {
    try {
      const response = await httpFetch(api.url)
      if (!response.ok) continue

      const isJson = api.url.includes('/json')
      const data = isJson ? await response.json() : await response.text()
      const country = api.parseCountry(data)

      if (country) {
        logger?.log(`   Detected country: ${country}`)
        return country
      }
    } catch {
      // Try next API
    }
  }

  logger?.log('   Failed to detect location')
  return null
}

/**
 * Resolve user context (home country, timezone) with automatic detection and caching.
 *
 * Priority for both home country and timezone:
 * 1. CLI arg (--home-country, --timezone)
 * 2. Environment variable (HOME_COUNTRY, TIMEZONE)
 * 3. Config file value from ~/.config/chat-to-map/config.json
 * 4. Auto-detect (geoip for country, /etc/localtime for timezone)
 *
 * Throws if home country cannot be determined from any source.
 */
export async function resolveUserContext(
  options: ResolveOptions = {}
): Promise<ResolvedUserContext> {
  const { argsHomeCountry, argsTimezone, configFile, cacheDir, logger } = options

  // Attempt migration from old user-settings.json on first access
  const migrated = await migrateFromUserSettings(cacheDir, configFile)
  if (migrated) {
    logger?.log('\n📍 Migrated settings from old user-settings.json location')
  }

  // Resolve home country
  let homeCountry: string | undefined
  let countrySource: string | undefined

  if (argsHomeCountry) {
    homeCountry = argsHomeCountry
    countrySource = '--home-country'
  } else if (process.env.HOME_COUNTRY) {
    homeCountry = process.env.HOME_COUNTRY
    countrySource = 'HOME_COUNTRY env'
  }

  // Resolve timezone
  let timezone: string | undefined
  let timezoneSource: string | undefined

  if (argsTimezone) {
    timezone = argsTimezone
    timezoneSource = '--timezone'
  } else if (process.env.TIMEZONE) {
    timezone = process.env.TIMEZONE
    timezoneSource = 'TIMEZONE env'
  }

  // Check config file for any missing values
  const config = await loadConfig(configFile)
  if (config) {
    if (!homeCountry && config.homeCountry) {
      homeCountry = config.homeCountry
      countrySource = 'config'
    }
    if (!timezone && config.timezone) {
      timezone = config.timezone
      timezoneSource = 'config'
    }
  }

  // Auto-detect missing values
  let needsSave = false
  const updates: Partial<Config> = {}

  if (!homeCountry) {
    const detected = await fetchGeoIp(logger)
    if (detected) {
      homeCountry = detected
      countrySource = 'detected from IP'
      updates.homeCountry = detected
      needsSave = true
    }
  }

  if (!timezone) {
    const systemTz = getSystemTimezone()
    if (systemTz) {
      timezone = systemTz
      timezoneSource = 'system'
      updates.timezone = systemTz
      needsSave = true
    }
  }

  // Save if we detected new values
  if (needsSave && homeCountry) {
    await saveConfig({ ...config, ...updates }, configFile)
  }

  if (!homeCountry) {
    throw new Error(
      'Could not determine home country. Use --home-country or set HOME_COUNTRY env var.'
    )
  }

  if (!timezone) {
    throw new Error('Could not determine timezone. Use --timezone or set TIMEZONE env var.')
  }

  // Log final resolved values
  logger?.log(`\n📍 Home country: ${homeCountry}${countrySource ? ` (${countrySource})` : ''}`)
  logger?.log(`   Timezone: ${timezone}${timezoneSource ? ` (${timezoneSource})` : ''}`)

  return { homeCountry, timezone }
}
