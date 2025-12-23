/**
 * Extraction Patterns
 *
 * Regex patterns for identifying activity candidates.
 * Based on patterns proven to work in the Python prototype.
 */

import type { QueryType } from '../../types'

interface ActivityPattern {
  readonly name: string
  readonly pattern: RegExp
  readonly confidence: number
  readonly description: string
  /** Whether this pattern indicates a suggestion or agreement. */
  readonly candidateType: QueryType
}

/**
 * High-confidence patterns (0.85-0.95) - strong activity indicators
 */
const HIGH_CONFIDENCE_PATTERNS: readonly ActivityPattern[] = [
  {
    name: 'bucket_list',
    pattern: /\bbucket ?list\b/i,
    confidence: 0.95,
    description: 'Bucket list mention',
    candidateType: 'suggestion'
  },
  {
    name: 'we_should',
    pattern: /\bwe should\b(?!\s+(?:not|stop|avoid|have|be\s+careful))/i,
    confidence: 0.9,
    description: 'We should...',
    candidateType: 'suggestion'
  },
  {
    name: 'must_visit',
    pattern: /\b(?:must visit|must go|have to visit)\b/i,
    confidence: 0.9,
    description: 'Must visit/go...',
    candidateType: 'suggestion'
  },
  {
    name: 'lets_go',
    pattern: /\blet'?s go\b(?!\s+(?:home|back|now|already))/i,
    confidence: 0.85,
    description: "Let's go...",
    candidateType: 'suggestion'
  },
  {
    name: 'lets_try',
    pattern: /\blet'?s try\b/i,
    confidence: 0.85,
    description: "Let's try...",
    candidateType: 'suggestion'
  },
  {
    name: 'wanna_go',
    pattern: /\b(?:wanna|want to) go\b/i,
    confidence: 0.85,
    description: 'Wanna/want to go...',
    candidateType: 'suggestion'
  }
]

/**
 * Medium-confidence patterns (0.65-0.80) - moderate activity indicators
 */
const MEDIUM_CONFIDENCE_PATTERNS: readonly ActivityPattern[] = [
  {
    name: 'should_we',
    pattern: /\bshould we\b(?!\s+(?:not|stop))/i,
    confidence: 0.8,
    description: 'Should we...?',
    candidateType: 'suggestion'
  },
  {
    name: 'lets_do',
    pattern: /\blet'?s do\b/i,
    confidence: 0.8,
    description: "Let's do...",
    candidateType: 'suggestion'
  },
  {
    name: 'can_we',
    pattern: /\bcan we\b.*?\b(?:go|try|do|visit|see)\b/i,
    confidence: 0.75,
    description: 'Can we go/try/do...?',
    candidateType: 'suggestion'
  },
  {
    name: 'would_be_fun',
    // Must have activity after "would be fun" - e.g. "would be fun to go hiking"
    // Excludes standalone agreements like "that would be awesome!"
    pattern: /\bwould be (?:fun|cool|nice|awesome|amazing)\b.*?\b(?:to|if)\b/i,
    confidence: 0.75,
    description: 'Would be fun/cool/nice to...',
    candidateType: 'suggestion'
  },
  {
    name: 'we_could',
    pattern: /\bwe could\b(?!\s+(?:not|never))/i,
    confidence: 0.7,
    description: 'We could...',
    candidateType: 'suggestion'
  },
  {
    name: 'one_day',
    pattern: /\bone day\b.*?\b(?:go|visit|try|do|see)\b/i,
    confidence: 0.7,
    description: 'One day we should...',
    candidateType: 'suggestion'
  },
  {
    name: 'next_time',
    pattern: /\bnext time\b.*?\b(?:go|visit|try|do|see|should)\b/i,
    confidence: 0.7,
    description: 'Next time...',
    candidateType: 'suggestion'
  },
  {
    name: 'come_back',
    pattern: /\bcome back\b.*?\b(?:and|to)\b/i,
    confidence: 0.65,
    description: 'Come back to...',
    candidateType: 'suggestion'
  },
  {
    name: 'would_you_like',
    pattern: /\bwould you like to\b/i,
    confidence: 0.8,
    description: 'Would you like to...?',
    candidateType: 'suggestion'
  },
  {
    name: 'do_you_want',
    pattern: /\bdo you (?:want|wanna)\b/i,
    confidence: 0.8,
    description: 'Do you want/wanna...?',
    candidateType: 'suggestion'
  }
]

/**
 * Lower-confidence patterns (0.50-0.65) - weaker activity indicators
 */
