/**
 * Minimal Jest transform for the popup's ES-module files (src/popup/*.js),
 * so CommonJS tests can require them without adding Babel config:
 *   import { a, b } from './x.js'  →  const { a, b } = require('./x.js')
 *   import './x.js'                →  require('./x.js')
 *   export function f(...)         →  function f(...) + module.exports.f = f
 */
module.exports = {
    process(source) {
        const exported = [];
        let code = source
            .replace(/^import\s*\{([^}]+)\}\s*from\s*(['"][^'"]+['"]);?/gm, 'const {$1} = require($2);')
            .replace(/^import\s+(['"][^'"]+['"]);?/gm, 'require($1);')
            .replace(/^export function\s+([A-Za-z0-9_$]+)/gm, (m, name) => {
                exported.push(name);
                return `function ${name}`;
            });
        if (exported.length) {
            code += `\nif (typeof module !== 'undefined') { module.exports = Object.assign(module.exports || {}, { ${exported.join(', ')} }); }\n`;
        }
        return { code };
    }
};
