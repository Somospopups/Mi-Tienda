const fs = require('fs');
const p = 'index.html';
const before = fs.readFileSync(p, 'utf8');
const bad = ');<\\/script>\r\n  \r\n\r\n</body></html>"';
const good = ');<\\/script></body></html>"';
const n = before.split(bad).length - 1;
console.log('ocurrencias del patron corrupto:', n);
if (n !== 1) { console.log('ABORT: se esperaba exactamente 1'); process.exit(1); }
const after = before.replace(bad, good);
if (before.length - after.length !== 8) { console.log('ABORT: delta', before.length - after.length); process.exit(1); }
fs.writeFileSync(p, after, 'utf8');
console.log('jsPDF OK: bytes', before.length, '->', after.length);
