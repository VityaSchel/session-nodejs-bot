"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.cleanSearchTerm = void 0;
function cleanSearchTerm(searchTerm) {
    const lowercase = searchTerm.toLowerCase();
    const withoutSpecialCharacters = lowercase.replace(/([!"#$%&'()*+,-./:;<=>?@[\]^_`{|}~])/g, ' ');
    const whiteSpaceNormalized = withoutSpecialCharacters.replace(/\s+/g, ' ');
    const byToken = whiteSpaceNormalized.split(' ');
    const withoutSpecialTokens = byToken.filter(token => token &&
        token !== 'and' &&
        token !== 'or' &&
        token !== 'not' &&
        token !== ')' &&
        token !== '(' &&
        token !== '+' &&
        token !== ',' &&
        token !== 'near');
    const withWildcards = withoutSpecialTokens.map(token => `${token}*`);
    return withWildcards.join(' ').trim();
}
exports.cleanSearchTerm = cleanSearchTerm;
