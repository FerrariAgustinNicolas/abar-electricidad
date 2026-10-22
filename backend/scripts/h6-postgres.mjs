import { localDockerHost } from './h6-docker-endpoint.mjs';
import { spawnSync } from 'node:child_process';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { mkdtempSync, writeFileSync, mkdirSync, cpSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const flags = process.argv.slice(2);
if (flags.includes('--help')) {
  console.log('Usage: node backend/scripts/h6-postgres.mjs [--setup-only] [--keep]\nCreates new owned loopback PostgreSQL 17 and Mailpit fixtures. Checks clean migrations, a populated H5 upgrade and drift. By default runs H6 integration tests. --setup-only prepares fixtures without claiming runtime tests passed. --keep retains only owned containers for further checks; private manifest is never committed. No existing services or databases are reused.');
  process.exit(0);
}
if (flags.some(flag => !['--setup-only', '--keep'].includes(flag))) { console.error('Unknown option. Use --help.'); process.exit(2); }
const backend = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(resolve(backend, 'package.json'));
const { Client } = require('pg');
const owner = randomUUID(), password = randomBytes(32).toString('base64url');
const scratch = mkdtempSync(resolve(tmpdir(), 'abar-h6-owned.'));
const dockerHost = localDockerHost();
const containers = [];
const dockerEnvironment = { ...process.env, POSTGRES_PASSWORD: password };
delete dockerEnvironment.DOCKER_CONTEXT;
const docker = args => spawnSync('docker', ['--host', dockerHost, ...args], {encoding:'utf8', env:dockerEnvironment});
const inspect = id => { const r=docker(['inspect',id]); if(r.status!==0) throw Error('Owned fixture inspection failed'); return JSON.parse(r.stdout)[0]; };
function start(name, image, args) {
  const r = docker(['run','--pull=never','-d','--name',`abar-h6-${name}-${owner}`,'--label',`com.abar.h6-owner=${owner}`,'--label','com.abar.h6-purpose=integration',...args,image]);
  if (r.status!==0 || !/^[0-9a-f]{64}$/.test(r.stdout.trim())) throw Error(`Unable to create owned ${name} fixture`);
  const id=r.stdout.trim(); containers.push(id);
  writeFileSync(resolve(scratch,'ownership.json'),JSON.stringify({containers,owner,dockerHost}),{mode:0o600});
  return inspect(id);
}
const digest = value => createHash('sha256').update(value).digest('hex');
const runPrisma = (config, url, args) => {
  const result=spawnSync(process.execPath,[resolve(backend,'node_modules/prisma/build/index.js'),...args,'--config',config],{cwd:backend,env:{...process.env,H6_TARGET_DATABASE_URL:url},stdio:'inherit'});
  if(result.status!==0) throw Error(`Owned Prisma command failed (exit ${result.status ?? 'unavailable'})`);
};
let exit=1;
try {
  const pg=start('postgres','postgres:17.11-bookworm',['--label',`com.abar.h5-owner=${owner}`,'--tmpfs','/var/lib/postgresql/data','-e','POSTGRES_PASSWORD','-e','POSTGRES_USER=h6_demo','-e','POSTGRES_DB=h6_notifications','-p','127.0.0.1::5432']);
  const mail=start('mailpit','axllent/mailpit:v1.31.3',['--tmpfs','/data','-p','127.0.0.1::1025','-p','127.0.0.1::8025']);
  const binding=(container,port)=>{const b=container.NetworkSettings.Ports[`${port}/tcp`];if(b?.length!==1||b[0].HostIp!=='127.0.0.1')throw Error('Fixture must be loopback only');return b[0].HostPort;};
  const url=`postgresql://h6_demo:${password}@127.0.0.1:${binding(pg,5432)}/h6_notifications`;
  const database=name=>{const u=new URL(url);u.pathname=`/${name}`;return u.toString();};
  let ready=false;
  for(let n=0;n<80;n++){const c=new Client({connectionString:url});try{await c.connect();await c.query('SELECT 1');ready=true;}catch{await new Promise(r=>setTimeout(r,200));}finally{await c.end().catch(()=>{});}if(ready)break;}
  if(!ready)throw Error('Owned PostgreSQL did not become ready');
  const c=new Client({connectionString:url});await c.connect();
  for(const name of ['h6_settings','h6_upgrade','h6_browser','h6_verify'])await c.query(`CREATE DATABASE "${name}"`);
  await c.end();
  const old=resolve(scratch,'h5-migrations');mkdirSync(old);
  for(const m of readdirSync(resolve(backend,'prisma/migrations')))if(/^\d+_/.test(m)&&!m.includes('_h6_'))cpSync(resolve(backend,'prisma/migrations',m),resolve(old,m),{recursive:true});
  const config=resolve(scratch,'current.config.ts'), historical=resolve(scratch,'h5.config.ts');
  const configSource=path=>`import { defineConfig } from ${JSON.stringify(resolve(backend,'node_modules/prisma/config.js'))};\nexport default defineConfig({schema:${JSON.stringify(resolve(backend,'prisma/schema.prisma'))},migrations:{path:${JSON.stringify(path)}},datasource:{url:process.env.H6_TARGET_DATABASE_URL}});\n`;
  writeFileSync(config,configSource(resolve(backend,'prisma/migrations')),{mode:0o600});writeFileSync(historical,configSource(old),{mode:0o600});
  for(const name of ['h6_notifications','h6_settings','h6_browser','h6_verify'])runPrisma(config,database(name),['migrate','deploy']);
  const upgradeUrl=database('h6_upgrade');runPrisma(historical,upgradeUrl,['migrate','deploy']);
  const upgrade=new Client({connectionString:upgradeUrl});await upgrade.connect();
  const quote=randomUUID(),order=randomUUID(),job=randomUUID();
  await upgrade.query('INSERT INTO "CheckoutQuote"(id,"policyVersion","stateFingerprint",response,"expiresAt") VALUES($1,1,$2,$3,now()+interval \'1 hour\')',[quote,'1'.repeat(64),{frozen:'DEMO historical quote'}]);
  await upgrade.query(`INSERT INTO "Order"(id,"orderNumber","quoteId","deliveryMode","customerFirstName","customerLastName","customerEmail","customerPhone","acceptedTermsVersion","subtotalMinor","deliveryFeeMinor","totalMinor","accessTokenHash","accessExpiresAt") VALUES($1,$2,$3,'PICKUP','DEMO','Upgrade','upgrade@example.test','DEMO','demo-2026-10-20-v1',1234,0,1234,$4,now()+interval '1 hour')`,[order,`ABAR-DEMO-${order}`,quote,digest(order)]);
  await upgrade.query('INSERT INTO "NotificationJob"(id,"orderId",kind,recipient,"dedupeKey",payload) VALUES($1,$2,\'ORDER_CREATED_BUYER\',\'upgrade@example.test\',$3,$4)',[job,order,`${order}:ORDER_CREATED_BUYER`,{template:'ORDER_CREATED',orderNumber:`ABAR-DEMO-${order}`}]);
  const snapshot=async()=> (await upgrade.query(`SELECT jsonb_build_object('policy',(SELECT to_jsonb(t)-'contact' FROM "CheckoutPolicy" t WHERE id='default'),'quote',(SELECT to_jsonb(t) FROM "CheckoutQuote" t WHERE id=$1),'order',(SELECT to_jsonb(t) FROM "Order" t WHERE id=$2),'job',(SELECT jsonb_build_object('id',id,'orderId',"orderId",'kind',kind,'recipient',recipient,'dedupeKey',"dedupeKey",'payload',payload,'state',state,'createdAt',"createdAt") FROM "NotificationJob" WHERE id=$3))::text AS value`,[quote,order,job])).rows[0].value;
  const before=digest(await snapshot());runPrisma(config,upgradeUrl,['migrate','deploy']);const after=digest(await snapshot());
  if(before!==after)throw Error('Populated H5 historical bytes changed');
  const upgraded=(await upgrade.query('SELECT "attemptCount","totalAttemptCount",version,"leaseToken","leaseUntil","nextAttemptAt" FROM "NotificationJob" WHERE id=$1',[job])).rows[0];
  if(upgraded.attemptCount!==0||upgraded.totalAttemptCount!==0||upgraded.version!==1||upgraded.leaseToken!==null||upgraded.leaseUntil!==null||!upgraded.nextAttemptAt)throw Error('H5 job lifecycle defaults invalid');
  await upgrade.end();
  for(const target of [url,upgradeUrl])runPrisma(config,target,['migrate','diff','--from-config-datasource','--to-schema',resolve(backend,'prisma/schema.prisma'),'--exit-code']);
  const mailpitUrl=`http://127.0.0.1:${binding(mail,8025)}`;
  let mailReady=false;for(let n=0;n<60;n++){try{if((await fetch(`${mailpitUrl}/api/v1/info`)).ok){mailReady=true;break;}}catch{}await new Promise(r=>setTimeout(r,200));}
  if(!mailReady)throw Error('Owned Mailpit did not become ready');
  const env={H6_DATABASE_URL:url,H6_SETTINGS_DATABASE_URL:database('h6_settings'),H6_UPGRADE_DATABASE_URL:upgradeUrl,H6_BROWSER_DATABASE_URL:database('h6_browser'),H6_VERIFY_DATABASE_URL:database('h6_verify'),H6_CONTAINER_ID:pg.Id,H6_MAILPIT_CONTAINER_ID:mail.Id,H6_OWNER:owner,H6_SMTP_HOST:'127.0.0.1',H6_SMTP_PORT:binding(mail,1025),H6_MAILPIT_URL:mailpitUrl,H6_CONFIG:config};
  const evidence={cleanMigration:'PASS',populatedH5Upgrade:'PASS',beforeHash:before,afterHash:after,drift:'PASS',postgresImage:pg.Config.Image,mailpitImage:mail.Config.Image,loopback:true};
  writeFileSync(resolve(scratch,'fixture.json'),JSON.stringify({env,evidence,containers,owner,dockerHost,scratch},null,2),{mode:0o600});
  console.log(JSON.stringify(evidence));console.log(`Private owned fixture manifest: ${resolve(scratch,'fixture.json')}`);
  if(!flags.includes('--setup-only')){
    const r=spawnSync(process.execPath,[resolve(backend,'node_modules/jest/bin/jest.js'),'--config',resolve(backend,'test/jest-e2e.json'),'--runInBand','--runTestsByPath',...readdirSync(resolve(backend,'test')).filter(name=>name.startsWith('h6-')&&name.endsWith('.e2e-spec.ts')).map(name=>resolve(backend,'test',name))],{cwd:backend,env:{...process.env,...env},stdio:'inherit'});exit=r.status??1;
  }else{console.log('SETUP ONLY: runtime integration tests not executed.');exit=0;}
}catch{console.error('H6 owned fixture setup/check failed; inspect local command results. No ambient services reused.');}
finally{
  if(!flags.includes('--keep'))for(const id of containers){try{const c=inspect(id);if(c.Id===id&&c.Config.Labels['com.abar.h6-owner']===owner&&c.Mounts.every(m=>m.Type==='tmpfs'))docker(['rm','-f',id]);}catch{console.error('Owned fixture cleanup requires parent inspection.');}}
  console.log(`Scratch retained for parent cleanup: ${scratch}`);
}
process.exitCode=exit;
