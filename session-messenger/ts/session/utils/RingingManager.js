"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setIsRinging = exports.getIsRinging = void 0;
const sessionjs_logger_1 = require("../../sessionjs-logger");
const sound = './sound/ringing.mp3';
let currentlyRinging = false;
let ringingAudio;
function stopRinging() {
    if (ringingAudio) {
        ringingAudio.pause();
        ringingAudio.srcObject = null;
    }
}
function startRinging() {
    if (!ringingAudio) {
        ringingAudio = new Audio(sound);
        ringingAudio.loop = true;
        ringingAudio.volume = 0.6;
    }
    void ringingAudio.play().catch(sessionjs_logger_1.console.info);
}
function getIsRinging() {
    return currentlyRinging;
}
exports.getIsRinging = getIsRinging;
function setIsRinging(isRinging) {
    if (!currentlyRinging && isRinging) {
        startRinging();
        currentlyRinging = true;
    }
    else if (currentlyRinging && !isRinging) {
        stopRinging();
        currentlyRinging = false;
    }
}
exports.setIsRinging = setIsRinging;
