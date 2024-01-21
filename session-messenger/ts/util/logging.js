"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const privacy_1 = require("./privacy");
const sessionjs_logger_1 = require("../sessionjs-logger");
const BLANK_LEVEL = '     ';
const LEVELS = {
    60: 'fatal',
    50: 'error',
    40: 'warn ',
    30: 'info ',
    20: 'debug',
    10: 'trace',
};
function now() {
    const date = new Date();
    return date.toJSON();
}
function cleanArgsForIPC(args) {
    const str = args.map((item) => {
        if (typeof item !== 'string') {
            try {
                return JSON.stringify(item);
            }
            catch (error) {
                return item;
            }
        }
        return item;
    });
    return str.join(' ');
}
function log(...args) {
    logAtLevel('info', 'INFO ', ...args);
}
function getHeader() {
    let header = `[SBOT]:window.navigator.userAgent`;
    header += ` node/${process.version}`;
    header += ` env/[SBOT]`;
    return header;
}
function getLevel(level) {
    const text = LEVELS[level];
    if (!text) {
        return BLANK_LEVEL;
    }
    return text.toUpperCase();
}
function formatLine(entry) {
    return `${getLevel(entry.level)} ${entry.time} ${entry.msg}`;
}
function format(entries) {
    return (0, privacy_1.redactAll)(entries.map(formatLine).join('\n'));
}
const development = true;
function logAtLevel(level, prefix, ...args) {
    if (prefix === 'DEBUG') {
        return;
    }
    if (development) {
        const fn = `_${level}`;
        sessionjs_logger_1.console[fn](prefix, now(), ...args);
    }
    else {
        sessionjs_logger_1.console._log(prefix, now(), ...args);
    }
    const str = cleanArgsForIPC(args);
    const logText = (0, privacy_1.redactAll)(str);
}
