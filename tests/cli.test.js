const { describe, it, beforeEach, afterEach, mock } = require('node:test');
const assert = require('node:assert');
const path = require('path');

describe('cli', () => {
    let originalArgv;
    let lib;
    let logUtil;

    function loadFreshCli() {
        const cliPath = path.resolve(__dirname, '../bin/cli.js');
        delete require.cache[cliPath];
        require(cliPath);
    }

    function runCliWithArgs(args) {
        process.argv = ['node', 'cli', ...args];
        loadFreshCli();
    }

    beforeEach(() => {
        originalArgv = process.argv;
        lib = require('../lib/index');
        logUtil = require('../utils/log');

        mock.method(lib, 'unlinkLocalDependencies');
        mock.method(logUtil, 'log', () => {});
        mock.method(process, 'exit', () => {}); // prevent actual exit
    });

    afterEach(() => {
        process.argv = originalArgv;
        mock.restoreAll();
        const cliPath = path.resolve(__dirname, '../bin/cli.js');
        delete require.cache[cliPath];
    });

    function assertUsageLogged() {
        const msgs = logUtil.log.mock.calls.map(c => c.arguments[0]);
        const usageCall = msgs.find(m => m.startsWith('Usage: resolve-local-dependencies'));
        assert.ok(usageCall, 'usage text missing');
        assert.ok(usageCall.includes('--silent'), 'silent flag missing');
        assert.ok(usageCall.includes('--no-install'), 'no-install flag missing');
        assert.ok(usageCall.includes('--dev'), 'dev flag missing');
    }

    it('invokes unlinkLocalDependencies (no flags)', () => {
        runCliWithArgs([]);

        assert.strictEqual(lib.unlinkLocalDependencies.mock.callCount(), 1, 'unlink not called');
        const arg = lib.unlinkLocalDependencies.mock.calls[0].arguments[0];
        // Defaults: silently=false, install=false, dev=false
        assert.deepStrictEqual(arg, { silently: false, install: false, dev: false });

        assert.strictEqual(process.exit.mock.callCount(), 1, 'exit not called');
        assert.strictEqual(process.exit.mock.calls[0].arguments[0], 0, 'exit code not 0');

        const msgs = logUtil.log.mock.calls.map(c => c.arguments[0]);
        assert.ok(msgs.includes('Local dependencies unlinked successfully.'), 'success message missing');
    });

    it('passes silently true with --silent', () => {
        runCliWithArgs(['--silent']);

        assert.strictEqual(lib.unlinkLocalDependencies.mock.callCount(), 1);
        assert.deepStrictEqual(
            lib.unlinkLocalDependencies.mock.calls[0].arguments[0],
            { silently: true, install: false, dev: false }
        );
        assert.strictEqual(process.exit.mock.calls[0].arguments[0], 0);
    });

    it('sets no install flag true with --no-install', () => {
        runCliWithArgs(['--no-install']);

        assert.strictEqual(lib.unlinkLocalDependencies.mock.callCount(), 1);
        assert.deepStrictEqual(
            lib.unlinkLocalDependencies.mock.calls[0].arguments[0],
            { silently: false, install: true, dev: false }
        );
    });

    it('sets dev flag true with --dev', () => {
        runCliWithArgs(['--dev']);

        assert.strictEqual(lib.unlinkLocalDependencies.mock.callCount(), 1);
        assert.deepStrictEqual(
            lib.unlinkLocalDependencies.mock.calls[0].arguments[0],
            { silently: false, install: false, dev: true }
        );
    });

    it('combines multiple flags', () => {
        runCliWithArgs(['--silent', '--no-install', '--dev']);

        assert.strictEqual(lib.unlinkLocalDependencies.mock.callCount(), 1);
        assert.deepStrictEqual(
            lib.unlinkLocalDependencies.mock.calls[0].arguments[0],
            { silently: true, install: true, dev: true }
        );
    });

    it('handles error path and exits with code 1', () => {
        lib.unlinkLocalDependencies.mock.mockImplementation(() => {
            throw new Error('Test error');
        });

        runCliWithArgs([]);

        assert.strictEqual(process.exit.mock.callCount(), 1);
        assert.strictEqual(process.exit.mock.calls[0].arguments[0], 1, 'exit code not 1');

        const logArgs = logUtil.log.mock.calls.map(c => c.arguments[0]);
        assert.ok(logArgs.includes('Error unlinking local dependencies: Test error'));
    });

    it('prints usage and exits 0 with --help', () => {
        runCliWithArgs(['--help']);

        assert.strictEqual(lib.unlinkLocalDependencies.mock.callCount(), 0, 'unlink should not run');
        assertUsageLogged();
        assert.strictEqual(process.exit.mock.callCount(), 1, 'exit not called');
        assert.strictEqual(process.exit.mock.calls[0].arguments[0], 0, 'exit code not 0');
    });

    it('prints usage and exits 0 with -h', () => {
        runCliWithArgs(['-h']);

        assert.strictEqual(lib.unlinkLocalDependencies.mock.callCount(), 0);
        assertUsageLogged();
        assert.strictEqual(process.exit.mock.callCount(), 1);
        assert.strictEqual(process.exit.mock.calls[0].arguments[0], 0);
    });

    it('prints usage even when combined with --silent', () => {
        runCliWithArgs(['--help', '--silent']);

        assert.strictEqual(lib.unlinkLocalDependencies.mock.callCount(), 0);
        assertUsageLogged();
        // usage logged with silently forced false
        const firstCall = logUtil.log.mock.calls[0].arguments;
        assert.strictEqual(firstCall[2], false, 'usage should ignore silent flag');
        assert.strictEqual(process.exit.mock.callCount(), 1);
        assert.strictEqual(process.exit.mock.calls[0].arguments[0], 0);
    });
});
