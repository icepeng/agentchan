export interface Logger {
  info(line: string): void;
  warn(line: string): void;
  error(line: string): void;
}

export function consoleLogger(): Logger {
  return {
    info: (line) => console.log(line),
    warn: (line) => console.warn(line),
    error: (line) => console.error(line),
  };
}
