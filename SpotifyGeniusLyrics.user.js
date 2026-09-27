// ==UserScript==
// @name            Spotify Genius Lyrics
// @description     Shows lyrics from genius.com on the Spotify web player
// @description:es  Mostra la letra de genius.com de las canciones en el reproductor web de Spotify
// @description:de  Zeigt den Songtext von genius.com im Spotify-Webplayer an
// @description:fr  Présente les paroles de chansons de genius.com sur Spotify
// @description:pl  Pokazuje teksty piosenek z genius.com na Spotify
// @description:pt  Mostra letras de genius.com no Spotify
// @description:it  Mostra i testi delle canzoni di genius.com su Spotify
// @description:ja  スクリプトは、Spotify (スポティファイ)上の genius.com から歌詞を表示します
// @namespace       https://greasyfork.org/users/20068
// @license         GPL-3.0-or-later; http://www.gnu.org/licenses/gpl-3.0.txt
// @copyright       2020, cuzi (https://github.com/cvzi)
// @supportURL      https://github.com/cvzi/Spotify-Genius-Lyrics-userscript/issues
// @icon            https://avatars.githubusercontent.com/u/251374?s=200&v=4
// @version         23.6.21.6
// @require         https://raw.githubusercontent.com/Blackspirits/genius-lyrics-userscript/c12a087e81b04aa5a13fc68c47d8bb704c3a04a3/GeniusLyrics.js
// @require         https://cdnjs.cloudflare.com/ajax/libs/lz-string/1.5.0/lz-string.min.js
// @grant           GM.xmlHttpRequest
// @grant           GM.setValue
// @grant           GM.getValue
// @grant           GM.registerMenuCommand
// @grant           GM_openInTab
// @connect         genius.com
// @match           https://open.spotify.com/*
// @match           https://genius.com/songs/new
// @sandbox         JavaScript
// ==/UserScript==

/*
    Copyright (C) 2020 cuzi (cuzi@openmail.cc)

    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.

    You should have received a copy of the GNU General Public License
    along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

/* global genius, geniusLyrics, unsafeWindow, GM, GM_openInTab, KeyboardEvent */ // eslint-disable-line no-unused-vars
/* jshint asi: true, esversion: 8 */

'use strict'

const scriptName = 'Spotify Genius Lyrics'
let genius
let resizeLeftContainer
let resizeContainer
let optionCurrentSize = 30.0
let uiLanguagePreference = 'auto'
GM.getValue('optioncurrentsize', optionCurrentSize).then(function (value) {
  optionCurrentSize = value
})
GM.getValue('ui_language', 'auto').then(function (value) {
  uiLanguagePreference = value === 'en' || value === 'pt-PT' ? value : 'auto'
  document.querySelectorAll('.lyricsnavbar').forEach(styleLyricsBar)
  document.querySelectorAll('.genius-search-container').forEach(translateSearch)
})

function setFrameDimensions (container, iframe, bar) {
  iframe.style.width = container.clientWidth - 6 + 'px'
  iframe.style.height = document.documentElement.clientHeight - bar.clientHeight - 15 + 'px'
}

function onResize () {
  const iframe = document.getElementById('lyricsiframe')
  if (iframe) {
    setFrameDimensions(document.getElementById('lyricscontainer'), document.getElementById('lyricsiframe'), document.querySelector('.lyricsnavbar'))
  }
}
function initResize () {
  window.addEventListener('mousemove', onMouseMoveResize)
  window.addEventListener('mouseup', stopResize)
  window.removeEventListener('resize', onResize)
}
function onMouseMoveResize (e) {
  optionCurrentSize = 100 - (e.clientX / document.body.clientWidth * 100)
  resizeLeftContainer.style.width = (100 - optionCurrentSize) + '%'
  resizeContainer.style.width = optionCurrentSize + '%'
}
function stopResize () {
  window.removeEventListener('mousemove', onMouseMoveResize)
  window.removeEventListener('mouseup', stopResize)
  window.addEventListener('resize', onResize)
  onResize()
  GM.setValue('optioncurrentsize', optionCurrentSize)
}
function getCleanLyricsContainer () {
  document.querySelectorAll('.loadingspinner').forEach((spinner) => spinner.remove())

  const topContainer = document.querySelector('div.Root')
  if (!document.getElementById('lyricscontainer')) {
    topContainer.style.width = (100 - optionCurrentSize) + '%'
    topContainer.style.float = 'left'
    if (topContainer.style.getPropertyValue('--panel-gap')) {
      topContainer.style.marginRight = '-' + topContainer.style.getPropertyValue('--panel-gap')
    }
    resizeContainer = document.createElement('div')
    resizeContainer.id = 'lyricscontainer'
    resizeContainer.style = 'min-height: 100%; width: ' + optionCurrentSize + '%; position: relative; z-index: 1; float:left;background:black'
    topContainer.parentNode.insertBefore(resizeContainer, topContainer.nextSibling)
  } else {
    resizeContainer = document.getElementById('lyricscontainer')
    resizeContainer.innerHTML = ''
    topContainer.parentNode.insertBefore(resizeContainer, topContainer.nextSibling)
  }
  resizeLeftContainer = topContainer
  resizeContainer.style.zIndex = 10
  resizeContainer.classList.remove('genius-search-container')

  return document.getElementById('lyricscontainer')
}

function onNewSongPlaying () {
  genius.f.closeModalUIs()
}

async function onNoResults (songTitle, songArtistsArr) {
  const showSpotifyLyricsEnabled = await GM.getValue('show_spotify_lyrics', true)
  const submitSpotifyLyricsIgnored = JSON.parse(await GM.getValue('submit_spotify_lyrics_ignore', '[]'))

  const key = songTitle + ' - ' + songArtistsArr.join(', ')
  if (submitSpotifyLyricsIgnored.indexOf(key) !== -1) {
    // User has previously clicked "Cancel" on the confirm dialog for this song
    console.debug('onNoResults() Key "' + key + '" is ignored')
    return
  }

  if (showSpotifyLyricsEnabled && document.querySelector('[data-testid="lyrics-button"]')) {
    openAndAskToSubmitSpotifyLyrics(songTitle, songArtistsArr, false)
  }
}

