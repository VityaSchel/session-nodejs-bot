"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.console = void 0;
exports.console = {
    log: (...args) => {
        global.SBOT?.verbose?.includes('info') && global.console.log('[Session]', ...args);
    },
    error: (...args) => {
        global.SBOT?.verbose?.includes('error') && global.console.error('[Session]', ...args);
    },
    warn: (...args) => {
        global.SBOT?.verbose?.includes('warn') && global.console.warn('[Session]', ...args);
    },
    info: (...args) => {
        global.SBOT?.verbose?.includes('info') && global.console.info('[Session]', ...args);
    },
    debug: (...args) => {
        global.SBOT?.verbose?.includes('info') && global.console.debug('[Session]', ...args);
    },
};
