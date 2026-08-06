const fs = require('fs');
const path = require('path');

const baseDir = path.join('d:', 'eatsie-project', 'backend');
const results = [];

function search(dir) {
  try {
    const entries = fs.readdirSync(dir, { recursive: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry);
      try {
        const stat = fs.statSync(fullPath);
        if (stat.isFile() && (entry.endsWith('.js') || entry.endsWith('.ts'))) {
          const content = fs.readFileSync(fullPath, 'utf8');
          if (content.includes('model.define("personalization_template"') || 
              content.includes('PersonalizationTemplate')) {
            // Skip node_modules and hidden dirs
            const relPath = path.relative(baseDir, fullPath);
            if (!relPath.includes('node_modules') && !relPath.includes('.eatsie-')) {
              results.push(relPath);
            }
          }
        }
      } catch (e) {
        // skip
      }
    }
  } catch (e) {
    // skip
  }
}

search(baseDir);
console.log('Files containing PersonalizationTemplate or model.define("personalization_template"):');
results.forEach(r => console.log(r));