async function openAndAskToSubmitSpotifyLyrics (songTitle, songArtistsArr, forceSubmit = false) {
  const submitSpotifyLyricsEnabled = forceSubmit || (await GM.getValue('submit_spotify_lyrics', true))
  const key = songTitle + ' - ' + songArtistsArr.join(', ')

  // Open lyrics if they are not already open
  if (!document.querySelector('#main-view [data-testid="lyrics-line"]')) {
    document.querySelector('[data-testid="lyrics-button"]').click()
  }
  // Wait one second for lyrics to open
  window.setTimeout(async function () {
    const lyrics = Array.from(document.querySelectorAll('#main-view [data-testid="lyrics-line"]')).map(div => div.textContent).join('\n')

    // Close lyrics again, if there are no lyrics
    if (document.querySelectorAll('#main-view [data-testid="lyrics-line"]').length === 0) {
      console.debug('Closing lyrics-view, because Spotify has no lyrics either.')
      document.querySelector('[data-testid="lyrics-button"]').click()
      return
    }

    // Check if the lyrics are behind a premium modal overlay
    for (let p = document.querySelector('#main-view [data-testid="lyrics-line"]'); p && p.parentElement; p = p.parentElement) {
      if (p.tagName === 'MAIN') {
        if (p.querySelector('button span')) {
          console.debug('Lyrics are behind paywall, abort submit to genius.')
          improveLyricsPaywall()
          return
        }
        break
      }
    }

    if (submitSpotifyLyricsEnabled && lyrics && lyrics.trim()) {
      // Add this song to the ignored list so we don't ask again
      GM.getValue('submit_spotify_lyrics_ignore', '[]').then(async function (s) {
        const arr = JSON.parse(s)
        arr.push(key)
        await GM.setValue('submit_spotify_lyrics_ignore', JSON.stringify(arr))
      })
      // Ask user if they want to submit the lyrics
      genius.f.closeModalUIs()
      if (forceSubmit || (await genius.f.modalConfirm(`Genius.com doesn't have the lyrics for this song but Spotify has the lyrics. Would you like to submit the lyrics from Spotify to Genius.com?\n(You need a Genius.com account to do this)\n${songTitle} by ${songArtistsArr.join(', ')}`))) {
        submitLyricsToGenius(songTitle, songArtistsArr, lyrics)
      } else {
        // Once (globally) show the suggestion to disable this feature
        GM.getValue('suggest_to_disable_submit_spotify_lyrics', true).then(async function (suggestToDisable) {
          if (suggestToDisable) {
            genius.f.modalAlert('You can disable this suggestion in the options of the script.')
            GM.setValue('suggest_to_disable_submit_spotify_lyrics', false)
          }
        })
      }
    }
  }, 1000)
}

function improveLyricsPaywall () {
  if (!document.querySelector('[data-testid="fullscreen-lyric"]')) {
    return
  }
  let main
  for (let p = document.querySelector('[data-testid="fullscreen-lyric"]'); p && p.parentElement; p = p.parentElement) {
    if (p.tagName === 'MAIN') {
      if (p.querySelector('button span')) {
        main = p
        break
      } else {
        return
      }
    }
  }
  const modal = main.querySelector('button span').parentNode.parentNode.parentNode
  modal.style.width = '50%'
  modal.style.height = '30%'
  modal.style.top = 'auto'
  modal.style.bottom = 0
  modal.style.left = 'auto'
  modal.style.right = 0
  const lyricsHolder = document.querySelector('[data-testid="fullscreen-lyric"]').parentNode
  const style = window.getComputedStyle(document.querySelector('[data-testid="fullscreen-lyric"]').firstElementChild, null)
  lyricsHolder.className = ''
  lyricsHolder.style.fontSize = style.fontSize
  lyricsHolder.style.fontWeight = style.fontWeight
  lyricsHolder.style.color = style.color
}

function submitLyricsFromMenu () {
  genius.f.closeModalUIs()

  const [ret, songTitle, songArtistsArr] = getSongTitleAndArtist()
  if (ret < 0) return

  if (songTitle && document.querySelector('[data-testid="lyrics-button"]')) {
    openAndAskToSubmitSpotifyLyrics(songTitle, songArtistsArr, true)
  } else {
    genius.f.modalAlert('Spotify lyrics are not available for this song.')
  }
}

function submitLyricsToGenius (songTitle, songArtistsArr, lyrics) {
  GM.setValue('submitToGenius', JSON.stringify({
    lyrics,
    songTitle,
    songArtistsArr
  })).then(function () {
    GM_openInTab('https://genius.com/songs/new', { active: true })
  })
}

async function fillGeniusForm () {
  const data = JSON.parse(await GM.getValue('submitToGenius', '{}'))
  await GM.setValue('submitToGenius', '{}')
  if ('lyrics' in data && 'songTitle' in data && 'songArtistsArr' in data) {
    document.getElementById('song_primary_artists__name').value = data.songArtistsArr.join(', ')
    document.getElementById('song_title').value = data.songTitle
    document.getElementById('song_lyrics').value = data.lyrics

    // Create keyup event on song name, to generate the warning about duplicates
    const evt = new KeyboardEvent('keyup', { bubbles: true, cancelable: true, key: 'e', char: 'e' })
    document.getElementById('song_primary_artists__name').dispatchEvent(evt)
    document.getElementById('song_title').dispatchEvent(evt)
  }
}

function hideLyrics () {
  addLyricsButton()
  document.querySelectorAll('.loadingspinner').forEach((spinner) => spinner.remove())
  if (document.getElementById('lyricscontainer')) {
    document.getElementById('lyricscontainer').parentNode.removeChild(document.getElementById('lyricscontainer'))
    const topContainer = document.querySelector('div.Root')
    topContainer.style.width = '100%'
    topContainer.style.removeProperty('float')
  }
}

function translateSearch (container) {
  const t = uiText()
  const isResults = container.dataset.searchView === 'results'
  const heading = container.querySelector('.genius-search-title')
  if (heading) {
    heading.textContent = isResults ? `${container.dataset.resultCount} ${t.results}` : t.search
  }
  const hide = container.querySelector('.genius-search-hide')
  if (hide) hide.textContent = t.hide
  const back = container.querySelector('.genius-search-back')
  if (back) back.textContent = t.back
  const input = container.querySelector('.genius-search-input')
  if (input) {
    input.placeholder = t.searchHint
    input.setAttribute('aria-label', t.searchHint)
  }
  const submit = container.querySelector('.genius-search-submit')
  if (submit) submit.textContent = t.searchButton
  const status = container.querySelector('.genius-search-status')
  if (status) {
    status.textContent = {
      searching: t.searching,
      error: t.searchError,
      empty: t.noResults
    }[status.dataset.status] || ''
  }
  for (const badge of container.querySelectorAll('.genius-search-badge')) {
    badge.textContent = t[badge.dataset.state] || badge.dataset.state
  }
  for (const views of container.querySelectorAll('.genius-search-views')) {
    views.textContent = `${views.dataset.count} ${t.view}`
  }
}

function searchShell (container, view, query) {
  container.replaceChildren()
  container.classList.add('genius-search-container')
  container.dataset.searchView = view
  const header = container.appendChild(document.createElement('div'))
  header.className = 'genius-search-header'
  const title = header.appendChild(document.createElement('h2'))
  title.className = 'genius-search-title'
  const actions = header.appendChild(document.createElement('div'))
  actions.className = 'genius-search-actions'
  if (view === 'results') {
    const back = actions.appendChild(document.createElement('button'))
    back.type = 'button'
    back.className = 'genius-search-back'
    back.addEventListener('click', () => showSearchField(query))
  }
  const hide = actions.appendChild(document.createElement('button'))
  hide.type = 'button'
  hide.className = 'genius-search-hide'
  hide.addEventListener('click', hideLyrics)
  translateSearch(container)
}

