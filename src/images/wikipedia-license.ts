/**
 * Wikipedia/Wikimedia License Filtering
 *
 * Filters Wikipedia images by license to ensure only CC/PD licensed
 * images are used. This is critical for legal compliance.
 *
 * Allowed licenses:
 * - CC-BY-SA (any version) - Creative Commons Attribution-ShareAlike
 * - CC-BY (not NC or ND) - Creative Commons Attribution
 * - CC0 - Public Domain Dedication
 * - Public Domain - Various PD licenses
 * - GFDL - GNU Free Documentation License
 *
 * Blocked licenses:
 * - Fair Use - Only valid on Wikipedia, not for commercial use
 * - Non-Commercial (NC) - Cannot use commercially
 * - No Derivatives (ND) - Cannot modify
 * - Unknown - Cannot verify rights
 */

/**
 * Result of license check.
 */
export interface LicenseCheckResult {
  /** Whether the license allows commercial use */
  readonly allowed: boolean
  /** Reason for blocking (if not allowed) */
  readonly reason?: string
  /** Whether to warn about this license (unrecognized) */
  readonly warn?: boolean
}

/**
 * Allowed license patterns for commercial use.
 * See: https://en.wikipedia.org/wiki/Wikipedia:Database_download
 */
const ALLOWED_LICENSE_PATTERNS: readonly RegExp[] = [
  /^cc[- ]?by[- ]?sa/i, // CC-BY-SA (any version)
  /^cc[- ]?by(?![- ]?n)/i, // CC-BY (but not CC-BY-NC or CC-BY-ND)
  /^cc[- ]?0/i, // CC0
  /^cc0/i, // CC0 alternate
  /^public[- ]?domain/i, // Public Domain
  /^pd[- ]/i, // PD-old, PD-author, PD-US, etc.
  /^pd$/i, // Just "PD"
  /^gfdl/i, // GNU Free Documentation License
  /^attribution$/i // Generic attribution (equivalent to CC-BY)
]

/**
 * Explicitly blocked license patterns.
 */
const BLOCKED_LICENSE_PATTERNS: readonly RegExp[] = [
  /^unknown$/i, // Unknown license - can't verify rights
  /fair[- ]?use/i, // Fair use - NOT safe outside Wikipedia
  /non[- ]?commercial/i, // Non-commercial
  /\bnc\b/i, // CC-BY-NC
  /no[- ]?deriv/i, // No derivatives
  /\bnd\b/i // CC-BY-ND
]

/**
 * Check if a Wikipedia image license allows commercial use.
 *
 * @param license - The license string from Wikipedia metadata
 * @returns Check result with allowed status and reason
 */
export function isLicenseAllowed(license: string): LicenseCheckResult {
  if (!license) {
    return { allowed: false, reason: 'No license', warn: true }
  }

  // Check blocked patterns first
  for (const pattern of BLOCKED_LICENSE_PATTERNS) {
    if (pattern.test(license)) {
      return { allowed: false, reason: `Blocked: ${license}` }
    }
  }

  // Check allowed patterns
  for (const pattern of ALLOWED_LICENSE_PATTERNS) {
    if (pattern.test(license)) {
      return { allowed: true }
    }
  }

  // Unrecognized - block but warn so we can review
  return { allowed: false, reason: `Unrecognized: ${license}`, warn: true }
}

/**
 * Check multiple licenses (some images have dual licensing).
 * Returns true if ANY license is allowed.
 */
export function hasAllowedLicense(licenses: readonly string[]): LicenseCheckResult {
  if (licenses.length === 0) {
    return { allowed: false, reason: 'No licenses', warn: true }
  }

  const results = licenses.map(isLicenseAllowed)

  // If any license is allowed, the image is allowed
  const allowed = results.find((r) => r.allowed)
  if (allowed) {
    return { allowed: true }
  }

  // Return the first blocked result (most specific reason)
  const blocked = results.find((r) => !r.allowed && r.reason)
  return blocked ?? { allowed: false, reason: 'All licenses blocked' }
}

/**
 * Normalize license string for consistent matching.
 */
export function normalizeLicense(license: string): string {
  return license
    .trim()
    .toLowerCase()
    .replace(/version\s*(\d)/gi, '$1') // "version 4" → "4" (before separator normalization)
    .replace(/[_\s]+/g, '-') // Normalize separators
}
