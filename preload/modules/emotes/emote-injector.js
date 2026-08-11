//swaps emote names in a chat message for images.
//native twitch emotes are already elements rather than text by the time we see a
//message, so walking text nodes can't accidentally touch them.

//matches the inline height the tv interface gives its own emotes
const emoteSize = '2.4rem'
const processedFlag = 'vacuumEmotes'

function createEmoteImage(emote) {
    const image = document.createElement('img')

    image.src = emote.url
    image.alt = emote.name
    image.title = `${emote.name} (${emote.provider})`
    image.draggable = false
    image.style.height = emoteSize
    image.style.verticalAlign = 'middle'
    image.style.objectFit = 'contain'

    return image;
}

function createEmoteWrapper(emote) {
    const wrapper = document.createElement('span')

    wrapper.style.position = 'relative'
    wrapper.style.display = 'inline-block'
    wrapper.style.verticalAlign = 'middle'
    wrapper.appendChild(createEmoteImage(emote))

    return wrapper;
}

function createOverlay(emote) {
    const image = createEmoteImage(emote)

    image.style.position = 'absolute'
    image.style.left = '0'
    image.style.top = '0'
    image.style.width = '100%'
    image.style.height = '100%'
    image.style.pointerEvents = 'none'

    return image;
}

function collectTextNodes(root) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
    const nodes = []

    let node = walker.nextNode()
    while (node) {
        nodes.push(node)
        node = walker.nextNode()
    }

    return nodes;
}

function dropTrailingWhitespace(fragment) {
    const last = fragment.lastChild
    if (!last) return;

    const isWhitespaceText = last.nodeType === Node.TEXT_NODE && !last.nodeValue.trim()
    if (isWhitespaceText) fragment.removeChild(last)
}

//returns the wrapper of the last emote written, so an overlay arriving in a later
//text node can still stack onto it
function replaceTextNode(textNode, store, previousWrapper) {
    const parts = textNode.nodeValue.split(/(\s+)/)
    const hasAnyEmote = parts.some(part => !!store.lookup(part))
    if (!hasAnyEmote) return previousWrapper;

    const fragment = document.createDocumentFragment()
    let lastWrapper = previousWrapper

    for (const part of parts) {
        const isWhitespace = !part.trim()
        if (isWhitespace) {
            fragment.appendChild(document.createTextNode(part))
            continue;
        }

        const emote = store.lookup(part)
        if (!emote) {
            fragment.appendChild(document.createTextNode(part))
            lastWrapper = null //plain words break an overlay chain
            continue;
        }

        const stacksOnPrevious = emote.zeroWidth && !!lastWrapper
        if (stacksOnPrevious) {
            dropTrailingWhitespace(fragment)
            lastWrapper.appendChild(createOverlay(emote))
            continue;
        }

        const wrapper = createEmoteWrapper(emote)
        fragment.appendChild(wrapper)
        lastWrapper = wrapper
    }

    textNode.parentNode.replaceChild(fragment, textNode)
    return lastWrapper;
}

function inject(messageElement, store) {
    //don't mark anything as done while the emote list is still downloading,
    //so the caller can rescan these messages once it lands
    if (!store.isReady()) return;

    const alreadyDone = messageElement.dataset?.[processedFlag]
    if (alreadyDone) return;

    if (messageElement.dataset) messageElement.dataset[processedFlag] = 'true'

    let lastWrapper = null
    for (const textNode of collectTextNodes(messageElement)) {
        //a previous replacement may have detached this node
        if (!textNode.parentNode) continue;

        lastWrapper = replaceTextNode(textNode, store, lastWrapper)
    }
}

module.exports = {
    inject
}
