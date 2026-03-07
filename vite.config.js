import { defineConfig } from 'vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { copyFileSync, mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';

const rootDir = path.dirname(fileURLToPath(import.meta.url));

// Plugin to copy assets and manifest to dist
function chromeExtensionPlugin() {
    return {
        name: 'chrome-extension-plugin',
        writeBundle() {
            // 1. Copy dexie.min.js
            const dexieSrc = path.resolve(rootDir, 'src/assets/libs/dexie.min.js');
            const dexieDestDir = path.resolve(rootDir, 'dist/src/assets/libs');
            if (!existsSync(dexieDestDir)) {
                mkdirSync(dexieDestDir, { recursive: true });
            }
            if (existsSync(dexieSrc)) {
                copyFileSync(dexieSrc, path.resolve(dexieDestDir, 'dexie.min.js'));
                console.log('Copied dexie.min.js');
            }

            // 2. Copy and fix manifest.json
            const manifestPath = path.resolve(rootDir, 'manifest.json');
            const distManifestPath = path.resolve(rootDir, 'dist/manifest.json');
            
            if (existsSync(manifestPath)) {
                let manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
                
                // Fix paths for dist
                if (manifest.background && manifest.background.service_worker) {
                    manifest.background.service_worker = manifest.background.service_worker.replace('dist/', '');
                }
                if (manifest.options_ui && manifest.options_ui.page) {
                    manifest.options_ui.page = manifest.options_ui.page.replace('dist/', '');
                }
                if (manifest.action && manifest.action.default_popup) {
                    manifest.action.default_popup = manifest.action.default_popup.replace('dist/', '');
                }
                
                writeFileSync(distManifestPath, JSON.stringify(manifest, null, 4));
                console.log('Copied and fixed manifest.json to dist/');
            }

            // 3. Copy src files for content scripts
            const srcDir = path.resolve(rootDir, 'src');
            const distSrcDir = path.resolve(rootDir, 'dist/src');
            
            const copyRecursive = (src, dest) => {
                if (!existsSync(dest)) mkdirSync(dest, { recursive: true });
                const entries = require('fs').readdirSync(src, { withFileTypes: true });
                for (let entry of entries) {
                    const srcPath = path.join(src, entry.name);
                    const destPath = path.join(dest, entry.name);
                    if (entry.isDirectory()) {
                        copyRecursive(srcPath, destPath);
                    } else if (entry.isFile() && !destPath.endsWith('.html') && !destPath.includes('popup.js') && !destPath.includes('options.js')) {
                        copyFileSync(srcPath, destPath);
                    }
                }
            };
            
            if (existsSync(path.resolve(srcDir, 'content'))) {
                 ['algorithms', 'shared', 'content'].forEach(dir => {
                     const s = path.resolve(srcDir, dir);
                     const d = path.resolve(distSrcDir, dir);
                     if (existsSync(s)) copyRecursive(s, d);
                 });
                 console.log('Copied content script dependencies to dist/src/');
            }
        }
    };
}

export default defineConfig({
    base: '', // Use relative paths for assets
    build: {
        outDir: 'dist',
        emptyOutDir: true,
        rollupOptions: {
            input: {
                popup: path.resolve(rootDir, 'src/popup/popup.html'),
                options: path.resolve(rootDir, 'src/options/options.html'),
                drills: path.resolve(rootDir, 'src/drills/drills.html'),
                drill_overview: path.resolve(rootDir, 'src/drills/drill_overview.html'),
                background: path.resolve(rootDir, 'src/background/worker.js')
            },
            output: {
                entryFileNames: '[name].js',
                chunkFileNames: 'chunks/[name].js',
                assetFileNames: 'assets/[name][extname]'
            }
        }
    },
    plugins: [chromeExtensionPlugin()]
});
