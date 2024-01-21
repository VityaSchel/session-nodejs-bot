"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.hexColorToRGB = void 0;
function hexColorToRGB(hexColor) {
    let red = 0;
    let green = 0;
    let blue = 0;
    if (hexColor.length === 4) {
        red = Number(`0x${hexColor[1]}${hexColor[1]}`);
        green = Number(`0x${hexColor[2]}${hexColor[2]}`);
        blue = Number(`0x${hexColor[3]}${hexColor[3]}`);
    }
    else if (hexColor.length === 7) {
        red = Number(`0x${hexColor[1]}${hexColor[2]}`);
        green = Number(`0x${hexColor[3]}${hexColor[4]}`);
        blue = Number(`0x${hexColor[5]}${hexColor[6]}`);
    }
    return `${red}, ${green}, ${blue}`;
}
exports.hexColorToRGB = hexColorToRGB;
