//7tv + bttv emote support for the twitch tv interface.
//the socket hook tells us which channel we're in, the store turns that into a
//name -> image lookup, and the injector rewrites messages as they appear.

const { ipcRenderer } = require('electron')

const chatSocket = require('./chat-socket')
const emoteStore = require('./emote-store')
const chatDom = require('./chat-dom')
const emoteInjector = require('./emote-injector')

let enabled = true;
let currentRoomId = null;

function readEnabled(config) {
    //treat anything other than an explicit false as on
    return config?.third_party_emotes !== false;
}

async function refresh() {
    const canLoad = enabled && !!currentRoomId
    if (!canLoad) return;

    await emoteStore.load(currentRoomId)

    //messages that arrived while the emote list was downloading were skipped
    chatDom.rescan()
}

function applyEnabled(next) {
    const unchanged = next === enabled
    if (unchanged) return;

    enabled = next

    if (!enabled) {
        console.log('[emotes] disabled')
        chatDom.detach()
        return;
    }

    console.log('[emotes] enabled')
    chatDom.start()
    refresh()
}

module.exports = () => {
    //install the hook first thing, while we're still ahead of the page's own scripts
    chatSocket.install()

    try {
        enabled = readEnabled(ipcRenderer.sendSync('get-config'))
    } catch (err) {
        console.warn('[emotes] could not read config, defaulting to on', err.message)
    }

    chatSocket.onRoomId((roomId) => {
        currentRoomId = roomId
        refresh()
    })

    chatDom.onMessage((element) => {
        if (!enabled) return;

        emoteInjector.inject(element, emoteStore)
    })

    ipcRenderer.on('config-update', (event, config) => {
        applyEnabled(readEnabled(config))
    })

    if (enabled) chatDom.start()
}
