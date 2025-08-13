// eslint.config.js
const globals = require('globals');
const pluginJs = require('@eslint/js');

module.exports = [
    {
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'commonjs',
            globals: {
                ...globals.node,
            },
        },
        rules: {
            indent: ['error', 4],
            quotes: ['error', 'single'],
            semi: ['error', 'always'],
        },
    },
    pluginJs.configs.recommended,
];
