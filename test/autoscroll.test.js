const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { join } = require('node:path')
const { test } = require('node:test')
const vm = require('node:vm')

const script = readFileSync(join(__dirname, '..', 'SpotifyGeniusLyrics.user.js'), 'utf8')

function player (currentText, rightText, { title = null, artists = [], closeButton = null } = {}) {
  const scrolled = []
  const intervals = []
  const elements = {
    '[data-testid="player-controls"] [data-testid="playback-position"]': currentText == null ? null : { textContent: currentText },
    '[data-testid="player-controls"] [data-testid="playback-duration"]': rightText == null ? null : { textContent: rightText }
  }
  const context = vm.createContext({
    document: {
      location: { hostname: 'open.spotify.com' },
      querySelector: selector => selector.includes('context-item-info-title') ? title : elements[selector] ?? null,
      querySelectorAll: selector => {
        if (selector.includes('context-item-info-artist')) return artists
        if (selector === '.NowPlayingView button[aria-label="Ocultar vista Em reprodução"]' && closeButton) return [closeButton]
        return []
      }
    },
    GM: {
      getValue: async (_key, defaultValue) => defaultValue,
      registerMenuCommand: () => {}
    },
    geniusLyrics: () => ({
      f: {
        cleanUpSongTitle: text => text,
        scrollLyrics: pos => scrolled.push(pos)
      },
      onThemeChanged: [],
      option: {}
    }),
    window: {
      setInterval: (callback, ms) => intervals.push({ callback, ms })
    }
  })
  vm.runInContext(script, context)
  return { context, intervals, scrolled, update: intervals.find(interval => interval.ms === 1000).callback }
}

test('scrolls to the actual position when Spotify displays total duration', () => {
  const { scrolled, update } = player('2:58', '3:16')
  update()
  update()
  assert.deepEqual(scrolled, [178 / 196])
})

test('scrolls to the same position when Spotify displays remaining time', () => {
  const { scrolled, update } = player('2:58', '-0:18')
  update()
  assert.deepEqual(scrolled, [178 / 196])
})

test('supports hour-long tracks and the Unicode minus sign', () => {
  const { scrolled, update } = player('1:00:00', '−1:00:00')
  update()
  assert.deepEqual(scrolled, [0.5])
})

test('does not scroll for missing, malformed or inconsistent playback times', () => {
  for (const [current, right] of [
    [null, '3:16'],
    ['2:58', null],
    ['-:--', '3:16'],
    ['0:00', '-0:00'],
    ['4:00', '3:16']
  ]) {
    const { scrolled, update } = player(current, right)
    update()
    assert.deepEqual(scrolled, [])
  }
})

test('uses each artist once when the playing bar and side panel repeat them', () => {
  const names = ['CHEN', 'BAEKHYUN', 'XIUMIN', 'CHEN', 'BAEKHYUN', 'XIUMIN']
  const artists = names.map(name => ({
    textContent: name,
    getAttribute: () => `/intl-pt/artist/${name}`
  }))
  const { context } = player('2:58', '3:16', { title: { textContent: 'For You' }, artists })
  const [status, title, result] = vm.runInContext('getSongTitleAndArtist()', context)
  assert.equal(status, 0)
  assert.equal(title, 'For You')
  assert.deepEqual(Array.from(result), ['CHEN', 'BAEKHYUN', 'XIUMIN'])
})

test('closes the Now Playing panel with the pt-PT button label', async () => {
  let clicks = 0
  const { intervals } = player('2:58', '3:16', { closeButton: { click: () => { clicks++ } } })
  intervals.find(interval => interval.ms === 3000).callback()
  await Promise.resolve()
  assert.equal(clicks, 1)
})

test('keeps English selectable on a Portuguese Spotify page', () => {
  const { context } = player('0:30', '3:00')
  context.document.documentElement = { lang: 'pt-PT' }
  context.document.location.pathname = '/intl-pt/'
  context.navigator = { language: 'en-US', languages: ['en-US'] }
  assert.equal(vm.runInContext('uiText().menuTitle', context), 'Opções das letras')
  vm.runInContext("uiLanguagePreference = 'en'", context)
  assert.equal(vm.runInContext('uiText().menuTitle', context), 'Options')
  vm.runInContext("uiLanguagePreference = 'pt-PT'", context)
  assert.equal(vm.runInContext('uiText().searchButton', context), 'Pesquisar')
})
