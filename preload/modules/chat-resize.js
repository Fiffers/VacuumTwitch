//lets the user resize chat while a stream is playing, by mouse or by controller.
//
//the tv interface splits the screen with two hashed styled-components classes
//(`.dfykmD { width: 75vw }` for the video, `.hGTxSm { width: 25vw }` for chat),
//and those hashes change on every twitch deploy. driving both off one custom
//property through plain element selectors avoids depending on them.
//
//two input paths, because this runs on desktops and on tvs:
//  - mouse/touch: drag the handle on the edge of chat
//  - controller/remote: select opens an on-screen adjuster, left/right resize it
//
//the handle and the adjuster are appended to <body> rather than into the layout,
//because everything from #__next down belongs to react and would be torn out on
//the next render.

const { ipcRenderer } = require('electron')

const styleId = 'vacuum-chat-resize'
const handleId = 'vacuum-chat-resize-handle'
const overlayId = 'vacuum-chat-resize-overlay'
const widthProperty = '--vacuum-chat-width'

const defaultWidth = 25
const minWidth = 15
const maxWidth = 50
const stepWidth = 2
const presenceCheckMs = 1000
const overlayHideMs = 4000

//twitch's navigation is asynchronous, so we wait a moment before deciding that a
//right press went nowhere
const edgeDelayMs = 180

//controller-support.js turns gamepad buttons into keydown events carrying a
//keyCode, so both a real keyboard and a controller arrive here the same way
const toggleKeyCode = 117 //f6, and the select button
const leftKeyCode = 37
const rightKeyCode = 39
const selectKeyCodes = new Set([13, 32]) //enter, space
const confirmKeyCodes = new Set([13, 27, 32]) //enter, escape, space

const css = `
    body:not([data-vacuum-chat-hidden]) aside {
        width: var(${widthProperty}, ${defaultWidth}vw) !important;
    }
    body:not([data-vacuum-chat-hidden]) main > section {
        width: calc(100vw - var(${widthProperty}, ${defaultWidth}vw)) !important;
    }

    #${handleId} {
        position: fixed;
        top: 0;
        height: 100vh;
        width: 0.6vw;
        transform: translateX(50%);
        z-index: 2147483000;
        cursor: ew-resize;
        background: transparent;
        /* invisible until you actually interact with it, so it doesn't sit as a
           permanent line down the middle of the stream */
        border-left: 0.12vw solid transparent;
        transition: border-color 0.15s;
        touch-action: none;
    }

    #${handleId}:hover,
    #${handleId}[data-dragging="true"] {
        border-left-color: rgba(255, 255, 255, 0.55);
    }

    /* highlighted: navigated onto, but not selected */
    #${handleId}:focus {
        outline: none;
        border-left-color: rgba(255, 255, 255, 0.9);
        border-left-width: 0.2vw;
    }

    /* selected: left/right now resize */
    #${handleId}[data-adjusting="true"] {
        border-left-color: #bb86fc;
        border-left-width: 0.35vw;
    }

    body[data-vacuum-resizing="true"] {
        user-select: none;
    }

    #${overlayId} {
        position: fixed;
        bottom: 8vh;
        left: 50%;
        transform: translateX(-50%);
        z-index: 2147483001;
        display: none;
        padding: 1.2vw 2.4vw;
        border-radius: 0.6vw;
        background: rgba(0, 0, 0, 0.88);
        border: 0.1vw solid rgba(255, 255, 255, 0.25);
        color: #fff;
        font-family: Inter, Roobert, "Helvetica Neue", Helvetica, Arial, sans-serif;
        text-align: center;
        pointer-events: none;
    }

    #${overlayId} .vacuum-overlay-value {
        font-size: 2.2vw;
        font-weight: 600;
        letter-spacing: 0.05vw;
    }

    #${overlayId} .vacuum-overlay-hint {
        margin-top: 0.5vw;
        font-size: 1vw;
        opacity: 0.65;
    }
`

let handle = null;
let overlay = null;
let overlayValue = null;
let overlayVisible = false;
let overlayTimer = null;
let edgeTimer = null;
let previousFocus = null;
let observedSection = null;
let sectionObserver = null;
let currentWidth = defaultWidth;
let overlayHint = null;

//the divider behaves like any other control: navigating onto it only highlights
//it, and it ignores left/right until you actually select it
let mode = 'idle' //'idle' | 'focused' | 'adjusting'

//twitch hides chat by swapping the section's styled-components class to one that
//declares width: 100vw. the hashes change every deploy, so read the declared width
//rather than the class name, and stand down when twitch wants the full width.
function twitchSectionWidth(section) {
    for (const sheet of document.styleSheets) {
        let rules;

        try {
            rules = sheet.cssRules
        } catch {
            continue; //cross-origin sheet
        }

        const isOurs = sheet.ownerNode?.id === styleId
        if (isOurs) continue;

        for (const rule of rules) {
            if (!rule.style?.width || !rule.selectorText) continue;

            try {
                if (section.matches(rule.selectorText)) return rule.style.width;
            } catch {
                continue; //selector we can't match against
            }
        }
    }

    return null;
}

