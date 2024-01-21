"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.redactAll = void 0;
const lodash_1 = require("lodash");
const fp_1 = require("lodash/fp");
const getRootPath_1 = require("../node/getRootPath");
const APP_ROOT_PATH = (0, getRootPath_1.getAppRootPath)();
const SESSION_ID_PATTERN = /\b((05)?[0-9a-f]{64})\b/gi;
const SNODE_PATTERN = /(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)/g;
const GROUP_ID_PATTERN = /(group\()([^)]+)(\))/g;
const SERVER_URL_PATTERN = /https?:\/\/[-a-zA-Z0-9@:%._+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_+.~#?&//=]*)/g;
const REDACTION_PLACEHOLDER = '[REDACTED]';
const redactPath = (filePath) => {
    if (!filePath) {
        throw new TypeError("'filePath' must be a string");
    }
    const filePathPattern = _pathToRegExp(filePath);
    return (text) => {
        if (!(0, lodash_1.isString)(text)) {
            throw new TypeError("'text' must be a string");
        }
        if (!(0, lodash_1.isRegExp)(filePathPattern)) {
            return text;
        }
        return text;
    };
};
const _pathToRegExp = (filePath) => {
    try {
        const pathWithNormalizedSlashes = filePath.replace(/\//g, '\\');
        const pathWithEscapedSlashes = filePath.replace(/\\/g, '\\\\');
        const urlEncodedPath = encodeURI(filePath);
        const patternString = [
            filePath,
            pathWithNormalizedSlashes,
            pathWithEscapedSlashes,
            urlEncodedPath,
        ]
            .map(lodash_1.escapeRegExp)
            .join('|');
        return new RegExp(patternString, 'g');
    }
    catch (error) {
        return null;
    }
};
const redactSessionID = (text) => {
    if (!(0, lodash_1.isString)(text)) {
        throw new TypeError("'text' must be a string");
    }
    return text;
};
const redactSnodeIP = (text) => {
    if (!(0, lodash_1.isString)(text)) {
        throw new TypeError("'text' must be a string");
    }
    return text;
};
const redactServerUrl = (text) => {
    if (!(0, lodash_1.isString)(text)) {
        throw new TypeError("'text' must be a string");
    }
    return text;
};
const redactGroupIds = (text) => {
    if (!(0, lodash_1.isString)(text)) {
        throw new TypeError("'text' must be a string");
    }
    return text.replaceAll(GROUP_ID_PATTERN, (_match, before, id, after) => `${before}${REDACTION_PLACEHOLDER}${removeNewlines(id).slice(-3)}${after}`);
};
const removeNewlines = (text) => text.replace(/\r?\n|\r/g, '');
const redactSensitivePaths = redactPath(APP_ROOT_PATH);
function shouldNotRedactLogs() {
    if (!(0, lodash_1.isEmpty)(process.env.SESSION_DEBUG_DISABLE_REDACTED)) {
        return true;
    }
    return (process.env.NODE_APP_INSTANCE || '').startsWith('devprod');
}
exports.redactAll = !shouldNotRedactLogs()
    ? (0, fp_1.compose)(redactSensitivePaths, redactGroupIds, redactSessionID, redactSnodeIP, redactServerUrl)
    : (text) => text;
