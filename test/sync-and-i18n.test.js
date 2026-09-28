const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { join } = require('node:path')
const { test } = require('node:test')
const vm = require('node:vm')

const script = readFileSync(join(__dirname, '..', 'SpotifyGeniusLyrics.user.js'), 'utf8')

function context () {
  const sandbox = vm.createContext({
    document: {
      documentElement: { lang: 'en' },
      location: { hostname: 'open.spotify.com', pathname: '/' },
      querySelectorAll: () => []
    },
    navigator: { language: 'en', languages: ['en'] },
    GM: { getValue: async (_key, fallback) => fallback, registerMenuCommand: () => {} },
    geniusLyrics: options => {
      sandbox.lyricsOptions = options
      return { f: { scrollLyrics: () => {} }, onThemeChanged: [], option: { fontSize: 26 } }
    },
    window: { setInterval: () => {} }
  })
  vm.runInContext(script, sandbox)
  return sandbox
}

test('matches timed Korean verses in order, including a repeated chorus', () => {
  const vmContext = context()
  const result = vm.runInContext(`(() => {
    const lyrics = ['[Chorus]', '니 눈앞에 왔잖아', '내가 여기 있잖아', '너의 입술로 말을 해줘', 'Say yes, say yes',
      '[Verse]', '손을 내밀어 줬으면 해', '[Chorus]', '니 눈앞에 왔잖아', '내가 여기 있잖아', '너의 입술로 말을 해줘', 'Say yes, say yes']
      .map(text => ({ text }))
    const timed = parseSyncedLyrics('[00:12.00] 니 눈앞에 왔잖아\\n[00:16.20] 내가 여기 있잖아\\n[00:20.00] 너의 입술로 말을 해줘\\n[00:24.00] Say yes, say yes\\n[00:50.00] 손을 내밀어 줬으면 해\\n[01:12.00] 니 눈앞에 왔잖아\\n[01:16.00] 내가 여기 있잖아\\n[01:20.00] 너의 입술로 말을 해줘\\n[01:24.00] Say yes, say yes')
    return matchSyncedLines(lyrics, timed).map(({ index, time }) => [index, time])
  })()`, vmContext)
  assert.deepEqual(Array.from(result, value => Array.from(value)), [
    [1, 12], [2, 16.2], [3, 20], [4, 24], [6, 50], [8, 72], [9, 76], [10, 80], [11, 84]
  ])
})

test('rejects unrelated lyrics and incorrect recordings despite similar metadata', () => {
  const vmContext = context()
  assert.equal(vm.runInContext(`matchSyncedLines(
    ['First line', 'Second line', 'Third line', 'Fourth line', 'Fifth line'].map(text => ({ text })),
    parseSyncedLyrics('[00:01.00] Wrong words\\n[00:05.00] Another song\\n[00:09.00] No match\\n[00:13.00] Still wrong')
  ).length`, vmContext), 0)
  assert.equal(vm.runInContext('selectSyncedRecord([{ trackName: \'Say Yes\', artistName: \'Loco & Punch\', duration: 196, syncedLyrics: \'abc\' }], \'Say Yes\', \'Loco\', 240)', vmContext), null)
  assert.equal(vm.runInContext('selectSyncedRecord([{ trackName: \'Say Yes\', artistName: \'Another Artist\', duration: 196, syncedLyrics: \'abc\' }], \'Say Yes\', \'Loco\', 196)', vmContext), null)
})

test('requests timed lyrics once per song and identifies the client', async () => {
  const vmContext = context()
  const requests = []
  vmContext.URLSearchParams = URLSearchParams
  vmContext.GM.xmlHttpRequest = async options => {
    requests.push(options)
    return {
      status: 200,
      response: [{ trackName: 'Say Yes', artistName: 'Loco & Punch', duration: 196, syncedLyrics: '[00:01.00] First line' }]
    }
  }
  vm.runInContext(`
    getSongTitleAndArtist = () => [0, 'Say Yes', ['Loco']]
    syncedLines.document = {}
    applySyncedLines = () => {}
    requestSyncedLines(196)
  `, vmContext)
  await new Promise(resolve => setImmediate(resolve))
  vm.runInContext('requestSyncedLines(196)', vmContext)
  assert.equal(requests.length, 1)
  assert.match(requests[0].url, /lrclib\.net\/api\/search\?track_name=Say\+Yes&artist_name=Loco/)
  assert.match(requests[0].headers['Lrclib-Client'], /Spotify-Genius-Lyrics/)
})

