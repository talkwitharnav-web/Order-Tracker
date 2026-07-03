// For now, we'll keep it simple and log to the console.
// This can be expanded later to use a more robust logging library like Winston or Pino.

const getTimestamp = (): string => new Date().toISOString();

export const logger = {
  info: (message: string, context: Record<string, any> = {}) => {
    console.log(JSON.stringify({
      level: 'INFO',
      timestamp: getTimestamp(),
      message,
      ...context,
    }, null, 2));
  },
  error: (message: string, error: any, context: Record<string, any> = {}) => {
    console.error(JSON.stringify({
      level: 'ERROR',
      timestamp: getTimestamp(),
      message,
      error: error instanceof Error ? { message: error.message, stack: error.stack } : error,
      ...context,
    }, null, 2));
  },
  warn: (message: string, context: Record<string, any> = {}) => {
    console.warn(JSON.stringify({
      level: 'WARN',
      timestamp: getTimestamp(),
      message,
      ...context,
    }, null, 2));
  }
};
