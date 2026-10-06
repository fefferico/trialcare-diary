#!/usr/bin/env node
const fs = require('node:fs');

const url = process.env.SUPABASE_URL || 'https://upslsnpweosagvnkuzya.supabase.co';
const key = process.env.SUPABASE_PUBLISHABLE_KEY;

if (!key || key === 'YOUR_SUPABASE_PUBLISHABLE_KEY') {
  console.error('Missing SUPABASE_PUBLISHABLE_KEY. Add it as a GitHub Actions repository variable before deploying Pages.');
  process.exit(1);
}

const source = `export const environment = {\n  production: true,\n  supabaseUrl: ${JSON.stringify(url)},\n  supabasePublishableKey: ${JSON.stringify(key)},\n};\n`;
fs.writeFileSync('src/environments/environment.pages.ts', source, { mode: 0o600 });
console.log('Generated the Pages environment from repository variables.');
