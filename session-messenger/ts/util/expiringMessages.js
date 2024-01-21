"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ExpirationTimerOptions = exports.destroyMessagesAndUpdateRedux = void 0;
const lodash_1 = require("lodash");
const moment_1 = __importDefault(require("moment"));
const wallClockListener_1 = require("./wallClockListener");
const data_1 = require("../data/data");
const conversations_1 = require("../session/conversations");
const sessionjs_logger_1 = require("../sessionjs-logger");
async function destroyMessagesAndUpdateRedux(messages) {
    if (!messages.length) {
        return;
    }
    const conversationWithChanges = (0, lodash_1.uniq)(messages.map(m => m.conversationKey));
    try {
        await data_1.Data.removeMessagesByIds(messages.map(m => m.messageId));
    }
    catch (e) {
        sessionjs_logger_1.console.error('destroyMessages: removeMessagesByIds failed', e && e.message ? e.message : e);
    }
    sessionjs_logger_1.console.log('[SBOT/redux] messagesExpired');
    conversationWithChanges.forEach(convoIdToUpdate => {
        (0, conversations_1.getConversationController)()
            .get(convoIdToUpdate)
            ?.updateLastMessage();
    });
}
exports.destroyMessagesAndUpdateRedux = destroyMessagesAndUpdateRedux;
async function destroyExpiredMessages() {
    try {
        sessionjs_logger_1.console.info('destroyExpiredMessages: Loading messages...');
        const messages = await data_1.Data.getExpiredMessages();
        const messagesExpiredDetails = messages.map(m => ({
            conversationKey: m.get('conversationId'),
            messageId: m.id,
        }));
        messages.forEach(expired => {
            sessionjs_logger_1.console.info('Message expired', {
                sentAt: expired.get('sent_at'),
            });
        });
        await destroyMessagesAndUpdateRedux(messagesExpiredDetails);
    }
    catch (error) {
        sessionjs_logger_1.console.error('destroyExpiredMessages: Error deleting expired messages', error && error.stack ? error.stack : error);
    }
    sessionjs_logger_1.console.info('destroyExpiredMessages: complete');
    void checkExpiringMessages();
}
let timeout;
async function checkExpiringMessages() {
    const messages = await data_1.Data.getNextExpiringMessage();
    const next = messages.at(0);
    if (!next) {
        return;
    }
    const expiresAt = next.get('expires_at');
    if (!expiresAt) {
        return;
    }
    sessionjs_logger_1.console.info('next message expires', new Date(expiresAt).toISOString());
    sessionjs_logger_1.console.info('next message expires in ', (expiresAt - Date.now()) / 1000);
    let wait = expiresAt - Date.now();
    if (wait < 0) {
        wait = 0;
    }
    if (wait > 2147483647) {
        wait = 2147483647;
    }
    if (timeout) {
        global.clearTimeout(timeout);
    }
    timeout = global.setTimeout(async () => destroyExpiredMessages(), wait);
}
const throttledCheckExpiringMessages = (0, lodash_1.throttle)(checkExpiringMessages, 1000);
let isInit = false;
const initExpiringMessageListener = () => {
    if (isInit) {
        throw new Error('expiring messages listener is already init');
    }
    void checkExpiringMessages();
    (0, wallClockListener_1.initWallClockListener)(async () => throttledCheckExpiringMessages());
    isInit = true;
};
const updateExpiringMessagesCheck = () => {
    void throttledCheckExpiringMessages();
};
function getTimerOptionName(time, unit) {
    return (moment_1.default.duration(time, unit).humanize());
}
function getTimerOptionAbbreviated(time, unit) {
    return '';
}
const timerOptionsDurations = [
    { time: 0, unit: 'seconds' },
    { time: 5, unit: 'seconds' },
    { time: 10, unit: 'seconds' },
    { time: 30, unit: 'seconds' },
    { time: 1, unit: 'minute' },
    { time: 5, unit: 'minutes' },
    { time: 30, unit: 'minutes' },
    { time: 1, unit: 'hour' },
    { time: 6, unit: 'hours' },
    { time: 12, unit: 'hours' },
    { time: 1, unit: 'day' },
    { time: 1, unit: 'week' },
].map(o => {
    const duration = moment_1.default.duration(o.time, o.unit);
    return {
        time: o.time,
        unit: o.unit,
        seconds: duration.asSeconds(),
    };
});
function getName(seconds = 0) {
    const o = timerOptionsDurations.find(m => m.seconds === seconds);
    if (o) {
        return getTimerOptionName(o.time, o.unit);
    }
    return [seconds, 'seconds'].join(' ');
}
function getAbbreviated(seconds = 0) {
    const o = timerOptionsDurations.find(m => m.seconds === seconds);
    if (o) {
        return getTimerOptionAbbreviated(o.time, o.unit);
    }
    return [seconds, 's'].join('');
}
function getTimerSecondsWithName() {
    return timerOptionsDurations.map(t => {
        return { name: getName(t.seconds), value: t.seconds };
    });
}
exports.ExpirationTimerOptions = {
    getName,
    getAbbreviated,
    updateExpiringMessagesCheck,
    initExpiringMessageListener,
    getTimerSecondsWithName,
};
