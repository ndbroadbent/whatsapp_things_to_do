/* global L, mapData */
;(function () {
  'use strict'

  if (typeof mapData === 'undefined') {
    console.error('mapData not found. Make sure data.js is loaded first.')
    return
  }

  var floatingTooltip = document.getElementById('floatingTooltip')
  var escapeDiv = document.createElement('div')

  function escapeHtml(str) {
    escapeDiv.textContent = str
    return escapeDiv.innerHTML
  }

  function formatSenders(messages) {
    var uniqueSenders = []
    var seen = {}
    for (var i = 0; i < messages.length; i++) {
      var name = messages[i].sender.split(' ')[0]
      if (!seen[name]) {
        seen[name] = true
        uniqueSenders.push(name)
      }
    }
    var label = uniqueSenders.length === 1 ? 'Sender' : 'Senders'
    var display =
      uniqueSenders.length <= 2
        ? uniqueSenders.join(', ')
        : uniqueSenders.slice(0, 2).join(', ') + ', and ' + (uniqueSenders.length - 2) + ' more'
    return { label: label, display: display }
  }

  function buildTooltipHtml(messages) {
    return messages
      .map(function (m) {
        var senderName = m.sender.split(' ')[0]
        return (
          '<div class="msg-tooltip-item">' +
          '<div class="msg-tooltip-header">' +
          escapeHtml(senderName) +
          ' · ' +
          m.date +
          '</div>' +
          '<div class="msg-tooltip-text">' +
          escapeHtml(m.message) +
          '</div></div>'
        )
      })
      .join('')
  }

  function showTooltip(trigger, messages) {
    floatingTooltip.innerHTML = buildTooltipHtml(messages)
    var rect = trigger.getBoundingClientRect()
    var left = rect.left
    if (left + 300 > window.innerWidth) left = window.innerWidth - 310
    if (left < 10) left = 10
    floatingTooltip.style.left = left + 'px'
    floatingTooltip.style.bottom = window.innerHeight - rect.top + 10 + 'px'
    floatingTooltip.style.top = 'auto'
    floatingTooltip.style.display = 'block'
  }

  function hideTooltip() {
    floatingTooltip.style.display = 'none'
  }

  // Initialize map
  var map = L.map('map').setView([mapData.center.lat, mapData.center.lng], mapData.zoom)

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(map)

  var markersLayer = mapData.clusterMarkers
    ? L.markerClusterGroup({
        maxClusterRadius: 50,
        spiderfyOnMaxZoom: true,
        showCoverageOnHover: false
      })
    : L.layerGroup()

  // Add markers
  mapData.points.forEach(function (p) {
    var messagesEncoded = encodeURIComponent(JSON.stringify(p.messages)).replace(/'/g, '%27')
    var senderDisplay = formatSenders(p.messages)
    var mentionCount = p.messages.length
    var mentionText = mentionCount > 1 ? ' (' + mentionCount + ' mentions)' : ''

    var imageHtml = p.imagePath
      ? '<img src="' +
        escapeHtml(p.imagePath) +
        '" style="display:block;width:100%;max-width:200px;border-radius:4px;margin-bottom:8px;" />'
      : ''

    var mapsUrl = p.placeId
      ? 'https://www.google.com/maps/search/?api=1&query=' +
        encodeURIComponent(p.activity) +
        '&query_place_id=' +
        p.placeId
      : null

    var popupContent =
      '<div style="max-width:240px;">' +
      imageHtml +
      '<strong>' +
      escapeHtml(p.activity) +
      '</strong><br>' +
      '<small>' +
      p.date +
      ' · <span class="sender-trigger" data-messages="' +
      messagesEncoded +
      '">' +
      senderDisplay.label +
      ': ' +
      senderDisplay.display +
      mentionText +
      '</span></small><br>' +
      (p.location ? '<em>' + escapeHtml(p.location) + '</em><br>' : '') +
      (mapsUrl ? '<a href="' + mapsUrl + '" target="_blank">View on Google Maps</a><br>' : '') +
      (p.url ? '<a href="' + escapeHtml(p.url) + '" target="_blank">Source Link</a>' : '') +
      '</div>'

    var marker = L.marker([p.lat, p.lng], {
      icon: L.divIcon({
        className: 'custom-marker',
        html:
          '<div style="background-color:' +
          p.color +
          ';width:12px;height:12px;border-radius:50%;border:2px solid white;"></div>',
        iconSize: [16, 16],
        iconAnchor: [8, 8]
      })
    })
      .addTo(markersLayer)
      .bindPopup(popupContent)

    var closeTimeout = null
    marker.on('mouseover', function () {
      if (closeTimeout) {
        clearTimeout(closeTimeout)
        closeTimeout = null
      }
      this.openPopup()
    })
    marker.on('mouseout', function () {
      var self = this
      closeTimeout = setTimeout(function () {
        self.closePopup()
      }, 100)
    })
    marker.on('popupopen', function () {
      var popup = this.getPopup()
      var popupEl = popup.getElement()
      if (popupEl) {
        popupEl.addEventListener('mouseenter', function () {
          if (closeTimeout) {
            clearTimeout(closeTimeout)
            closeTimeout = null
          }
        })
        popupEl.addEventListener('mouseleave', function () {
          marker.closePopup()
        })
      }
    })
  })

  map.addLayer(markersLayer)

  if (markersLayer.getLayers().length > 0) {
    map.fitBounds(markersLayer.getBounds(), { padding: [50, 50] })
  }

  // Popup tooltip handlers
  map.on('popupopen', function () {
    var triggers = document.querySelectorAll('.leaflet-popup .sender-trigger[data-messages]')
    triggers.forEach(function (trigger) {
      trigger.addEventListener('mouseenter', function () {
        var messages = JSON.parse(decodeURIComponent(trigger.getAttribute('data-messages') || ''))
        if (!messages.length) return
        showTooltip(trigger, messages)
      })
      trigger.addEventListener('mouseleave', hideTooltip)
    })
  })

  // Render info box
  document.getElementById('infoTitle').textContent = mapData.title
  document.getElementById('infoCount').textContent = mapData.points.length

  // Render legend
  var legendHtml = Object.entries(mapData.senderColors)
    .sort(function (a, b) {
      return a[0].localeCompare(b[0])
    })
    .map(function (entry) {
      var sender = entry[0]
      var color = entry[1]
      var firstName = sender.split(' ')[0]
      return (
        '<div class="legend-item"><div class="legend-dot" style="background-color:' +
        color +
        ';"></div>' +
        '<span>' +
        escapeHtml(firstName) +
        "'s suggestions</span></div>"
      )
    })
    .join('')
  document.getElementById('legend').innerHTML = legendHtml

  // Activity list
  var activities = mapData.points.map(function (p) {
    return {
      id: p.activityId,
      activity: p.activity,
      sender: p.sender.split(' ')[0],
      location: p.location,
      date: p.date,
      score: p.score,
      imagePath: p.imagePath,
      placeId: p.placeId,
      url: p.url,
      messages: p.messages
    }
  })

  function renderActivityList(sorted) {
    var html = sorted
      .map(function (a, idx) {
        var mapsUrl = a.placeId
          ? 'https://www.google.com/maps/search/?api=1&query=' +
            encodeURIComponent(a.activity) +
            '&query_place_id=' +
            a.placeId
          : null
        var thumb = a.imagePath
          ? '<img src="' + a.imagePath + '" class="activity-thumb" alt="" />'
          : '<div class="activity-thumb-placeholder"></div>'
        var links =
          (mapsUrl ? '<a href="' + mapsUrl + '" target="_blank">Google Maps</a>' : '') +
          (a.url ? '<a href="' + a.url + '" target="_blank">Source</a>' : '')
        var senderInfo = formatSenders(a.messages)
        var senderHtml =
          '<span class="sender-trigger" data-idx="' +
          idx +
          '">' +
          senderInfo.label +
          ': ' +
          senderInfo.display +
          '</span>'
        return (
          '<div class="activity-row">' +
          thumb +
          '<div class="activity-content">' +
          '<div class="activity-title">' +
          escapeHtml(a.activity) +
          '</div>' +
          '<div class="activity-meta">' +
          (a.location ? '<span class="activity-location">' + escapeHtml(a.location) + '</span> · ' : '') +
          senderHtml +
          ' · ' +
          a.date +
          '</div>' +
          '<div class="activity-links">' +
          links +
          '</div>' +
          '</div></div>'
        )
      })
      .join('')
    document.getElementById('activityListBody').innerHTML = html
    attachTooltipHandlers(sorted)
  }

  function attachTooltipHandlers(sorted) {
    var triggers = document.querySelectorAll('.sender-trigger[data-idx]')
    triggers.forEach(function (trigger) {
      trigger.addEventListener('mouseenter', function () {
        var idx = parseInt(trigger.getAttribute('data-idx'), 10)
        var a = sorted[idx]
        if (!a) return
        showTooltip(trigger, a.messages)
      })
      trigger.addEventListener('mouseleave', hideTooltip)
    })
  }

  window.sortActivities = function (sortBy) {
    var sorted = activities.slice()
    if (sortBy === 'score')
      sorted.sort(function (a, b) {
        return b.score - a.score
      })
    else if (sortBy === 'oldest')
      sorted.sort(function (a, b) {
        return a.date.localeCompare(b.date)
      })
    else if (sortBy === 'newest')
      sorted.sort(function (a, b) {
        return b.date.localeCompare(a.date)
      })
    renderActivityList(sorted)
  }

  window.openModal = function () {
    document.getElementById('activityModal').classList.add('open')
    document.body.style.overflow = 'hidden'
    window.sortActivities(document.getElementById('sortSelect').value)
  }

  window.closeModal = function (e) {
    if (!e || e.target === e.currentTarget) {
      document.getElementById('activityModal').classList.remove('open')
      document.body.style.overflow = ''
    }
  }

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') window.closeModal()
  })
})()
