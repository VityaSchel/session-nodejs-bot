"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getTimerBucketIcon = exports.getIncrement = void 0;
const lodash_1 = require("lodash");
function getIncrement(length) {
    if (length < 0) {
        return 1000;
    }
    if (length <= 60000) {
        return 500;
    }
    return Math.ceil(length / 12);
}
exports.getIncrement = getIncrement;
function getTimerBucketIcon(expiration, length) {
    const delta = expiration - Date.now();
    if (delta < 0) {
        return 'timer60';
    }
    if (delta > length) {
        return 'timer00';
    }
    const bucket = Math.round((delta / length) * 12);
    const padded = (0, lodash_1.padStart)(String(bucket * 5), 2, '0');
    switch (padded) {
        case '00':
            return 'timer00';
        case '05':
            return 'timer05';
        case '10':
            return 'timer10';
        case '15':
            return 'timer15';
        case '20':
            return 'timer20';
        case '25':
            return 'timer25';
        case '30':
            return 'timer30';
        case '35':
            return 'timer35';
        case '40':
            return 'timer40';
        case '45':
            return 'timer45';
        case '50':
            return 'timer50';
        case '55':
            return 'timer55';
        default:
            return 'timer60';
    }
}
exports.getTimerBucketIcon = getTimerBucketIcon;