function listSongs (hits, container, query) {
  if (!container) container = getCleanLyricsContainer()
  searchShell(container, 'results', query)
  container.dataset.resultCount = hits.length
  const list = container.appendChild(document.createElement('ol'))
  list.className = 'genius-search-results'
  if (!hits.length) {
    const status = container.appendChild(document.createElement('p'))
    status.className = 'genius-search-status'
    status.dataset.status = 'empty'
  }
  const compoundTitle = genius.current.compoundTitle
  hits.forEach(hit => {
    const song = hit.result || {}
    const item = list.appendChild(document.createElement('li'))
    const button = item.appendChild(document.createElement('button'))
    button.type = 'button'
    button.className = 'genius-search-result'
    button.addEventListener('click', () => {
      genius.f.rememberLyricsSelection(compoundTitle, null, JSON.stringify(hit))
      genius.f.showLyrics(hit, hits.length)
    })
    const art = button.appendChild(document.createElement('span'))
    art.className = 'genius-search-art'
    const cover = song.song_art_image_thumbnail_url || song.header_image_thumbnail_url
    if (typeof cover === 'string' && /^https:\/\//.test(cover)) {
      const image = art.appendChild(document.createElement('img'))
      image.src = cover
      image.alt = ''
      image.loading = 'lazy'
    } else {
      art.textContent = 'G'
    }
    const info = button.appendChild(document.createElement('span'))
    info.className = 'genius-search-info'
    const name = info.appendChild(document.createElement('strong'))
    name.className = 'genius-search-song'
    name.textContent = song.title_with_featured || song.title || ''
    const artist = info.appendChild(document.createElement('span'))
    artist.className = 'genius-search-artist'
    artist.textContent = song.primary_artist?.name || ''
    const meta = info.appendChild(document.createElement('span'))
    meta.className = 'genius-search-meta'
    if (typeof song.stats?.pageviews === 'number') {
      const views = meta.appendChild(document.createElement('span'))
      views.className = 'genius-search-views'
      views.dataset.count = genius.f.metricPrefix(song.stats.pageviews, 1)
    }
    if (song.lyrics_state) {
      const state = meta.appendChild(document.createElement('span'))
      state.className = 'genius-search-badge'
      state.dataset.state = song.lyrics_state
    }
  })
  translateSearch(container)
}

const songTitleQuery = '.Root [data-testid="now-playing-bar"] .standalone-ellipsis-one-line a[href*="/album/"],[data-testid="context-item-info-title"] a[href*="/album/"],[data-testid="context-item-info-title"] a[href*="/track/"]'
const songArtistsQuery = '.Root [data-testid="now-playing-bar"] .standalone-ellipsis-one-line a[href*="/artist/"],a[data-testid="context-item-info-artist"][href*="/artist/"],[data-testid="context-item-info-artist"] a[href*="/artist/"]'

function getSongTitleAndArtist () {
  const songTitleDOM = document.querySelector(songTitleQuery)
  if (!songTitleDOM) {
    console.warn('The song title element is not found.')
    return [-1]
  }
  const songTitle = genius.f.cleanUpSongTitle(songTitleDOM.textContent)
  if (!songTitle) {
    console.warn('The song title is empty.')
    return [-2]
  }
  const songArtistsArr = []
  const seenArtistLinks = new Set()
  const ArtistLinks = document.querySelectorAll(songArtistsQuery)
  for (const e of ArtistLinks) {
    const href = e.getAttribute('href')
    if (seenArtistLinks.has(href)) continue
    seenArtistLinks.add(href)
    songArtistsArr.push(e.textContent.trim())
  }

  return [0, songTitle, songArtistsArr]
}

function addLyrics (force, beLessSpecific) {
  let musicIsPlaying = false
  const buttons = document.querySelectorAll('.Root button[data-testid="control-button-playpause"]')
  if (buttons.length) {
    buttons.forEach(function (button) {
      if (button.getAttribute('aria-label') === 'Pause' ||
          button.innerHTML.indexOf('M3 2h3v12H3zM10 2h3v12h-3z') !== -1 ||
          button.innerHTML.indexOf('M3 2h3v12H3zm7 0h3v12h-3z') !== -1 ||
          button.innerHTML.indexOf('M2.7 1a.7.7 0 00-.7.7v12.6a.7.7 0') !== -1 ||
          button.innerHTML.indexOf('M2.7 1a.7.7 0 0 0-.7.7v12.6a') !== -1
      ) {
        musicIsPlaying = true
      }
    })
  }
  const [ret, songTitle, songArtistsArr] = getSongTitleAndArtist()
  if (ret < 0) return
  genius.f.loadLyrics(force, beLessSpecific, songTitle, songArtistsArr, musicIsPlaying)
}

let lastPos = null
function parsePlaybackTime (text) {
  const value = text.trim()
  if (!/^\d+:[0-5]\d(?::[0-5]\d)?$/.test(value)) return null
  return value.split(':').reduce((seconds, part) => seconds * 60 + Number(part), 0)
}

function updateAutoScroll () {
  const currentElement = document.querySelector('[data-testid="player-controls"] [data-testid="playback-position"]')
  const rightElement = document.querySelector('[data-testid="player-controls"] [data-testid="playback-duration"]')
  if (!currentElement || !rightElement) return

  const rightText = rightElement.textContent.trim()
  const isRemaining = rightText.startsWith('-') || rightText.startsWith('−')
  const current = parsePlaybackTime(currentElement.textContent)
  const right = parsePlaybackTime(isRemaining ? rightText.slice(1) : rightText)
  if (current == null || right == null) return

  const duration = isRemaining ? current + right : right
  const pos = duration > 0 ? current / duration : null
  if (pos != null && pos >= 0 && pos <= 1 && lastPos !== pos) {
    genius.f.scrollLyrics(pos)
    lastPos = pos
  }
}

function startSearch (query, container) {
  const status = container.querySelector('.genius-search-status') || container.appendChild(document.createElement('p'))
  status.className = 'genius-search-status'
  status.dataset.status = 'searching'
  translateSearch(container)
  genius.f.searchByQuery(query, container, res => {
    if (res?.status === 200) {
      listSongs(res.hits, container, query)
    } else {
      status.dataset.status = 'error'
      translateSearch(container)
    }
  })
}

