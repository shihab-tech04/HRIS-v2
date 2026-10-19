import assert from 'node:assert/strict';

const moduleKeys = ['expenses', 'learning', 'travel'];
const buckets = ['expense-receipts', 'learning-completion-evidence', 'phase03-unrelated'];
const payload = text => new Blob([text], { type: 'text/plain' });

export async function runPhase03OptionalModuleAuthAcceptance({ admin, superAdmin, ordinary, tenantId, check }) {
  let modules;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    modules = await superAdmin.client.rpc('platform_hris_list_tenant_modules', { p_tenant_id: tenantId });
    if (!modules.error || modules.error.code !== 'PGRST202') break;
    await new Promise(resolve => setTimeout(resolve, Math.min(250 + attempt * 150, 1000)));
  }
  assert.ifError(modules.error);
  assert.deepEqual(modules.data.map(row => row.module_key), moduleKeys);
  assert.ok(modules.data.every(row => row.enabled === true), 'New tenant modules must default to enabled.');
  check(true, 'Real authenticated RPC returns all optional modules enabled by default');

  const nonAdminList = await ordinary.client.rpc('platform_hris_list_tenant_modules', { p_tenant_id: tenantId });
  check(Boolean(nonAdminList.error && nonAdminList.error.code === '42501'),
    'Ordinary authenticated user cannot read platform module controls');
  const directSettings = await superAdmin.client.from('tenant_module_settings')
    .select('tenant_id,module_key,enabled').eq('tenant_id', tenantId);
  check(Boolean(directSettings.error), 'Authenticated Data API cannot read protected module settings');

  const history = await admin.from('travel_requests').select('id')
    .eq('tenant_id', tenantId).eq('note', 'phase03-auth-historical-travel').single();
  assert.ifError(history.error);
  const newTravel = await superAdmin.client.from('travel_requests')
    .insert({ tenant_id: tenantId, note: 'phase03-auth-pre-disable-travel' }).select('id').single();
  assert.ifError(newTravel.error);
  check(Boolean(newTravel.data.id), 'Authenticated PostgREST can create a travel row while the module is enabled');

  const claim = await admin.from('expense_claims')
    .insert({ tenant_id: tenantId, note: 'phase03-auth-historical-receipt' }).select('id').single();
  assert.ifError(claim.error);
  const enrollment = await admin.from('learning_enrollments')
    .insert({ tenant_id: tenantId, note: 'phase03-auth-historical-evidence' }).select('id').single();
  assert.ifError(enrollment.error);

  for (const bucket of buckets) {
    const created = await admin.storage.createBucket(bucket, { public: false });
    assert.ifError(created.error);
  }
  const receiptPath = superAdmin.id + '/' + claim.data.id + '/receipt.txt';
  const evidencePath = superAdmin.id + '/' + tenantId + '/' + enrollment.data.id + '/completion.txt';
  const receiptStorage = superAdmin.client.storage.from('expense-receipts');
  const learningStorage = superAdmin.client.storage.from('learning-completion-evidence');
  const unrelatedStorage = superAdmin.client.storage.from('phase03-unrelated');
  const receiptUpload = await receiptStorage.upload(receiptPath, payload('authorized historical receipt'));
  assert.ifError(receiptUpload.error);
  const evidenceUpload = await learningStorage.upload(evidencePath, payload('authorized historical evidence'));
  assert.ifError(evidenceUpload.error);
  check(true, 'Real GoTrue bearer sessions can upload allowed receipt and learning evidence');

  async function setModule(moduleKey, enabled) {
    const result = await superAdmin.client.rpc('platform_hris_set_tenant_module', {
      p_tenant_id: tenantId, p_module_key: moduleKey, p_enabled: enabled,
    });
    assert.ifError(result.error);
  }

  await setModule('travel', false);
  const historicalTravel = await superAdmin.client.from('travel_requests').select('id')
    .eq('id', history.data.id).single();
  assert.ifError(historicalTravel.error);
  const travelInsertDenied = await superAdmin.client.from('travel_requests')
    .insert({ tenant_id: tenantId, note: 'phase03-auth-denied-travel' });
  check(Boolean(travelInsertDenied.error && travelInsertDenied.error.code === '42501'),
    'Disabled travel rejects an authenticated PostgREST insert');
  const travelUpdateDenied = await superAdmin.client.from('travel_requests')
    .update({ note: 'phase03-auth-denied-update' }).eq('id', newTravel.data.id);
  check(Boolean(travelUpdateDenied.error && travelUpdateDenied.error.code === '42501'),
    'Disabled travel rejects an authenticated PostgREST update');
  const travelDeleteDenied = await superAdmin.client.from('travel_requests').delete().eq('id', newTravel.data.id);
  check(Boolean(travelDeleteDenied.error && travelDeleteDenied.error.code === '42501'),
    'Disabled travel rejects an authenticated PostgREST delete');
  check(true, 'Authorized PostgREST history remains readable after travel is disabled');

  await setModule('expenses', false);
  const historicReceipt = await receiptStorage.download(receiptPath);
  assert.ifError(historicReceipt.error);
  const expenseInsertDenied = await superAdmin.client.from('expense_claims')
    .insert({ tenant_id: tenantId, note: 'phase03-auth-denied-expense' });
  check(Boolean(expenseInsertDenied.error && expenseInsertDenied.error.code === '42501'),
    'Disabled expenses rejects an authenticated PostgREST insert');
  const receiptInsertDenied = await receiptStorage.upload(
    superAdmin.id + '/' + claim.data.id + '/new-receipt.txt', payload('new receipt'),
  );
  check(Boolean(receiptInsertDenied.error), 'Disabled expenses rejects a Storage API receipt upload');
  const receiptUpdateDenied = await receiptStorage.upload(receiptPath, payload('replacement receipt'), { upsert: true });
  check(Boolean(receiptUpdateDenied.error), 'Disabled expenses rejects a Storage API receipt upsert');
  const receiptDeleteAttempt = await receiptStorage.remove([receiptPath]);
  const receiptAfterDelete = await receiptStorage.download(receiptPath);
  assert.ifError(receiptAfterDelete.error);
  check(true, 'Disabled expenses prevents a Storage API delete attempt from removing historical receipt evidence');
  check(true, 'Authorized historical receipt remains downloadable after expenses are disabled');

  await setModule('learning', false);
  const historicalLearning = await superAdmin.client.from('learning_enrollments').select('id')
    .eq('id', enrollment.data.id).single();
  assert.ifError(historicalLearning.error);
  const learningInsertDenied = await superAdmin.client.from('learning_enrollments')
    .insert({ tenant_id: tenantId, note: 'phase03-auth-denied-learning' });
  check(Boolean(learningInsertDenied.error && learningInsertDenied.error.code === '42501'),
    'Disabled learning rejects an authenticated PostgREST insert');
  const evidenceUploadDenied = await learningStorage.upload(
    superAdmin.id + '/' + tenantId + '/' + enrollment.data.id + '/new-completion.txt', payload('new evidence'),
  );
  check(Boolean(evidenceUploadDenied.error), 'Disabled learning rejects a Storage API evidence upload');
  const evidenceDeleteAttempt = await learningStorage.remove([evidencePath]);
  const historicEvidence = await learningStorage.download(evidencePath);
  assert.ifError(historicEvidence.error);
  check(true, 'Disabled learning prevents a Storage API delete attempt from removing historical completion evidence');
  check(true, 'Authorized historical learning evidence remains downloadable after learning is disabled');

  const unrelated = await unrelatedStorage.upload(superAdmin.id + '/unrelated.txt', payload('unrelated module'));
  assert.ifError(unrelated.error);
  check(true, 'Disabled optional modules do not block writes to an unrelated Storage bucket');

  const after = await superAdmin.client.rpc('platform_hris_list_tenant_modules', { p_tenant_id: tenantId });
  assert.ifError(after.error);
  assert.deepEqual(Object.fromEntries(after.data.map(row => [row.module_key, row.enabled])),
    { expenses: false, learning: false, travel: false });
  check(true, 'Authenticated RPC reports all three disabled module settings');

  for (const bucket of buckets) {
    const emptied = await admin.storage.emptyBucket(bucket);
    assert.ifError(emptied.error);
    const removed = await admin.storage.deleteBucket(bucket);
    assert.ifError(removed.error);
  }
}
