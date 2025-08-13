#!/usr/bin/env node

const { unlinkLocalDependencies } = require('../lib/index.js');
const { log } = require('../utils/log.js');

// Parse command-line arguments
const args = process.argv.slice(2);

// Help flag (handled before anything else)
if (args.includes('--help') || args.includes('-h')) {
    const usage = `
Usage: resolve-local-dependencies [options]

Options:
  -h, --help         Show this help message
  --silent           Suppress non-error output
  --no-install       Skip npm install after unlinking
  --dev              Use development mode (include devDependencies)
`;
    // Always show help regardless of --silent
    log(usage.trim(), 'log', false);
    process.exit(0);
    return;
}

const silently = args.includes('--silent');
const install = args.includes('--no-install');
const dev = args.includes('--dev');

try {
    unlinkLocalDependencies({ silently, install, dev });
    log('Local dependencies unlinked successfully.', 'log', silently);
    process.exit(0);
} catch (error) {
    log(`Error unlinking local dependencies: ${error.message}`, 'error', silently);
    process.exit(1);
}
