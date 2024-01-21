"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LinkPreviews = void 0;
const url_1 = __importDefault(require("url"));
const lodash_1 = require("lodash");
const linkify_it_1 = __importDefault(require("linkify-it"));
const linkify = (0, linkify_it_1.default)();
function maybeParseHref(href) {
    try {
        return new URL(href);
    }
    catch (err) {
        return null;
    }
}
function isLinkSafeToPreview(href) {
    const url = maybeParseHref(href);
    return Boolean(url && url.protocol === 'https:' && !isLinkSneaky(href));
}
function findLinks(text, caretLocation) {
    const haveCaretLocation = (0, lodash_1.isNumber)(caretLocation);
    const textLength = text ? text.length : 0;
    const matches = linkify.match(text || '') || [];
    return (0, lodash_1.compact)(matches.map(match => {
        if (!haveCaretLocation) {
            return match.text;
        }
        if (match.lastIndex === textLength && caretLocation === textLength) {
            return match.text;
        }
        if (match.index > caretLocation || match.lastIndex < caretLocation) {
            return match.text;
        }
        return null;
    }));
}
function getDomain(href) {
    const url = maybeParseHref(href);
    return url ? url.hostname : null;
}
const VALID_URI_CHARACTERS = new Set([
    '%',
    ':',
    '/',
    '?',
    '#',
    '[',
    ']',
    '@',
    '!',
    '$',
    '&',
    "'",
    '(',
    ')',
    '*',
    '+',
    ',',
    ';',
    '=',
    ...String.fromCharCode(...(0, lodash_1.range)(65, 91), ...(0, lodash_1.range)(97, 123)),
    ...(0, lodash_1.range)(10).map(String),
    '-',
    '.',
    '_',
    '~',
]);
const ASCII_PATTERN = new RegExp('[\\u0020-\\u007F]', 'g');
const MAX_HREF_LENGTH = 2 ** 12;
function isLinkSneaky(href) {
    if (href.length > MAX_HREF_LENGTH) {
        return true;
    }
    const url = maybeParseHref(href);
    if (!url) {
        return true;
    }
    if (url.username) {
        return true;
    }
    if (!url.hostname) {
        return true;
    }
    if (url.hostname.length > 2048) {
        return true;
    }
    if (url.hostname.includes('%')) {
        return true;
    }
    const labels = url.hostname.split('.');
    if (labels.length < 2 || labels.some(lodash_1.isEmpty)) {
        return true;
    }
    const unicodeDomain = url_1.default.domainToUnicode
        ? url_1.default.domainToUnicode(url.hostname)
        : url.hostname;
    const withoutPeriods = unicodeDomain.replace(/\./g, '');
    const hasASCII = ASCII_PATTERN.test(withoutPeriods);
    const withoutASCII = withoutPeriods.replace(ASCII_PATTERN, '');
    const isMixed = hasASCII && withoutASCII.length > 0;
    if (isMixed) {
        return true;
    }
    const startOfPathAndHash = href.indexOf('/', url.protocol.length + 4);
    const pathAndHash = startOfPathAndHash === -1 ? '' : href.substr(startOfPathAndHash);
    return [...pathAndHash].some(character => !VALID_URI_CHARACTERS.has(character));
}
exports.LinkPreviews = { isLinkSneaky, getDomain, findLinks, isLinkSafeToPreview };
