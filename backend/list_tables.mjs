import fs from 'fs';
const content = fs.readFileSync('.medusa/types/query-entry-points.d.ts', 'utf8');
const lines = content.split('\n');
console.log("Matching lines:");
console.log(lines.filter(l => l.includes('b2b') || l.includes('quote') || l.includes('Company')).slice(0, 100));







