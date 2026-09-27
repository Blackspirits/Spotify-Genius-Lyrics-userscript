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
    geniusLyrics: () => ({ f: {}, onThemeChanged: [], option: {} }),
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
