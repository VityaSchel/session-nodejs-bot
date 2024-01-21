"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPrintableError = void 0;
function getPrintableError(error) {
    return error && error.stack ? error.stack : error;
}
exports.getPrintableError = getPrintableError;