function chatIsVisible() {
    const aside = document.querySelector('aside')
    if (!aside) return false;

    const section = document.querySelector('main > section')
    if (!section) return false;

    return twitchSectionWidth(section) !== '100vw';
}

function updateChatVisibility() {
    const visible = chatIsVisible()

    if (visible) delete document.body.dataset.vacuumChatHidden
    else document.body.dataset.vacuumChatHidden = 'true'

    return visible;
}

function clamp(value) {
    if (value < minWidth) return minWidth;
    if (value > maxWidth) return maxWidth;

    return value;
}

function applyWidth(width) {
    currentWidth = clamp(width)

    document.documentElement.style.setProperty(widthProperty, `${currentWidth}vw`)
    if (handle) handle.style.right = `${currentWidth}vw`
    if (overlayValue) overlayValue.textContent = `Chat Width  ${Math.round(currentWidth)}%`
}

function persistWidth() {
    try {
        //dragging produces a long fraction, so keep the config file readable
        ipcRenderer.sendSync('set-config', { chat_width: Math.round(currentWidth * 10) / 10 })
    } catch (err) {
        console.warn('[chat-resize] could not save width', err.message)
    }
}

function widthFromPointer(clientX) {
    const distanceFromRight = window.innerWidth - clientX

    return distanceFromRight / window.innerWidth * 100;
}

//the listeners live on the window rather than the handle, so the drag keeps
//tracking once the pointer moves off the handle and over the video or chat
function startDrag(event) {
    event.preventDefault()
    event.stopPropagation()

    handle.dataset.dragging = 'true'
    document.body.dataset.vacuumResizing = 'true'

    window.addEventListener('pointermove', moveDrag)
    window.addEventListener('pointerup', endDrag)
    window.addEventListener('pointercancel', endDrag)
}

function moveDrag(event) {
    event.preventDefault()
    applyWidth(widthFromPointer(event.clientX))
}

function endDrag() {
    const wasDragging = handle.dataset.dragging === 'true'
    if (!wasDragging) return;

    handle.dataset.dragging = 'false'
    delete document.body.dataset.vacuumResizing

    window.removeEventListener('pointermove', moveDrag)
    window.removeEventListener('pointerup', endDrag)
    window.removeEventListener('pointercancel', endDrag)

    persistWidth()
}

function resetWidth() {
    applyWidth(defaultWidth)
    persistWidth()
}

function refreshHint() {
    if (!overlayHint) return;

    const adjusting = mode === 'adjusting'
    overlayHint.textContent = adjusting
        ? 'Left / Right to adjust  ·  Enter when done'
        : 'Press Enter to adjust'
}

function showOverlay() {
    overlayVisible = true;
    overlay.style.display = 'block'
    applyWidth(currentWidth) //refreshes the readout
    refreshHint()
    restartOverlayTimer()
}

function hideOverlay() {
    if (!overlayVisible) return;

    overlayVisible = false;
    overlay.style.display = 'none'
    clearTimeout(overlayTimer)
    persistWidth()
}

function activate() {
    mode = 'adjusting'
    handle.dataset.adjusting = 'true'
    refreshHint()
    restartOverlayTimer()
}

function deactivate() {
    mode = 'focused'
    delete handle.dataset.adjusting
    refreshHint()
    persistWidth()
    restartOverlayTimer()
}

function restartOverlayTimer() {
    clearTimeout(overlayTimer)

    //going idle should also give focus back, otherwise the divider keeps eating
    //the arrow keys with nothing on screen to explain why
    overlayTimer = setTimeout(releaseFocus, overlayHideMs)
}

function grabFocus(previous) {
    previousFocus = previous || document.activeElement

    mode = 'focused'
    delete handle.dataset.adjusting
    handle.focus()
    showOverlay()
}

function releaseFocus() {
    mode = 'idle'
    delete handle.dataset.adjusting
    hideOverlay()

    const canRestore = previousFocus && document.contains(previousFocus)
    if (canRestore) previousFocus.focus()
    else handle.blur()

    previousFocus = null
}

//"Hide chat" is the rightmost thing twitch will focus, so pressing right there
//goes nowhere. that dead end is our way in: if a right press leaves focus exactly
//where it was, the user has walked into the edge of the layout and we hand focus
//to the divider.
function watchForEdge() {
    const before = document.activeElement
    const insideApp = before && before !== document.body
    if (!insideApp) return;

    clearTimeout(edgeTimer)
    edgeTimer = setTimeout(() => {
        const focusDidNotMove = document.activeElement === before
        const chatStillPresent = !!document.querySelector('aside')
        if (focusDidNotMove && chatStillPresent) grabFocus(before)
    }, edgeDelayMs)
}

