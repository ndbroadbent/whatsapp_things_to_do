/**
 * Type declarations for wordpos package.
 * WordPOS uses WordNet for part-of-speech tagging.
 */

declare module 'wordpos' {
  interface WordPOSOptions {
    dictPath?: string
    profile?: boolean
  }

  interface WordNetResult {
    synsetOffset: number
    lexFilenum: number
    pos: string
    wCnt: number
    lemma: string
    synonyms: string[]
    gloss: string
  }

  export default class WordPOS {
    constructor(options?: WordPOSOptions)

    isNoun(word: string): Promise<boolean>
    isVerb(word: string): Promise<boolean>
    isAdjective(word: string): Promise<boolean>
    isAdverb(word: string): Promise<boolean>

    getNouns(text: string): Promise<string[]>
    getVerbs(text: string): Promise<string[]>
    getAdjectives(text: string): Promise<string[]>
    getAdverbs(text: string): Promise<string[]>

    lookup(word: string): Promise<WordNetResult[]>
    lookupNoun(word: string): Promise<WordNetResult[]>
    lookupVerb(word: string): Promise<WordNetResult[]>
  }
}
