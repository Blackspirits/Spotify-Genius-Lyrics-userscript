const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { join } = require('node:path')
const { test } = require('node:test')
const vm = require('node:vm')

const script = readFileSync(join(__dirname, '..', 'SpotifyGeniusLyrics.user.js'), 'utf8')

function context ({ frame = false } = {}) {
  const intervals = []
  const commands = []
  const sandbox = vm.createContext({
    document: {
      documentElement: { lang: 'en' },
      location: { hostname: 'open.spotify.com', pathname: frame ? '/robots.txt' : '/', hash: frame ? '#html:post' : '' },
      querySelectorAll: () => []
    },
    navigator: { language: 'en', languages: ['en'] },
    GM: { getValue: async (_key, fallback) => fallback, registerMenuCommand: command => commands.push(command) },
    geniusLyrics: options => {
      sandbox.lyricsOptions = options
      return { f: { scrollLyrics: () => {} }, onThemeChanged: [], option: { fontSize: 26 } }
    },
    window: { top: frame ? {} : null, setInterval: (fn, ms) => intervals.push(ms) }
  })
  if (!frame) sandbox.window.top = sandbox.window
  sandbox.intervals = intervals
  sandbox.commands = commands
  vm.runInContext(script, sandbox)
  return sandbox
}

test('registers Spotify timers and menu commands only in the main page', () => {
  const page = context()
  const frame = context({ frame: true })
  assert.equal(page.commands.length, 3)
  assert.equal(page.intervals.includes(1000), true)
  assert.deepEqual(frame.commands, [])
  assert.deepEqual(frame.intervals, [])
})

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

test('expands repeated LRC timestamps and matches small spelling and ad-lib differences', () => {
  const vmContext = context()
  const result = vm.runInContext(`(() => {
    const timed = parseSyncedLyrics('[00:15.00][01:40.00] We have been creeping\\n[00:19.00][01:44.00] Hold me tight\\n[00:23.00][01:48.00] Here we go (yeah)\\n[00:27.00][01:52.00] Love is true')
    const lyrics = ['[Chorus]', "We have been creepin'", 'Hold me tight', 'Here we go', 'Love is true',
      '[Chorus]', "We have been creepin'", 'Hold me tight', 'Here we go', 'Love is true'].map(text => ({ text }))
    return { timed: timed.map(line => [line.time, line.text]), matches: matchSyncedLines(lyrics, timed).map(line => [line.index, line.time]) }
  })()`, vmContext)
  assert.deepEqual(Array.from(result.timed, row => Array.from(row)), [
    [15, 'We have been creeping'], [19, 'Hold me tight'], [23, 'Here we go (yeah)'], [27, 'Love is true'],
    [100, 'We have been creeping'], [104, 'Hold me tight'], [108, 'Here we go (yeah)'], [112, 'Love is true']
  ])
  assert.deepEqual(Array.from(result.matches, row => Array.from(row)), [
    [1, 15], [2, 19], [3, 23], [4, 27], [6, 100], [7, 104], [8, 108], [9, 112]
  ])
})

