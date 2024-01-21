"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchLinkPreviewImage = exports.fetchLinkPreviewMetadata = void 0;
const MIME_1 = require("../types/MIME");
const sessionjs_logger_1 = require("../sessionjs-logger");
const MAX_REQUEST_COUNT_WITH_REDIRECTS = 20;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const MAX_CONTENT_TYPE_LENGTH_TO_PARSE = 100;
const MAX_HTML_BYTES_TO_LOAD = 500 * 1024;
const MIN_HTML_CONTENT_LENGTH = 8;
const MIN_IMAGE_CONTENT_LENGTH = 8;
const MAX_IMAGE_CONTENT_LENGTH = 1024 * 1024;
const VALID_IMAGE_MIME_TYPES = new Set([
    MIME_1.IMAGE_GIF,
    MIME_1.IMAGE_ICO,
    MIME_1.IMAGE_JPEG,
    MIME_1.IMAGE_PNG,
    MIME_1.IMAGE_WEBP,
]);
const MIN_DATE = 0;
const MAX_DATE = new Date(3000, 0, 1).valueOf();
const emptyContentType = { type: null, charset: null };
async function fetchWithRedirects(fetchFn, href, options) {
    const urlsSeen = new Set();
    let nextHrefToLoad = href;
    for (let i = 0; i < MAX_REQUEST_COUNT_WITH_REDIRECTS; i += 1) {
        if (urlsSeen.has(nextHrefToLoad)) {
            sessionjs_logger_1.console.warn('fetchWithRedirects: found a redirect loop');
            throw new Error('redirect loop');
        }
        urlsSeen.add(nextHrefToLoad);
        const response = await fetchFn(nextHrefToLoad, {
            ...options,
            redirect: 'manual',
        });
        if (!REDIRECT_STATUSES.has(response.status)) {
            return response;
        }
        const location = response.headers.get('location');
        if (!location) {
            sessionjs_logger_1.console.warn('fetchWithRedirects: got a redirect status code but no Location header; bailing');
            throw new Error('no location with redirect');
        }
        const newUrl = maybeParseUrl(location, nextHrefToLoad);
        if (newUrl?.protocol !== 'https:') {
            sessionjs_logger_1.console.warn('fetchWithRedirects: got a redirect status code and an invalid Location header');
            throw new Error('invalid location');
        }
        nextHrefToLoad = newUrl.href;
    }
    sessionjs_logger_1.console.warn('fetchWithRedirects: too many redirects');
    throw new Error('too many redirects');
}
function maybeParseUrl(href, base) {
    let result;
    try {
        result = new URL(href, base);
    }
    catch (err) {
        return null;
    }
    result.hash = '';
    return result;
}
const parseContentType = (headerValue) => {
    if (!headerValue || headerValue.length > MAX_CONTENT_TYPE_LENGTH_TO_PARSE) {
        return emptyContentType;
    }
    const [rawType, ...rawParameters] = headerValue
        .toLowerCase()
        .split(/;/g)
        .map(part => part.trim())
        .filter(Boolean);
    if (!rawType) {
        return emptyContentType;
    }
    let charset = null;
    for (let i = 0; i < rawParameters.length; i += 1) {
        const rawParameter = rawParameters[i];
        const parsed = new URLSearchParams(rawParameter);
        const parsedCharset = parsed.get('charset')?.trim();
        if (parsedCharset) {
            charset = parsedCharset;
            break;
        }
    }
    return {
        type: rawType,
        charset,
    };
};
const isInlineContentDisposition = (headerValue) => !headerValue || headerValue.split(';', 1)[0] === 'inline';
const parseContentLength = (headerValue) => {
    if (typeof headerValue !== 'string' || !/^\d{1,10}$/g.test(headerValue)) {
        return Infinity;
    }
    const result = parseInt(headerValue, 10);
    return Number.isNaN(result) ? Infinity : result;
};
const emptyHtmlDocument = () => new DOMParser().parseFromString('', 'text/html');
const parseHtmlBytes = (bytes, httpCharset) => {
    const hasBom = bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;
    let isSureOfCharset;
    let decoder;
    if (hasBom) {
        decoder = new TextDecoder();
        isSureOfCharset = true;
    }
    else if (httpCharset) {
        try {
            decoder = new TextDecoder(httpCharset);
            isSureOfCharset = true;
        }
        catch (err) {
            decoder = new TextDecoder();
            isSureOfCharset = false;
        }
    }
    else {
        decoder = new TextDecoder();
        isSureOfCharset = false;
    }
    let decoded;
    try {
        decoded = decoder.decode(bytes);
    }
    catch (err) {
        decoded = '';
    }
    let document;
    try {
        document = new DOMParser().parseFromString(decoded, 'text/html');
    }
    catch (err) {
        document = emptyHtmlDocument();
    }
    if (!isSureOfCharset) {
        const httpEquiv = document
            .querySelector('meta[http-equiv="content-type"]')
            ?.getAttribute('content');
        if (httpEquiv) {
            const httpEquivCharset = parseContentType(httpEquiv).charset;
            if (httpEquivCharset) {
                return parseHtmlBytes(bytes, httpEquivCharset);
            }
        }
        const metaCharset = document.querySelector('meta[charset]')?.getAttribute('charset');
        if (metaCharset) {
            return parseHtmlBytes(bytes, metaCharset);
        }
    }
    return document;
};
const getHtmlDocument = async (body, contentLength, httpCharset, abortSignal) => {
    let result = emptyHtmlDocument();
    const maxHtmlBytesToLoad = Math.min(contentLength, MAX_HTML_BYTES_TO_LOAD);
    const buffer = new Uint8Array(new ArrayBuffer(maxHtmlBytesToLoad));
    let bytesLoadedSoFar = 0;
    try {
        for await (let chunk of body) {
            if (abortSignal.aborted) {
                break;
            }
            if (typeof chunk === 'string') {
                if (httpCharset !== null && httpCharset !== undefined && Buffer.isEncoding(httpCharset)) {
                    chunk = Buffer.from(chunk, httpCharset);
                }
                else {
                    chunk = Buffer.from(chunk, 'utf8');
                }
            }
            const truncatedChunk = chunk.slice(0, maxHtmlBytesToLoad - bytesLoadedSoFar);
            buffer.set(truncatedChunk, bytesLoadedSoFar);
            bytesLoadedSoFar += truncatedChunk.byteLength;
            result = parseHtmlBytes(buffer.slice(0, bytesLoadedSoFar), httpCharset);
            const hasLoadedMaxBytes = bytesLoadedSoFar >= maxHtmlBytesToLoad;
            if (hasLoadedMaxBytes) {
                break;
            }
        }
    }
    catch (err) {
        sessionjs_logger_1.console.warn('getHtmlDocument: error when reading body; continuing with what we got');
    }
    return result;
};
const getOpenGraphContent = (document, properties) => {
    for (let i = 0; i < properties.length; i += 1) {
        const property = properties[i];
        const content = document
            .querySelector(`meta[property="${property}"]`)
            ?.getAttribute('content')
            ?.trim();
        if (content) {
            return content;
        }
    }
    return null;
};
const getLinkHrefAttribute = (document, rels) => {
    for (let i = 0; i < rels.length; i += 1) {
        const rel = rels[i];
        const href = document
            .querySelector(`link[rel="${rel}"]`)
            ?.getAttribute('href')
            ?.trim();
        if (href) {
            return href;
        }
    }
    return null;
};
const parseMetadata = (document, href) => {
    const title = getOpenGraphContent(document, ['og:title']) || document.title.trim();
    if (!title) {
        sessionjs_logger_1.console.warn("parseMetadata: HTML document doesn't have a title; bailing");
        return null;
    }
    const rawImageHref = getOpenGraphContent(document, ['og:image', 'og:image:url']) ||
        getLinkHrefAttribute(document, ['shortcut icon', 'icon', 'apple-touch-icon']);
    const imageUrl = rawImageHref ? maybeParseUrl(rawImageHref, href) : null;
    const imageHref = imageUrl ? imageUrl.href : null;
    let date = null;
    const rawDate = getOpenGraphContent(document, [
        'og:published_time',
        'article:published_time',
        'og:modified_time',
        'article:modified_time',
    ]);
    if (rawDate) {
        const parsed = Date.parse(rawDate);
        if (parsed > MIN_DATE && parsed < MAX_DATE) {
            date = parsed;
        }
    }
    return {
        title,
        imageHref,
        date,
    };
};
async function fetchLinkPreviewMetadata(fetchFn, href, abortSignal) {
    let response;
    try {
        response = await fetchWithRedirects(fetchFn, href, {
            headers: {
                Accept: 'text/html,application/xhtml+xml',
                'User-Agent': 'WhatsApp',
            },
            signal: abortSignal,
        });
    }
    catch (err) {
        sessionjs_logger_1.console.warn('fetchLinkPreviewMetadata: failed to fetch link preview HTML; bailing');
        return null;
    }
    if (!response.ok) {
        sessionjs_logger_1.console.warn(`fetchLinkPreviewMetadata: got a ${response.status} status code; bailing`);
        return null;
    }
    if (!response.body) {
        sessionjs_logger_1.console.warn('fetchLinkPreviewMetadata: no response body; bailing');
        return null;
    }
    if (!isInlineContentDisposition(response.headers.get('Content-Disposition'))) {
        sessionjs_logger_1.console.warn('fetchLinkPreviewMetadata: Content-Disposition header is not inline; bailing');
        return null;
    }
    if (abortSignal.aborted) {
        return null;
    }
    const contentLength = parseContentLength(response.headers.get('Content-Length'));
    if (contentLength < MIN_HTML_CONTENT_LENGTH) {
        sessionjs_logger_1.console.warn('fetchLinkPreviewMetadata: Content-Length is too short; bailing');
        return null;
    }
    const contentType = parseContentType(response.headers.get('Content-Type'));
    if (contentType.type !== 'text/html') {
        sessionjs_logger_1.console.warn('fetchLinkPreviewMetadata: Content-Type is not HTML; bailing');
        return null;
    }
    const document = await getHtmlDocument(response.body, contentLength, contentType.charset, abortSignal);
    try {
        response.body.destroy();
    }
    catch (err) {
    }
    if (abortSignal.aborted) {
        return null;
    }
    return parseMetadata(document, response.url);
}
exports.fetchLinkPreviewMetadata = fetchLinkPreviewMetadata;
async function fetchLinkPreviewImage(fetchFn, href, abortSignal) {
    let response;
    try {
        response = await fetchWithRedirects(fetchFn, href, {
            headers: {
                'User-Agent': 'WhatsApp',
            },
            size: MAX_IMAGE_CONTENT_LENGTH,
            signal: abortSignal,
        });
    }
    catch (err) {
        sessionjs_logger_1.console.warn('fetchLinkPreviewImage: failed to fetch image; bailing');
        return null;
    }
    if (abortSignal.aborted) {
        return null;
    }
    if (!response.ok) {
        sessionjs_logger_1.console.warn(`fetchLinkPreviewImage: got a ${response.status} status code; bailing`);
        return null;
    }
    const contentLength = parseContentLength(response.headers.get('Content-Length'));
    if (contentLength < MIN_IMAGE_CONTENT_LENGTH) {
        sessionjs_logger_1.console.warn('fetchLinkPreviewImage: Content-Length is too short; bailing');
        return null;
    }
    if (contentLength > MAX_IMAGE_CONTENT_LENGTH) {
        sessionjs_logger_1.console.warn('fetchLinkPreviewImage: Content-Length is too large or is unset; bailing');
        return null;
    }
    const { type: contentType } = parseContentType(response.headers.get('Content-Type'));
    if (!contentType || !VALID_IMAGE_MIME_TYPES.has(contentType)) {
        sessionjs_logger_1.console.warn('fetchLinkPreviewImage: Content-Type is not an image; bailing');
        return null;
    }
    let data;
    try {
        data = await response.arrayBuffer();
    }
    catch (err) {
        sessionjs_logger_1.console.warn('fetchLinkPreviewImage: failed to read body; bailing');
        return null;
    }
    return { data, contentType };
}
exports.fetchLinkPreviewImage = fetchLinkPreviewImage;
