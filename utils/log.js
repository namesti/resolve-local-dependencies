/**
 * Logs a message to the console if not silenced.
 * @param {string} message - The message to log.
 * @param {string} [level='log'] - The log level ('log', 'warn', 'error').
 * @param {boolean} [silently=false] - If true, suppresses console output.
 */
function log(message, level = 'log', silently) {
    if (!silently) {
        console[level](message);
    }
}

module.exports = { log };
