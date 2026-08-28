const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

function loadEnvFile(file) {
  if (!fs.existsSync(file)) return;
  const content = fs.readFileSync(file, 'utf8');
  content.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const eq = trimmed.indexOf('=');
    if (eq > 0) {
      const key = trimmed.slice(0, eq).trim();
      let val = trimmed.slice(eq + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = val;
    }
  });
}

loadEnvFile('.env.local');
loadEnvFile('.env');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function testAuditLogs() {
  console.log('====================================================');
  console.log('STARTING AUDIT LOGS BULK SELECTION & DELETION TESTS');
  console.log('====================================================\n');

  // STEP 1: Register Organization Owner via API
  const orgDomain = `test-audit-${Date.now()}.com`;
  const email = `audit_owner_${Date.now()}@${orgDomain}`;
  const password = 'Password123!';

  console.log('1. Registering test organization owner...');
  const regRes = await fetch('http://localhost:3000/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email,
      password,
      name: 'Audit Owner',
      accountMode: 'organization',
      isNewOrganization: true,
      organizationDomain: orgDomain,
      publicKey: '-----BEGIN PGP PUBLIC KEY BLOCK-----\n...\n-----END PGP PUBLIC KEY BLOCK-----',
      encryptedPrivateKey: '-----BEGIN PGP PRIVATE KEY BLOCK-----\n...\n-----END PGP PRIVATE KEY BLOCK-----',
    })
  });
  const regData = await regRes.json();
  const orgId = regData.organizationId;

  // Verify org with verification code
  const { data: orgRow } = await supabase.from('organizations').select('data').eq('id', orgId).single();
  const code = orgRow.data.verificationCode;

  await fetch('http://localhost:3000/api/auth/verify-organization', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, code })
  });

  // Login
  const loginRes = await fetch('http://localhost:3000/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  const loginData = await loginRes.json();
  const token = loginData.session?.access_token || loginData.token;

  const authHeaders = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
    'Cookie': `access_token=${token}`,
    'x-app-mode': 'organization'
  };

  // STEP 2: Generate Audit Logs (create folders and groups)
  console.log('2. Creating actions to populate audit logs...');
  const fRes1 = await fetch('http://localhost:3000/api/folders', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ name: 'Finance Folder 1' })
  });
  const fRes2 = await fetch('http://localhost:3000/api/folders', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ name: 'Finance Folder 2' })
  });
  const gRes1 = await fetch('http://localhost:3000/api/groups', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ name: 'Audit Test Group', description: 'Testing' })
  });

  // STEP 3: Fetch audit logs
  console.log('3. Fetching audit logs from GET /api/admin/audit-logs...');
  const logsRes = await fetch('http://localhost:3000/api/admin/audit-logs', {
    method: 'GET',
    headers: authHeaders
  });
  const logs = await logsRes.json();
  console.log(`Retrieved ${logs.length} audit log entries.`);
  if (logs.length < 3) {
    throw new Error(`Expected at least 3 audit logs, found ${logs.length}`);
  }

  // TEST 1: Bulk Delete 2 selected log IDs
  console.log('\nTEST 1: Bulk Delete 2 selected audit logs');
  const targetIds = [logs[0].id, logs[1].id];
  const deleteRes1 = await fetch('http://localhost:3000/api/admin/audit-logs', {
    method: 'DELETE',
    headers: authHeaders,
    body: JSON.stringify({ ids: targetIds })
  });
  const delData1 = await deleteRes1.json();
  console.log('Delete response:', delData1);

  if (delData1.count !== 2 || !delData1.success) {
    throw new Error(`TEST 1 FAILED: Expected count=2 and success=true, got ${JSON.stringify(delData1)}`);
  }

  // Verify they are gone from GET
  const afterLogs1 = await (await fetch('http://localhost:3000/api/admin/audit-logs', { headers: authHeaders })).json();
  if (afterLogs1.some(l => targetIds.includes(l.id))) {
    throw new Error('TEST 1 FAILED: Deleted IDs still present in audit logs GET response!');
  }
  console.log('✅ TEST 1 PASSED: Selected audit logs deleted successfully from memory and database.\n');

  // TEST 2: Clear All remaining audit logs
  console.log('TEST 2: Clear All remaining audit logs (deleteAll: true)');
  const deleteRes2 = await fetch('http://localhost:3000/api/admin/audit-logs', {
    method: 'DELETE',
    headers: authHeaders,
    body: JSON.stringify({ deleteAll: true })
  });
  const delData2 = await deleteRes2.json();
  console.log('Clear All response:', delData2);

  const afterLogs2 = await (await fetch('http://localhost:3000/api/admin/audit-logs', { headers: authHeaders })).json();
  console.log('Remaining logs after clear all:', afterLogs2);

  if (afterLogs2.length !== 0) {
    throw new Error(`TEST 2 FAILED: Expected 0 logs after clear all, but got ${afterLogs2.length}`);
  }
  console.log('✅ TEST 2 PASSED: All audit logs cleared cleanly.\n');

  // CLEAN UP
  const fData1 = await fRes1.json();
  const fData2 = await fRes2.json();
  const gData1 = await gRes1.json();
  if (fData1?.id) await fetch(`http://localhost:3000/api/folders/${fData1.id}`, { method: 'DELETE', headers: authHeaders });
  if (fData2?.id) await fetch(`http://localhost:3000/api/folders/${fData2.id}`, { method: 'DELETE', headers: authHeaders });
  if (gData1?.id) await fetch(`http://localhost:3000/api/groups/${gData1.id}`, { method: 'DELETE', headers: authHeaders });

  await supabase.from('organizations').delete().eq('id', orgId);
  await supabase.from('users').delete().eq('id', regData.user?.id);
  if (regData.authUser?.id) await supabase.auth.admin.deleteUser(regData.authUser.id);
  console.log('Cleaned up test fixtures.');

  console.log('====================================================');
  console.log('ALL AUDIT LOG SELECTION & DELETION TESTS PASSED 100%');
  console.log('====================================================');
  process.exit(0);
}

testAuditLogs().catch(err => {
  console.error('❌ Audit logs test failed:', err);
  process.exit(1);
});
