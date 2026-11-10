/*
  BreakFree feature catalog.

  Every setting lives here. The popup builds its controls from this list and
  the content script turns the active settings into one stylesheet.

  Item fields
    k        unique key (stored in sync storage)
    label    text in the popup
    hint     optional second line
    hide     selectors to hide with display:none when the toggle is on
    css      raw CSS added when the toggle is on (string) or, for selects/colors, fn(value)
    type     'toggle' (default) | 'select' | 'color'
    options  for selects: [[value, label], ...]; the first entry is the default
    js       true when content.js also does something for this key
    kids     nested items shown in an inner card
    kidsNeedParent  kids only apply while the parent is on (otherwise: while it is off)

  YouTube renames its markup often. When something stops working, fix the selector here.
*/
var BF_FEATURES = (() => {
  /* ---------- shared selector pieces ---------- */

  const ITEMS = [
    'ytd-rich-item-renderer',
    'ytd-video-renderer',
    'ytd-compact-video-renderer',
    'ytd-grid-video-renderer',
    'ytd-playlist-video-renderer',
    'ytd-playlist-panel-video-renderer',
    'yt-lockup-view-model',
    'ytd-reel-item-renderer'
  ].join(', ');

  const inItem = sel => sel.split(/,\s*/).map(s => `:is(${ITEMS}) ${s}`).join(', ');

  const THUMB_IMG = 'ytd-thumbnail img, yt-thumbnail-view-model img, .ytThumbnailViewModelImage img, ytd-playlist-thumbnail img';
  const THUMB_BOX = 'ytd-thumbnail, yt-thumbnail-view-model, ytd-playlist-thumbnail';
  const ITEM_TITLE = inItem('#video-title, .ytLockupMetadataViewModelTitle, .yt-lockup-metadata-view-model__title');
  const ITEM_TITLE_BLOCK = inItem('h3:has(#video-title), h3.ytLockupMetadataViewModelHeadingReset, h3:has(.yt-lockup-metadata-view-model__title)');
  const META_ROW = '.ytContentMetadataViewModelMetadataRow';

  const HOME = 'ytd-browse[page-subtype="home"]';
  const SUBS = 'ytd-browse[page-subtype="subscriptions"]';
  const CHANNEL = 'ytd-browse[page-subtype="channels"]';
  const YOU = ':is(ytd-browse[page-subtype="you"], ytd-browse[page-subtype="library"])';
  const SEARCH = 'ytd-search';
  const WATCH = 'ytd-watch-flexy';
  const META = 'ytd-watch-metadata';
  const PLAYER = 'ytd-player .html5-video-player';
  // Set by content.js when "Show recommendations for this video" is clicked; lifts the hide for that one video.
  const RELATED_HIDDEN = 'html:not([data-bf-show-related])';
  const EMBED = '.html5-video-player.ytp-embed';
  const SHORTS = 'ytd-shorts';
  const BAR = 'reel-action-bar-view-model';
  const CH_HEAD = `${CHANNEL} yt-page-header-view-model`;
  const CH_META = `${CH_HEAD} .ytPageHeaderViewModelContentMetadata`;

  const SHORTS_ANYWHERE = [
    'ytd-rich-section-renderer:has(ytd-rich-shelf-renderer[is-shorts])',
    'ytd-rich-shelf-renderer[is-shorts]',
    'ytd-reel-shelf-renderer',
    'grid-shelf-view-model:has(ytm-shorts-lockup-view-model, ytm-shorts-lockup-view-model-v2, a[href^="/shorts/"])',
    'ytd-rich-item-renderer:has(a[href^="/shorts/"])',
    'ytd-video-renderer:has(a[href^="/shorts/"])',
    'ytd-grid-video-renderer:has(a[href^="/shorts/"])',
    'ytd-compact-video-renderer:has(a[href^="/shorts/"])',
    'yt-lockup-view-model:has(a[href^="/shorts/"])',
    'ytm-shorts-lockup-view-model',
    'ytm-shorts-lockup-view-model-v2',
    'ytd-guide-entry-renderer:has(a[title="Shorts"])',
    'ytd-mini-guide-entry-renderer[aria-label="Shorts"]',
    'yt-tab-shape[tab-title="Shorts"]',
    'yt-chip-cloud-chip-renderer:has(chip-shape[aria-label="Shorts"], [title="Shorts"])'
  ].join(', ');

  const grayscale = sel => `${sel} { filter: grayscale(1) !important; }`;
  const titleCaseCss = (value, sel, block) => ({
    lower: `${sel} { text-transform: lowercase !important; }`,
    upper: `${sel} { text-transform: uppercase !important; }`,
    title: `${sel} { text-transform: capitalize !important; }`,
    sentence: `${sel} { text-transform: lowercase !important; } ${block}::first-letter { text-transform: uppercase !important; }`
  }[value] || '');

  /* button inside YouTube's action rows, matched by its English aria-label */
  const actionButton = label =>
    `${META} #actions :is(yt-button-view-model, ytd-button-renderer, button-view-model):has(button[aria-label="${label}"])`;

  /* ---------- sections ---------- */

  const SECTIONS = [
    {
      id: 'general',
      title: 'General',
      groups: [
        {
          title: 'Everywhere',
          items: [
            { k: 'gen.shorts', label: 'Hide Shorts Everywhere', hint: 'Feeds, search, sidebar, channel tabs', hide: SHORTS_ANYWHERE },
            { k: 'gen.grayscale', label: 'Grayscale Everything', css: 'html { filter: grayscale(1) !important; }' },
            { k: 'gen.mixes', label: 'Hide Mixes and Radios', hide: 'ytd-radio-renderer, ytd-compact-radio-renderer, ytd-rich-item-renderer:has(a[href*="start_radio=1"]), yt-lockup-view-model:has(a[href*="start_radio=1"])' },
            { k: 'gen.playables', label: 'Hide Playables (games)', hide: 'ytd-rich-section-renderer:has(a[href^="/playables"]), ytd-guide-entry-renderer:has(a[href^="/playables"])' }
          ]
        }
      ]
    },

    {
      id: 'home',
      title: 'Home Page',
      groups: [
        {
          title: 'Feed',
          items: [
            {
              k: 'home.feed', label: 'Hide Feed', hint: 'Shows a calm empty page instead',
              css: `${HOME} ytd-rich-grid-renderer > #contents, ${HOME} #header ytd-feed-filter-chip-bar-renderer { display: none !important; }
                ${HOME} ytd-rich-grid-renderer::before { content: "Nothing to scroll here. Search for what you came for."; display: block; padding: 18vh 24px 0; text-align: center; font: 500 18px/1.5 Roboto, Arial, sans-serif; color: var(--yt-spec-text-secondary, #888); }`
            },
            { k: 'home.redirect', label: 'Open This Instead of Home', type: 'select', js: true, options: [['', 'Home (default)'], ['/feed/subscriptions', 'Subscriptions'], ['/playlist?list=WL', 'Watch Later'], ['/feed/you', 'You'], ['/feed/history', 'History']] },
            { k: 'home.chips', label: 'Hide Topic Chips', hide: `${HOME} ytd-feed-filter-chip-bar-renderer, ${HOME} #chips-wrapper` },
            { k: 'home.shorts', label: 'Hide Shorts', hide: `${HOME} ytd-rich-section-renderer:has(ytd-rich-shelf-renderer[is-shorts]), ${HOME} ytd-rich-shelf-renderer[is-shorts], ${HOME} ytd-rich-item-renderer:has(a[href^="/shorts/"]), ${HOME} grid-shelf-view-model` },
            { k: 'home.shelves', label: 'Hide Extra Shelves', hint: 'News, Explore topics, Breaking news', hide: `${HOME} ytd-rich-section-renderer:not(:has(ytd-rich-shelf-renderer[is-shorts]))` },
            { k: 'home.watched', label: 'Hide Watched Videos', js: true },
            { k: 'home.noInfinite', label: 'Disable Infinite Scrolling', hide: `${HOME} ytd-continuation-item-renderer` },
            { k: 'home.columns', label: 'Videos per Row', type: 'select', options: [['', 'Default'], ['2', '2'], ['3', '3'], ['4', '4'], ['5', '5'], ['6', '6']],
              css: v => `${HOME} ytd-rich-grid-renderer { --ytd-rich-grid-items-per-row: ${v} !important; }` }
          ]
        }
      ]
    },

    {
      id: 'nav',
      title: 'Left Sidebar',
      groups: [
        {
          title: 'Navigation',
          items: [
            {
              k: 'nav.all', label: 'Hide Entire Sidebar',
              css: `tp-yt-app-drawer#guide, ytd-mini-guide-renderer, ytd-masthead #guide-button { display: none !important; }
                ytd-app[mini-guide-visible] ytd-page-manager, ytd-app[guide-persistent-and-visible] ytd-page-manager { margin-left: 0 !important; }`,
              kids: [
                { k: 'nav.home', label: "Hide 'Home'", hide: 'ytd-guide-entry-renderer:has(a[href="/"]), ytd-mini-guide-entry-renderer:has(a[href="/"])' },
                { k: 'nav.shorts', label: "Hide 'Shorts'", hide: 'ytd-guide-entry-renderer:has(a[title="Shorts"]), ytd-mini-guide-entry-renderer[aria-label="Shorts"]' },
                { k: 'nav.subs', label: "Hide 'Subscriptions'", hide: 'ytd-guide-entry-renderer:has(a[href="/feed/subscriptions"]), ytd-mini-guide-entry-renderer:has(a[href="/feed/subscriptions"])' },
                { k: 'nav.you', label: "Hide 'You' Section", hide: 'ytd-guide-section-renderer:has(a[href="/feed/history"]), ytd-mini-guide-entry-renderer:has(a[href="/feed/you"])' },
                { k: 'nav.channels', label: 'Hide Subscribed Channels List', hide: 'ytd-guide-section-renderer:has(ytd-guide-collapsible-entry-renderer a[href^="/@"]), ytd-guide-section-renderer:has(#items > ytd-guide-entry-renderer a[href^="/@"]):not(:has(a[href="/feed/history"]))' },
                { k: 'nav.explore', label: "Hide 'Explore' Section", hide: 'ytd-guide-section-renderer:has(a[href^="/feed/trending"], a[href^="/gaming"], a[href^="/feed/news_destination"], a[href^="/channel/UC-9-kyTW8ZkZNDHQJ6FgpwQ"])' },
                { k: 'nav.more', label: "Hide 'More from YouTube'", hide: 'ytd-guide-section-renderer:has(a[href*="studio.youtube.com"], a[href*="music.youtube.com"], a[href*="youtubekids.com"])' },
                { k: 'nav.settings', label: 'Hide Settings and Help Links', hide: 'ytd-guide-section-renderer:has(a[href^="/account"], a[href*="/reporthistory"])' },
                { k: 'nav.footer', label: 'Hide Footer', hide: 'ytd-guide-renderer #footer' }
              ]
            }
          ]
        }
      ]
    },

    {
      id: 'header',
      title: 'Header',
      groups: [
        {
          title: 'Search Bar',
          items: [
            {
              k: 'hd.search', label: 'Hide Search Bar', hide: 'ytd-masthead #center',
              kids: [
                { k: 'hd.suggestions', label: 'Hide Search Suggestions', hide: '.ytSearchboxComponentSuggestionsContainer, .ytSearchboxComponentSuggestionsContainerScrollable, .sbdd_a, .gstl_50.sbdd_a' },
                { k: 'hd.previous', label: 'Hide Previous Searches', hide: '.ytSuggestionComponentSuggestion:has(.ytSuggestionComponentRemoveLink), [class*="SuggestionComponentSuggestion"]:has([class*="RemoveLink"]), .sbsb_c:has(.sbsb_i)' },
                { k: 'hd.voice', label: "Hide 'Voice Search' Button", hide: 'ytd-masthead #voice-search-button' },
                { k: 'hd.ask', label: "Hide 'Ask' AI Button", hide: 'ytd-masthead #ai-companion-button' }
              ]
            }
          ]
        },
        {
          title: 'Logo',
          items: [
            {
              k: 'hd.logo', label: 'Hide Logo', hide: 'ytd-masthead ytd-topbar-logo-renderer',
              kids: [
                { k: 'hd.logoColor', label: 'Logo Color', type: 'select', options: [['', 'Default'], ['mono', 'Monochrome'], ['accent', 'BreakFree Mint'], ['dim', 'Dimmed']],
                  css: v => ({
                    mono: 'ytd-topbar-logo-renderer #logo-icon { filter: grayscale(1) !important; }',
                    accent: 'ytd-topbar-logo-renderer #logo-icon { filter: hue-rotate(150deg) saturate(1.2) !important; }',
                    dim: 'ytd-topbar-logo-renderer #logo-icon { opacity: .45 !important; }'
                  }[v] || '') },
                { k: 'hd.logoLink', label: 'Disable Logo Link', css: 'ytd-topbar-logo-renderer a#logo { pointer-events: none !important; }' },
                { k: 'hd.country', label: 'Hide Logo Country Code', hide: 'ytd-topbar-logo-renderer #country-code' },
                { k: 'hd.logoWord', label: 'Hide Word in Logo', css: 'ytd-topbar-logo-renderer #logo-icon { width: 29px !important; overflow: hidden !important; } ytd-topbar-logo-renderer #logo-icon svg { width: 93px !important; min-width: 93px !important; height: 20px !important; }' }
              ]
            }
          ]
        },
        {
          title: 'Buttons',
          items: [
            { k: 'hd.history', label: "Show 'History' Button", hint: 'Click for your 5 latest videos; Ctrl/Cmd-click opens the History page', js: true },
            { k: 'hd.create', label: "Hide 'Create' Button", hide: 'ytd-masthead #buttons > :is(ytd-button-renderer, ytd-topbar-menu-button-renderer):has([aria-label="Create"])' },
            { k: 'hd.upload', label: "Hide 'Upload' Button", hide: 'ytd-masthead #buttons > :is(ytd-button-renderer, ytd-topbar-menu-button-renderer):has([aria-label="Upload"], a[href*="/upload"])' },
            { k: 'hd.notifications', label: "Hide 'Notifications' Button", hide: 'ytd-masthead ytd-notification-topbar-button-renderer' },
            { k: 'hd.signin', label: "Hide 'Sign In' Button", hide: 'ytd-masthead #buttons > ytd-button-renderer:has(a[href*="ServiceLogin"])' }
          ]
        },
        {
          title: 'Others',
          items: [
            { k: 'hd.all', label: 'Hide Header', hint: 'Search with "/" still works on most pages',
              css: '#masthead-container { display: none !important; } ytd-app { --ytd-masthead-height: 0px !important; } ytd-page-manager { margin-top: 0 !important; } tp-yt-app-drawer #header { display: none !important; }' },
            { k: 'hd.notifCount', label: 'Hide Notifications Count', hide: 'ytd-notification-topbar-button-renderer .yt-spec-icon-badge-shape__badge, ytd-notification-topbar-button-renderer [class*="IconBadgeShapeBadge"]' }
          ]
        }
      ]
    },

    {
      id: 'video',
      title: 'Video Page',
      groups: [
        {
          title: 'Sidebar',
          items: [
            {
              k: 'vp.related', label: 'Hide Related Videos', hint: 'Adds a one-time "Show recommendations" button under each video', js: true,
              hide: `${RELATED_HIDDEN} ${WATCH} #related, ${RELATED_HIDDEN} ytd-watch-next-secondary-results-renderer`, kidsNeedParent: true,
              kids: [
                { k: 'vp.center', label: 'Centering Content', js: true, hint: 'Centers the player when the sidebar is empty',
                  css: `${RELATED_HIDDEN} ${WATCH}:not([theater]):not([fullscreen]):not(:has(#secondary :is(ytd-playlist-panel-renderer:not([hidden]) #items > *, ytd-live-chat-frame:not([hidden]), ytd-engagement-panel-section-list-renderer[visibility="ENGAGEMENT_PANEL_VISIBILITY_EXPANDED"]))) :is(#secondary, #secondary-inner) { display: none !important; }
                    ${RELATED_HIDDEN} ${WATCH}:not([theater]):not([fullscreen]):not(:has(#secondary :is(ytd-playlist-panel-renderer:not([hidden]) #items > *, ytd-live-chat-frame:not([hidden]), ytd-engagement-panel-section-list-renderer[visibility="ENGAGEMENT_PANEL_VISIBILITY_EXPANDED"]))) #primary { max-width: var(--ytd-watch-flexy-max-player-width, 1280px) !important; margin-inline: auto !important; }` }
              ]
            },
            { k: 'vp.liveChat', label: 'Hide Live Chat', hide: `${WATCH} #chat-container, ytd-live-chat-frame` },
            { k: 'vp.playlist', label: 'Hide Playlist', hide: `${WATCH} ytd-playlist-panel-renderer#playlist` },
            { k: 'vp.fundraiser', label: 'Hide Fundraiser', hide: `${WATCH} ytd-donation-shelf-renderer, ${WATCH} #donation-shelf` },
            { k: 'vp.watched', label: 'Hide Watched Related Videos', js: true },
            { k: 'vp.chapters', label: 'Automatically Show Chapters', js: true },
            { k: 'vp.fixedSidebar', label: 'Fixed Sidebar', hint: 'Sidebar scrolls on its own',
              css: `${WATCH}:not([theater]) #secondary { position: sticky !important; top: calc(var(--ytd-masthead-height, 56px) + 8px) !important; max-height: calc(100vh - var(--ytd-masthead-height, 56px) - 16px) !important; overflow-y: auto !important; align-self: flex-start !important; scrollbar-width: thin; }` },
            { k: 'vp.maxPanels', label: 'Max Heights Panels', hint: 'Chapters, transcript and chat fit the screen',
              css: `${WATCH} #panels ytd-engagement-panel-section-list-renderer, ${WATCH} ytd-live-chat-frame { max-height: calc(100vh - var(--ytd-masthead-height, 56px) - 24px) !important; }` }
          ]
        },
        {
          title: 'Video Player',
          items: [
            { k: 'vp.endSuggest', label: 'Hide Suggestions in the Video End', hide: `${PLAYER} .html5-endscreen, ${PLAYER} .ytp-endscreen-content, ${PLAYER} .ytp-fullscreen-grid, ${PLAYER} .ytp-autonav-endscreen, ${PLAYER} .ytp-modern-videowall-still` },
            { k: 'vp.endCards', label: 'Hide Cards in the Video End', hide: `${PLAYER} .ytp-ce-element, ${PLAYER} .ytp-cards-teaser, ${PLAYER} .ytp-cards-button` },
            { k: 'vp.gradient', label: 'Hide Video Player Bar Gradient Shadow', hide: `${PLAYER} .ytp-gradient-bottom, ${PLAYER} .ytp-gradient-top` },
            { k: 'vp.time', label: 'Hide Video Time', hide: `${PLAYER} .ytp-time-display` },
            { k: 'vp.watermark', label: 'Hide Watermark', hide: `${PLAYER} .ytp-watermark, ${PLAYER} .iv-branding, ${PLAYER} .branding-img-container` },
            { k: 'vp.heatmap', label: 'Hide the Graph of the Most Viewed Scenes', hide: `${PLAYER} .ytp-heat-map-container, ${PLAYER} .ytp-heat-map` },
            { k: 'vp.autoplayOff', label: 'Disable Autoplay', js: true },
            { k: 'vp.theater', label: 'Auto Theater Mode', js: true },
            { k: 'vp.radius', label: 'Remove Corner Radius', css: `${WATCH} #ytd-player, ${WATCH} #ytd-player .html5-video-player, ${WATCH} #ytd-player video, ${WATCH} #player-container-outer, ${WATCH} #cinematics-container { border-radius: 0 !important; }` },
            { k: 'vp.paid', label: "Hide 'Includes Paid Promotion'", hide: `${PLAYER} .ytp-paid-content-overlay, ${WATCH} ytd-paid-content-overlay-renderer` },
            { k: 'vp.ambient', label: 'Disable Ambient Glow', hide: `${WATCH} #cinematics, ${WATCH} #cinematics-container` },
            { k: 'vp.grayscale', label: 'Grayscale Video', css: grayscale(`${WATCH} video`) }
          ]
        },
        {
          title: 'Details',
          items: [
            { k: 'vp.title', label: 'Hide Video Title', hide: `${META} #title` },
            { k: 'vp.avatar', label: 'Hide Channel Avatar', hide: `${META} #owner #avatar, ${META} #owner #avatar-stack` },
            { k: 'vp.avatarGray', label: 'Grayscale Channel Avatar', css: grayscale(`${META} #owner #avatar img`) },
            { k: 'vp.channel', label: 'Hide Channel Name', hide: `${META} #upload-info ytd-channel-name` },
            { k: 'vp.subs', label: 'Hide Channel Subscribers Count', hide: `${META} #owner-sub-count` },
            { k: 'vp.license', label: 'Hide Doctor License', hint: 'Health source labels under the channel', hide: `${WATCH} #clarify-box, ${META} #upload-info #attributed-channel-name ~ yt-formatted-string:not(#owner-sub-count)` },
            { k: 'vp.fundBadge', label: "Hide 'Fundraiser' Badge", hide: `${META} .badge-style-type-fundraiser, ${META} [aria-label="Fundraiser"]` },
            { k: 'vp.verified', label: "Hide 'Verified' Badge", hide: `${META} #upload-info ytd-badge-supported-renderer, ${META} #upload-info .ytIconWrapperHost` },
            { k: 'vp.infoRow', label: 'Hide Info Row', hint: 'License, Suggested by UMG, parental warnings', hide: `${META} #middle-row, ${WATCH} ytd-metadata-row-container-renderer, ${WATCH} #limited-state` },
            { k: 'vp.merch', label: 'Hide Merch, Tickets, Offers', hide: `${WATCH} #merch-shelf, ${WATCH} #ticket-shelf, ytd-merch-shelf-renderer, ytd-ticket-shelf-renderer, ${WATCH} #offer-module, ${WATCH} #shopping-timely-shelf, ytd-product-list-renderer, ${actionButton('Shop')}` }
          ]
        },
        {
          title: 'Description',
          items: [
            {
              k: 'vp.desc', label: 'Hide Description', hide: `${META} #bottom-row`,
              kids: [
                { k: 'vp.descExpand', label: 'Auto Expand Description', js: true },
                { k: 'vp.descMinimal', label: 'Minimal Description (Views and Date)', hide: `${META} #description ytd-text-inline-expander, ${META} #description #structured-description, ${META} #description tp-yt-paper-button#expand, ${META} #description #collapse` },
                { k: 'vp.views', label: 'Hide Video Views Count', hide: `${META} #info-container #info > span:nth-child(1), ${META} #info-container #info > span:nth-child(2), ${META} #view-count` },
                { k: 'vp.date', label: 'Hide Video Published Time', hide: `${META} #info-container #info > span:nth-child(3), ${META} #date-text` },
                { k: 'vp.hashtags', label: 'Hide Video Hashtags', hide: `${META} #info-container #info a[href^="/hashtag"], ${META} #super-title, ${META} #description a[href^="/hashtag"]` },
                { k: 'vp.descShorts', label: 'Hide Shorts in Description', hide: `${META} #description ytd-reel-shelf-renderer, ${META} #description grid-shelf-view-model` },
                { k: 'vp.transcript', label: 'Hide Transcript Block', hide: `${META} ytd-video-description-transcript-section-renderer` },
                { k: 'vp.chInfo', label: 'Hide Channel Info', hide: `${META} ytd-video-description-infocards-section-renderer` },
                { k: 'vp.chVideos', label: "Hide 'Videos' Button", hide: `${META} ytd-video-description-infocards-section-renderer :is(ytd-button-renderer, yt-button-view-model, button-view-model):has(a[href$="/videos"])` },
                { k: 'vp.chAbout', label: "Hide 'About' Button", hide: `${META} ytd-video-description-infocards-section-renderer :is(ytd-button-renderer, yt-button-view-model, button-view-model):has(a[href$="/about"])` }
              ]
            }
          ]
        },
        {
          title: 'Video Player Buttons',
          items: [
            { k: 'vb.play', label: "Hide 'Play / Pause' Button", hide: `${PLAYER}:not(.ended-mode) .ytp-play-button` },
            { k: 'vb.replay', label: "Hide 'Replay' Button", hide: `${PLAYER}.ended-mode .ytp-play-button` },
            { k: 'vb.next', label: "Hide 'Play Next' Button", hide: `${PLAYER} .ytp-next-button, ${PLAYER} .ytp-prev-button` },
            { k: 'vb.volume', label: "Hide 'Volume' Button", hide: `${PLAYER} .ytp-volume-area` },
            { k: 'vb.chapters', label: "Hide 'Chapters' Button", hide: `${PLAYER} .ytp-chapter-container` },
            { k: 'vb.autoplay', label: "Hide 'Autoplay' Button", hide: `${PLAYER} .ytp-autonav-toggle, ${PLAYER} button:has(.ytp-autonav-toggle-button)` },
            { k: 'vb.captions', label: "Hide 'Captions' Button", hide: `${PLAYER} .ytp-subtitles-button` },
            { k: 'vb.settings', label: "Hide 'Settings' Button", hide: `${PLAYER} .ytp-settings-button` },
            { k: 'vb.mini', label: "Hide 'Mini Player' Button", hide: `${PLAYER} .ytp-miniplayer-button, ${PLAYER} .ytp-pip-button` },
            { k: 'vb.theater', label: "Hide 'Theater Mode' Button", hide: `${PLAYER} .ytp-size-button` },
            { k: 'vb.airplay', label: "Hide 'AirPlay' / Cast Button", hide: `${PLAYER} .ytp-remote-button, ${PLAYER} .ytp-airplay-button` },
            { k: 'vb.fullscreen', label: "Hide 'Full Screen' Button", hide: `${PLAYER} .ytp-fullscreen-button` },
            { k: 'vb.moreChannel', label: "Hide 'More from this Channel' Button", hide: `${PLAYER} .ytp-fullerscreen-edu-button, ${PLAYER} .ytp-fullscreen-grid-expand-button, ${PLAYER} .ytp-fullscreen-grid-peeking` }
          ]
        },
        {
          title: 'Buttons Under Video Player',
          items: [
            {
              k: 'vu.all', label: 'Hide Buttons Under Player', hide: `${META} #actions, ${META} #sponsor-button, ${META} #subscribe-button, ${META} #purchase-button, ${META} #notification-preference-button`,
              kids: [
                { k: 'vu.join', label: "Hide 'Join' Button", hide: `${META} #sponsor-button` },
                { k: 'vu.subscribe', label: "Hide 'Subscribe' Button", hide: `${META} #subscribe-button, ${META} #notification-preference-button` },
                { k: 'vu.likeDislike', label: "Hide 'Like / Dislike' Button", hide: `${META} segmented-like-dislike-button-view-model, ${META} ytd-segmented-like-dislike-button-renderer` },
                { k: 'vu.likeCount', label: 'Hide Video Likes Count', hide: `${META} like-button-view-model :is(.yt-spec-button-shape-next__button-text-content, .ytSpecButtonShapeNextButtonTextContent)` },
                { k: 'vu.likeAnim', label: 'Disable Like Animation', css: `${META} like-button-view-model *, ${META} dislike-button-view-model * { animation: none !important; transition: none !important; } ${META} like-button-view-model :is(yt-animated-icon, lottie-component) ~ * { display: none !important; }` },
                { k: 'vu.share', label: "Hide 'Share' Button", hide: actionButton('Share') },
                { k: 'vu.thanks', label: "Hide 'Thanks' Button", hide: actionButton('Thanks') },
                { k: 'vu.clip', label: "Hide 'Clip' Button", hide: actionButton('Clip') },
                { k: 'vu.download', label: "Hide 'Download' Button", hide: `${META} ytd-download-button-renderer` },
                { k: 'vu.save', label: "Hide 'Save' Button", hide: actionButton('Save to playlist') },
                { k: 'vu.ask', label: "Hide 'Ask' Button", hide: actionButton('Ask') },
                { k: 'vu.more', label: "Hide 'More' Button", hide: `${META} #actions ytd-menu-renderer > :is(yt-button-shape#button-shape, yt-icon-button#button)` }
              ]
            }
          ]
        },
        {
          title: 'Comments',
          items: [
            {
              k: 'vp.comments', label: 'Hide Comments', hide: `${WATCH} ytd-comments#comments, ${WATCH} #comment-teaser, ytd-comments-entry-point-header-renderer`,
              kids: [
                { k: 'cm.count', label: 'Hide Comments Count', hide: 'ytd-comments-header-renderer #count, ytd-comments-header-renderer h2#title' },
                { k: 'cm.teaser', label: 'Hide Comment Teaser', hide: `${WATCH} #comment-teaser, ytd-comments-entry-point-header-renderer` },
                { k: 'cm.box', label: "Hide 'Add Comment' Textfield", hide: 'ytd-comments ytd-comment-simplebox-renderer, ytd-comments-header-renderer #simple-box' },
                { k: 'cm.sort', label: 'Hide Comments Sort Button', hide: 'ytd-comments-header-renderer #sort-menu' },
                { k: 'cm.avatar', label: 'Hide Comment Avatar', hide: 'ytd-comments #author-thumbnail' },
                { k: 'cm.avatarGray', label: 'Grayscale Comment Avatar', css: grayscale('ytd-comments #author-thumbnail img') },
                { k: 'cm.user', label: 'Hide Comment Username', hide: 'ytd-comments #header-author :is(h3, #author-text, .ytd-channel-name)' },
                { k: 'cm.time', label: 'Hide Comment Published Time', hide: 'ytd-comments #published-time-text' },
                { k: 'cm.likeCount', label: 'Hide Likes Count of Comment', hide: 'ytd-comments #vote-count-middle' },
                { k: 'cm.like', label: "Hide 'Like' Comment Button", hide: 'ytd-comments #like-button' },
                { k: 'cm.dislike', label: "Hide 'Dislike' Comment Button", hide: 'ytd-comments #dislike-button' },
                { k: 'cm.reply', label: "Hide 'Reply' Comment Button", hide: 'ytd-comments #reply-button-end' },
                { k: 'cm.heart', label: 'Hide Like from the Video Creator', hide: 'ytd-comments #creator-heart' },
                { k: 'cm.replies', label: 'Hide Comment Replies', hide: 'ytd-comments ytd-comment-replies-renderer, ytd-comments #replies' }
              ]
            }
          ]
        }
      ]
    },

    {
      id: 'item',
      title: 'Video Item',
      hint: 'Video tiles on Home, Search, Subscriptions, sidebars and channels',
      groups: [
        {
          title: 'Thumbnail',
          items: [
            {
              k: 'vi.thumb', label: 'Hide Thumbnail', css: `${THUMB_BOX}, .ytLockupViewModelContentImage { display: none !important; }`,
              kids: [
                { k: 'vi.replace', label: 'Replace Thumbnail', type: 'select', js: true, options: [['', 'Default'], ['1', 'Frame from start'], ['2', 'Frame from middle'], ['3', 'Frame from end']] },
                { k: 'vi.flip', label: 'Flip Thumbnail Horizontally', css: `${THUMB_IMG} { transform: scaleX(-1) !important; }` },
                { k: 'vi.blur', label: 'Blur Thumbnail', type: 'select', options: [['', 'Default'], ['3px', 'Light'], ['8px', 'Medium'], ['16px', 'Strong']],
                  css: v => `:root { --bf-thumb-blur: ${v}; } ${THUMB_IMG} { filter: blur(var(--bf-thumb-blur, 0)) grayscale(var(--bf-thumb-gray, 0)) !important; }` },
                { k: 'vi.gray', label: 'Shade of Gray for Thumbnails', type: 'select', options: [['', 'Default'], ['.5', 'Half'], ['1', 'Full']],
                  css: v => `:root { --bf-thumb-gray: ${v}; } ${THUMB_IMG} { filter: blur(var(--bf-thumb-blur, 0)) grayscale(var(--bf-thumb-gray, 0)) !important; }` },
                { k: 'vi.opacity', label: 'Thumbnail Transparency', type: 'select', options: [['', 'Default'], ['.75', '25%'], ['.5', '50%'], ['.25', '75%']],
                  css: v => `${THUMB_IMG} { opacity: ${v} !important; }` },
                { k: 'vi.noHover', label: 'Disable Play on Hover', hide: 'ytd-video-preview, #video-preview, ytd-moving-thumbnail-renderer, #mouseover-overlay, ytd-thumbnail #hover-overlays, #inline-preview-player, .ytInlinePlayerControlsHost, yt-inline-player-controls' },
                { k: 'vi.radius', label: 'Remove Corner Radius', css: `${THUMB_BOX}, ${THUMB_IMG}, .ytThumbnailViewModelImage, ytd-thumbnail a#thumbnail, .ytLockupViewModelContentImage { border-radius: 0 !important; }` },
                { k: 'vi.paid', label: "Hide 'Includes Paid Promotion'", hide: 'ytd-thumbnail ytd-paid-content-overlay-renderer, [class*="PaidContentOverlay"]' }
              ]
            }
          ]
        },
        {
          title: 'Title',
          items: [
            {
              k: 'vi.title', label: 'Hide Title', hide: ITEM_TITLE_BLOCK,
              kids: [
                { k: 'vi.fullTitle', label: 'Display Full Title', css: `${ITEM_TITLE}, ${ITEM_TITLE} * { -webkit-line-clamp: unset !important; line-clamp: unset !important; max-height: none !important; overflow: visible !important; display: block !important; }` },
                { k: 'vi.titleCase', label: 'Title Text Case', type: 'select', options: [['', 'Default'], ['sentence', 'Sentence case'], ['lower', 'lowercase'], ['upper', 'UPPERCASE'], ['title', 'Title Case']],
                  css: v => titleCaseCss(v, ITEM_TITLE, ITEM_TITLE_BLOCK) }
              ]
            }
          ]
        },
        {
          title: 'Details',
          items: [
            { k: 'vi.avatar', label: 'Hide Channel Avatar', hide: inItem('#avatar-link, #channel-thumbnail, .ytLockupMetadataViewModelAvatar, .yt-lockup-metadata-view-model__avatar') },
            { k: 'vi.avatarGray', label: 'Grayscale Channel Avatar', css: grayscale(inItem('#avatar-link img, #channel-thumbnail img, .ytLockupMetadataViewModelAvatar img')) },
            { k: 'vi.channel', label: 'Hide Channel Name', hide: inItem(`ytd-channel-name, ${META_ROW}:first-child:not(:last-child)`) },
            { k: 'vi.views', label: 'Hide Views Count', hide: inItem(`#metadata-line > span.inline-metadata-item:nth-of-type(1), ${META_ROW}:last-child:not(:first-child) > span:first-child, ${META_ROW}:last-child:not(:first-child) > span:first-child + .ytContentMetadataViewModelDelimiter`) },
            { k: 'vi.time', label: 'Hide Published Time', hide: inItem(`#metadata-line > span.inline-metadata-item:nth-of-type(2), ${META_ROW}:last-child:not(:first-child) > span.ytContentMetadataViewModelDelimiter ~ span`) },
            { k: 'vi.duration', label: 'Hide Video Duration', hide: 'ytd-thumbnail-overlay-time-status-renderer:not([overlay-style="LIVE"]), yt-thumbnail-badge-view-model:has(badge-shape[class*="ThumbnailDefault"])' },
            { k: 'vi.menu', label: "Hide 'Menu' Button", hide: inItem('#menu ytd-menu-renderer, ytd-menu-renderer.ytd-video-renderer, .ytLockupMetadataViewModelMenuButton, .yt-lockup-metadata-view-model__menu-button') },
            { k: 'vi.desc', label: 'Hide Description', hint: 'Snippets under search results', hide: 'ytd-video-renderer .metadata-snippet-container, ytd-video-renderer #description-text, ytd-video-renderer .metadata-snippet-container-one-line' },
            { k: 'vi.chapters', label: 'Hide Chapters', hide: 'ytd-video-renderer ytd-expandable-metadata-renderer' },
            { k: 'vi.progress', label: 'Hide Watch Progress Bar', hide: 'ytd-thumbnail-overlay-resume-playback-renderer, ytw-thumbnail-overlay-resume-playback-renderer, [class*="ThumbnailOverlayProgressBarHost"]' }
          ]
        },
        {
          title: 'Badges',
          items: [
            { k: 'vi.badgeNew', label: "Hide 'New, 4K, CC' Badges", hide: inItem('#badges, ytd-badge-supported-renderer.video-badge, ytd-badge-supported-renderer#badges') },
            { k: 'vi.badgeLive', label: "Hide 'Live, Premiere' Badges", hide: 'ytd-thumbnail-overlay-time-status-renderer[overlay-style="LIVE"], ytd-thumbnail-overlay-time-status-renderer[overlay-style="UPCOMING"], .badge-style-type-live-now-alpha, yt-thumbnail-badge-view-model:has(badge-shape[class*="ThumbnailLive"])' },
            { k: 'vi.badgeFund', label: "Hide 'Fundraiser' Badges", hide: inItem('.badge-style-type-fundraiser, [aria-label="Fundraiser"]') },
            { k: 'vi.badgeVerified', label: "Hide 'Verified' Badges", hide: inItem('ytd-channel-name ytd-badge-supported-renderer, .ytContentMetadataViewModelIcon') }
          ]
        }
      ]
    },

    {
      id: 'search',
      title: 'Search Page',
      groups: [
        {
          title: 'Search Results',
          items: [
            { k: 'sr.channels', label: 'Hide Channels', hide: `${SEARCH} ytd-channel-renderer` },
            { k: 'sr.playlists', label: 'Hide Playlists', hide: `${SEARCH} ytd-playlist-renderer, ${SEARCH} yt-lockup-view-model:has([class*="CollectionStack"], .yt-collection-thumbnail-view-model):not(:has(a[href*="start_radio=1"]))` },
            { k: 'sr.mixes', label: 'Hide Mixes', hide: `${SEARCH} ytd-radio-renderer, ${SEARCH} yt-lockup-view-model:has(a[href*="start_radio=1"])` },
            { k: 'sr.shorts', label: 'Hide Shorts', hide: `${SEARCH} ytd-reel-shelf-renderer, ${SEARCH} grid-shelf-view-model, ${SEARCH} ytd-video-renderer:has(a[href^="/shorts/"])` },
            { k: 'sr.shelves', label: 'Hide For You, Trending, etc', hide: `${SEARCH} ytd-shelf-renderer, ${SEARCH} ytd-item-section-renderer ytd-vertical-list-renderer` },
            { k: 'sr.peopleAlso', label: "Hide 'People Also Search For'", hide: `${SEARCH} ytd-horizontal-card-list-renderer` },
            { k: 'sr.watched', label: 'Hide Watched Videos', js: true },
            { k: 'sr.noInfinite', label: 'Disable Infinite Results Scrolling', hide: `${SEARCH} ytd-continuation-item-renderer` },
            { k: 'sr.sidebar', label: 'Hide Right Sidebar', hide: `${SEARCH} ytd-secondary-search-container-renderer` },
            { k: 'sr.sort', label: 'Sort Results by', type: 'select', js: true, options: [['', 'Relevance (Default)'], ['CAI%3D', 'Upload date'], ['CAM%3D', 'View count'], ['CAE%3D', 'Rating']] }
          ]
        },
        {
          title: 'Buttons',
          items: [
            { k: 'sr.about', label: "Hide 'About These Results' Button", hide: `${SEARCH} ytd-search-header-renderer #info-button, ${SEARCH} ytd-search-header-renderer ytd-button-renderer:has(button[aria-label*="About" i]), ${SEARCH} ytd-search-sub-menu-renderer #info` },
            { k: 'sr.filters', label: "Hide 'Filters' Button", hide: `${SEARCH} ytd-search-header-renderer #filter-button, ${SEARCH} ytd-search-header-renderer ytd-button-renderer:has(button[aria-label*="filter" i]), ${SEARCH} ytd-search-sub-menu-renderer #filter-menu` },
            { k: 'sr.chips', label: 'Hide Search Categories', hide: `${SEARCH} ytd-search-header-renderer yt-chip-cloud-renderer, ${SEARCH} #chips-wrapper` }
          ]
        }
      ]
    },

    {
      id: 'subs',
      title: 'Subscriptions Page',
      groups: [
        {
          title: '',
          items: [
            { k: 'sb.watched', label: 'Hide Watched Videos', js: true },
            { k: 'sb.live', label: 'Hide Live and Premiere Videos', js: true },
            { k: 'sb.upcoming', label: 'Hide Upcoming Videos', js: true },
            { k: 'sb.shorts', label: 'Hide Shorts', hide: `${SUBS} ytd-rich-section-renderer:has(ytd-rich-shelf-renderer[is-shorts]), ${SUBS} ytd-reel-shelf-renderer, ${SUBS} ytd-rich-item-renderer:has(a[href^="/shorts/"]), ${SUBS} grid-shelf-view-model` },
            { k: 'sb.list', label: 'Show as a List', css: `${SUBS} ytd-rich-grid-renderer { --ytd-rich-grid-items-per-row: 1 !important; } ${SUBS} ytd-rich-item-renderer { max-width: 760px !important; margin-inline: auto !important; }` }
          ]
        }
      ]
    },

    {
      id: 'channel',
      title: 'Channel Page',
      groups: [
        {
          title: 'Redirect',
          items: [
            { k: 'ch.start', label: 'Start Page on Channel is', type: 'select', js: true, options: [['', 'Home Page'], ['videos', 'Videos'], ['shorts', 'Shorts'], ['streams', 'Live'], ['playlists', 'Playlists'], ['posts', 'Posts']] }
          ]
        },
        {
          title: 'Header',
          items: [
            { k: 'ch.banner', label: 'Hide Banner', hide: `${CHANNEL} #page-header-banner, ${CHANNEL} yt-image-banner-view-model, ${CHANNEL} #page-header-banner-sizer` },
            { k: 'ch.bannerGray', label: 'Grayscale Banner', css: grayscale(`${CHANNEL} yt-image-banner-view-model img, ${CHANNEL} #page-header-banner img`) },
            { k: 'ch.avatar', label: 'Hide Channel Avatar', hide: `${CH_HEAD} yt-decorated-avatar-view-model` },
            { k: 'ch.avatarGray', label: 'Grayscale Channel Avatar', css: grayscale(`${CH_HEAD} yt-decorated-avatar-view-model img`) },
            { k: 'ch.name', label: 'Hide Channel Name', hide: `${CH_HEAD} yt-dynamic-text-view-model` },
            { k: 'ch.verified', label: "Hide 'Verified' Badge", hide: `${CH_HEAD} yt-dynamic-text-view-model .ytIconWrapperHost, ${CH_HEAD} yt-dynamic-text-view-model .ytAttributedStringInlineBlockMod` },
            { k: 'ch.handle', label: 'Hide Channel ID', hide: `${CH_META} > ${META_ROW}:first-child, ${CH_META} > .ytContentMetadataViewModelDelimiterStandalone` },
            { k: 'ch.subs', label: 'Hide Subscribers Count', hide: `${CH_META} > ${META_ROW}:last-child > span:first-child, ${CH_META} > ${META_ROW}:last-child > span:first-child + .ytContentMetadataViewModelDelimiter` },
            { k: 'ch.videos', label: 'Hide Videos Count', hide: `${CH_META} > ${META_ROW}:last-child > span:last-child:not(:first-child), ${CH_META} > ${META_ROW}:last-child > .ytContentMetadataViewModelDelimiter` },
            { k: 'ch.tagline', label: 'Hide Channel Tagline', hide: `${CH_HEAD} yt-description-preview-view-model` },
            { k: 'ch.links', label: 'Hide Links', hide: `${CH_HEAD} yt-attribution-view-model` },
            { k: 'ch.subscribe', label: "Hide 'Subscribe' Button", hide: `${CH_HEAD} .ytFlexibleActionsViewModelAction:has(button[aria-label^="Subscribe"], button[aria-label^="Unsubscribe"], yt-subscribe-button-view-model)` },
            { k: 'ch.purchase', label: "Hide 'Purchase' Button", hide: `${CH_HEAD} .ytFlexibleActionsViewModelAction:has(button[aria-label*="Store" i], button[aria-label*="Shop" i], button[aria-label*="Buy" i])` },
            { k: 'ch.join', label: "Hide 'Join' Button", hide: `${CH_HEAD} .ytFlexibleActionsViewModelAction:has(button[aria-label^="Join"])` }
          ]
        },
        {
          title: 'Horizontal Menu Bar',
          items: [
            {
              k: 'ch.menu', label: 'Hide Entire Menu', hide: `${CHANNEL} #tabs-container, ${CHANNEL} tp-yt-app-toolbar`,
              kids: [
                ['Home', 'Home'], ['Videos', 'Videos'], ['Shorts', 'Shorts'], ['Live', 'Live'], ['Releases', 'Releases'],
                ['Podcasts', 'Podcasts'], ['Playlists', 'Playlists'], ['Community', 'Posts'], ['Store', 'Store'], ['Channels', 'Channels']
              ].map(([label, tab]) => ({
                k: 'ch.tab' + label,
                label: `Hide '${label}' Button`,
                hide: `${CHANNEL} yt-tab-shape[tab-title="${tab}"]` + (tab === 'Posts' ? `, ${CHANNEL} yt-tab-shape[tab-title="Community"]` : '')
              })).concat([
                { k: 'ch.tabSearch', label: "Hide 'Search' Button", hide: `${CHANNEL} yt-tab-shape[tab-title="Search"], ${CHANNEL} #tabs-container ytd-expandable-tab-renderer` }
              ])
            }
          ]
        },
        {
          title: 'Sections',
          hint: 'Sections on the channel Home tab',
          items: [
            ['foryou', "'For You'"], ['videos', "'Videos'"], ['popular', "'Popular Videos'"], ['playlist', "'Playlist'"]
          ].map(([id, label]) => ({ k: 'ch.sec.' + id, label: `Hide ${label} Section`, js: true, hide: `${CHANNEL} ytd-item-section-renderer[data-bf-chsec="${id}"]` }))
            .concat([
              { k: 'ch.sec.shorts', label: "Hide 'Shorts' Section", hide: `${CHANNEL} ytd-item-section-renderer:has(ytd-reel-shelf-renderer, grid-shelf-view-model)` },
              { k: 'ch.sec.members', label: "Hide 'Our Members' Section", js: true, hide: `${CHANNEL} ytd-item-section-renderer[data-bf-chsec="members"], ${CHANNEL} ytd-item-section-renderer:has(ytd-recognition-shelf-renderer)` },
              { k: 'ch.sec.featured', label: "Hide 'Featured' Section", hide: `${CHANNEL} ytd-item-section-renderer:has(ytd-channel-video-player-renderer), ${CHANNEL} ytd-channel-video-player-renderer` },
              { k: 'ch.sec.releases', label: "Hide 'Releases' Section", js: true, hide: `${CHANNEL} ytd-item-section-renderer[data-bf-chsec="releases"]` },
              { k: 'ch.sec.live', label: "Hide 'Live' Section", js: true, hide: `${CHANNEL} ytd-item-section-renderer[data-bf-chsec="live"]` },
              { k: 'ch.playAll', label: "Hide 'Play All' Buttons", hide: `${CHANNEL} ytd-shelf-renderer #play-button, ${CHANNEL} ytd-shelf-renderer ytd-button-renderer:has(a[href*="/watch"])` }
            ])
        }
      ]
    },

    {
      id: 'shorts',
      title: 'Shorts Page',
      groups: [
        {
          title: 'Redirect',
          items: [
            { k: 'sh.redirect', label: 'Redirect Shorts to Normal Player', js: true }
          ]
        },
        {
          title: 'Others',
          items: [
            { k: 'sh.noScroll', label: 'Disable Scrolling', hint: 'Stops swiping to the next Short', js: true,
              css: `${SHORTS} #navigation-button-up, ${SHORTS} #navigation-button-down, ${SHORTS} .navigation-container { display: none !important; } ${SHORTS} #shorts-inner-container { overflow: hidden !important; }` }
          ]
        },
        {
          title: 'Details',
          items: [
            { k: 'sh.desc', label: 'Hide Description', hide: `${SHORTS} :is(.ytShortsVideoTitleViewModelHost, yt-shorts-video-title-view-model, h2.title, .metadata-container .title)` },
            { k: 'sh.avatar', label: 'Hide Channel Avatar', hide: `${SHORTS} :is(.ytReelChannelBarViewModelChannelAvatar, .ytReelChannelBarViewModelHost yt-decorated-avatar-view-model, #channel-thumbnail, yt-reel-channel-bar-view-model yt-decorated-avatar-view-model)` },
            { k: 'sh.user', label: 'Hide Channel Username', hide: `${SHORTS} :is(.ytReelChannelBarViewModelChannelName, #channel-name)` },
            { k: 'sh.likeCount', label: 'Hide Likes Count', hide: `${SHORTS} :is(#like-button, like-button-view-model) :is(.yt-spec-button-shape-with-label__label, .ytSpecButtonShapeWithLabelLabel, [class*="ButtonShapeWithLabelLabel"])` },
            { k: 'sh.commentCount', label: 'Hide Comments Count', hide: `${SHORTS} :is(#comments-button, ${BAR} button-view-model:has(button[aria-label*="comment" i])) :is(.yt-spec-button-shape-with-label__label, .ytSpecButtonShapeWithLabelLabel, [class*="ButtonShapeWithLabelLabel"])` },
            { k: 'sh.labels', label: 'Hide Dislike and Share Labels', hide: `${SHORTS} :is(#dislike-button, #share-button, dislike-button-view-model, ${BAR} button-view-model:has(button[aria-label="Share"])) :is(.yt-spec-button-shape-with-label__label, .ytSpecButtonShapeWithLabelLabel, [class*="ButtonShapeWithLabelLabel"])` }
          ]
        },
        {
          title: 'Buttons',
          items: [
            { k: 'sh.play', label: "Hide 'Play' Button", hide: `${SHORTS} :is(.ytPlayerOverlayPlayButton, #play-pause-button-shape, .ytp-large-play-button, [class*="PlayPauseButton"], desktop-shorts-player-controls .ytdDesktopShortsPlayerControlsPlayPauseButtonContainer)` },
            { k: 'sh.mute', label: "Hide 'Mute' Button", hide: `${SHORTS} :is(#volume-button, .ytdDesktopShortsVolumeControlsHost, desktop-shorts-volume-controls, [class*="VolumeControls"], [class*="MuteButton"])` },
            { k: 'sh.subscribe', label: "Hide 'Subscribe' Button", hide: `${SHORTS} :is(.ytReelChannelBarViewModelReelSubscribeButton, yt-reel-channel-bar-view-model yt-subscribe-button-view-model, #subscribe-button)` },
            { k: 'sh.like', label: "Hide 'Like' Button", hide: `${SHORTS} :is(#like-button, ${BAR} like-button-view-model, ${BAR} toggle-button-view-model:has(button[aria-label^="like" i]))` },
            { k: 'sh.dislike', label: "Hide 'Dislike' Button", hide: `${SHORTS} :is(#dislike-button, ${BAR} dislike-button-view-model, ${BAR} toggle-button-view-model:has(button[aria-label^="Dislike"]))` },
            { k: 'sh.comments', label: "Hide 'Comments' Button", hide: `${SHORTS} :is(#comments-button, ${BAR} button-view-model:has(button[aria-label*="comment" i]))` },
            { k: 'sh.share', label: "Hide 'Share' Button", hide: `${SHORTS} :is(#share-button, ${BAR} button-view-model:has(button[aria-label="Share"]))` },
            { k: 'sh.more', label: "Hide 'More' Button", hide: `${SHORTS} :is(#menu-button, ${BAR} :is(button-view-model, yt-button-shape, ytd-menu-renderer):has(button[aria-label^="More"]), ${SHORTS} .ytp-overflow-button)` },
            { k: 'sh.sound', label: "Hide 'Sound' and 'Remix' Buttons", hide: `${SHORTS} :is(#pivot-button, pivot-button-view-model, .ytReelSoundMetadataViewModelHost, yt-reel-sound-metadata-view-model, #remix-button, ${BAR} button-view-model:has(button[aria-label="Remix"]))` }
          ]
        }
      ]
    },

    {
      id: 'library',
      title: 'Library Page',
      hint: 'The "You" page',
      groups: [
        {
          title: '',
          items: [
            { k: 'lb.avatar', label: 'Hide Your Avatar', hide: `${YOU} :is(yt-page-header-renderer, ytd-page-header-renderer, #page-header) :is(yt-decorated-avatar-view-model, yt-avatar-shape, #avatar)` },
            { k: 'lb.history', label: "Hide 'History' Section", hide: `${YOU} :is(ytd-rich-section-renderer, ytd-item-section-renderer, ytd-shelf-renderer):has(:is(#title-container, #header, yt-section-header-view-model) a[href^="/feed/history"])` },
            { k: 'lb.watchLater', label: "Hide 'Watch Later' Section", hide: `${YOU} :is(ytd-rich-section-renderer, ytd-item-section-renderer, ytd-shelf-renderer):has(:is(#title-container, #header, yt-section-header-view-model) a[href*="list=WL"])` },
            { k: 'lb.playlists', label: "Hide 'Playlists' Section", hide: `${YOU} :is(ytd-rich-section-renderer, ytd-item-section-renderer, ytd-shelf-renderer):has(:is(#title-container, #header, yt-section-header-view-model) a[href^="/feed/playlists"])` },
            { k: 'lb.liked', label: "Hide 'Liked Videos' Section", hide: `${YOU} :is(ytd-rich-section-renderer, ytd-item-section-renderer, ytd-shelf-renderer):has(:is(#title-container, #header, yt-section-header-view-model) a[href*="list=LL"])` },
            { k: 'lb.clips', label: "Hide 'Your Clips' Section", hide: `${YOU} :is(ytd-rich-section-renderer, ytd-item-section-renderer, ytd-shelf-renderer):has(:is(#title-container, #header, yt-section-header-view-model) a[href^="/feed/clips"])` }
          ]
        }
      ]
    },

    {
      id: 'embed',
      title: 'Embed Videos',
      hint: 'YouTube players embedded on other sites',
      groups: [
        {
          title: '',
          items: [
            { k: 'em.endSuggest', label: 'Hide Suggestions in the Video End', hide: `${EMBED} .html5-endscreen, ${EMBED} .ytp-endscreen-content, ${EMBED} .ytp-fullscreen-grid` },
            { k: 'em.endCards', label: 'Hide Cards in the Video End', hide: `${EMBED} .ytp-ce-element` },
            { k: 'em.gradient', label: 'Hide Video Player Bar Gradient Shadow', hide: `${EMBED} .ytp-gradient-bottom` },
            { k: 'em.topGradient', label: 'Hide Top Gradient Shadow', hide: `${EMBED} .ytp-gradient-top` },
            { k: 'em.pause', label: 'Hide Recommendations on Pause', hide: `${EMBED} .ytp-pause-overlay, ${EMBED} .ytp-pause-overlay-container` },
            { k: 'em.title', label: 'Hide Video Title', hide: `${EMBED} .ytp-title-text, ${EMBED} .ytp-title-expanded-heading` },
            { k: 'em.time', label: 'Hide Video Time', hide: `${EMBED} .ytp-time-display` },
            { k: 'em.avatar', label: 'Hide Channel Avatar', hide: `${EMBED} .ytp-title-channel` },
            { k: 'em.watermark', label: 'Hide Watermark', hide: `${EMBED} .ytp-watermark, ${EMBED} .iv-branding` },
            { k: 'em.watchOn', label: "Hide 'Watch on YouTube' Button", hide: `${EMBED} .ytp-impression-link, ${EMBED} .ytp-youtube-button:has(.ytp-impression-link-text)` },
            { k: 'em.ytButton', label: "Hide 'YouTube' Button", hide: `${EMBED} .ytp-youtube-button, ${EMBED} .ytp-watermark` },
            { k: 'em.play', label: "Hide 'Play / Pause / Replay' Button", hide: `${EMBED} .ytp-play-button` },
            { k: 'em.volume', label: "Hide 'Volume' Button", hide: `${EMBED} .ytp-volume-area` },
            { k: 'em.captions', label: "Hide 'Captions' Button", hide: `${EMBED} .ytp-subtitles-button` },
            { k: 'em.settings', label: "Hide 'Settings' Button", hide: `${EMBED} .ytp-settings-button` },
            { k: 'em.fullscreen', label: "Hide 'Full Screen' Button", hide: `${EMBED} .ytp-fullscreen-button` }
          ]
        }
      ]
    },

    {
      id: 'decoration',
      title: 'Decoration',
      groups: [
        {
          title: '',
          items: [
            { k: 'dc.font', label: 'Font', type: 'select', options: [['', 'Default'], ['system', 'System'], ['rounded', 'Rounded'], ['serif', 'Serif'], ['mono', 'Monospace']],
              css: v => {
                const stack = {
                  system: 'system-ui, -apple-system, "Segoe UI", sans-serif',
                  rounded: 'ui-rounded, "SF Pro Rounded", "Nunito", "Varela Round", system-ui, sans-serif',
                  serif: 'ui-serif, Georgia, "Iowan Old Style", "Times New Roman", serif',
                  mono: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace'
                }[v];
                return stack ? `html, body, ytd-app, ytd-app *, input, button, yt-formatted-string, .ytAttributedStringHost { font-family: ${stack} !important; }` : '';
              } },
            { k: 'dc.base', label: 'Base Color', hint: 'Progress bar, buttons and badges', type: 'color',
              css: v => `html, html[dark], html:not([dark]) { --yt-spec-brand-button-background: ${v} !important; --yt-spec-static-brand-red: ${v} !important; --yt-spec-call-to-action: ${v} !important; --yt-brand-youtube-red: ${v} !important; }
                .ytp-play-progress, .ytp-swatch-background-color, .ytp-scrubber-button, .ytp-settings-button.ytp-hd-quality-badge::after,
                ytd-thumbnail-overlay-resume-playback-renderer #progress, [class*="ThumbnailOverlayProgressBarHostWatchedProgressBarSegment"] { background: ${v} !important; }` },
            { k: 'dc.bg', label: 'Primary Background Color', type: 'color',
              css: v => `html, html[dark], html:not([dark]) { --yt-spec-base-background: ${v} !important; --yt-spec-general-background-a: ${v} !important; --yt-spec-brand-background-solid: ${v} !important; --yt-spec-brand-background-primary: ${v} !important; --yt-spec-raised-background: ${v} !important; --yt-spec-menu-background: ${v} !important; }
                html, body, ytd-app, #masthead-container, ytd-masthead, #background.ytd-masthead, tp-yt-app-drawer #contentContainer, ytd-mini-guide-renderer { background: ${v} !important; }` }
          ]
        }
      ]
    }
  ];

  /* ---------- derived lookups ---------- */

  const ALL = [];
  const PARENT = {};
  SECTIONS.forEach(sec => sec.groups.forEach(g => g.items.forEach(item => {
    ALL.push(item);
    (item.kids || []).forEach(kid => { ALL.push(kid); PARENT[kid.k] = item; });
  })));
  const BY_KEY = Object.fromEntries(ALL.map(i => [i.k, i]));

  return { SECTIONS, ALL, BY_KEY, PARENT, ITEMS };
})();
