if(Number(process.versions.node.split('.')[0])<22)throw new Error('Install Node.js 24 LTS before running this project.');
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
if (!existsSync('.env')) {
  writeFileSync('.env', readFileSync('.env.example', 'utf8').replace('replace_using_npm_run_setup', randomBytes(48).toString('hex')));
  console.log('Created .env with a random signing secret. Local launch initializes MongoDB automatically.');
} else console.log('.env already exists; preserved unchanged.');
