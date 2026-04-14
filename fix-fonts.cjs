const fs = require('fs');
const path = './src/App.tsx';
let content = fs.readFileSync(path, 'utf8');
content = content.replace(/text-\[9px\]/g, 'text-xs');
content = content.replace(/text-\[10px\]/g, 'text-xs');
fs.writeFileSync(path, content);
console.log('Replaced all text-[9px] and text-[10px] with text-xs');
