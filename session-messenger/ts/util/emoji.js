"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.searchSync = exports.initialiseEmojiData = exports.i18nEmojiData = exports.nativeEmojiData = exports.getEmojiSizeClass = void 0;
const emoji_mart_1 = require("emoji-mart");
const sessionjs_logger_1 = require("../sessionjs-logger");
function getRegexUnicodeEmojis() {
    return /\p{Emoji_Presentation}/gu;
}
function getCountOfAllMatches(str) {
    const regex = getRegexUnicodeEmojis();
    const matches = str.match(regex);
    return matches?.length || 0;
}
function hasNormalCharacters(str) {
    const noEmoji = str.replace(getRegexUnicodeEmojis(), '').trim();
    return noEmoji.length > 0;
}
function getEmojiSizeClass(str) {
    if (!str || !str.length) {
        return 'small';
    }
    if (hasNormalCharacters(str)) {
        return 'small';
    }
    const emojiCount = getCountOfAllMatches(str);
    if (emojiCount > 6) {
        return 'small';
    }
    if (emojiCount > 4) {
        return 'medium';
    }
    if (emojiCount > 2) {
        return 'large';
    }
    return 'jumbo';
}
exports.getEmojiSizeClass = getEmojiSizeClass;
exports.nativeEmojiData = null;
exports.i18nEmojiData = null;
async function initialiseEmojiData(data) {
    const ariaLabels = {};
    Object.entries(data.emojis).forEach(([key, value]) => {
        value.search = `,${[
            [value.id, false],
            [value.name, true],
            [value.keywords, false],
            [value.emoticons, false],
        ]
            .map(([strings, split]) => {
            if (!strings) {
                return null;
            }
            return (Array.isArray(strings) ? strings : [strings])
                .map(string => (split ? string.split(/[-|_|\s]+/) : [string]).map((s) => s.toLowerCase()))
                .flat();
        })
            .flat()
            .filter(a => a && a.trim())
            .join(',')})}`;
        value.skins.forEach(skin => {
            ariaLabels[skin.native] = value.name;
        });
        data.emojis[key] = value;
    });
    data.ariaLabels = ariaLabels;
    exports.nativeEmojiData = data;
    await (0, emoji_mart_1.init)({ data, i18n: exports.i18nEmojiData });
}
exports.initialiseEmojiData = initialiseEmojiData;
function searchSync(query, args) {
    if (!exports.nativeEmojiData) {
        sessionjs_logger_1.console.error('No native emoji data found');
        return [];
    }
    if (!query || !query.trim().length) {
        return [];
    }
    const maxResults = args && args.maxResults ? args.maxResults : 90;
    const values = query
        .toLowerCase()
        .replace(/(\w)-/, '$1 ')
        .split(/[\s|,]+/)
        .filter((word, i, words) => {
        return word.trim() && words.indexOf(word) === i;
    });
    if (!values.length) {
        return [];
    }
    let pool = Object.values(exports.nativeEmojiData.emojis);
    let results = [];
    let scores = {};
    for (const value of values) {
        if (!pool.length) {
            break;
        }
        results = [];
        scores = {};
        for (const emoji of pool) {
            if (!emoji.search) {
                continue;
            }
            const score = emoji.search.indexOf(`,${value}`);
            if (score === -1) {
                continue;
            }
            results.push(emoji);
            scores[emoji.id] = scores[emoji.id] ? scores[emoji.id] : 0;
            scores[emoji.id] += emoji.id === value ? 0 : score + 1;
        }
        pool = results;
    }
    if (results.length < 2) {
        return results;
    }
    results.sort((a, b) => {
        const aScore = scores[a.id];
        const bScore = scores[b.id];
        if (aScore === bScore) {
            return a.id.localeCompare(b.id);
        }
        return aScore - bScore;
    });
    if (results.length > maxResults) {
        results = results.slice(0, maxResults);
    }
    return results;
}
exports.searchSync = searchSync;
