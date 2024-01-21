"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getLastestRelease = exports.setLastestRelease = void 0;
let latestRelease;
function setLastestRelease(release) {
    latestRelease = release;
}
exports.setLastestRelease = setLastestRelease;
function getLastestRelease() {
    return latestRelease;
}
exports.getLastestRelease = getLastestRelease;
