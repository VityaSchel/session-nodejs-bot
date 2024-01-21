"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.start = void 0;
const fs_1 = require("fs");
const sessionjs_logger_1 = require("../../sessionjs-logger");
const ENCODING = 'utf8';
function start(name, targetPath, options = {}) {
    const { allowMalformedOnStartup } = options;
    let cachedValue = {};
    try {
        const text = (0, fs_1.readFileSync)(targetPath, ENCODING);
        cachedValue = JSON.parse(text);
        sessionjs_logger_1.console.log(`config/get: Successfully read ${name} config file`);
        if (!cachedValue) {
            sessionjs_logger_1.console.log(`config/get: ${name} config value was falsy, cache is now empty object`);
            cachedValue = Object.create(null);
        }
    }
    catch (error) {
        if (!allowMalformedOnStartup && error.code !== 'ENOENT') {
            throw error;
        }
        sessionjs_logger_1.console.log(`config/get: Did not find ${name} config file, cache is now empty object`);
        cachedValue = Object.create(null);
    }
    function get(keyPath) {
        return cachedValue[keyPath];
    }
    function set(keyPath, value) {
        cachedValue[keyPath] = value;
        sessionjs_logger_1.console.log(`config/set: Saving ${name} config to disk`);
        const text = JSON.stringify(cachedValue, null, '  ');
        (0, fs_1.writeFileSync)(targetPath, text, ENCODING);
        sessionjs_logger_1.console.log(`config/set: Saved ${name} config to disk`);
    }
    function remove() {
        sessionjs_logger_1.console.log(`config/remove: Deleting ${name} config from disk`);
        (0, fs_1.unlinkSync)(targetPath);
        cachedValue = Object.create(null);
    }
    return {
        set,
        get,
        remove,
    };
}
exports.start = start;
