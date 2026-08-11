//hides the "Join the conversation" button at the bottom of chat.
//it's the only button inside the chat sidebar, so matching on that rather than on
//the english label or twitch's hashed class names keeps this working across
//locales and twitch redeploys. the aside:has(div[dir="auto"]) part pins it to the
//sidebar that actually holds chat messages, so asides on other pages are untouched.
//
//done as a stylesheet instead of removing the node, because react rebuilds the
//sidebar on its own schedule and would put the button straight back.

const styleId = 'vacuum-hide-join-conversation'
const css = 'aside:has(div[dir="auto"]) div:has(> button) { display: none !important; }'

function injectStyle() {
    const alreadyInjected = !!document.getElementById(styleId)
    if (alreadyInjected) return;

    const style = document.createElement('style')
    style.id = styleId
    style.textContent = css

    const target = document.head || document.documentElement
    if (!target) return;

    target.appendChild(style)
}

module.exports = () => {
    const documentIsReady = document.readyState !== 'loading'
    if (documentIsReady) {
        injectStyle()
        return;
    }

    document.addEventListener('DOMContentLoaded', injectStyle)
}
