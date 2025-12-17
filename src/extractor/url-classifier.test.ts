import { describe, expect, it } from 'vitest'
import { classifyUrl, extractGoogleMapsCoords, isActivityUrl } from './url-classifier.js'

describe('URL Classifier', () => {
  describe('classifyUrl', () => {
    it('classifies Google Maps URLs', () => {
      expect(classifyUrl('https://maps.google.com/maps?q=restaurant')).toBe('google_maps')
      expect(classifyUrl('https://www.google.com/maps/place/Rome')).toBe('google_maps')
      expect(classifyUrl('https://goo.gl/maps/abc123')).toBe('google_maps')
    })

    it('classifies TikTok URLs', () => {
      expect(classifyUrl('https://www.tiktok.com/@user/video/123')).toBe('tiktok')
      expect(classifyUrl('https://vt.tiktok.com/abc')).toBe('tiktok')
      expect(classifyUrl('https://vm.tiktok.com/abc')).toBe('tiktok')
    })

    it('classifies YouTube URLs', () => {
      expect(classifyUrl('https://www.youtube.com/watch?v=abc')).toBe('youtube')
      expect(classifyUrl('https://youtu.be/abc123')).toBe('youtube')
      expect(classifyUrl('https://music.youtube.com/watch?v=abc')).toBe('youtube')
    })

    it('classifies Instagram URLs', () => {
      expect(classifyUrl('https://www.instagram.com/p/abc123')).toBe('instagram')
      expect(classifyUrl('https://instagr.am/p/abc')).toBe('instagram')
    })

    it('classifies TripAdvisor URLs', () => {
      expect(classifyUrl('https://www.tripadvisor.com/Restaurant_Review-g123-d456')).toBe(
        'tripadvisor'
      )
      expect(classifyUrl('https://tripadvisor.com/Hotel_Review-something')).toBe('tripadvisor')
      expect(classifyUrl('https://tripadvisor.co.nz/Attraction')).toBe('tripadvisor')
    })

    it('classifies Airbnb URLs', () => {
      expect(classifyUrl('https://www.airbnb.com/rooms/12345')).toBe('airbnb')
      expect(classifyUrl('https://airbnb.co.nz/experiences/67890')).toBe('airbnb')
    })

    it('classifies Booking.com URLs', () => {
      expect(classifyUrl('https://www.booking.com/hotel/us/hotel-name')).toBe('booking')
    })

    it('classifies event URLs', () => {
      expect(classifyUrl('https://www.eventbrite.com/e/event-name-tickets-12345')).toBe('event')
      expect(classifyUrl('https://www.meetup.com/group-name/events/12345')).toBe('event')
      expect(classifyUrl('https://www.facebook.com/events/123')).toBe('event')
      expect(classifyUrl('https://www.eventfinda.co.nz/event/123')).toBe('event')
      expect(classifyUrl('https://www.ticketmaster.com/event/123')).toBe('event')
    })

    it('returns website for unrecognized URLs', () => {
      expect(classifyUrl('https://example.com/page')).toBe('website')
      expect(classifyUrl('https://randomsite.org')).toBe('website')
    })

    it('handles URLs with different protocols', () => {
      expect(classifyUrl('http://maps.google.com/maps')).toBe('google_maps')
    })

    it('is case insensitive', () => {
      expect(classifyUrl('https://MAPS.GOOGLE.COM/maps')).toBe('google_maps')
      expect(classifyUrl('https://WWW.AIRBNB.COM/rooms/123')).toBe('airbnb')
    })
  })

  describe('isActivityUrl', () => {
    it('returns true for activity-related URLs', () => {
      expect(isActivityUrl('https://maps.google.com/maps?q=restaurant')).toBe(true)
      expect(isActivityUrl('https://tripadvisor.com/Restaurant_Review')).toBe(true)
      expect(isActivityUrl('https://airbnb.com/rooms/123')).toBe(true)
      expect(isActivityUrl('https://booking.com/hotel')).toBe(true)
      expect(isActivityUrl('https://eventbrite.com/e/event')).toBe(true)
    })

    it('returns false for generic website URLs', () => {
      expect(isActivityUrl('https://example.com')).toBe(false)
      expect(isActivityUrl('https://news.com/article')).toBe(false)
      expect(isActivityUrl('https://blog.site.com/post')).toBe(false)
    })

    it('returns false for social media URLs', () => {
      expect(isActivityUrl('https://youtube.com/watch')).toBe(false)
      expect(isActivityUrl('https://instagram.com/p/123')).toBe(false)
      expect(isActivityUrl('https://tiktok.com/@user')).toBe(false)
    })
  })

  describe('extractGoogleMapsCoords', () => {
    it('extracts coordinates from @lat,lng format', () => {
      const url = 'https://www.google.com/maps/place/Name/@41.9028,12.4964,15z'

      const coords = extractGoogleMapsCoords(url)

      expect(coords?.lat).toBeCloseTo(41.9028)
      expect(coords?.lng).toBeCloseTo(12.4964)
    })

    it('extracts coordinates from q=lat,lng format', () => {
      const url = 'https://maps.google.com/maps?q=41.9028,12.4964'

      const coords = extractGoogleMapsCoords(url)

      expect(coords?.lat).toBeCloseTo(41.9028)
      expect(coords?.lng).toBeCloseTo(12.4964)
    })

    it('extracts coordinates from ll=lat,lng format', () => {
      const url = 'https://maps.google.com/maps?ll=41.9028,12.4964'

      const coords = extractGoogleMapsCoords(url)

      expect(coords?.lat).toBeCloseTo(41.9028)
      expect(coords?.lng).toBeCloseTo(12.4964)
    })

    it('handles negative coordinates', () => {
      const url = 'https://www.google.com/maps/place/NYC/@40.7128,-74.0060,12z'

      const coords = extractGoogleMapsCoords(url)

      expect(coords?.lat).toBeCloseTo(40.7128)
      expect(coords?.lng).toBeCloseTo(-74.006)
    })

    it('returns null for URLs without coordinates', () => {
      const url = 'https://maps.google.com/maps?q=restaurant+near+me'

      const coords = extractGoogleMapsCoords(url)

      expect(coords).toBeNull()
    })

    it('returns null for non-coordinate patterns', () => {
      const url = 'https://example.com/page'

      const coords = extractGoogleMapsCoords(url)

      expect(coords).toBeNull()
    })

    it('handles goo.gl short URLs with coordinates', () => {
      const url = 'https://goo.gl/maps/@41.9028,12.4964'

      const coords = extractGoogleMapsCoords(url)

      expect(coords?.lat).toBeCloseTo(41.9028)
      expect(coords?.lng).toBeCloseTo(12.4964)
    })

    it('handles decimal precision', () => {
      const url = 'https://www.google.com/maps/@41.90278,12.49636,15z'

      const coords = extractGoogleMapsCoords(url)

      expect(coords?.lat).toBeCloseTo(41.90278, 4)
      expect(coords?.lng).toBeCloseTo(12.49636, 4)
    })
  })
})
