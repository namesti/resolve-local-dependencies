const fs = require('fs');
const path = require('path');
const childProcess = require('child_process');
const { log } = require('../utils/log');

/**
 * Recursively copies files and directories from src to dest.
 * @param {string} src - Source directory path.
 * @param {string} dest - Destination directory path.
 */
function copyRecursiveSync(src, dest) {
    if (!fs.existsSync(dest)) {
        fs.mkdirSync(dest, { recursive: true });
    }

    fs.readdirSync(src).forEach(file => {
        const srcPath = path.join(src, file);
        const destPath = path.join(dest, file);
        const stat = fs.statSync(srcPath);

        if (stat.isDirectory()) {
            copyRecursiveSync(srcPath, destPath);
        } else {
            fs.copyFileSync(srcPath, destPath);
        }
    });
}

function installDependencies(dest, { dev = true, silent = false } = {}) {
    const pkgPath = path.join(dest, 'package.json');
    if (!fs.existsSync(pkgPath)) {
        log(`[SKIP] No package.json in ${dest}`, 'log', silent);
        return;
    }

    // Avoid reinstall if node_modules already exists
    const nmPath = path.join(dest, 'node_modules');
    if (fs.existsSync(nmPath)) {
        log(`[SKIP] Dependencies already present for ${path.basename(dest)}`, 'log', silent);
        return;
    }

    const args = ['install', '--no-audit', '--no-fund'];
    if (!dev) args.push('--production');

    log(`[INSTALL] Running npm ${args.join(' ')} in ${path.basename(dest)}`, 'log', silent);
    const result = childProcess.spawnSync('npm', args, {
        cwd: dest,
        stdio: silent ? 'ignore' : 'inherit',
        shell: process.platform === 'win32'
    });

    if (result.status !== 0) {
        log(`[ERROR] Failed to install dependencies for ${path.basename(dest)}`, 'error', silent);
    }
}

/**
 * Unlink local dependencies by replacing symlinks with actual copies.
 * @param {Object} options
 * @param {boolean} [options.silent=false] - Suppress console output.
 * @param {boolean} [options.noInstall=false] - If true, skip npm install for each copied dependency.
 * @param {boolean} [options.dev=false] - If true, install devDependencies for each copied dependency.
 * @returns {void}
 */
function unlinkLocalDependencies({ silent = false, noInstall = false, dev = false } = {}) {
    const projectRoot = process.cwd();
    const nodeModulesDir = path.join(projectRoot, 'node_modules');
    const pkgJsonPath = path.join(projectRoot, 'package.json');

    const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
    const allDeps = {
        ...(pkg.dependencies || {}),
        ...(pkg.devDependencies || {}),
        ...(pkg.peerDependencies || {}),
        ...(pkg.optionalDependencies || {}),
    };

    Object.entries(allDeps)
        .filter(([, version]) => typeof version === 'string' && version.startsWith('file:'))
        .forEach(([pkgName, version]) => {
            const relativePath = version.replace(/^file:/, '');
            const src = path.resolve(projectRoot, relativePath);
            const dest = path.join(nodeModulesDir, pkgName);

            if (!fs.existsSync(dest)) {
                log(`[WARN] ${pkgName} not found in node_modules`, 'warn', silent);
                return;
            }

            const isSymlink = fs.lstatSync(dest).isSymbolicLink();
            if (!isSymlink) {
                log(`[SKIP] ${pkgName} is not a symlink`, 'log', silent);
                return;
            }

            log(`[REPLACE] ${pkgName}: replacing symlink with copy from ${relativePath}`, 'log', silent);
            fs.rmSync(dest, { recursive: true, force: true });
            copyRecursiveSync(src, dest);

            if (!noInstall) {
                installDependencies(dest, { dev, silent });
            }
        });
}

module.exports = { unlinkLocalDependencies };
