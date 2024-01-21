"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MAX_USERNAME_BYTES = exports.DEFAULT_RECENT_REACTS = exports.UI = exports.VALIDATION = exports.MAX_ATTACHMENT_FILESIZE_BYTES = exports.CONVERSATION = exports.PROTOCOLS = exports.SWARM_POLLING_TIMEOUT = exports.TTL_DEFAULT = exports.DURATION = void 0;
const seconds = 1000;
const minutes = seconds * 60;
const hours = minutes * 60;
const days = hours * 24;
exports.DURATION = {
    SECONDS: seconds,
    MINUTES: minutes,
    HOURS: hours,
    DAYS: days,
};
exports.TTL_DEFAULT = {
    TYPING_MESSAGE: 20 * exports.DURATION.SECONDS,
    CALL_MESSAGE: 5 * 60 * exports.DURATION.SECONDS,
    TTL_MAX: 14 * exports.DURATION.DAYS,
    TTL_CONFIG: 30 * exports.DURATION.DAYS,
};
exports.SWARM_POLLING_TIMEOUT = {
    ACTIVE: exports.DURATION.SECONDS * 5,
    MEDIUM_ACTIVE: exports.DURATION.SECONDS * 60,
    INACTIVE: exports.DURATION.SECONDS * 120,
};
exports.PROTOCOLS = {
    HTTP: 'http:',
    HTTPS: 'https:',
};
exports.CONVERSATION = {
    DEFAULT_MEDIA_FETCH_COUNT: 50,
    DEFAULT_DOCUMENTS_FETCH_COUNT: 100,
    DEFAULT_MESSAGE_FETCH_COUNT: 30,
    MAX_MESSAGE_FETCH_COUNT: 1000,
    MAX_VOICE_MESSAGE_DURATION: 300,
    MAX_UNREAD_COUNT: 999,
};
exports.MAX_ATTACHMENT_FILESIZE_BYTES = 10 * 1000 * 1000;
exports.VALIDATION = {
    MAX_GROUP_NAME_LENGTH: 30,
    CLOSED_GROUP_SIZE_LIMIT: 100,
};
exports.UI = {
    COLORS: {
        GREEN: '#00F782',
    },
};
exports.DEFAULT_RECENT_REACTS = ['😂', '🥰', '😢', '😡', '😮', '😈'];
exports.MAX_USERNAME_BYTES = 64;
