//hooks the chat websocket purely to read which channel we're in.
//twitch's tv interface talks raw irc over a websocket, and every PRIVMSG carries
//a `room-id=<numeric id>` tag, which is exactly what the 7tv/bttv apis want.
//this runs from preload, which executes before any page script, so we always
//catch the socket at construction time.

const roomIdPattern = /room-id=(\d+)/

let installed = false;
let currentRoomId = null;
const listeners = []

function notify(roomId) {
    for (const listener of listeners) {
        try {
            listener(roomId)
        } catch (err) {
            console.error('[emotes] room id listener failed', err)
        }
    }
}

function readFrame(data) {
    const isText = typeof data === 'string'
    if (!isText) return;

    const mentionsRoom = data.includes('room-id=')
    if (!mentionsRoom) return;

    const match = data.match(roomIdPattern)
    if (!match) return;

    const roomId = match[1]
    const isSameChannel = roomId === currentRoomId
    if (isSameChannel) return;

    currentRoomId = roomId
    console.log(`[emotes] channel is now room ${roomId}`)
    notify(roomId)
}

function install() {
    if (installed) return;
    installed = true;

    const NativeWebSocket = window.WebSocket

    //a proxy keeps the prototype, static constants and instanceof behaviour intact,
    //so the page can't tell the difference
    window.WebSocket = new Proxy(NativeWebSocket, {
        construct(target, args) {
            const socket = new target(...args)

            socket.addEventListener('message', (event) => {
                try {
                    readFrame(event.data)
                } catch (err) {
                    console.error('[emotes] failed reading socket frame', err)
                }
            })

            return socket;
        }
    })
}

function onRoomId(listener) {
    listeners.push(listener)

    //if we already know the room, tell the new listener straight away
    if (currentRoomId) listener(currentRoomId)
}

module.exports = {
    install,
    onRoomId
}
