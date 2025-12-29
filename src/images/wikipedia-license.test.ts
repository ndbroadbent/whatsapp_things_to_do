import { describe, expect, it } from 'vitest'
import { hasAllowedLicense, isLicenseAllowed, normalizeLicense } from './wikipedia-license'

describe('isLicenseAllowed', () => {
  describe('allowed licenses', () => {
    it.each([
      'CC-BY-SA',
      'CC BY SA 4.0',
      'cc-by-sa-3.0',
      'CC BY SA',
      'CC-BY',
      'CC BY 4.0',
      'cc-by-2.0',
      'CC0',
      'cc0',
      'CC 0',
      'cc-0',
      'Public Domain',
      'public domain',
      'PD',
      'PD-old',
      'PD-US',
      'PD-author',
      'GFDL',
      'gfdl-1.2',
      'Attribution'
    ])('allows %s', (license) => {
      expect(isLicenseAllowed(license)).toEqual({ allowed: true })
    })
  })

  describe('blocked licenses', () => {
    it.each([
      ['Unknown', 'Blocked: Unknown'],
      ['Fair Use', 'Blocked: Fair Use'],
      ['fair-use', 'Blocked: fair-use'],
      ['Non-Commercial', 'Blocked: Non-Commercial'],
      ['CC-BY-NC', 'Blocked: CC-BY-NC'],
      ['CC-BY-NC-SA', 'Blocked: CC-BY-NC-SA'],
      ['No Derivatives', 'Blocked: No Derivatives'],
      ['CC-BY-ND', 'Blocked: CC-BY-ND']
    ])('blocks %s with reason "%s"', (license, expectedReason) => {
      const result = isLicenseAllowed(license)
      expect(result.allowed).toBe(false)
      expect(result.reason).toBe(expectedReason)
    })
  })

  describe('unrecognized licenses', () => {
    it('blocks unrecognized license with warning', () => {
      const result = isLicenseAllowed('Some Random License')
      expect(result.allowed).toBe(false)
      expect(result.reason).toBe('Unrecognized: Some Random License')
      expect(result.warn).toBe(true)
    })

    it('blocks empty license with warning', () => {
      const result = isLicenseAllowed('')
      expect(result.allowed).toBe(false)
      expect(result.reason).toBe('No license')
      expect(result.warn).toBe(true)
    })
  })

  describe('edge cases', () => {
    it('blocks CC-BY-NC even when combined with other text', () => {
      expect(isLicenseAllowed('Some CC-BY-NC License').allowed).toBe(false)
    })

    it('allows CC-BY even when version is included', () => {
      expect(isLicenseAllowed('CC-BY-4.0').allowed).toBe(true)
    })

    it('does not confuse CC-BY-SA with CC-BY-NC-SA', () => {
      expect(isLicenseAllowed('CC-BY-SA-4.0').allowed).toBe(true)
      expect(isLicenseAllowed('CC-BY-NC-SA-4.0').allowed).toBe(false)
    })
  })
})

describe('hasAllowedLicense', () => {
  it('returns true if any license is allowed', () => {
    const result = hasAllowedLicense(['CC-BY-NC', 'CC-BY-SA'])
    expect(result.allowed).toBe(true)
  })

  it('returns false if all licenses are blocked', () => {
    const result = hasAllowedLicense(['CC-BY-NC', 'Fair Use'])
    expect(result.allowed).toBe(false)
  })

  it('handles empty array', () => {
    const result = hasAllowedLicense([])
    expect(result.allowed).toBe(false)
    expect(result.reason).toBe('No licenses')
    expect(result.warn).toBe(true)
  })

  it('handles single allowed license', () => {
    const result = hasAllowedLicense(['CC0'])
    expect(result.allowed).toBe(true)
  })

  it('handles single blocked license', () => {
    const result = hasAllowedLicense(['Unknown'])
    expect(result.allowed).toBe(false)
    expect(result.reason).toBe('Blocked: Unknown')
  })
})

describe('normalizeLicense', () => {
  it('converts to lowercase', () => {
    expect(normalizeLicense('CC-BY-SA')).toBe('cc-by-sa')
  })

  it('replaces spaces with hyphens', () => {
    expect(normalizeLicense('CC BY SA')).toBe('cc-by-sa')
  })

  it('replaces underscores with hyphens', () => {
    expect(normalizeLicense('CC_BY_SA')).toBe('cc-by-sa')
  })

  it('normalizes version text', () => {
    expect(normalizeLicense('CC BY SA version 4')).toBe('cc-by-sa-4')
  })

  it('trims whitespace', () => {
    expect(normalizeLicense('  CC-BY-SA  ')).toBe('cc-by-sa')
  })
})
