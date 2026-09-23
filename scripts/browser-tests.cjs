const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const localBrowsers = path.join(root, '.browser-cache');
const env = { ...process.env };
if (!env.PLAYWRIGHT_BROWSERS_PATH && fs.existsSync(localBrowsers)) env.PLAYWRIGHT_BROWSERS_PATH = localBrowsers;
const tests = fs.readdirSync(path.join(root, 'tests/browser'))
  .filter(file => file.endsWith('.test.cjs')).map(file => path.join(root, 'tests/browser', file));
const result = spawnSync(process.execPath, ['--test', ...tests], { cwd: root, env, stdio: 'inherit' });
if (result.error) console.error(result.error.message);
process.exitCode = result.status ?? 1;
