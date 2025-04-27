import {globalSetting as setting}  from "./config/config";

type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal' | 'silent';

const levelOrder: Record<LogLevel, number> = {
    trace: 10,
    debug: 20,
    info: 30,
    warn: 40,
    error: 50,
    fatal: 60,
    silent: Infinity,
};

export function getLogger(prefix: string = "") {
    return new Logger(prefix, setting['LOGGER_LEVEL'] ?? "info")
}

class Logger {

    prefix?: string
    currentLevel: number

    constructor(prefix: string = "", level: string) {
        this.prefix = prefix
        this.currentLevel = levelOrder[level.toLowerCase()]
    }

    shouldLog(level: LogLevel) {
        return levelOrder[level] >= this.currentLevel;
    }

    private format(level: LogLevel, message: string) {
        const time = new Date().toISOString();
        return `[${time}] [${level.toUpperCase()}]${this.prefix ? ' [' + this.prefix + ']' : ''} ${message}`;
    }

    
    debug(msg: string) {
        if (this.shouldLog('debug')) console.error(this.format('debug', msg));
    }
    info(msg: string){
        if (this.shouldLog('info')) console.error(this.format('info', msg));
    }
    warn(msg: string){
        if (this.shouldLog('warn')) console.error(this.format('warn', msg));
    }
    error(msg: string){
        if (this.shouldLog('error')) console.error(this.format('error', msg));
    }
    fatal(msg: string){
        if (this.shouldLog('fatal')) console.error(this.format('fatal', msg));
    }
}

