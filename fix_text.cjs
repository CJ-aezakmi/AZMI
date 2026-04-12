const fs = require('fs');
const file = 'src/lib/checklistData.ts';
let c = fs.readFileSync(file, 'utf8');

// Remove leading emojis + space from guide paragraph strings
// Match: single quote followed by emoji chars + space
c = c.replace(/'[\p{Extended_Pictographic}\uFE0F\u200D]+\s+/gu, (match, offset) => {
  // Safety check: only if followed by text (not a closing quote)
  const after = c[offset + match.length];
  if (after && after !== "'") return "'";
  return match;
});

// Replace em dashes with regular dashes
c = c.replace(/\u2014/g, '-');

fs.writeFileSync(file, c, 'utf8');
console.log('Done - emojis and em-dashes replaced');
