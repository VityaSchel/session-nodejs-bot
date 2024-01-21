"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isThemeMismatched = exports.getOppositeTheme = exports.checkLightTheme = exports.checkDarkTheme = void 0;
const checkDarkTheme = (theme) => theme.includes('dark');
exports.checkDarkTheme = checkDarkTheme;
const checkLightTheme = (theme) => theme.includes('light');
exports.checkLightTheme = checkLightTheme;
function getOppositeTheme(themeName) {
    if ((0, exports.checkDarkTheme)(themeName)) {
        return themeName.replace('dark', 'light');
    }
    if ((0, exports.checkLightTheme)(themeName)) {
        return themeName.replace('light', 'dark');
    }
    return themeName;
}
exports.getOppositeTheme = getOppositeTheme;
function isThemeMismatched(themeName, prefersDark) {
    const systemLightTheme = (0, exports.checkLightTheme)(themeName);
    const systemDarkTheme = (0, exports.checkDarkTheme)(themeName);
    return (prefersDark && systemLightTheme) || (!prefersDark && systemDarkTheme);
}
exports.isThemeMismatched = isThemeMismatched;
