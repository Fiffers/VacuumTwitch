//makes the page fill the window instead of a fixed 16:9 box.
//
//the tv interface is built for televisions, which are always 16:9, so it lays
//itself out on a fixed 106.67rem x 60rem canvas and ties rem to viewport width
//with `html { font-size: 0.9375vw !important }`. every height in the ui, chat
//included, therefore derives from the window's WIDTH and ignores its height.
//in a desktop window that means the layout stays 16:9 and gets centred, leaving
//dead space above and below on a tall window and running off the bottom on a
//short one.
//
//pinning the outer containers to the viewport height lets the app fill whatever
//shape the window actually is. the video keeps object-fit: contain, so it still
//letterboxes rather than stretching.

const styleId = 'vacuum-fit-window'
const css = `
    html { min-height: 100vh !important; }
    body, #__next, main { height: 100vh !important; }
    aside { height: 100vh !important; }
`

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
