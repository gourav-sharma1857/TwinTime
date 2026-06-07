import 'dotenv/config';
import { mkdir, copyFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(fileURLToPath(import.meta.url));
const sourceRoot = join(root, '..');
const buildDir = join(sourceRoot, 'build');

const envVars = {
  apiKey: process.env.FIREBASE_API_KEY,
  authDomain: process.env.FIREBASE_AUTH_DOMAIN,
  projectId: process.env.FIREBASE_PROJECT_ID,
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.FIREBASE_APP_ID
};

const missing = Object.entries(envVars)
  .filter(([, value]) => !value)
  .map(([key]) => key);

if (missing.length > 0) {
  throw new Error(
    `Missing Firebase environment variables: ${missing.join(', ')}.\n` +
    'Set these values in your local .env file or GitHub Actions secrets.'
  );
}

const firebaseConfigText = `// Auto-generated from environment variables.\n` +
`export const firebaseConfig = {\n` +
`  apiKey: '${envVars.apiKey}',\n` +
`  authDomain: '${envVars.authDomain}',\n` +
`  projectId: '${envVars.projectId}',\n` +
`  storageBucket: '${envVars.storageBucket}',\n` +
`  messagingSenderId: '${envVars.messagingSenderId}',\n` +
`  appId: '${envVars.appId}'\n` +
`};\n`;

await mkdir(buildDir, { recursive: true });
await writeFile(join(buildDir, 'firebase-config.js'), firebaseConfigText, 'utf8');

const filesToCopy = ['index.html', 'script.js', 'style.css'];
for (const file of filesToCopy) {
  await copyFile(join(sourceRoot, file), join(buildDir, file));
}

console.log('Build complete. build/ directory is ready.');
