import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const rootDocsDir = path.resolve(__dirname, '../../../docs');
const publicDocsDir = path.resolve(__dirname, '../public/docs');

function copyRecursiveSync(src, dest) {
  const exists = fs.existsSync(src);
  const stats = exists && fs.statSync(src);
  const isDirectory = exists && stats.isDirectory();
  
  if (isDirectory) {
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }
    fs.readdirSync(src).forEach((childItemName) => {
      copyRecursiveSync(path.join(src, childItemName), path.join(dest, childItemName));
    });
  } else {
    fs.copyFileSync(src, dest);
  }
}

try {
  console.log('🔄 Syncing documentation from root /docs to /apps/web/public/docs...');
  if (!fs.existsSync(rootDocsDir)) {
    console.error('❌ Root docs directory not found at:', rootDocsDir);
    process.exit(1);
  }
  
  copyRecursiveSync(rootDocsDir, publicDocsDir);
  console.log('✅ Documentation sync complete!');
} catch (error) {
  console.error('❌ Sync failed:', error);
  process.exit(1);
}
