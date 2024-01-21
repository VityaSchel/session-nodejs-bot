"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isWindowFocused = void 0;
let windowFocused = false;
window.addEventListener('blur', () => {
    windowFocused = false;
});
window.addEventListener('focus', () => {
    windowFocused = true;
});
const isWindowFocused = () => windowFocused;
exports.isWindowFocused = isWindowFocused;
