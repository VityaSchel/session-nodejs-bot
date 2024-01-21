"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.toLogFormat = void 0;
const toLogFormat = (error) => {
    if (!error) {
        return error;
    }
    if (error && error.stack) {
        return error.stack;
    }
    return error.toString();
};
exports.toLogFormat = toLogFormat;