function showSearchField (query) {
  const container = getCleanLyricsContainer()
  searchShell(container, 'search', query)
  const form = container.appendChild(document.createElement('form'))
  form.className = 'genius-search-form'
  form.setAttribute('role', 'search')
  const input = form.appendChild(document.createElement('input'))
  input.type = 'search'
  input.className = 'genius-search-input'
  const current = genius.current
  input.value = query || current.compoundTitle?.replace('\t', ' ') ||
    (current.artists && current.title ? current.artists + ' ' + current.title : current.artists || '')
  const submit = form.appendChild(document.createElement('button'))
  submit.type = 'submit'
  submit.className = 'genius-search-submit'
  form.addEventListener('submit', event => {
    event.preventDefault()
    const value = input.value.trim()
    if (value) startSearch(value, container)
  })
  translateSearch(container)
  input.focus()
}

function addLyricsButton () {
  if (document.getElementById('showlyricsbutton')) {
    return
  }
  const b = document.createElement('div')
  b.setAttribute('id', 'showlyricsbutton')
  b.setAttribute('style', 'position:absolute; top: 0px; right:0px; font-size:14px; color:#ffff64; cursor:pointer; z-index:3000;')
  b.setAttribute('title', 'Load lyrics from genius.com')
  b.appendChild(document.createTextNode('🅖'))
  b.addEventListener('click', function onShowLyricsButtonClick () {
    genius.option.autoShow = true // Temporarily enable showing lyrics automatically on song change
    window.clearInterval(genius.iv.main)
    genius.iv.main = window.setInterval(main, 2000)
    b.remove()
    addLyrics(true)
  })
  document.body.appendChild(b)
  if (b.clientWidth < 10) {
    b.setAttribute('style', 'position:absolute; top: 0px; right:0px; font-size:14px; background-color:#0007; color:#ffff64; cursor:pointer; z-index:3000;border:1px solid #ffff64;border-radius: 100%;padding: 0px 5px;font-size: 10px;')
    b.innerHTML = 'G'
  }
}

function configShowSpotifyLyrics (div) {
  // Input: Show lyrics from Spotify if no lyrics found on genius.com
  const id = 'input945455'

  const input = div.appendChild(document.createElement('input'))
  input.type = 'checkbox'
  input.id = id
  GM.getValue('show_spotify_lyrics', true).then(function (v) {
    input.checked = v
  })

  const label = div.appendChild(document.createElement('label'))
  label.setAttribute('for', id)
  label.appendChild(document.createTextNode('Open lyrics from Spotify if no lyrics found on genius.com'))

  const onChange = function onChangeListener () {
    GM.setValue('show_spotify_lyrics', input.checked)
  }
  input.addEventListener('change', onChange)
}

function configSubmitSpotifyLyrics (div) {
  // Input: Submit lyrics from Spotify to genius.com
  const id = 'input337565'

  const input = div.appendChild(document.createElement('input'))
  input.type = 'checkbox'
  input.id = id
  input.setAttribute('title', '...in case Spotify has lyrics that genius.com does not have')
  GM.getValue('submit_spotify_lyrics', true).then(function (v) {
    input.checked = v
  })

  const label = div.appendChild(document.createElement('label'))
  label.setAttribute('for', id)
  label.appendChild(document.createTextNode('Suggest to submit lyrics from Spotify to genius.com'))
  label.setAttribute('title', '...in case Spotify has lyrics that genius.com does not have')

  const onChange = function onChangeListener () {
    GM.setValue('submit_spotify_lyrics', input.checked)
  }
  input.addEventListener('change', onChange)
}

function configHideSpotifySuggestions (div) {
  // Input: Hide suggestions and hints from Spotify about new features
  const id = 'input875687'

  const input = div.appendChild(document.createElement('input'))
  input.type = 'checkbox'
  input.id = id
  input.setAttribute('title', 'Hide suggestions and hints from Spotify about new features')
  GM.getValue('hide_spotify_suggestions', true).then(function (v) {
    input.checked = v
  })

  const label = div.appendChild(document.createElement('label'))
  label.setAttribute('for', id)
  label.appendChild(document.createTextNode('Hide suggestions and hints from Spotify about new features'))

  const onChange = function onChangeListener () {
    GM.setValue('hide_spotify_suggestions', input.checked)
  }
  input.addEventListener('change', onChange)
}

function configHideSpotifyNowPlayingView (div) {
  // Input: Hide "Now Playing View"
  const id = 'input12567826'

  const input = div.appendChild(document.createElement('input'))
  input.type = 'checkbox'
  input.id = id
  input.setAttribute('title', 'Hide Spotify\'s "Now Playing View"')
  GM.getValue('hide_spotify_now_playing_view', true).then(function (v) {
    input.checked = v
  })

  const label = div.appendChild(document.createElement('label'))
  label.setAttribute('for', id)
  label.appendChild(document.createTextNode('Hide Spotify\'s "Now Playing View"'))

  const onChange = function onChangeListener () {
    GM.setValue('hide_spotify_now_playing_view', input.checked)
  }
  input.addEventListener('change', onChange)
}

function isPortugueseInterface () {
  const locale = [document.documentElement.lang, navigator.language, ...(navigator.languages || [])]
  return locale.some(language => /^pt(?:-|$)/i.test(language || '')) || /^\/intl-pt(?:\/|$)/i.test(document.location.pathname)
}

