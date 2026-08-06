const fs = require('fs');
const path = require('path');

const dirsToClean = [
  'backend/.medusa',
  'backend/dist',
  'backend/build',
  'frontend/dist',
  'frontend/build'
];

for (const dir of dirsToClean) {
  const fullPath = path.join('d:', 'eatsie-project', dir);
  if (fs.existsSync(fullPath)) {
    fs.rmSync(fullPath, { recursive: true, force: true });
    console.log(`Cleaned: ${dir}`);
  }
}

console.log('Stale cache cleanup complete');