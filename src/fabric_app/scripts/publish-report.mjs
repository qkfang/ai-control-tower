// Publishes the generated PBIR report to a Fabric workspace via the Fabric REST API.
// Auth: uses the current `az` login to fetch a Fabric access token.
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const REPORT_DIR = [
  path.join(ROOT, 'powerbi', 'AI Control Tower.Report'),
  path.join(ROOT, '..', 'powerbi', 'AI Control Tower.Report'),
]
  .map((p) => path.resolve(p))
  .find((p) => fs.existsSync(p));
const WORKSPACE_ID = process.env.FABRIC_WORKSPACE_ID || '5662e90c-c128-4d18-a1b9-9fe24a816fbd';
const DISPLAY_NAME = process.env.FABRIC_REPORT_NAME || 'AI Control Tower';
const FABRIC_BASE = 'https://api.fabric.microsoft.com/v1';

function token() {
  const out = execSync(
    'az account get-access-token --resource https://api.fabric.microsoft.com --query accessToken -o tsv',
    { encoding: 'utf8' },
  );
  return out.trim();
}

function walk(dir, base) {
  const parts = [];
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) {
      parts.push(...walk(full, base));
    } else {
      const rel = path.relative(base, full).split(path.sep).join('/');
      const payload = fs.readFileSync(full).toString('base64');
      parts.push({ path: rel, payload, payloadType: 'InlineBase64' });
    }
  }
  return parts;
}

async function main() {
  if (!REPORT_DIR) {
    console.error('Could not locate "AI Control Tower.Report" folder.');
    process.exit(1);
  }
  const t = token();
  const auth = { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' };
  const parts = walk(REPORT_DIR, REPORT_DIR);
  console.log(`Packaged ${parts.length} definition parts from ${REPORT_DIR}`);

  // Find an existing report with the same name so we update in place instead of duplicating.
  const listRes = await fetch(`${FABRIC_BASE}/workspaces/${WORKSPACE_ID}/reports`, { headers: auth });
  const list = await listRes.json().catch(() => ({}));
  const existing = (list.value || []).find((r) => r.displayName === DISPLAY_NAME);

  let url;
  let body;
  if (existing) {
    console.log(`Updating existing report ${existing.id}`);
    url = `${FABRIC_BASE}/workspaces/${WORKSPACE_ID}/reports/${existing.id}/updateDefinition`;
    body = { definition: { parts } };
  } else {
    console.log('No existing report found; creating a new one.');
    url = `${FABRIC_BASE}/workspaces/${WORKSPACE_ID}/reports`;
    body = { displayName: DISPLAY_NAME, definition: { parts } };
  }

  const res = await fetch(url, { method: 'POST', headers: auth, body: JSON.stringify(body) });

  if (res.status === 202) {
    // Long-running operation: poll until done.
    const opUrl = res.headers.get('operation-location') || res.headers.get('location');
    console.log('Accepted (202). Polling operation:', opUrl);
    while (true) {
      await new Promise((r) => setTimeout(r, 3000));
      const p = await fetch(opUrl, { headers: auth });
      const j = await p.json().catch(() => ({}));
      const status = j.status || j.state;
      console.log('  status:', status);
      if (status === 'Succeeded') {
        console.log('Publish succeeded.');
        return;
      }
      if (status === 'Failed') {
        console.error('Operation failed:', JSON.stringify(j, null, 2));
        process.exit(1);
      }
    }
  }

  const text = await res.text();
  if (res.ok) {
    console.log(`Success (${res.status}).`);
    if (text) console.log(text);
  } else {
    console.error(`Failed (${res.status}):`);
    console.error(text);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