// Add a dictionary and a language option here to support another interface language.
const UI_TEXT = {
  en: {
    language: 'Language',
    menuTitle: 'Options',
    support: 'Report a problem',
    lyricsGroup: 'Lyrics',
    advanced: 'Advanced',
    hide: 'Hide',
    options: 'Options',
    wrongLyrics: 'Wrong lyrics',
    back: 'Back to search',
    search: 'Search Genius',
    searchHint: 'Search for a song or artist',
    searchButton: 'Search',
    searching: 'Searching…',
    searchError: 'Search failed. Try again.',
    noResults: 'No results found',
    results: 'results',
    view: 'views',
    complete: 'Complete',
    incomplete: 'Incomplete',
    instrumental: 'Instrumental',
    autoShow: ' Automatically show lyrics when a new song starts',
    autoShowHint: '(if disabled, use the small button in the top right corner)',
    pip: 'Picture in Picture: ',
    pipHint: 'Show lyrics in a floating window if your browser supports it.',
    pipDisabled: 'Disabled',
    pipHidden: 'When tab is hidden',
    pipAlways: 'Always',
    firefoxSize: 'Firefox PiP size: ',
    firefoxFont: 'Firefox PiP font size: ',
    firefoxHint: 'These values are saved automatically.',
    theme: 'Theme: ',
    font: 'Font size: ',
    annotations: ' Show annotations',
    scroll: ' Automatic scrolling',
    spotifyLyrics: ' Show Spotify lyrics if no lyrics are found on Genius',
    submit: ' Suggest submitting Spotify lyrics to Genius',
    suggestions: ' Hide Spotify suggestions',
    nowPlaying: ' Hide Spotify Now Playing View',
    romaji: 'Romaji: ',
    low: 'Low Priority',
    high: 'High Priority',
    compression: 'Compression: ',
    enabled: 'Enabled',
    disabled: 'Disabled',
    close: 'Close',
    clearCache: 'Clear cache',
    cleared: 'Cleared',
    debugOn: 'Debug is on',
    debugOff: 'Debug is off',
    powered: 'Powered by ',
    contributors: ' and contributors.',
    license: 'Licensed under the GNU General Public License v3.0'
  },
  'pt-PT': {
    language: 'Idioma',
    menuTitle: 'Opções das letras',
    support: 'Reportar um problema',
    lyricsGroup: 'Letras',
    advanced: 'Avançado',
    hide: 'Ocultar',
    options: 'Opções',
    wrongLyrics: 'Letra errada',
    back: 'Voltar à pesquisa',
    search: 'Pesquisar no Genius',
    searchHint: 'Pesquisar música ou artista',
    searchButton: 'Pesquisar',
    searching: 'A pesquisar…',
    searchError: 'A pesquisa falhou. Tenta novamente.',
    noResults: 'Sem resultados',
    results: 'resultados',
    view: 'visualizações',
    complete: 'Completa',
    incomplete: 'Incompleta',
    instrumental: 'Instrumental',
    autoShow: ' Mostrar letras automaticamente ao mudar de música',
    autoShowHint: '(se desativares, podes abri-las pelo botão no canto superior direito)',
    pip: 'Janela flutuante: ',
    pipHint: 'Mostra as letras numa janela flutuante, se o navegador permitir.',
    pipDisabled: 'Desativada',
    pipHidden: 'Quando o separador está oculto',
    pipAlways: 'Sempre',
    firefoxSize: 'Tamanho da janela no Firefox: ',
    firefoxFont: 'Tamanho do texto: ',
    firefoxHint: 'Valores guardados automaticamente.',
    theme: 'Tema: ',
    font: 'Tamanho do texto: ',
    annotations: ' Mostrar anotações',
    scroll: ' Deslocação automática',
    spotifyLyrics: ' Mostrar letras do Spotify quando não existem no Genius',
    submit: ' Sugerir letras do Spotify para o Genius',
    suggestions: ' Ocultar sugestões do Spotify',
    nowPlaying: ' Ocultar a vista «A reproduzir» do Spotify',
    romaji: 'Romaji: ',
    low: 'Prioridade baixa',
    high: 'Prioridade alta',
    compression: 'Compressão: ',
    enabled: 'Ativada',
    disabled: 'Desativada',
    close: 'Fechar',
    clearCache: 'Limpar cache',
    cleared: 'Cache limpa',
    debugOn: 'Diagnóstico ativo',
    debugOff: 'Diagnóstico inativo',
    powered: 'Criado com ',
    contributors: ' e colaboradores.',
    license: 'Licenciado sob a GNU General Public License v3.0'
  }
}

function uiText () {
  const language = uiLanguagePreference === 'auto'
    ? (isPortugueseInterface() ? 'pt-PT' : 'en')
    : uiLanguagePreference
  return UI_TEXT[language] || UI_TEXT.en
}

function styleLyricsBar (bar) {
  const t = uiText()
  const labels = {
    '.genius-lyrics-hide-button': t.hide,
    '.genius-lyrics-config-button': t.options,
    '.genius-lyrics-wronglyrics-button': t.wrongLyrics
  }
  for (const [selector, label] of Object.entries(labels)) {
    const button = bar.querySelector(selector)
    if (button) button.textContent = label
  }
  const back = bar.querySelector('.genius-lyrics-back-button')
  if (back) back.textContent = t.back
}

function translateOptionsMenu (win) {
  const t = uiText()
  const row = id => win.querySelector(`#${id}`)?.parentElement
  const label = (id, value) => {
    const target = win.querySelector(`label[for="${id}"]`)
    if (target) target.textContent = value
  }
  const selectLabel = (id, value) => {
    const text = [...(row(id)?.childNodes || [])].find(node => node.nodeType === 3)
    if (text) text.textContent = value
  }
  const hint = (id, value) => {
    const text = [...(row(id)?.childNodes || [])].find(node => node.nodeType === 3)
    if (text) text.textContent = value
  }
  const options = (id, names) => {
    for (const option of win.querySelectorAll(`#${id} option`)) {
      if (names[option.value]) option.textContent = names[option.value]
    }
  }
  win.querySelector('h1').textContent = t.menuTitle
  const support = win.querySelector(':scope > a')
  if (support) support.textContent = t.support
  label('genius-ui-language', t.language + ': ')
  label('checkAutoShow748', t.autoShow)
  hint('checkAutoShow748', t.autoShowHint)
  label('selectPictureInPictureMode748', t.pip)
  hint('selectPictureInPictureMode748', t.pipHint)
  options('selectPictureInPictureMode748', {
    disabled: t.pipDisabled, 'when-tab-is-hidden': t.pipHidden, always: t.pipAlways
  })
  const firefox = row('firefoxPiPWidth748')
  if (firefox) {
    const labels = firefox.querySelectorAll('label')
    if (labels[0]) labels[0].textContent = t.firefoxSize
    if (labels[1]) labels[1].textContent = t.firefoxFont
    const firefoxHint = [...firefox.childNodes].find(node => node.nodeType === 3 && /These values|Valores guardados/.test(node.textContent))
    if (firefoxHint) firefoxHint.textContent = t.firefoxHint
  }
  selectLabel('selectTheme748', t.theme)
  label('inputFontSize748', t.font)
  label('checkAnnotationsEnabled748', t.annotations)
  label('checkAutoScrollEnabled748', t.scroll)
  label('input945455', t.spotifyLyrics)
  label('input337565', t.submit)
  label('input875687', t.suggestions)
  label('input12567826', t.nowPlaying)
  selectLabel('selectRomajiPriority748', t.romaji)
  options('selectRomajiPriority748', { low: t.low, high: t.high })
  selectLabel('selectLZCompression748', t.compression)
  options('selectLZCompression748', { true: t.enabled, false: t.disabled })
  const close = win.querySelector('#myconfigwin39457845_close_button')
  if (close) {
    close.textContent = t.close
    const cache = close.nextElementSibling
    if (cache) {
      cache.textContent = cache.textContent
        .replace(/^(Clear cache|Limpar cache)/, t.clearCache)
        .replace(/^(Cleared|Cache limpa)$/, t.cleared)
    }
    const debug = cache?.nextElementSibling
    if (debug) {
      const on = debug.textContent === UI_TEXT.en.debugOn || debug.textContent === UI_TEXT['pt-PT'].debugOn
      debug.textContent = on ? t.debugOn : t.debugOff
    }
  }
  for (const heading of win.querySelectorAll('.genius-options-group h2')) {
    if (heading.parentElement.classList.contains('genius-options-lyrics')) heading.textContent = t.lyricsGroup
  }
  const summary = win.querySelector('.genius-options-advanced summary')
  if (summary) summary.textContent = t.advanced
  const footer = win.lastElementChild?.querySelector('p')
  for (const text of footer?.childNodes || []) {
    if (text.nodeType !== 3) continue
    if (/^(Powered by |Criado com )$/.test(text.textContent)) text.textContent = t.powered
    if (/^( and contributors\.| e colaboradores\.)$/.test(text.textContent)) text.textContent = t.contributors
    if (/^(Licensed under|Licenciado sob)/.test(text.textContent)) text.textContent = t.license
  }
}