const LOWER_CONFIDENCE_PATTERNS: readonly ActivityPattern[] = [
  {
    name: 'i_want_to',
    pattern: /\bi want to\b(?!\s+(?:die|cry|leave|sleep|quit|go home))/i,
    confidence: 0.6,
    description: 'I want to...',
    candidateType: 'suggestion'
  },
  {
    name: 'we_need_to',
    pattern: /\bwe need to\b(?!\s+(?:stop|avoid|talk|figure|think|discuss))/i,
    confidence: 0.6,
    description: 'We need to...',
    candidateType: 'suggestion'
  },
  {
    name: 'looks_fun',
    pattern: /\b(?:looks?|sounds?) (?:fun|amazing|awesome|incredible|beautiful|great|good)\b/i,
    confidence: 0.5,
    description: 'Looks/sounds fun/amazing...',
    candidateType: 'agreement'
  },
  {
    name: 'im_keen',
    pattern: /\b(?:i'?m|we'?re|i'?d be|we'?d be) (?:keen|down)\b/i,
    confidence: 0.5,
    description: "I'm keen/down",
    candidateType: 'agreement'
  },
  {
    name: 'lets_book',
    pattern: /\blet'?s book (?:it|that|this)\b/i,
    confidence: 0.5,
    description: "Let's book it",
    candidateType: 'agreement'
  },
  {
    name: 'check_out',
    pattern: /\bcheck (?:this|it) out\b/i,
    confidence: 0.5,
    description: 'Check this out...',
    candidateType: 'suggestion'
  }
]

/**
 * All activity patterns combined, ordered by confidence (highest first)
 */
export const ACTIVITY_PATTERNS: readonly ActivityPattern[] = [
  ...HIGH_CONFIDENCE_PATTERNS,
  ...MEDIUM_CONFIDENCE_PATTERNS,
  ...LOWER_CONFIDENCE_PATTERNS
]

/**
 * Activity/place keywords that boost confidence when combined with activity patterns
 */
export const ACTIVITY_KEYWORDS: readonly RegExp[] = [
  // Food & drink
  /\b(?:restaurant|cafe|coffee|bar|pub|brewery|winery|vineyard|brunch|dinner)\b/i,
  // Water activities
  /\b(?:beach|lake|river|waterfall|hot springs?|pool|swim|kayak|paddleboard|surf|dive|snorkel)\b/i,
  // Hiking & nature
  /\b(?:hike|walk|trail|track|trek|mountain|hill|volcano|summit|peak)\b/i,
  // Parks & gardens
  /\b(?:park|garden|reserve|sanctuary|forest|bush|national park)\b/i,
  // Culture & entertainment
  /\b(?:museum|gallery|exhibition|art|concert|show|theatre|movie|cinema|festival|event)\b/i,
  // Markets
  /\b(?:market|farmers market|night market)\b/i,
  // Accommodation
  /\b(?:hotel|airbnb|bach|accommodation|camping|glamping|resort|lodge)\b/i,
  // Adventure
  /\b(?:ski|snowboard|bungy|bungee|skydive|zipline|jet boat|luge|zorb)\b/i,
  // Travel
  /\b(?:tour|cruise|trip|getaway|holiday|vacation|road trip|roadie)\b/i
]

/**
 * Exclusion patterns - things that look like activities but aren't fun activities
 */
export const EXCLUSION_PATTERNS: readonly RegExp[] = [
  // Work & business
  /\b(?:work|job|meeting|email|call|pay|bill|tax|deadline|project|boss|office)\b/i,
  // Medical & appointments
  /\b(?:doctor|dentist|hospital|appointment|vet|mechanic|optometrist|physio)\b/i,
  // Chores & errands
  /\b(?:groceries|shopping|buy|sell|order|clean|cleaning|laundry|dishes|vacuum|chores)\b/i,
  // Negative constructs
  /\b(?:should not|shouldn't|can't|cannot|won't|wouldn't|don't)\b/i,
  // Past tense indicators
  /\b(?:we went|we did|we visited|we tried|already been|been there)\b/i
]

/**
 * URL confidence mapping by type
 */
export const URL_CONFIDENCE_MAP: Record<string, number> = {
  google_maps: 0.7,
  airbnb: 0.8,
  booking: 0.8,
  tripadvisor: 0.75,
  event: 0.85,
  facebook_group: 0.75,
  tiktok: 0.5,
  youtube: 0.4,
  instagram: 0.35,
  x: 0.35,
  facebook: 0.4,
  website: 0.3
}
