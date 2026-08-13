//esc dismisses the player overlay instead of navigating back.
//
//class names are hashed, so the overlay is found by how it animates. it comes in
//two flavours: layers that fade via opacity (text, buttons, images), and a scrim
//that fades by animating its gradient instead. the scrim sits at opacity 1 even
//when hidden, so only the fading layers can answer "is the overlay up?".

const escapeKeyCode = 27

let hidden = false;

function overlaySection() {
    return document.querySelector('main > section > section');
}

function fadeLayers(section) {
    return [...section.querySelectorAll('div')]
        .filter(element => getComputedStyle(element).transitionProperty === 'opacity');
}

function scrimLayers(section) {
    return [...section.querySelectorAll('div')].filter(element => {
        const style = getComputedStyle(element)
        const isGradient = style.backgroundImage.includes('gradient')

        return isGradient && style.transitionProperty.includes('background');
    });
}

function allLayers() {
    const section = overlaySection()
    if (!section) return [];

    return [...fadeLayers(section), ...scrimLayers(section)];
}

function isVisible() {
    const section = overlaySection()
    if (!section) return false;

    return fadeLayers(section).some(layer => parseFloat(getComputedStyle(layer).opacity) > 0.5);
}

function hide() {
    for (const layer of allLayers()) {
        layer.style.setProperty('opacity', '0', 'important')
        layer.style.setProperty('pointer-events', 'none', 'important')
    }

    hidden = true;
}

//twitch brings the overlay back by animating it, which our inline style would
//otherwise block, so drop the override as soon as the user does anything else
function restore() {
    if (!hidden) return;
    hidden = false;

    for (const layer of allLayers()) {
        layer.style.removeProperty('opacity')
        layer.style.removeProperty('pointer-events')
    }
}

function handleKey(event) {
    const isEscape = event.keyCode === escapeKeyCode
    if (!isEscape) {
        restore()
        return;
    }

    if (!isVisible()) {
        restore() //nothing to dismiss, let escape navigate back as usual
        return;
    }

    event.preventDefault()
    event.stopImmediatePropagation()
    hide()
}

module.exports = () => {
    window.addEventListener('keydown', handleKey, true)
    window.addEventListener('mousemove', restore)
}