function styleOptionsMenu (win) {
  const row = id => win.querySelector(`#${id}`)?.parentElement
  const autoShow = row('checkAutoShow748')
  const pictureInPicture = row('selectPictureInPictureMode748')
  const firefoxPictureInPicture = row('firefoxPiPWidth748')
  const theme = row('selectTheme748')
  const fontSize = row('inputFontSize748')
  const annotations = row('checkAnnotationsEnabled748')
  const autoScroll = row('checkAutoScrollEnabled748')
  const spotifyLyrics = row('input945455')
  const submitLyrics = row('input337565')
  const hideSuggestions = row('input875687')
  const hideNowPlaying = row('input12567826')
  const romaji = row('selectRomajiPriority748')
  const compression = row('selectLZCompression748')
  const close = win.querySelector('#myconfigwin39457845_close_button')
  const actions = close?.parentElement
  if (!autoShow || !actions) return

  const languageRow = win.insertBefore(document.createElement('div'), autoShow)
  languageRow.className = 'genius-language-picker'
  const languageLabel = languageRow.appendChild(document.createElement('label'))
  languageLabel.htmlFor = 'genius-ui-language'
  const language = languageRow.appendChild(document.createElement('select'))
  language.id = 'genius-ui-language'
  for (const [value, title] of [['auto', 'Auto / Automático'], ['en', 'English'], ['pt-PT', 'Português (Portugal)']]) {
    const option = language.appendChild(document.createElement('option'))
    option.value = value
    option.textContent = title
  }
  language.value = uiLanguagePreference
  language.addEventListener('change', () => {
    uiLanguagePreference = language.value
    GM.setValue('ui_language', uiLanguagePreference)
    translateOptionsMenu(win)
    document.querySelectorAll('.lyricsnavbar').forEach(styleLyricsBar)
    document.querySelectorAll('.genius-search-container').forEach(translateSearch)
  })

  const addRows = (parent, rows) => rows.filter(Boolean).forEach(element => parent.appendChild(element))
  const createSection = (title, rows, className) => {
    const section = win.insertBefore(document.createElement('section'), actions)
    section.className = 'genius-options-group ' + className
    const heading = section.appendChild(document.createElement('h2'))
    heading.textContent = title
    addRows(section, rows)
  }
  createSection('Lyrics', [autoShow, theme, fontSize, annotations, autoScroll], 'genius-options-lyrics')
  createSection('Spotify', [spotifyLyrics, submitLyrics, hideSuggestions, hideNowPlaying], 'genius-options-spotify')
  const advanced = win.insertBefore(document.createElement('details'), actions)
  advanced.className = 'genius-options-advanced'
  advanced.appendChild(document.createElement('summary'))
  addRows(advanced, [pictureInPicture, firefoxPictureInPicture, romaji, compression])
  if (pictureInPicture?.querySelector('select')?.value !== 'disabled') advanced.open = true

  const cache = close.nextElementSibling
  const debug = cache?.nextElementSibling
  if (cache) {
    cache.addEventListener('click', () => {
      const observer = new window.MutationObserver(() => {
        translateOptionsMenu(win)
        observer.disconnect()
      })
      observer.observe(cache, { childList: true })
    })
  }
  if (debug) {
    debug.addEventListener('click', () => {
      const observer = new window.MutationObserver(() => {
        translateOptionsMenu(win)
        observer.disconnect()
      })
      observer.observe(debug, { childList: true })
    })
  }
  const version = win.lastElementChild?.appendChild(document.createElement('small'))
  if (version) {
    version.className = 'genius-options-version'
    version.textContent = 'Spotify Genius Lyrics v23.6.21.6 · GeniusLyrics v5.16.21.3'
  }
  translateOptionsMenu(win)
}