test('provides every translated label and respects automatic or selected language', () => {
  const vmContext = context()
  const complete = vm.runInContext(`Object.entries(UI_TEXT).every(([language, values]) =>
    Object.keys(UI_TEXT.en).every(key => typeof values[key] === 'string' && values[key].length > 0))`, vmContext)
  assert.equal(complete, true)
  for (const [locale, button] of [['fr-FR', 'Rechercher'], ['de-DE', 'Suchen'], ['es-ES', 'Buscar'], ['it-IT', 'Cerca'], ['pt-BR', 'Buscar']]) {
    vmContext.document.documentElement.lang = locale
    assert.equal(vm.runInContext('uiText().searchButton', vmContext), button)
  }
  vm.runInContext("uiLanguagePreference = 'en'", vmContext)
  assert.equal(vm.runInContext('uiText().searchButton', vmContext), 'Search')
})

test('translates Genius credit expansion and updates it when the language changes', () => {
  const vmContext = context()
  const button = { textContent: '1more', dataset: {}, childElementCount: 0 }
  const header = { querySelectorAll: () => [button] }
  const frame = { querySelector: () => header }
  vmContext.frame = frame
  vm.runInContext("uiLanguagePreference = 'pt-PT'; translateGeniusHeader(frame)", vmContext)
  assert.equal(button.textContent, '1 mais')
  assert.equal(button.dataset.geniusMoreCount, '1')
  vm.runInContext("uiLanguagePreference = 'en'; translateGeniusHeader(frame)", vmContext)
  assert.equal(button.textContent, '1 more')
  button.textContent = '2more'
  delete button.dataset.geniusMoreCount
  vm.runInContext("uiLanguagePreference = 'es'; translateGeniusHeader(frame)", vmContext)
  assert.equal(button.textContent, '2 más')
})

test('covers added languages and localizes credit order for Chinese and Japanese', () => {
  const vmContext = context()
  const expected = { 'zh-CN': '搜索', hi: 'खोजें', ar: 'بحث', bn: 'খুঁজুন', ru: 'Найти', ja: '検索', ko: '검색', id: 'Cari' }
  for (const [language, search] of Object.entries(expected)) {
    vmContext.document.documentElement.lang = language
    assert.equal(vm.runInContext('uiText().searchButton', vmContext), search)
  }
  vm.runInContext("uiLanguagePreference = 'zh-CN'", vmContext)
  assert.equal(vm.runInContext("formatMoreCredits('2')", vmContext), '另有2人')
  vm.runInContext("uiLanguagePreference = 'ja'", vmContext)
  assert.equal(vm.runInContext("formatMoreCredits('2')", vmContext), 'ほか2人')
  vm.runInContext("uiLanguagePreference = 'ar'", vmContext)
  assert.equal(vm.runInContext("formatMoreCredits('1')", vmContext), 'شخص آخر')
})

