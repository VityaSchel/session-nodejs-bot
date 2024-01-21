"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getInitials = void 0;
function getInitials(name) {
    if (!name || !name.length) {
        return '0';
    }
    if (name.length > 2 && name.startsWith('05')) {
        return upperAndShorten(name[2]);
    }
    if (name.split(/[-\s]/).length === 1) {
        if (name.length > 1) {
            const alphanum = name.match(/[\p{L}\p{N}]+/u);
            if (alphanum) {
                return upperAndShorten(alphanum[0].slice(0, 2));
            }
        }
        return upperAndShorten(name[0]);
    }
    return upperAndShorten(name
        .split(/[-\s]/)
        .slice(0, 2)
        .map(n => n.match(/^[\p{L}\p{N}]/u))
        .join(''));
}
exports.getInitials = getInitials;
function upperAndShorten(str) {
    return str.toLocaleUpperCase().slice(0, 2);
}