function addCss () {
  document.head.appendChild(document.createElement('style')).innerHTML = `
  .lyricsiframe {
    opacity:0.1;
    transition:opacity 2s;
    margin:0px;
    padding:0px;
  }
  .loadingspinnerholder {
    position:absolute;
    top:100px;
    left:100px;
    cursor:progress
  }
  .lyricsnavbar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px;
    box-sizing: border-box;
    min-height: 44px;
    margin: 0;
    padding: 5px 8px;
    background: #181818;
    border-bottom: 1px solid #ffffff26;
    font-size: 12px !important;
  }

  .lyricsnavbar > span:not(.second-line-separator) {
    display: inline-flex;
    align-items: center;
    min-height: 30px;
    padding: 2px 8px;
    border-radius: 6px;
    color: #d6d6d6;
    transition: background-color 160ms, color 160ms;
  }
  .lyricsnavbar > span:not(.second-line-separator):hover {
    color: #fff;
    background: #ffffff1a;
  }
  .lyricsnavbar .second-line-separator {
    display: none;
  }
  .lyricsnavbar .genius-lyrics-config-button {
    color: #fff;
  }

  #myoverlay7658438 {
    background: #000b;
  }
  #myconfigwin39457845 {
    box-sizing: border-box;
    width: min(600px, calc(100vw - 32px));
    max-width: none;
    max-height: calc(100vh - 32px);
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    padding: 22px;
    border: 1px solid #ffffff30;
    border-radius: 14px;
    background: #1c1c1c;
    color: #f5f5f5;
    box-shadow: 0 20px 60px #0009;
    font-size: 14px;
    line-height: 1.5;
    scrollbar-color: #696969 #1c1c1c;
  }
  #myconfigwin39457845 h1 {
    padding: 0;
    margin: 0 0 8px;
    font-size: 24px;
  }
  #myconfigwin39457845 > a:link,
  #myconfigwin39457845 > a:visited {
    display: block;
    margin-bottom: 16px;
    color: #b3eac6;
    font-size: 12px;
    overflow-wrap: anywhere;
  }
  #myconfigwin39457845 > a:hover {
    color: #d4f8df;
    font-size: 12px;
  }
  #myconfigwin39457845 > div {
    box-sizing: border-box;
    margin: 8px 0;
    padding: 12px 14px;
    border: 1px solid #ffffff18;
    border-radius: 8px;
    background: #262626;
  }
  #myconfigwin39457845 .genius-options-group,
  #myconfigwin39457845 .genius-options-advanced {
    display: block;
    margin: 16px 0 0;
    padding: 0;
    border: 0;
    background: transparent;
  }
  #myconfigwin39457845 .genius-options-group h2,
  #myconfigwin39457845 .genius-options-advanced summary {
    margin: 0 0 6px;
    color: #b3b3b3;
    font-size: 13px;
    font-weight: 700;
    letter-spacing: .03em;
  }
  #myconfigwin39457845 .genius-options-advanced summary {
    padding: 8px 2px;
    cursor: pointer;
  }
  #myconfigwin39457845 .genius-options-group > div,
  #myconfigwin39457845 .genius-options-advanced > div {
    box-sizing: border-box;
    margin: 6px 0;
    padding: 9px 12px;
    border: 1px solid #ffffff18;
    border-radius: 8px;
    background: #262626;
  }
  #myconfigwin39457845 .genius-options-group > div label,
  #myconfigwin39457845 .genius-options-advanced > div label {
    line-height: 1.4;
  }
  #myconfigwin39457845 .genius-options-advanced summary:focus-visible {
    outline: 2px solid #1ed760;
    outline-offset: 2px;
  }
  #myconfigwin39457845 > .genius-language-picker {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin: 12px 0;
    padding: 10px 12px;
  }
  #myconfigwin39457845 .genius-language-picker select {
    min-width: 150px;
  }
  #myconfigwin39457845 .genius-options-version {
    display: block;
    margin-top: 8px;
    color: #b3b3b3;
    font-size: 11px;
  }
  #myconfigwin39457845 input[type=checkbox] {
    accent-color: #1ed760;
  }
  #myconfigwin39457845 label {
    cursor: pointer;
  }
  #myconfigwin39457845 select,
  #myconfigwin39457845 input[type=number],
  #myconfigwin39457845 input[type=text] {
    max-width: 100%;
    padding: 5px 7px;
    border: 1px solid #ffffff40;
    border-radius: 5px;
    background: #333;
    color: #fff;
    font: inherit;
  }
  #myconfigwin39457845 button {
    margin: 2px 6px 2px 0;
    padding: 6px 10px;
    border: 1px solid #ffffff40;
    border-radius: 6px;
    background: #383838;
    color: #fff;
    font: inherit;
  }
  #myconfigwin39457845 button:hover,
  #myconfigwin39457845 button:focus-visible {
    background: #4b4b4b;
    border-color: #fff8;
  }
  #myconfigwin39457845_close_button {
    background: #1ed760 !important;
    border-color: #1ed760 !important;
    color: #121212 !important;
    font-weight: 700 !important;
  }
  #myconfigwin39457845 :is(button, select, input, a):focus-visible {
    outline: 2px solid #1ed760;
    outline-offset: 2px;
  }
  #lyricscontainer.genius-search-container {
    box-sizing: border-box;
    min-height: 100%;
    padding: 18px 14px;
    border-left: 1px solid #ffffff1f;
    background: #181818 !important;
    color: #f5f5f5;
    overflow-y: auto;
  }
  .genius-search-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 8px;
    margin-bottom: 14px;
  }
  .genius-search-title {
    margin: 0;
    font-size: 19px;
    line-height: 1.25;
  }
  .genius-search-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .genius-search-container :is(button, input) {
    font: inherit;
  }
  .genius-search-container button {
    cursor: pointer;
    border: 1px solid #ffffff38;
    border-radius: 7px;
    color: #f5f5f5;
    background: #292929;
  }
  .genius-search-container button:hover {
    background: #383838;
  }
  .genius-search-container :is(button, input):focus-visible {
    outline: 2px solid #1ed760;
    outline-offset: 2px;
  }
  .genius-search-actions button {
    min-height: 32px;
    padding: 5px 9px;
  }
  .genius-search-form {
    display: flex;
    gap: 7px;
    width: 100%;
  }
  .genius-search-input {
    box-sizing: border-box;
    min-width: 0;
    flex: 1;
    padding: 9px 12px;
    border: 1px solid #ffffff4a;
    border-radius: 8px;
    color: white;
    background: #292929;
  }
  .genius-search-submit {
    min-height: 40px;
    padding: 8px 12px;
    border-color: #1ed760 !important;
    color: #121212 !important;
    background: #1ed760 !important;
    font-weight: 700 !important;
  }
  .genius-search-results {
    display: grid;
    gap: 7px;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .genius-search-result {
    box-sizing: border-box;
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    padding: 8px;
    text-align: left;
  }
  .genius-search-art {
    flex: 0 0 48px;
    display: grid;
    place-items: center;
    width: 48px;
    height: 48px;
    border-radius: 5px;
    overflow: hidden;
    background: #383838;
    color: #b3b3b3;
    font-weight: 700;
  }
  .genius-search-art img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .genius-search-info {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .genius-search-song, .genius-search-artist {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .genius-search-song { font-size: 14px; }
  .genius-search-artist, .genius-search-meta {
    color: #b3b3b3;
    font-size: 12px;
  }
  .genius-search-meta { display: flex; gap: 8px; }
  .genius-search-badge {
    color: #a7eac0;
    text-transform: capitalize;
  }
  .genius-search-status {
    color: #b3b3b3;
    line-height: 1.5;
  }
  .geniushits li.tracklist-row {
    cursor:pointer
  }
  .geniushits li.tracklist-row:hover {
    background-color: #fff5;
    border-radius: 5px;
  }
  .geniushits li .geniushiticonout {
    display:inline-block;
  }
  .geniushits li:hover .geniushiticonout {
    display:none
  }
  .geniushits li .geniushiticonover {
    display:none
  }
  .geniushits li:hover .geniushiticonover {
    display:inline-block;
    padding-top:5px;
  }
  .geniushiticon {
    width:25px;
    height:2em;
    display:inline-block;
    vertical-align: top;
  }
  .geniushitname {
    display:inline-block;
    position: relative;
    overflow:hidden
  }
  .geniushitname .tracklist-name {
    font-size: 16px;
    font-weight: 400;
    color:white;
  }
  .geniushitname.runningtext .tracklist-name {
    display: inline-block;
    position: relative;
    animation: 3s linear 1s infinite normal runtext;
  }

  .geniushitname.runningtext:hover .tracklist-name {
    animation: none !important;
  }

  .geniushits .second-line-separator {
    opacity: 0.7
  }

  .geniushitname .geniusbadge {
    color: #121212;
    background-color: hsla(0,0%,100%,.6);
    border-radius: 2px;
    text-transform: uppercase;
    font-size: 9px;
    line-height: 10px;
    min-width: 16px;
    height: 16px;
    padding: 0 2px;
    margin: 0 3px;
  }

  @keyframes runtext {
    0%, 25% {
      transform: translateX(0%);
      left: 0%;
    }
    75%, 100% {
      transform: translateX(-100%);
      left: 100%;
    }
  }

  `
}

