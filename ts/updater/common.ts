export type MessagesType = {
  [key: string]: string;
};

type LogFunction = (...args: Array<any>) => void;

export type LoggerType = {
  fatal: LogFunction;
  error: LogFunction;
  warn: LogFunction;
  info: LogFunction;
  debug: LogFunction;
  trace: LogFunction;
};

export function getPrintableError(error: Error) {
  return error && error.stack ? error.stack : error;
}
