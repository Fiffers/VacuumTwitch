//fetches and normalises 7tv + bttv emotes into one lookup map.
//knows nothing about the dom or the websocket.

//7tv marks overlay emotes with bit 0 of the emote set entry's flags
const sevenTvZeroWidthFlag = 1

//bttv does not expose which emotes are overlays, so its own client hardcodes them.
//note this is NOT the same thing as bttv's `modifier` field, which marks image
//transforms (c!, h!, l!, r! ...) rather than overlays.
const bttvZeroWidthCodes = new Set([
    'SoSnowy',
    'IceCold',
    'SantaHat',
    'TopHat',
    'ReinDeer',
    'CandyCane',
    'cvMask',
    'cvHazmat'
])

let emotes = new Map()
let loadedRoomId = null;
let ready = false;

async function fetchJson(url) {
    try {
        const response = await fetch(url)
        if (!response.ok) return null;

        return await response.json();
    } catch (err) {
        console.warn(`[emotes] request failed for ${url}`, err.message)
        return null;
    }
}

function sevenTvUrl(entry) {
    const host = entry.data?.host
    if (!host?.url) return null;

    const files = host.files || []
    const preferred = files.find(file => file.name === '2x.webp')
        || files.find(file => file.name.endsWith('.webp'))
        || files[0]

    if (!preferred) return null;

    return `https:${host.url}/${preferred.name}`;
}

function addSevenTvEmotes(entries) {
    if (!Array.isArray(entries)) return;

    for (const entry of entries) {
        const url = sevenTvUrl(entry)
        if (!url) continue;

        const isZeroWidth = (entry.flags & sevenTvZeroWidthFlag) !== 0

        emotes.set(entry.name, {
            name: entry.name,
            url,
            zeroWidth: isZeroWidth,
            provider: '7TV'
        })
    }
}

function addBttvEmotes(entries) {
    if (!Array.isArray(entries)) return;

    for (const entry of entries) {
        //modifiers are an image-transform feature we don't implement, and rendering
        //them as plain emotes would put stray images in chat
        if (entry.modifier) continue;

        emotes.set(entry.code, {
            name: entry.code,
            url: `https://cdn.betterttv.net/emote/${entry.id}/2x.webp`,
            zeroWidth: bttvZeroWidthCodes.has(entry.code),
            provider: 'BTTV'
        })
    }
}

async function load(roomId) {
    const alreadyLoaded = roomId === loadedRoomId
    if (alreadyLoaded) return;

    loadedRoomId = roomId
    ready = false;

    const [sevenTvGlobal, sevenTvUser, bttvGlobal, bttvUser] = await Promise.all([
        fetchJson('https://7tv.io/v3/emote-sets/global'),
        fetchJson(`https://7tv.io/v3/users/twitch/${roomId}`),
        fetchJson('https://api.betterttv.net/3/cached/emotes/global'),
        fetchJson(`https://api.betterttv.net/3/cached/users/twitch/${roomId}`)
    ])

    //a later set overwrites an earlier one on a name clash, so this ordering means
    //channel emotes beat globals, and 7tv beats bttv
    emotes = new Map()

    addBttvEmotes(bttvGlobal)
    addSevenTvEmotes(sevenTvGlobal?.emotes)
    addBttvEmotes([...(bttvUser?.channelEmotes || []), ...(bttvUser?.sharedEmotes || [])])
    addSevenTvEmotes(sevenTvUser?.emote_set?.emotes)

    ready = true;
    console.log(`[emotes] loaded ${emotes.size} third-party emotes for room ${roomId}`)
}

function lookup(name) {
    return emotes.get(name);
}

function isReady() {
    return ready;
}

function size() {
    return emotes.size;
}

module.exports = {
    load,
    lookup,
    isReady,
    size
}
