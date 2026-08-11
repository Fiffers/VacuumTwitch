//finds the chat message list and reports new messages as they arrive.
//the tv interface is react native web, so every class name is hashed and unusable
//as a selector. instead we find the container structurally: the element with the
//most children that look like chat messages.

const containerCheckMs = 2000
const containerSearchMs = 500

let container = null;
let observer = null;
let searchTimer = null;
let watchTimer = null;
const listeners = []

function looksLikeMessage(element) {
    //a message row wraps a react-native-web text node, which always carries dir="auto",
    //and contains at least one span of actual text
    const hasTextNode = !!element.querySelector('div[dir="auto"]')
    if (!hasTextNode) return false;

    return !!element.querySelector('span');
}

function countMessageChildren(element) {
    let count = 0

    for (const child of element.children) {
        if (looksLikeMessage(child)) count++
    }

    return count;
}

function findContainer() {
    let best = null;
    let bestCount = 0

    for (const candidate of document.querySelectorAll('div')) {
        const tooFewChildren = candidate.children.length < 4
        if (tooFewChildren) continue;

        const count = countMessageChildren(candidate)
        if (count > bestCount) {
            bestCount = count
            best = candidate
        }
    }

    const foundEnough = bestCount >= 4
    return foundEnough ? best : null;
}

function notify(element) {
    for (const listener of listeners) {
        try {
            listener(element)
        } catch (err) {
            console.error('[emotes] message listener failed', err)
        }
    }
}

function attach(found) {
    container = found

    observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            for (const added of mutation.addedNodes) {
                const isElement = added.nodeType === Node.ELEMENT_NODE
                if (isElement) notify(added)
            }
        }
    })

    observer.observe(container, { childList: true })
    console.log(`[emotes] attached to chat container with ${container.children.length} messages`)

    //the container is torn down and rebuilt when you change channel, so keep checking
    watchTimer = setInterval(() => {
        const stillPresent = document.contains(container)
        if (stillPresent) return;

        console.log('[emotes] chat container went away, re-acquiring')
        detach()
        start()
    }, containerCheckMs)

    //catch up on whatever is already on screen
    for (const child of container.children) {
        notify(child)
    }
}

function start() {
    if (container) return;

    const found = findContainer()
    if (found) {
        attach(found)
        return;
    }

    //chat isn't up yet (or we're on a page without it), so keep looking
    searchTimer = setTimeout(start, containerSearchMs)
}

function detach() {
    if (observer) observer.disconnect()
    if (watchTimer) clearInterval(watchTimer)
    if (searchTimer) clearTimeout(searchTimer)

    observer = null;
    watchTimer = null;
    searchTimer = null;
    container = null;
}

function rescan() {
    if (!container) return;

    for (const child of container.children) {
        notify(child)
    }
}

function onMessage(listener) {
    listeners.push(listener)
}

module.exports = {
    start,
    detach,
    rescan,
    onMessage
}
