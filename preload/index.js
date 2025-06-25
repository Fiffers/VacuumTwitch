let modules = [
    require('./modules/events'),
    require('./modules/controller-support'),
    require('./modules/touch-controls'),
    require('./modules/mouse-disappear'),
    require('./modules/prevent-visibilitychange'),
    require('./modules/override-f11'),
]

for (let module of modules) {
    module()
}