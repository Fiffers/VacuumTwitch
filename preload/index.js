let modules = [
    require('./modules/events'),
    require('./modules/controller-support'),
    require('./modules/touch-controls'),
    require('./modules/emotes'),
    require('./modules/hide-join-conversation'),
    require('./modules/fit-window'),
    require('./modules/oled-theme'),
    require('./modules/chat-resize'),
    require('./modules/overlay-escape'),
    require('./modules/settings'),
    require('./modules/mouse-disappear'),
    require('./modules/prevent-visibilitychange'),
    require('./modules/override-f11'),
]

for (let module of modules) {
    module()
}