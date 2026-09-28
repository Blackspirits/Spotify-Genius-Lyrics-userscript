# Spotify-Genius-Lyrics-userscript
A userscript or greasemonkey script that shows lyrics from [genius.com](https://genius.com/) on the [Spotify Web Player](https://open.spotify.com/)

## BlackSpirits fork: line highlighting and languages

The interface supports 15 languages: English, Português (Portugal), Português (Brasil), Español, Français, Deutsch, Italiano, 简体中文, हिन्दी, العربية, বাংলা, Русский, 日本語, 한국어 and Bahasa Indonesia. Choose a language in **Options → Language**, or keep **Automatic** to follow the Spotify page language.

**Highlight current line** is enabled by default and can be turned off in **Options → Lyrics**. For each playing song, the script looks up timed lines from [LRCLIB](https://lrclib.net/docs) using its title and artist. It highlights a line in the Genius text only when title, artist, duration and enough lines match. If no reliable match is available, the existing Genius lyrics and automatic scrolling continue unchanged. Timing is by line, not by word. The lookup sends the current title and artist to LRCLIB; results are cached in memory for the browser session.

This work is being tested in a draft pull request. The installation link below points to the original project on Greasy Fork, not this fork.

It's primarily designed for Firefox and Chrome with
[Tampermonkey](https://www.tampermonkey.net/) [![Chrome logo](https://raw.githubusercontent.com/OpenUserJS/OpenUserJS.org/master/public/images/ua/chrome16.png)](https://chrome.google.com/webstore/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo) [![Firefox logo](https://raw.githubusercontent.com/OpenUserJS/OpenUserJS.org/master/public/images/ua/firefox16.png)](https://addons.mozilla.org/en-US/firefox/addon/tampermonkey/).

This userscript **DOES NOT** work with Greasemonkey because of [this bug greasemonkey/issues/2574](https://github.com/greasemonkey/greasemonkey/issues/2574) in Greasemonkey.

If you already have a userscript extension installed, you can install it below:

[**Click here to install**](https://greasyfork.org/scripts/377439-spotify-genius-lyrics/code/Spotify%20Genius%20Lyrics.user.js) 
Tested with Firefox/**Tampermonkey** and Chrome/**Tampermonkey**.

Family of GeniusLyrics Userscripts:
*   Powered by **GeniusLyrics Library** [GitHub](https://github.com/cvzi/genius-lyrics-userscript/) [Greaskfork](https://greasyfork.org/en/scripts/406698-geniuslyrics)
*   **Spotify Genius Lyrics** [GitHub](https://github.com/cvzi/Spotify-Genius-Lyrics-userscript) [Greaskfork](https://greasyfork.org/en/scripts/377439-spotify-genius-lyrics)
*   **Youtube Genius Lyrics** [GitHub](https://github.com/cvzi/Youtube-Genius-Lyrics-userscript) [Greaskfork](https://greasyfork.org/en/scripts/386259-youtube-genius-lyrics)
*   **Youtube Music Genius Lyrics** [GitHub](https://github.com/cvzi/Youtube-Music-Genius-Lyrics-userscript/) [Greaskfork](https://greasyfork.org/en/scripts/406892-youtube-music-genius-lyrics)

### Contributors:
[![Contributors](https://contrib.rocks/image?repo=cvzi/Spotify-Genius-Lyrics-userscript)](https://github.com/cvzi/Spotify-Genius-Lyrics-userscript/graphs/contributors)

Screenshot (Spotify theme):
![Screenshot of spotify web player with lyrics](screenshotSpotifyTheme.png)

Screenshot (Genius theme):
![Screenshot with the genius theme enabled](screenshotGeniusTheme.png)

Screenshot (Clean white theme):
![Screenshot with the new theme genius theme enabled](screenshotWhiteTheme.png)

![Keyboard shortcut](keyboard.png)

[![JavaScript Style Guide](https://img.shields.io/badge/code_style-standard-brightgreen.svg)](https://standardjs.com)