test('accepts a remaster label without confusing live or unrelated recordings', () => {
  const vmContext = context()
  const chosen = vm.runInContext(`selectSyncedRecord([
    { trackName: 'Song - Live', artistName: 'Eagles', duration: 200, syncedLyrics: 'live' },
    { trackName: 'Song - 2006 Remaster', artistName: 'Eagles', duration: 200, syncedLyrics: 'remaster' }
  ], 'Song', 'Eagles', 200)?.syncedLyrics`, vmContext)
  assert.equal(chosen, 'remaster')
  assert.equal(vm.runInContext(`selectSyncedRecord([
    { trackName: 'Song - Live', artistName: 'Eagles', duration: 200, syncedLyrics: 'live' }
  ], 'Song', 'Eagles', 200)`, vmContext), null)
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

test('uses a second LRCLIB search when the field search has no matching recording', async () => {
  const vmContext = context()
  const requests = []
  vmContext.URLSearchParams = URLSearchParams
  vmContext.GM.xmlHttpRequest = async options => {
    requests.push(options)
    return requests.length === 1
      ? { status: 200, response: [] }
      : { status: 200, response: [{ trackName: 'Song - 2006 Remaster', artistName: 'Eagles', duration: 200, syncedLyrics: '[00:01.00] Hello' }] }
  }
  vm.runInContext(`
    getSongTitleAndArtist = () => [0, 'Song', ['Eagles']]
    syncedLines.document = {}
    applySyncedLines = () => {}
    requestSyncedLines(200)
  `, vmContext)
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(requests.length, 2)
  assert.match(requests[1].url, /q=Song\+Eagles/)
  assert.equal(vm.runInContext('syncedLines.cache.size', vmContext), 1)
  assert.equal(vm.runInContext('syncedLines.cache.values().next().value.trackName', vmContext), 'Song - 2006 Remaster')
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
  assert.equal(requests.length, 2)
  assert.match(requests[1].url, /q=Say\+Yes\+Loco/)
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
  vm.runInContext("uiLanguagePreference = 'pt-PT'", vmContext)
  assert.deepEqual(JSON.parse(JSON.stringify(vmContext.lyricsOptions.getPictureInPictureLabels())), {
    resume: 'Retomar', fromHere: 'A partir daqui'
  })
})

test('identifies the second occurrence of a repeated chorus in Picture-in-Picture', () => {
  const vmContext = context()
  vm.runInContext(`
    syncedLines.document = {}
    syncedLines.active = { text: 'Say yes, say yes', index: 3, elements: [] }
    syncedLines.matches = [syncedLines.active]
    lyricGroups = () => [
      { text: 'Say yes, say yes' }, { text: 'Other line' },
      { text: 'Another line' }, { text: 'Say yes, say yes' }
    ]
  `, vmContext)
  assert.deepEqual(JSON.parse(JSON.stringify(vmContext.lyricsOptions.getPictureInPictureActiveLine())), {
    text: 'Say yes, say yes', occurrence: 1
  })
  vm.runInContext('syncedLines.active = null', vmContext)
  assert.equal(vmContext.lyricsOptions.getPictureInPictureActiveLine(), null)
})

function lyricsFrame (nestedBreaks) {
  const textNode = value => ({ nodeType: 3, nodeName: '#text', textContent: value, parentNode: null })
  const element = (name, children = [], attributes = []) => {
    const node = {
      nodeType: 1,
      nodeName: name,
      childNodes: [],
      parentNode: null,
      className: '',
      hasAttribute: key => attributes.includes(key),
      appendChild (child) {
        if (child.parentNode) child.parentNode.childNodes.splice(child.parentNode.childNodes.indexOf(child), 1)
        this.childNodes.push(child)
        child.parentNode = this
        return child
      },
      insertBefore (child, next) {
        if (child.parentNode) child.parentNode.childNodes.splice(child.parentNode.childNodes.indexOf(child), 1)
        this.childNodes.splice(this.childNodes.indexOf(next), 0, child)
        child.parentNode = this
      },
      replaceWith (...children) {
        const at = this.parentNode.childNodes.indexOf(this)
        this.parentNode.childNodes.splice(at, 1, ...children)
        for (const child of children) child.parentNode = this.parentNode
        this.parentNode = null
      },
      classList: {
        add (value) { node.className += ' ' + value },
        remove (value) { node.className = node.className.replace(value, '') }
      },
      get textContent () { return this.childNodes.map(child => child.textContent).join('') }
    }
    for (const child of children) node.appendChild(child)
    return node
  }
  const br = () => element('BR')
  const header = element('DIV', [textNode('15 Contributors')], ['data-exclude-from-selection'])
  const annotated = element('A', [element('SPAN', [textNode('Second lyric'), br(), textNode('Third lyric')])])
  const lyrics = nestedBreaks
    ? [textNode('First lyric'), br(), annotated, br(), textNode('Fourth lyric')]
    : [element('P', [textNode('First lyric'), br(), textNode('Second lyric'), br(), textNode('Third lyric'), br(), textNode('Fourth lyric')])]
  const container = element('DIV', [header, ...lyrics], ['data-lyrics-container'])
  const walk = (root, flags, filter) => {
    const nodes = []
    const visit = parent => {
      for (const child of parent.childNodes) {
        if (filter.acceptNode(child) === 2) continue
        nodes.push(child)
        if (child.childNodes) visit(child)
      }
    }
    visit(root)
    let cursor = 0
    return { nextNode: () => nodes[cursor++] || null }
  }
  const frame = {
    defaultView: { NodeFilter: { SHOW_ELEMENT: 1, SHOW_TEXT: 4, FILTER_ACCEPT: 1, FILTER_REJECT: 2 } },
    createTreeWalker: walk,
    createElement: name => element(name.toUpperCase()),
    querySelectorAll: selector => selector === '[data-lyrics-container="true"]'
      ? [container]
      : selector === 'span.genius-synced-line' ? [] : []
  }
  return { frame, container, annotated }
}

test('reads both Genius lyric layouts and preserves annotated links while highlighting', () => {
  const vmContext = context()
  for (const nestedBreaks of [false, true]) {
    const { frame, container, annotated } = lyricsFrame(nestedBreaks)
    vmContext.frame = frame
    const lines = vm.runInContext('lyricGroups(frame).map(line => line.text)', vmContext)
    assert.deepEqual(Array.from(lines), ['First lyric', 'Second lyric', 'Third lyric', 'Fourth lyric'])
    vm.runInContext(`
      syncedLines.document = frame
      syncedLines.trackKey = 'test'
      lastPlaybackTime = 0
      applySyncedLines({ syncedLyrics: '[00:01.00] First lyric\\n[00:02.00] Second lyric\\n[00:03.00] Third lyric\\n[00:04.00] Fourth lyric' }, 'test', frame)
    `, vmContext)
    assert.equal(vm.runInContext('syncedLines.matches.length', vmContext), 4)
    if (nestedBreaks) {
      assert.equal(annotated.parentNode, container)
      assert.equal(annotated.childNodes[0].childNodes.filter(node => node.className.includes('genius-synced-line')).length, 2)
    }
  }
})

test('keeps whitespace between annotation fragments without wrapping whitespace-only nodes', () => {
  const vmContext = context()
  const { frame, annotated } = lyricsFrame(true)
  const span = annotated.childNodes[0]
  const breakNode = span.childNodes[1]
  span.childNodes[0].textContent = 'Second'
  const gap = { nodeType: 3, nodeName: '#text', textContent: ' ', parentNode: null }
  span.insertBefore(gap, breakNode)
  span.insertBefore({ nodeType: 3, nodeName: '#text', textContent: 'lyric', parentNode: null }, breakNode)
  vmContext.frame = frame
  assert.deepEqual(Array.from(vm.runInContext('lyricGroups(frame).map(line => line.text)', vmContext)), [
    'First lyric', 'Second lyric', 'Third lyric', 'Fourth lyric'
  ])
  vm.runInContext(`
    syncedLines.document = frame
    syncedLines.trackKey = 'test'
    applySyncedLines({ syncedLyrics: '[00:01.00] First lyric\\n[00:02.00] Second lyric\\n[00:03.00] Third lyric\\n[00:04.00] Fourth lyric' }, 'test', frame)
  `, vmContext)
  assert.equal(vm.runInContext('syncedLines.matches.length', vmContext), 4)
  assert.equal(gap.parentNode, span)
})

test('keeps a stable song key across a one-second duration wobble and retries after rate limiting', async () => {
  const vmContext = context()
  let calls = 0
  vmContext.URLSearchParams = URLSearchParams
  vmContext.GM.xmlHttpRequest = async () => {
    calls++
    return calls === 1
      ? { status: 429, responseHeaders: 'retry-after: 10' }
      : { status: 200, response: [] }
  }
  vm.runInContext(`
    getSongTitleAndArtist = () => [0, 'Say Yes', ['Loco']]
    syncedLines.document = {}
    requestSyncedLines(196)
  `, vmContext)
  await new Promise(resolve => setImmediate(resolve))
  const firstKey = vm.runInContext('syncedLines.trackKey', vmContext)
  assert.equal(vm.runInContext('syncedLines.requestedKey', vmContext), '')
  assert.equal(vm.runInContext('syncedLines.cache.size', vmContext), 0)
  vm.runInContext('syncedLines.blockedUntil = 0; syncedLines.nextRequestAt = 0; requestSyncedLines(195)', vmContext)
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(vm.runInContext('syncedLines.trackKey', vmContext), firstKey)
  assert.equal(calls, 3)
})

test('centers the active line without counting the iframe scroll position twice', () => {
  const vmContext = context()
  let top
  const element = {
    classList: { add: () => {}, remove: () => {} },
    getBoundingClientRect: () => ({ top: 120 })
  }
  vmContext.scrollFrame = {
    hidden: false,
    scrollingElement: {
      scrollTop: 900,
      clientHeight: 400,
      getBoundingClientRect: () => ({ top: -900 }),
      scrollTo: options => { top = options.top }
    }
  }
  vmContext.match = { time: 5, index: 0, text: 'First lyric', elements: [element] }
  vm.runInContext(`
    syncedLines.document = scrollFrame
    syncedLines.matches = [match]
    genius.f.isScrollLyricsEnabled = () => true
    highlightSyncedLine(10)
  `, vmContext)
  assert.equal(top, 840)
})

test('interpolates playback without advancing while Media Session reports a pause', () => {
  const vmContext = context()
  vmContext.fakeNow = 1000
  vm.runInContext(`
    Date = { now: () => fakeNow }
    navigator.mediaSession = { playbackState: 'playing' }
    lastPlaybackTime = 10
    notePlaybackTime(10)
    fakeNow = 2000
    lastPlaybackTime = 11
    notePlaybackTime(11)
    fakeNow = 2250
  `, vmContext)
  assert.equal(vm.runInContext('estimatedPlaybackTime()', vmContext), 11.25)
  vm.runInContext("navigator.mediaSession.playbackState = 'paused'", vmContext)
  assert.equal(vm.runInContext('estimatedPlaybackTime()', vmContext), 11)
})

test('resumes centering the active line after four seconds without another lyric change', () => {
  const vmContext = context()
  let scrolls = 0
  vmContext.scrollFrame = {
    hidden: false,
    scrollingElement: { scrollTop: 900, clientHeight: 400, scrollTo: () => { scrolls++ } }
  }
  vmContext.match = {
    time: 5,
    index: 0,
    text: 'First lyric',
    elements: [{ classList: { add: () => {}, remove: () => {} }, getBoundingClientRect: () => ({ top: 120 }) }]
  }
  vmContext.fakeNow = 1000
  vm.runInContext(`
    Date = { now: () => fakeNow }
    syncedLines.document = scrollFrame
    syncedLines.matches = [match]
    syncedLines.userScrollUntil = 5000
    genius.f.isScrollLyricsEnabled = () => true
    highlightSyncedLine(10)
  `, vmContext)
  assert.equal(scrolls, 0)
  vm.runInContext('fakeNow = 5000; highlightSyncedLine(10)', vmContext)
  assert.equal(scrolls, 1)
  vm.runInContext('highlightSyncedLine(10)', vmContext)
  assert.equal(scrolls, 1)
})
