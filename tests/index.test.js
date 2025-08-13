const { describe, it, beforeEach, afterEach, mock } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { unlinkLocalDependencies } = require('../lib/index');

const PROJECT_ROOT = '/fake/project';
const rel = p => p.startsWith(PROJECT_ROOT + '/') ? p.slice(PROJECT_ROOT.length + 1) : p;

describe('unlinkLocalDependencies', () => {
    let originalCwd;

    beforeEach(() => {
        originalCwd = process.cwd;
        process.cwd = () => PROJECT_ROOT;
        mock.method(require('../utils/log'), 'log', () => { });
    });

    afterEach(() => {
        process.cwd = originalCwd;
        mock.restoreAll();
    });

    /**
     * cfg = {
     *   packageJson,
     *   symlinkPackages: [],
     *   existingNodeModules: [],
     *   sourceTree: { absDir: ['fileA','subdir'] },
     *   sourceDirectories: Set([absDir, absDir/subdir]),
     *   expected: {
     *     removed: [],
     *     createdDirs: [],
     *     copiedFiles: [],
     *     npmInstalls: [{ pkg:'name', production:true|false }]
     *   },
     *   runOptions: { install, production }
     * }
     */
    function runUnlinkTest(cfg) {
        const {
            packageJson,
            symlinkPackages = [],
            existingNodeModules = [],
            sourceTree = {},
            sourceDirectories = new Set(),
            expected = {},
            runOptions = {}
        } = cfg;

        // Track created filesystem artifacts
        const existingPaths = new Set([
            path.join(PROJECT_ROOT, 'package.json'),
            ...existingNodeModules.map(n => path.join(PROJECT_ROOT, 'node_modules', n)),
            ...Object.keys(sourceTree),
            ...[...sourceDirectories]
        ]);

        // fs.readFileSync (only root package.json)
        const readFileSync = mock.method(fs, 'readFileSync', (p) => {
            assert.strictEqual(p, path.join(PROJECT_ROOT, 'package.json'), 'Unexpected file read');
            return JSON.stringify(packageJson);
        });

        // existsSync reflects evolving state
        mock.method(fs, 'existsSync', (p) => existingPaths.has(p));

        // lstatSync determines symlink status for node_modules entries
        mock.method(fs, 'lstatSync', (p) => ({
            isSymbolicLink: () => {
                const nm = path.join(PROJECT_ROOT, 'node_modules');
                if (p.startsWith(nm)) {
                    const name = p.slice(nm.length + 1).split(path.sep)[0];
                    return symlinkPackages.includes(name);
                }
                return false;
            }
        }));

        // readdirSync supplies directory listings for sources
        mock.method(fs, 'readdirSync', (p) => sourceTree[p] || []);

        // statSync identifies which source paths are directories
        mock.method(fs, 'statSync', (p) => ({
            isDirectory: () => sourceDirectories.has(p)
        }));

        const mkdirCalls = [];
        mock.method(fs, 'mkdirSync', (p) => {
            mkdirCalls.push(p);
            existingPaths.add(p);
        });

        const rmCalls = [];
        mock.method(fs, 'rmSync', (p) => {
            rmCalls.push(p);
            existingPaths.delete(p);
        });

        const copyCalls = [];
        mock.method(fs, 'copyFileSync', (src, dest) => {
            copyCalls.push({ src, dest });
            // Simulate that copied package.json now exists (for install step)
            if (dest.endsWith('package.json')) existingPaths.add(dest);
        });

        // Mock child_process.spawnSync for install steps
        const cp = require('child_process');
        const spawnCalls = [];
        mock.method(cp, 'spawnSync', (cmd, args, opts) => {
            spawnCalls.push({ cmd, args, cwd: opts.cwd });
            return { status: 0 };
        });

        // Act
        unlinkLocalDependencies({ silently: true, ...runOptions });

        // Assertions
        if (expected.removed) {
            const removedRel = rmCalls.map(rel);
            expected.removed.forEach(name => {
                const target = `node_modules/${name}`;
                assert.ok(removedRel.includes(target), `Expected removal of ${target}, got ${removedRel}`);
            });
            assert.strictEqual(removedRel.length, expected.removed.length,
                `Unexpected extra removals: ${removedRel}`);
        }

        if (expected.createdDirs) {
            const createdRel = mkdirCalls.map(rel);
            expected.createdDirs.forEach(d => {
                assert.ok(createdRel.includes(d), `Expected created dir ${d}, got ${createdRel}`);
            });
        }

        if (expected.copiedFiles) {
            const copiedRel = copyCalls.map(c => rel(c.dest));
            expected.copiedFiles.forEach(f => {
                assert.ok(copiedRel.includes(f), `Expected copied file ${f}, got ${copiedRel}`);
            });
        }

        if (expected.npmInstalls) {
            assert.strictEqual(spawnCalls.length, expected.npmInstalls.length,
                `Expected ${expected.npmInstalls.length} npm installs, got ${spawnCalls.length}`);
            expected.npmInstalls.forEach(expectInst => {
                const match = spawnCalls.find(c =>
                    c.cmd === 'npm' &&
                    c.cwd.endsWith(path.join('node_modules', expectInst.pkg))
                );
                assert.ok(match, `No npm install call for ${expectInst.pkg}`);
                const hasProd = match.args.includes('--production');
                assert.strictEqual(hasProd, !!expectInst.production,
                    `Production flag mismatch for ${expectInst.pkg}`);
            });
        } else {
            // When not expecting installs ensure none accidentally happened
            assert.strictEqual(spawnCalls.length, 0, `Unexpected npm installs: ${JSON.stringify(spawnCalls)}`);
        }

        assert.ok(readFileSync.mock.callCount() >= 1, 'package.json not read');
    }

    it('replaces two symlinked file dependencies (deps + devDeps)', () => {
        runUnlinkTest({
            packageJson: {
                dependencies: { 'local-pkg': 'file:../local-package' },
                devDependencies: { 'local-dev-pkg': 'file:./dev-package' }
            },
            symlinkPackages: ['local-pkg', 'local-dev-pkg'],
            existingNodeModules: ['local-pkg', 'local-dev-pkg'],
            expected: {
                removed: ['local-pkg', 'local-dev-pkg']
            }
        });
    });

    it('processes all dependency categories', () => {
        runUnlinkTest({
            packageJson: {
                dependencies: { dep1: 'file:../dep1' },
                devDependencies: { dep2: 'file:../dep2' },
                peerDependencies: { dep3: 'file:../dep3' },
                optionalDependencies: { dep4: 'file:../dep4' }
            },
            symlinkPackages: ['dep1', 'dep2', 'dep3', 'dep4'],
            existingNodeModules: ['dep1', 'dep2', 'dep3', 'dep4'],
            expected: { removed: ['dep1', 'dep2', 'dep3', 'dep4'] }
        });
    });

    it('skips non-file dependencies', () => {
        runUnlinkTest({
            packageJson: {
                dependencies: {
                    regular: '^1.0.0',
                    gitdep: 'git+https://github.com/x/y.git'
                }
            },
            expected: { removed: [] }
        });
    });

    it('skips when node_modules entry missing', () => {
        runUnlinkTest({
            packageJson: { dependencies: { 'local-pkg': 'file:../local-package' } },
            symlinkPackages: ['local-pkg'],
            existingNodeModules: [],
            expected: { removed: [] }
        });
    });

    it('skips when target is not a symlink', () => {
        runUnlinkTest({
            packageJson: { dependencies: { 'local-pkg': 'file:../local-package' } },
            existingNodeModules: ['local-pkg'],
            expected: { removed: [] }
        });
    });

    it('handles empty package.json', () => {
        runUnlinkTest({
            packageJson: {},
            expected: { removed: [] }
        });
    });

    it('handles recursive directory copying', () => {
        const SRC_ROOT = '/fake/local-package';
        const SRC_LIB = path.join(SRC_ROOT, 'lib');
        runUnlinkTest({
            packageJson: { dependencies: { 'local-pkg': 'file:../local-package' } },
            symlinkPackages: ['local-pkg'],
            existingNodeModules: ['local-pkg'],
            sourceTree: {
                [SRC_ROOT]: ['index.js', 'lib', 'package.json'],
                [SRC_LIB]: ['helper.js']
            },
            sourceDirectories: new Set([SRC_ROOT, SRC_LIB]),
            expected: {
                removed: ['local-pkg'],
                createdDirs: [
                    'node_modules/local-pkg',
                    'node_modules/local-pkg/lib'
                ],
                copiedFiles: [
                    'node_modules/local-pkg/index.js',
                    'node_modules/local-pkg/lib/helper.js',
                    'node_modules/local-pkg/package.json'
                ],
                npmInstalls: [{ pkg: 'local-pkg', production: true }]
            }
        });
    });

    // New tests for install / production flags

    it('runs npm install with --production by default', () => {
        const SRC_ROOT = '/fake/pkgA';
        runUnlinkTest({
            packageJson: { dependencies: { pkgA: 'file:../pkgA' } },
            symlinkPackages: ['pkgA'],
            existingNodeModules: ['pkgA'],
            sourceTree: { [SRC_ROOT]: ['package.json'] },
            sourceDirectories: new Set([SRC_ROOT]),
            expected: {
                removed: ['pkgA'],
                createdDirs: ['node_modules/pkgA'],
                copiedFiles: ['node_modules/pkgA/package.json'],
                npmInstalls: [{ pkg: 'pkgA', production: true }]
            }
        });
    });

    it('runs npm install without --production when dev:true', () => {
        const SRC_ROOT = '/fake/pkgB';
        runUnlinkTest({
            packageJson: { dependencies: { pkgB: 'file:../pkgB' } },
            symlinkPackages: ['pkgB'],
            existingNodeModules: ['pkgB'],
            sourceTree: { [SRC_ROOT]: ['package.json'] },
            sourceDirectories: new Set([SRC_ROOT]),
            runOptions: { dev: true },
            expected: {
                removed: ['pkgB'],
                createdDirs: ['node_modules/pkgB'],
                copiedFiles: ['node_modules/pkgB/package.json'],
                npmInstalls: [{ pkg: 'pkgB', production: false }]
            }
        });
    });

    it('does not run npm install when noInstall:true', () => {
        const SRC_ROOT = '/fake/pkgC';
        runUnlinkTest({
            packageJson: { dependencies: { pkgC: 'file:../pkgC' } },
            symlinkPackages: ['pkgC'],
            existingNodeModules: ['pkgC'],
            sourceTree: { [SRC_ROOT]: ['package.json'] },
            sourceDirectories: new Set([SRC_ROOT]),
            runOptions: { noInstall: true },
            expected: {
                removed: ['pkgC'],
                createdDirs: ['node_modules/pkgC'],
                copiedFiles: ['node_modules/pkgC/package.json']
                // No npmInstalls field => ensures none occurred
            }
        });
    });
});