function styleCompactLyricsFrame ({ document: iframeDocument, theme }) {
  if (theme.themeKey !== 'spotify' && theme.themeKey !== 'cleanwhite') return

  const style = iframeDocument.createElement('style')
  style.textContent = `
    html .lyrics_body_pad {
      position: relative;
      padding-top: max(50vh, 175px);
    }
    .myheader {
      box-sizing: border-box;
      position: absolute;
      top: 12px;
      left: 0;
      right: 0;
      display: flex;
      align-items: flex-start;
      gap: 12px;
      max-width: none;
      max-height: calc(max(50vh, 175px) - 18px);
      margin: 0 10px;
      padding: 0 0 12px;
      overflow: auto;
    }
    .genius-cover-link {
      flex: 0 0 72px;
    }
    .genius-cover-link img {
      display: block;
      width: 72px;
      height: 72px;
      border-radius: 6px;
      object-fit: cover;
    }
    .genius-header-details {
      min-width: 0;
      flex: 1;
    }
    .myheader h1.mytitle {
      line-height: 1.2;
      margin-bottom: .25em;
      overflow-wrap: anywhere;
    }
    #lyrics-root.mylyrics {
      margin-top: 0;
      padding: 0 10px;
      line-height: 1.6;
      overflow-wrap: break-word;
    }
    #lyrics-root [data-lyrics-container="true"] > p {
      margin: 0;
    }
  `
  if (theme.themeKey === 'spotify') {
    style.textContent += '#lyrics-root.mylyrics { color: #e5e5e5; }'
  }
  iframeDocument.head.appendChild(style)
}

function styleIframeContent () {
  if (genius.option.themeKey === 'genius' || genius.option.themeKey === 'geniusReact') {
    genius.style.enabled = true
    genius.style.setup = () => {
      genius.style.setup = null // run once; set variables to genius.styleProps
      if (genius.option.themeKey !== 'genius' && genius.option.themeKey !== 'geniusReact') {
        genius.style.enabled = false
        return false
      }
      return true
    }
  } else {
    genius.style.enabled = false
    genius.style.setup = null
  }
}

function main () {
  if (document.querySelector('.Root [data-testid="player-controls"] [data-testid="playback-progressbar"]') && document.querySelector(songTitleQuery)) {
    if (genius.option.autoShow) {
      addLyrics()
    } else {
      addLyricsButton()
    }
  }
}

if (document.location.hostname === 'genius.com') {
  // https://genius.com/songs/new
  fillGeniusForm()
} else {
  window.setInterval(function removeAds () {
    // Remove "premium" button
    try {
      const button = document.querySelector('button[class^=Button][aria-label*=Premium]')
      if (button) {
        button.style.display = 'none'
      }
    } catch (e) {
      console.warn(e)
    }
    // Remove "install app" button
    try {
      const button = document.querySelector('a[href*="/download"]')
      if (button) {
        button.style.display = 'none'
      }
    } catch (e) {
      console.warn(e)
    }
    // Remove iframe "GET 3 MONTHS FREE"
    try {
      const iframe = document.querySelector('iframe[data-testid="inAppMessageIframe"]')
      if (iframe && iframe.contentDocument && iframe.contentDocument.body) {
        iframe.contentDocument.body.querySelectorAll('button').forEach(function (button) {
          if (button.parentNode.innerHTML.indexOf('Dismiss_action') !== -1) {
            button.click()
          }
        })
      }
    } catch (e) {
      console.warn(e)
    }
    // Remove another iframe "GET 3 MONTHS FREE"
    try {
      const iframe = document.querySelector('.ReactModalPortal iframe[srcdoc*="/purchase/"]')
      if (iframe && iframe.contentDocument && iframe.contentDocument.body) {
        const dismissButtons = Array.from(iframe.contentDocument.body.querySelectorAll('button')).filter(b => b.textContent.toLowerCase().includes('dismiss'))
        if (dismissButtons.length) {
          dismissButtons[0].click()
        }
        const nonUrlButtons = Array.from(iframe.contentDocument.body.querySelectorAll('button')).filter(b => b.dataset.clickToActionAction !== 'URL')
        if (nonUrlButtons.length) {
          nonUrlButtons[0].click()
        }
      }
    } catch (e) {
      console.warn(e)
    }

    GM.getValue('hide_spotify_suggestions', true).then(function (hideSuggestions) {
      if (hideSuggestions) {
        // Remove hints and suggestions
        document.querySelectorAll('.encore-announcement-set button[class*="Button-"]').forEach(b => b.click())
        // Check "show never again"
        document.querySelectorAll('#dont.show.onboarding.npv').forEach(c => (c.checked = true))
        // Close bubble
        document.querySelectorAll('.tippy-box button[class*="Button-"]').forEach(b => b.click())
      }
    })

    GM.getValue('hide_spotify_now_playing_view', true).then(function (hideNowPlaying) {
      if (hideNowPlaying) {
        // Close "Now Playing View"

        // New: 2025-12
        document.querySelectorAll('.NowPlayingView button[aria-label="Hide Now Playing view"]').forEach(function (b) {
          b.click()
        })
        document.querySelectorAll('.NowPlayingView button[aria-label="Ocultar vista Em reprodução"]').forEach(function (b) {
          b.click()
        })

        // Old: 2025-04
        document.querySelectorAll('[data-testid="control-button-npv"][data-active="true"]').forEach(function (b) {
          b.click()
        })
      }
    })
  }, 3000)

  genius = geniusLyrics({
    GM,
    scriptName,
    scriptIssuesURL: 'https://github.com/cvzi/Spotify-Genius-Lyrics-userscript/issues',
    scriptIssuesTitle: 'Report problem: github.com/cvzi/Spotify-Genius-Lyrics-userscript/issues',
    domain: 'https://open.spotify.com',
    emptyURL: 'https://open.spotify.com/robots.txt',
    main,
    addCss,
    listSongs,
    showSearchField,
    addLyrics,
    hideLyrics,
    getCleanLyricsContainer,
    setFrameDimensions,
    initResize,
    onResize,
    iframeLoadedCallback2: styleCompactLyricsFrame,
    onLyricsBarReady: styleLyricsBar,
    onOptionsReady: styleOptionsMenu,
    config: [
      configShowSpotifyLyrics,
      configSubmitSpotifyLyrics,
      configHideSpotifySuggestions,
      configHideSpotifyNowPlayingView
    ],
    toggleLyricsKey: {
      shiftKey: true,
      ctrlKey: false,
      altKey: false,
      key: 'L'
    },
    onNoResults,
    onNewSongPlaying
  })

  genius.option.enableStyleSubstitution = true
  genius.option.cacheHTMLRequest = true // 1 lyrics page consume 2XX KB [OR 25 ~ 50KB under ]

  genius.onThemeChanged.push(styleIframeContent)

  GM.registerMenuCommand(scriptName + ' - Show lyrics', () => addLyrics(true))
  GM.registerMenuCommand(scriptName + ' - Options', () => genius.f.config())
  GM.registerMenuCommand(scriptName + ' - Submit lyrics to Genius', () => submitLyricsFromMenu())
  window.setInterval(updateAutoScroll, 1000)
  window.setInterval(improveLyricsPaywall, 10000)
}
