const { execSync } = require('child_process');
const vm = require('vm');

function block4(rev) {
  const buf = execSync('git show ' + rev + ':index.html', { maxBuffer: 1e9, encoding: 'buffer' });
  const html = buf.toString('utf8');
  const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
  const out = [];
  let m;
  while ((m = re.exec(html)) !== null) out.push(m[1]);
  return out[3];
}

const good = block4('f8d8dff'); // my v76
const bad = block4('origin/main'); // v77

console.log('good len', good.length, 'bad len', bad.length);
console.log('bad parse:', (() => { try { new vm.Script(bad); return 'OK'; } catch (e) { return e.message.slice(0, 40); } })());

// first difference
let i = 0;
const min = Math.min(good.length, bad.length);
while (i < min && good[i] === bad[i]) i++;
console.log('first diff at', i);
console.log('good:', JSON.stringify(good.slice(i - 90, i + 60)));
console.log('bad :', JSON.stringify(bad.slice(i - 90, i + 60)));
