"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.closeDbInstance = exports.initDbInstanceWith = exports.assertGlobalInstanceOrInstance = exports.isInstanceInitialized = exports.assertGlobalInstance = void 0;
let globalInstance = null;
function assertGlobalInstance() {
    if (!globalInstance) {
        throw new Error('globalInstance is not initialized.');
    }
    return globalInstance;
}
exports.assertGlobalInstance = assertGlobalInstance;
function isInstanceInitialized() {
    return !!globalInstance;
}
exports.isInstanceInitialized = isInstanceInitialized;
function assertGlobalInstanceOrInstance(instance) {
    if (!globalInstance && !instance) {
        throw new Error('neither globalInstance nor initialized is initialized.');
    }
    return globalInstance || instance;
}
exports.assertGlobalInstanceOrInstance = assertGlobalInstanceOrInstance;
function initDbInstanceWith(instance) {
    if (globalInstance) {
        throw new Error('already init');
    }
    globalInstance = instance;
}
exports.initDbInstanceWith = initDbInstanceWith;
function closeDbInstance() {
    if (!globalInstance) {
        return;
    }
    const dbRef = globalInstance;
    globalInstance = null;
    dbRef.pragma('optimize');
    dbRef.close();
}
exports.closeDbInstance = closeDbInstance;
