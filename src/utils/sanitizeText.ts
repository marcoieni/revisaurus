// eslint-disable-next-line no-control-regex -- Sanitizer intentionally matches ANSI escape sequences.
const ansiEscapePattern = /\u001B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g;
// eslint-disable-next-line no-control-regex -- Sanitizer intentionally strips unsafe control characters.
const controlCharacterPattern = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g;

export function stripControlCharacters(value: string): string {
    return value.replace(ansiEscapePattern, "").replace(controlCharacterPattern, "");
}
