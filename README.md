# resolve-local-dependencies

A simple CLI tool to help install local dependencies from the filesystem. It is particularly useful for monorepos or development workflows where some project setups cannot resolve symlinked local dependencies.

When you use `npm install` with a local path (e.g., `file:../my-package`), npm creates a symbolic link in `node_modules`. This can cause module resolution errors in certain environments. This tool addresses the issue by replacing these symlinks with a physical copy of the dependency's directory, making it behave like a regular npm package.

It is designed to be run in a `postinstall` script to automate the process. The package also provides an export so this functionality can be imported and used programmatically.

## Features
- Helps installing dependencies directly from local paths
- Minimal dependencies (zero runtime deps)
- Includes CLI usage

## Installation

```sh
npm i resolve-local-dependencies
```

## Usage

### As a `postinstall` script

To automatically install local dependencies after every `npm install`, add the following to your `package.json`:

```json
"scripts": {
    "postinstall": "resolve-local-dependencies"
}
```

Now, when you run `npm install`, the script will automatically execute, replacing any symlinked local dependencies with a physical copy.

```sh
npm install
```

### CLI

Run directly from the command line:

```sh
npx resolve-local-dependencies
```

### Flags

Default behavior: replace each symlinked local dependency with a physical copy, then run a production-only install (prunes devDependencies) inside each copied dependency.

Examples:

#### Default

```sh
resolve-local-dependencies
```
- Copy over each linked local dependency
- Run `npm install --production` (or equivalent) inside each copied dependency

#### Install with devDependencies (`--dev`)

```sh
resolve-local-dependencies --dev
```
- Copy dependencies
- Run full `npm install` including devDependencies in each copied dependency

#### Skip installation (`--no-install`)

```sh
resolve-local-dependencies --no-install
```
- Only replace symlinks with directory copies
- Skip any install step inside the copied dependencies

#### Suppress output (`--silent`)

```sh
resolve-local-dependencies --silent
```
- Suppress normal console output

#### Show help (`-h`, `--help`)

```sh
resolve-local-dependencies -h
resolve-local-dependencies --help
```
- Show help / list of flags and exit

Flags summary:
- `--dev`: install all dependencies (not just production)
- `--no-install`: skip running install in copied dependencies
- `--silent`: suppress standard logs
- `-h`, `--help`: display help and exit

You can combine flags where meaningful, e.g.:
```sh
resolve-local-dependencies --dev --silent
```

## Development

This package uses:
* Node.js Test Runner for testing
* c8 for code coverage
* ESLint for linting

## Project Structure

```
/bin/cli.js        # CLI entry point
/lib/index.js      # Main logic
/tests/index.js    # Tests
/utils             # Internal helpers
```

## Scripts

* Run tests
```sh
npm test
```

* Run tests with coverage
```sh
npm run test:cov
```

* Lint the code
```sh
npm run lint
```

## License

MIT License
