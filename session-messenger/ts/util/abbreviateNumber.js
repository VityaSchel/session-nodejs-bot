"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.abbreviateNumber = void 0;
const abbreviations = ['k', 'm', 'b', 't'];
function abbreviateNumber(number, decimals = 2) {
    let result = String(number);
    const d = 10 ** decimals;
    for (let i = abbreviations.length - 1; i >= 0; i--) {
        const size = 10 ** ((i + 1) * 3);
        if (size <= number) {
            let n = Math.round((number * d) / size) / d;
            if (n === 1000 && i < abbreviations.length - 1) {
                n = 1;
                i++;
            }
            result = String(n) + abbreviations[i];
            break;
        }
    }
    return result;
}
exports.abbreviateNumber = abbreviateNumber;
