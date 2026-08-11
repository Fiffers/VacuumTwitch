//pure black theme for oled displays, where a black pixel is an off pixel.
//
//the interface gets its colour from two independent systems, so this has to
//cover both:
//  - twitch's own design tokens (--color-hinted-grey-*), which the video side
//    and most twitch-authored ui resolve through
//  - react-native-web, which chat is built with. rnw compiles colours down to
//    hashed atomic classes (.r-aihxlp) and literal rules like
//    `.hGTxSm { background: rgb(24,24,27) }`, and never looks at the tokens
//
//the hashes change on every twitch deploy, so rather than hardcode them we scan
//the stylesheets at runtime for rules declaring one of the known greys and emit
//an override for those exact selectors. new elements rendered later reuse the
//same classes, so they pick the theme up for free.

const { ipcRenderer } = require('electron')

const styleId = 'vacuum-oled-theme'
const dynamicStyleId = 'vacuum-oled-theme-dynamic'
const rescanMs = 3000

//the two largest surfaces go fully black; raised surfaces keep a little lift so
//menus, hover states and borders don't disappear into the void
const greyMap = {
    'rgb(14, 14, 16)': '#000000', //--color-hinted-grey-1, page body
    'rgb(24, 24, 27)': '#000000', //--color-hinted-grey-2, chat
    'rgb(31, 31, 35)': '#0a0a0a', //--color-hinted-grey-3
    'rgb(38, 38, 44)': '#141414'  //--color-hinted-grey-4
}

const baseCss = `
    html, body { background-color: #000000 !important; }
    aside { background-color: #000000 !important; }
    * {
        --color-hinted-grey-1: #000000 !important;
        --color-hinted-grey-2: #000000 !important;
        --color-hinted-grey-3: #0a0a0a !important;
        --color-hinted-grey-4: #141414 !important;
    }
`

let enabled = false;
let rescanTimer = null;
let lastRuleCount = -1;

function replaceGreys(value) {
    let result = value

    for (const grey of Object.keys(greyMap)) {
        result = result.split(grey).join(greyMap[grey])
    }

    return result;
}

function readableRules() {
    const collected = []

    for (const sheet of document.styleSheets) {
        let rules;

        try {
            rules = sheet.cssRules
        } catch {
            continue; //cross-origin sheet, nothing we can do
        }

        for (const rule of rules) {
            const isStyleRule = !!rule.style && !!rule.selectorText
            if (isStyleRule) collected.push(rule)
        }
    }

    return collected;
}

function buildOverrides(rules) {
    const overrides = []

    for (const rule of rules) {
        const backgroundColor = rule.style.backgroundColor
        const mappedColor = backgroundColor && greyMap[backgroundColor]
        if (mappedColor) {
            overrides.push(`${rule.selectorText} { background-color: ${mappedColor} !important; }`)
        }

        const backgroundImage = rule.style.backgroundImage
        const hasImage = backgroundImage && backgroundImage !== 'none'
        if (!hasImage) continue;

        //rules that pull in a url are things like stream thumbnails, whose address
        //changes as the page updates. re-emitting one would pin a stale image in
        //place with !important, so leave them alone
        const referencesUrl = backgroundImage.includes('url(')
        if (referencesUrl) continue;

        const rewritten = replaceGreys(backgroundImage)
        const changed = rewritten !== backgroundImage
        if (changed) {
            overrides.push(`${rule.selectorText} { background-image: ${rewritten} !important; }`)
        }
    }

    return overrides;
}

function writeStyle(id, css) {
    let style = document.getElementById(id)

    if (!style) {
        style = document.createElement('style')
        style.id = id

        const target = document.head || document.documentElement
        if (!target) return;

        target.appendChild(style)
    }

    style.textContent = css
}

function applyDynamicOverrides() {
    const rules = readableRules()

    //styled-components adds rules through the cssom without touching the dom, so
    //there's no mutation to observe. comparing the rule count is a cheap way to
    //notice new ones without rebuilding on every tick.
    const unchanged = rules.length === lastRuleCount
    if (unchanged) return;

    lastRuleCount = rules.length
    const overrides = buildOverrides(rules)
    writeStyle(dynamicStyleId, overrides.join('\n'))

    console.log(`[oled] themed ${overrides.length} rules from ${rules.length} scanned`)
}

function enable() {
    if (enabled) return;
    enabled = true;

    writeStyle(styleId, baseCss)
    lastRuleCount = -1
    applyDynamicOverrides()

    rescanTimer = setInterval(applyDynamicOverrides, rescanMs)
}

function disable() {
    if (!enabled) return;
    enabled = false;

    if (rescanTimer) clearInterval(rescanTimer)
    rescanTimer = null;
    lastRuleCount = -1

    document.getElementById(styleId)?.remove()
    document.getElementById(dynamicStyleId)?.remove()
}

function apply(config) {
    const wanted = config?.oled_theme === true

    if (wanted) enable()
    else disable()
}

module.exports = () => {
    const start = () => {
        try {
            apply(ipcRenderer.sendSync('get-config'))
        } catch (err) {
            console.warn('[oled] could not read config', err.message)
        }
    }

    const documentIsReady = document.readyState !== 'loading'
    if (documentIsReady) start()
    else document.addEventListener('DOMContentLoaded', start)

    ipcRenderer.on('config-update', (event, config) => {
        apply(config)
    })
}