//while adjusting, left/right resize. the divider is what moves, matching the drag
//handle: right pushes it toward chat and shrinks it, left pulls it back and grows it
function handleAdjustingKey(code) {
    const isLeft = code === leftKeyCode
    const isRight = code === rightKeyCode

    if (isLeft || isRight) {
        applyWidth(currentWidth + (isRight ? -stepWidth : stepWidth))
        restartOverlayTimer()
        return;
    }

    const isDone = confirmKeyCodes.has(code)
    if (isDone) {
        deactivate() //back to merely highlighted, same as stepping off a button
        return;
    }

    releaseFocus() //up or down leaves entirely
}

//highlighted but not selected yet, so left/right must not resize anything
function handleFocusedKey(code) {
    if (selectKeyCodes.has(code)) {
        activate()
        return;
    }

    //we're already at the right edge, so right has nowhere to go
    if (code === rightKeyCode) {
        restartOverlayTimer()
        return;
    }

    releaseFocus()
}

//once the divider has focus we take every key, so twitch doesn't also act on it
function handleKey(event) {
    const code = event.keyCode

    const chatHidden = document.body.dataset.vacuumChatHidden === 'true'
    if (chatHidden) return;

    const handleHasFocus = document.activeElement === handle
    if (handleHasFocus) {
        event.preventDefault()
        event.stopImmediatePropagation()

        if (mode === 'adjusting') handleAdjustingKey(code)
        else handleFocusedKey(code)

        return;
    }

    //f6 for anyone on a keyboard who would rather not walk to the edge
    if (code === toggleKeyCode) {
        event.preventDefault()
        event.stopImmediatePropagation()
        grabFocus()
        return;
    }

    if (code === rightKeyCode) watchForEdge()
}

function createHandle() {
    handle = document.createElement('div')
    handle.id = handleId
    handle.dataset.dragging = 'false'

    //twitch's navigation only visits elements it registered itself, so it will
    //never land here on its own. we hand it focus manually instead, but it still
    //needs to be focusable for that to work.
    handle.tabIndex = 0
    handle.setAttribute('role', 'separator')
    handle.setAttribute('aria-orientation', 'vertical')
    handle.setAttribute('aria-label', 'Chat width')

    handle.style.right = `${currentWidth}vw`
    handle.style.display = 'none'

    handle.addEventListener('pointerdown', startDrag)

    //double click restores the twitch default
    handle.addEventListener('dblclick', resetWidth)

    document.body.appendChild(handle)
}

function createOverlay() {
    overlay = document.createElement('div')
    overlay.id = overlayId

    overlayValue = document.createElement('div')
    overlayValue.className = 'vacuum-overlay-value'

    overlayHint = document.createElement('div')
    overlayHint.className = 'vacuum-overlay-hint'

    overlay.appendChild(overlayValue)
    overlay.appendChild(overlayHint)
    document.body.appendChild(overlay)
}

function syncChatVisibility() {
    const visible = updateChatVisibility()
    if (handle) handle.style.display = visible ? 'block' : 'none'

    const overlayShouldClose = overlayVisible && !visible
    if (overlayShouldClose) releaseFocus()
}

//polling alone would leave the video a second behind the hide chat button, so
//watch the class swap directly and fall back to the poll for re-acquisition
function watchSectionClass() {
    const section = document.querySelector('main > section')
    const alreadyWatching = section === observedSection
    if (!section || alreadyWatching) return;

    if (sectionObserver) sectionObserver.disconnect()

    observedSection = section
    sectionObserver = new MutationObserver(syncChatVisibility)
    sectionObserver.observe(section, { attributes: true, attributeFilter: ['class'] })
}

//chat only exists while watching, so the handle follows it on and off screen
function watchForChat() {
    setInterval(() => {
        watchSectionClass()
        syncChatVisibility()
    }, presenceCheckMs)
}

function injectStyle() {
    const style = document.createElement('style')
    style.id = styleId
    style.textContent = css

    const target = document.head || document.documentElement
    if (!target) return;

    target.appendChild(style)
}

function start() {
    const alreadyStarted = !!document.getElementById(styleId)
    if (alreadyStarted) return;

    injectStyle()

    try {
        const config = ipcRenderer.sendSync('get-config')
        const saved = Number(config?.chat_width)
        if (Number.isFinite(saved)) currentWidth = clamp(saved)
    } catch (err) {
        console.warn('[chat-resize] could not read config', err.message)
    }

    createHandle()
    createOverlay()
    applyWidth(currentWidth)
    watchForChat()

    //capture on the window runs before twitch's own document listeners, which is
    //what lets us swallow the arrow keys while the adjuster is open. controller
    //events are dispatched on document and still pass through here on the way down.
    window.addEventListener('keydown', handleKey, true)
}

module.exports = () => {
    const documentIsReady = document.readyState !== 'loading'
    if (documentIsReady) start()
    else document.addEventListener('DOMContentLoaded', start)
}