test('applies safe appearance settings within the lyrics frame', () => {
  const vmContext = context()
  let style
  vmContext.frame = {
    head: { appendChild: element => { style = element } },
    getElementById: () => style,
    createElement: () => ({ textContent: '' })
  }
  vm.runInContext(`
    appearance.fontFamily = 'serif'
    appearance.textColor = validColor('#ffffff')
    appearance.backgroundColor = validColor('#151515')
    appearance.highlightColor = validColor('#ffcc00')
    applyLyricsAppearance(frame)
  `, vmContext)
  assert.match(style.textContent, /font-family: Georgia, serif/)
  assert.match(style.textContent, /color: #ffffff !important/)
  assert.match(style.textContent, /background-color: #151515 !important/)
  assert.match(style.textContent, /rgba\(255, 204, 0, \.16\)/)
  assert.equal(vm.runInContext("validColor('red; color: blue')", vmContext), '')
  vm.runInContext("appearance.textColor = ''; applyLyricsAppearance(frame)", vmContext)
  assert.doesNotMatch(style.textContent, /color: #ffffff/)
})

test('updates the lyric font size immediately while the options are open', () => {
  const vmContext = context()
  const lyric = { style: { fontSize: '', removeProperty: () => { lyric.style.fontSize = '' } } }
  vmContext.frame = { querySelectorAll: () => [lyric] }
  vm.runInContext('applyLiveFontSize(frame, 28)', vmContext)
  assert.equal(lyric.style.fontSize, '28px')
  vm.runInContext('applyLiveFontSize(frame, 0)', vmContext)
  assert.equal(lyric.style.fontSize, '')
  vm.runInContext('applyLiveFontSize(frame, 500)', vmContext)
  assert.equal(lyric.style.fontSize, '99px')
  assert.equal(vm.runInContext('uiText().saveAndView', vmContext), 'Save and view')
})

test('the Spotify page adopts its loaded lyrics frame for live settings and synchronization', async () => {
  const vmContext = context()
  const requests = []
  const styles = []
  const lyric = { style: { fontSize: '' } }
  const frame = {
    head: { appendChild: style => { styles.push(style) } },
    getElementById: id => styles.find(style => style.id === id),
    createElement: () => ({ id: '', textContent: '' }),
    querySelector: selector => selector === '[data-lyrics-container="true"]' ? lyric : null,
    querySelectorAll: () => [lyric]
  }
  const iframe = { contentDocument: frame }
  vmContext.document.getElementById = id => id === 'lyricsiframe' ? iframe : null
  vmContext.document.querySelector = selector => {
    if (selector.endsWith('playback-position"]')) return { textContent: '0:12' }
    if (selector.endsWith('playback-duration"]')) return { textContent: '3:16' }
    return null
  }
  vmContext.URLSearchParams = URLSearchParams
  vmContext.GM.xmlHttpRequest = async options => {
    requests.push(options)
    return { status: 200, response: [] }
  }
  vm.runInContext("getSongTitleAndArtist = () => [0, 'Say Yes', ['Loco']]", vmContext)
  vmContext.lyricsOptions.onLyricsReady()
  assert.equal(vm.runInContext('syncedLines.document', vmContext), frame)
  assert.equal(lyric.style.fontSize, '26px')
  assert.equal(styles.some(style => style.id === 'genius-synced-line-style'), true)
  vm.runInContext("appearance.textColor = '#ff0000'; applyLyricsAppearance(syncedLines.document)", vmContext)
  assert.match(styles.find(style => style.id === 'genius-user-appearance').textContent, /#ff0000/)
  vm.runInContext('updateAutoScroll()', vmContext)
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(requests.length, 1)
  assert.equal(vm.runInContext('syncedLines.trackKey', vmContext), 'Say Yes\tLoco\t196')
  iframe.contentDocument = { querySelector: () => null }
  vm.runInContext('updateAutoScroll()', vmContext)
  assert.equal(vm.runInContext('syncedLines.document', vmContext), null)
})

test('passes the saved lyric appearance to Picture-in-Picture and refreshes an open window', () => {
  const vmContext = context()
  let refreshes = 0
  vm.runInContext(`
    appearance.fontFamily = 'serif'
    appearance.textColor = '#f4f4f4'
    appearance.backgroundColor = '#381818'
    appearance.highlightColor = '#ffcc00'
    genius.option.fontSize = 25
    genius.f.refreshPictureInPictureAppearance = () => { refreshed() }
  `, vmContext)
  vmContext.refreshed = () => { refreshes++ }
  assert.deepEqual(JSON.parse(JSON.stringify(vmContext.lyricsOptions.getPictureInPictureAppearance())), {
    fontFamily: 'Georgia, serif',
    fontSize: 25,
    textColor: '#f4f4f4',
    backgroundColor: '#381818',
    highlightColor: '#ffcc00'
  })
  vm.runInContext('refreshPictureInPictureAppearance()', vmContext)
  assert.equal(refreshes, 1)
})
