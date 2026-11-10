# BreakFree for YouTube

Break free from the YouTube algorithm and eliminate background clutter.

A free Chrome extension with 245 settings across 13 pages of YouTube. Nothing is locked, there are no accounts, and nothing leaves your browser except Chrome's own settings sync.

## Install

1. Open `chrome://extensions`.
2. Turn on **Developer mode** (top right).
3. Click **Load unpacked** and pick this folder, or unzip `breakfree-youtube.zip` and pick the unzipped folder.
4. Pin BreakFree from the puzzle-piece menu.

The Calm template is on after install: no Shorts, autoplay, end-screen suggestions or comments.

Changes in the popup apply to open YouTube tabs immediately. BreakFree does not block or hide ads.

## What it covers

| Page | Highlights |
| --- | --- |
| General | Hide Shorts everywhere, mixes, Playables, grayscale everything |
| Home Page | Hide the feed, chips, Shorts, extra shelves, watched videos; open Subscriptions or Watch Later instead; videos per row |
| Left Sidebar | Hide the whole sidebar or single entries (Shorts, Subscriptions, You, Explore, More from YouTube, footer) |
| Header | Search bar, suggestions, previous searches, voice search, logo (color, link, country code, wordmark), Create, notifications, sign-in, whole header |
| Video Page | Related videos with centering (plus a one-time "Show recommendations for this video" button), live chat, playlist, fundraiser, auto chapters, fixed sidebar, end screens, cards, heatmap, autoplay off, auto theater, every player button, every button under the player, description pieces, comments and every part of a comment |
| Video Item | Hide, replace, flip, blur, gray or fade thumbnails; hover previews; title case and full titles; avatar, channel, views, date, duration, menu, badges |
| Search Page | Channels, playlists, mixes, Shorts, For You and Trending shelves, People also search for, watched videos, infinite scroll, sidebar, default sort order |
| Subscriptions | Watched, live, upcoming, Shorts; list layout |
| Channel Page | Start tab, every header element, every tab, every Home section, Play All buttons |
| Shorts Page | Open Shorts in the normal player, disable scrolling, every overlay detail and button |
| Library Page | Your avatar and each section on the You page |
| Embed Videos | Players embedded on other sites: end screens, pause suggestions, title, avatar, watermark, every control |
| Decoration | Font, accent color and background color |

### Tools (menu, top left)

* **Active Settings**: every setting that's on in the current preset, in one flat list grouped by page. Turn things off right there.
* **Filters**: hide videos by title words or by channel name or @handle, and set what counts as "watched" (10 to 90 percent).
* **Schedule**: only run on chosen days and hours. Windows can cross midnight.
* **Presets**: up to 10 named presets you can switch between from the Preset dropdown, plus four starter templates (Calm, Focus, Monk Mode, Everything Visible).
* **Import & Export**: copy all settings as one Base64 code, or paste a code to restore them.

To keep BreakFree open next to YouTube, click the side-panel button at the top of the popup (or ☰ > Open in the side panel). BreakFree remembers this: from then on the toolbar icon opens the side panel. To go back, click the same button in the panel (or ☰ > Use the popup instead).

The search box in the popup searches all 245 settings at once.

## Files

| File | What it does |
| --- | --- |
| `manifest.json` | Extension manifest (MV3). Permissions: `storage`, `sidePanel`, plus `scripting` on YouTube so open tabs pick up a new version without a reload |
| `background.js` | On install or update, loads the content script into YouTube tabs that are already open |
| `features.js` | The catalog of every setting and its CSS selectors. **Edit this when YouTube changes its markup.** |
| `core.js` | Storage, presets, schedule and the CSS builder, shared by popup and page |
| `content.js` | Runs on YouTube: injects the CSS and handles redirects, filters, autoplay, theater mode, chapters and other script-only behavior |
| `popup.html/css/js` | The popup. Opening it in a tab (menu > Open in a full tab, or the extension's Options) gives a wider layout |
| `icons/` | Toolbar and store icons. `icons/icon.svg` is the source |

## When something stops working

YouTube changes its markup often. Each setting in `features.js` lists its selectors in `hide:` or `css:`. Open DevTools on the YouTube element, find its new tag or class, and update the selector. Some selectors match English button labels (Share, Clip, Thanks, Save to playlist, Join, Subscribe), so those settings only work with YouTube set to English.

## Tested

* All 406 generated CSS rules parse in Chrome and none of the selectors are invalid.
* Checked against live YouTube (signed out) on home, search, watch, channel and Shorts pages, with screenshots of the search, watch and channel pages.
* Settings that only appear when signed in (notifications, Create, Library sections, subscription feed) and the embed player were not checked against live pages.

## Brand

* Name: BreakFree for YouTube (short name BreakFree)
* Mark: a tilted white video tile with a green play button on a green gradient
* Colors: green `#3FE8A2` to `#0E9F62` for the icon, mint `#5EE8A8` on deep green-black `#0B1210` in the popup

"YouTube" is a trademark of Google LLC. BreakFree is not affiliated with or endorsed by Google.
