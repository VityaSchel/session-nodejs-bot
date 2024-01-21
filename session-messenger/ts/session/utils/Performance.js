"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.perfEnd = exports.perfStart = void 0;
function perfStart(prefix) {
    if (typeof performance !== 'undefined') {
        performance?.mark?.(`${prefix}-start`);
    }
}
exports.perfStart = perfStart;
function perfEnd(prefix, measureName) {
    if (typeof performance !== 'undefined') {
        performance?.mark?.(`${prefix}-end`);
        performance?.measure?.(measureName, `${prefix}-start`, `${prefix}-end`);
    }
}
exports.perfEnd = perfEnd;
