const fs = require('fs');
const vm = require('vm');

const html = fs.readFileSync('index.html', 'utf8');
const scriptTag = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi;
let count = 0;
let match;

while ((match = scriptTag.exec(html)) !== null) {
  const attributes = match[1] || '';
  const code = match[2] || '';
  if (/\bsrc\s*=/.test(attributes) || !code.trim()) continue;
  const typeMatch = attributes.match(/\btype\s*=\s*["']?([^\s"'>]+)/i);
  const type = typeMatch ? typeMatch[1].toLowerCase() : '';
  if (type && !['text/javascript', 'application/javascript', 'module'].includes(type)) continue;
  count += 1;
  try {
    new vm.Script(code, { filename: `index.html:inline-script-${count}` });
  } catch (error) {
    const detail = String(error && error.message || 'syntax error').split('\n')[0];
    console.error(`Syntax error in inline script ${count}: ${detail}`);
    process.exitCode = 1;
  }
}

if (!process.exitCode) console.log(`${count} inline JavaScript blocks passed syntax validation.`);
