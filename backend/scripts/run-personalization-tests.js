const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const logFile = path.join(__dirname, '../test-output.log');
fs.writeFileSync(logFile, 'Starting personalization tests execution...\n');

try {
  // Execute medusa exec command and capture stdout/stderr
  const output = execSync('npx medusa exec ./src/modules/personalization/__tests__/personalization.tests.ts', {
    cwd: path.join(__dirname, '..'),
    encoding: 'utf8',
    stdio: 'pipe'
  });
  
  fs.appendFileSync(logFile, '\n--- TEST OUTPUT ---\n' + output + '\n--- SUCCESS ---\n');
  console.log('Tests ran successfully.');
} catch (error) {
  fs.appendFileSync(logFile, '\n--- TEST ERROR ---\n' + error.message + '\n' + (error.stdout || '') + '\n' + (error.stderr || '') + '\n');
  console.error('Tests failed:', error.message);
}
