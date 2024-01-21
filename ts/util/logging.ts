/* eslint-env node */

/* eslint strict: ['error', 'never'] */
/* eslint-disable no-console */

import _ from 'lodash';

import { redactAll } from './privacy';
import { console } from '../sessionjs-logger';

// Default Bunyan levels: https://github.com/trentm/node-bunyan#levels
// To make it easier to visually scan logs, we make all levels the same length
const BLANK_LEVEL = '     ';
const LEVELS: Record<number, string> = {
  60: 'fatal',
  50: 'error',
  40: 'warn ',
  30: 'info ',
  20: 'debug',
  10: 'trace',
};

// Backwards-compatible logging, simple strings and no level (defaulted to INFO)
function now() {
  const date = new Date();
  return date.toJSON();
}

// To avoid [Object object] in our log since console.log handles non-strings smoothly
function cleanArgsForIPC(args: any) {
  const str = args.map((item: any) => {
    if (typeof item !== 'string') {
      try {
        return JSON.stringify(item);
      } catch (error) {
        return item;
      }
    }

    return item;
  });

  return str.join(' ');
}

function log(...args: any) {
  logAtLevel('info', 'INFO ', ...args);
}

// The mechanics of preparing a log for publish

function getHeader() {
  let header = `[SBOT]:window.navigator.userAgent`;

  header += ` node/${process.version}`;
  header += ` env/[SBOT]`;

  return header;
}

function getLevel(level: number) {
  const text = LEVELS[level];
  if (!text) {
    return BLANK_LEVEL;
  }

  return text.toUpperCase();
}

type EntryType = {
  level: number;
  time: number;
  msg: string;
};

function formatLine(entry: EntryType) {
  return `${getLevel(entry.level)} ${entry.time} ${entry.msg}`;
}

function format(entries: Array<EntryType>) {
  return redactAll(entries.map(formatLine).join('\n'));
}

const development = true;

// A modern logging interface for the browser

// The Bunyan API: https://github.com/trentm/node-bunyan#log-method-api
function logAtLevel(level: string, prefix: string, ...args: any) {
  if (prefix === 'DEBUG') {
    return;
  }
  if (development) {
    const fn = `_${level}`;
    (console as any)[fn](prefix, now(), ...args);
  } else {
    (console as any)._log(prefix, now(), ...args);
  }

  const str = cleanArgsForIPC(args);
  const logText = redactAll(str);
}

// console = {
//   fatal: _.partial(logAtLevel, 'fatal', 'FATAL'),
//   error: _.partial(logAtLevel, 'error', 'ERROR'),
//   warn: _.partial(logAtLevel, 'warn', 'WARN '),
//   info: _.partial(logAtLevel, 'info', 'INFO '),
//   debug: _.partial(logAtLevel, 'debug', 'DEBUG'),
//   trace: _.partial(logAtLevel, 'trace', 'TRACE'),
// };

// const onerror = (_message, _script, _line, _col, error) => {
//   const errorInfo = JSON.stringify(error);

  // console.error(
//     `Top-level unhandled error: "${_message}";"${_script}";"${_line}";"${_col}" ${errorInfo}`,
//     error
//   );
// };

// window.addEventListener('unhandledrejection', rejectionEvent => {
//   const error = rejectionEvent.reason;
//   const errorInfo = error && error.stack ? error.stack : error;
//   console.error('Top-level unhandled promise rejection:', errorInfo);
// });
