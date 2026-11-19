import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import { gzipSync } from 'node:zlib';

const [root, output] = process.argv.slice(2);
if (!root || !output) throw new Error('Provide a Vite output directory and a target module');
const types = {
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.html': 'text/html',
};
const assets = {};
for (const name of readdirSync(root, { recursive: true })) {
  const path = join(root, name);
  if (!statSync(path).isFile()) continue;
  const type = types[extname(path)];
  if (!type) throw new Error('Unsupported asset type: ' + name);
  assets['/' + name] = [type, gzipSync(readFileSync(path)).toString('base64')];
}
writeFileSync(output, 'export default ' + JSON.stringify(assets) + ';\n');
