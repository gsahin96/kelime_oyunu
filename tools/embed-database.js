const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const sourcePath = path.join(rootDir, 'database.json');
const targetPath = path.join(rootDir, 'public', 'js', 'database.js');

try {
    const raw = fs.readFileSync(sourcePath, 'utf8');
    fs.writeFileSync(targetPath, 'window.KELIME_DB = ' + raw + ';', 'utf8');
    console.log('Embedded database.json -> public/js/database.js (' + raw.length + ' bytes).');
} catch (error) {
    console.error('Failed to embed database.json', error);
    process.exit(1);
}

