"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.windowShouldQuit = exports.windowMarkShouldQuit = void 0;
let shouldQuitFlag = false;
function windowMarkShouldQuit() {
    shouldQuitFlag = true;
}
exports.windowMarkShouldQuit = windowMarkShouldQuit;
function windowShouldQuit() {
    return shouldQuitFlag;
}
exports.windowShouldQuit = windowShouldQuit;
