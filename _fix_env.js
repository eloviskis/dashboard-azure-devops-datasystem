const fs = require('fs');
const content = fs.readFileSync('/opt/fluxometria/backend/.env', 'utf8');
const lines = content.split('\n');
const seen = {};
const out = [];
for (const line of lines) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) { out.push(line); continue; }
  const key = trimmed.split('=')[0];
  if (!seen[key]) { seen[key] = true; out.push(line); }
}
fs.writeFileSync('/opt/fluxometria/backend/.env', out.join('\n'));
console.log('OK - env limpo');
