const fs = require('fs')
const electron = require('electron')
const path = require('path')

const userData = electron.app.getPath('userData')
const legacyStateFile = path.join(userData, 'state.json')
const configFile = path.join(userData, 'config.json')

let changed = false;
let config = {}

const defaults = {
    fullscreen: false, //changes automatically depending on user's last preference
    adblock: false, //block ads
    hardware_decoding: true, //use hardware gpu video decoding
    keep_on_top: false, //whether or not to keep window on top
    third_party_emotes: true, //show 7tv and bttv emotes in chat
    oled_theme: false, //pure black backgrounds for oled displays
    chat_width: 25 //width of chat as a percentage of the window, dragged in the app
}

function init(overrides = {}) {
    if (fs.existsSync(legacyStateFile)) {
        console.log('migrating legacy state.json')
        fs.renameSync(legacyStateFile, configFile)
    }

    if (fs.existsSync(configFile) && isValidJson(configFile)) {
        console.log(`reading config from ${configFile}`)

        let parsed = JSON.parse(fs.readFileSync(configFile, 'utf-8'))
        config = {
            ...defaults,
            ...stripIndexKeys(parsed)
        }

        console.log('loaded config', config)
    } else {
        console.log('initializing default config')

        config = {
            ...defaults,
            ...overrides
        }

        try {
            fs.writeFileSync(configFile, JSON.stringify(config, null, 4))
        } catch (err) {
            console.error('failed to write config file', err)
        }
    }

    setInterval(save, 2500)

    return config;
}

function save() {
    if (changed) {
        console.log('saving updated config to file')

        try {
            fs.writeFileSync(configFile, JSON.stringify(config, null, 4))
            return true;
        } catch (err) {
            console.error('failed to write config file', err)
            return false;
        } finally {
            changed = false;
        }
    }
}

function update(newConfig = {}) {
    config = {
        ...defaults,
        ...config,
        ...newConfig
    }

    changed = true;
}

function get() {
    return config;
}

//earlier builds passed the config path in as the overrides argument, which spread the
//string into the config one character at a time. drop that junk if we find it.
function stripIndexKeys(parsed) {
    let cleaned = {}

    for (let key of Object.keys(parsed)) {
        let isIndexKey = /^\d+$/.test(key)
        if (isIndexKey) continue;

        cleaned[key] = parsed[key]
    }

    return cleaned;
}

function isValidJson(file) {
    try {
        let text = fs.readFileSync(file, 'utf-8')
        let json = JSON.parse(text)
        if (typeof json != 'object') throw new Error('not an object');

        return true;
    } catch {
        return false;
    }
}

module.exports = {
    init,
    save,
    update,
    get
}