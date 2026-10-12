import { test, expect } from '@playwright/test';

const id = 'f1111111-1111-4111-8111-111111111111';
const account = { id, aud:'authenticated', role:'authenticated', email:'synthetic-recovery@example.org',
  app_metadata:{provider:'email',providers:['email']},user_metadata:{},created_at:'2026-01-01T00:00:00.000Z' };
const header = Buffer.from(JSON.stringify({typ:'JWT',alg:'HS256'})).toString('base64url');
const payload = Buffer.from(JSON.stringify({
  sub:id,aud:'authenticated',role:'authenticated',email:account.email,
  iss:'https://oslgwxaqfbteqtwqvdzs.supabase.co/auth/v1',
  exp:Math.floor(Date.now()/1000)+3600
})).toString('base64url');
const jwt = [header,payload,'synthetic-signature'].join('.');
const sampleToken = 'synthetic-test-token-1234567890';
const originalRecovery = 'https://oslgwxaqfbteqtwqvdzs.supabase.co/auth/v1/verify?token='
  + sampleToken + '&type=recovery&redirect_to=http%3A%2F%2Flocalhost%3A3000';

function interceptRecovery(page: import('@playwright/test').Page, tokenCaptured: string[]) {
  return page.route('**/auth/v1/**',async route=>{
    const req=route.request(),path=new URL(req.url()).pathname;
    if(path.endsWith('/verify')){
      const input=req.postDataJSON();
      expect(input.type).toBe('recovery');
      tokenCaptured.push(input.token_hash);
      await route.fulfill({status:200,contentType:'application/json',
        body:JSON.stringify({ access_token:jwt,refresh_token:'synthetic-refresh',
          expires_in:3600,token_type:'bearer',user:account })});
      return;
    }
    if(path.endsWith('/user')){
      await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(account)});
      return;
    }
    await route.fulfill({status:400,contentType:'application/json',body:JSON.stringify({message:'Unexpected test endpoint'})});
  });
}

test('wrong-host recovery link is rejected locally without calling Auth',async ({page})=>{
  let verified=0;
  await page.route('**/auth/v1/verify',async route=>{verified++; await route.abort();});
  await page.goto('/');
  await page.getByRole('button',{name:'Forgot password?'}).click();
  await page.getByLabel('Recovery email link').fill('https://attacker.example/auth/v1/verify?token='+sampleToken+'&type=recovery');
  await page.getByRole('button',{name:'Verify recovery link'}).click();
  await expect(page.getByRole('alert')).toContainText('not a recovery link for the current HRIS project');
  expect(verified).toBe(0);
});
test('Supabase recovery link with localhost redirect can be safely redeemed within HRIS',async ({page})=>{
  const used:string[]=[];
  await interceptRecovery(page,used);
  await page.goto('/');
  await page.getByRole('button',{name:'Forgot password?'}).click();
  await expect(page.getByRole('heading',{name:'Recovery email opens the wrong website?'})).toBeVisible();
  await page.getByLabel('Recovery email link').fill(originalRecovery);
  await page.getByRole('button',{name:'Verify recovery link'}).click();
  await expect(page.getByRole('heading',{name:'Choose a new password'})).toBeVisible({timeout:12000});
  expect(used).toEqual([sampleToken]);
  await expect(page).not.toHaveURL(/synthetic-test-token/);
});
test('secure recovery token in URL fragment is removed then opens password update',async ({page})=>{
  const used:string[]=[];
  await interceptRecovery(page,used);
  await page.goto('/#recover_token='+encodeURIComponent(sampleToken));
  await expect(page.getByRole('heading',{name:'Choose a new password'})).toBeVisible({timeout:12000});
  expect(used).toEqual([sampleToken]);
  await expect(page).not.toHaveURL(/recover_token|synthetic-test-token/);
});
test('expired recovery callback shows a useful retry path',async ({page})=>{
  await page.goto('/?error=access_denied&error_code=otp_expired&error_description=Link%20expired');
  await expect(page.getByRole('heading',{name:'Reset your password'})).toBeVisible();
  await expect(page.getByRole('alert')).toContainText('expired');
  await expect(page.getByRole('button',{name:'Send reset link'})).toBeVisible();
});
