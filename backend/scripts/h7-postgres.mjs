import { spawnSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const flags=process.argv.slice(2);
if(flags.includes('--help')){console.log('Usage: node backend/scripts/h7-postgres.mjs [--keep]\nCreates one owned loopback PostgreSQL 17 fixture, migrates it, and runs the H7 report integration suite. No existing database or service is reused.');process.exit(0);}
if(flags.some(x=>x!=='--keep')){console.error('Unknown option. Use --help.');process.exit(2);}
const backend=resolve(dirname(fileURLToPath(import.meta.url)),'..'),require=createRequire(resolve(backend,'package.json')),{Client}=require('pg');
const owner=randomUUID(),password=randomBytes(32).toString('base64url'),scratch=mkdtempSync(resolve(tmpdir(),'abar-h7-owned.'));
const context=process.env.DOCKER_CONTEXT,contextResult=spawnSync('docker',['context','inspect',...(context?[context]:[]),'--format','{{.Endpoints.docker.Host}}'],{encoding:'utf8',env:process.env});
if(contextResult.status!==0||!/^unix:\/\/\/[^\r\n]+$/.test(contextResult.stdout.trim())){console.error('H7 requires a local Docker Unix socket; no external Docker context was contacted.');process.exit(2);}
const host=contextResult.stdout.trim(),docker=args=>spawnSync('docker',['--host',host,...args],{encoding:'utf8',env:{...process.env,POSTGRES_PASSWORD:password}}),containers=[];
const run=(args,env={})=>{const r=spawnSync(process.execPath,args,{cwd:backend,env:{...process.env,...env},stdio:'inherit'});if(r.status!==0)throw new Error(`Command failed with exit ${r.status??'unknown'}`);};
let exit=1;
let manifestPath;
try{
 const started=docker(['run','--pull=never','-d','--name',`abar-h7-postgres-${owner}`,'--label',`com.abar.h7-owner=${owner}`,'--label','com.abar.h7-purpose=integration','--tmpfs','/var/lib/postgresql/data','-e','POSTGRES_PASSWORD','-e','POSTGRES_USER=h7_demo','-e','POSTGRES_DB=h7_reports','-p','127.0.0.1::5432','postgres:17.11-bookworm']);
 if(started.status!==0||!/^[0-9a-f]{64}$/.test(started.stdout.trim()))throw new Error('Could not create owned PostgreSQL');
 const id=started.stdout.trim();containers.push(id);const info=JSON.parse(docker(['inspect',id]).stdout)[0],binding=info.NetworkSettings.Ports['5432/tcp'];
 if(info.Id!==id||info.Config.Labels['com.abar.h7-owner']!==owner||binding?.length!==1||binding[0].HostIp!=='127.0.0.1'||!info.Mounts.every(x=>x.Type==='tmpfs'))throw new Error('PostgreSQL ownership/bind verification failed');
 const url=`postgresql://h7_demo:${password}@127.0.0.1:${binding[0].HostPort}/h7_reports`;let ready=false;
 for(let n=0;n<80;n++){const c=new Client({connectionString:url});try{await c.connect();await c.query('SELECT 1');ready=true;}catch{await new Promise(r=>setTimeout(r,250));}finally{await c.end().catch(()=>{});}if(ready)break;}
 if(!ready)throw new Error('Owned PostgreSQL did not become ready');
 const config=resolve(scratch,'h7.config.ts');writeFileSync(config,`import { defineConfig } from ${JSON.stringify(resolve(backend,'node_modules/prisma/config.js'))};\nexport default defineConfig({schema:${JSON.stringify(resolve(backend,'prisma/schema.prisma'))},datasource:{url:process.env.DATABASE_URL}});\n`,{mode:0o600});
 run([resolve(backend,'node_modules/prisma/build/index.js'),'migrate','deploy','--config',config],{DATABASE_URL:url});
 run([resolve(backend,'node_modules/prisma/build/index.js'),'migrate','diff','--from-config-datasource','--to-schema',resolve(backend,'prisma/schema.prisma'),'--exit-code','--config',config],{DATABASE_URL:url});
 manifestPath=resolve(scratch,'fixture.json');
 writeFileSync(manifestPath,JSON.stringify({owner,container:id,host:'127.0.0.1',hostPort:binding[0].HostPort,database:'h7_reports',connectionString:url,noH7MigrationRequired:true,scratch},null,2),{mode:0o600});
 run([resolve(backend,'node_modules/jest/bin/jest.js'),'--config',resolve(backend,'test/jest-e2e.json'),'--runInBand','--runTestsByPath',resolve(backend,'test/h7-reports.e2e-spec.ts')],{DATABASE_URL:url,H7_DATABASE_URL:url});exit=0;
}catch{console.error('H7 owned PostgreSQL setup or report tests failed; inspect local command output.');}
finally{
 if(!flags.includes('--keep')||exit!==0)for(const id of containers){try{const check=docker(['inspect',id]);const c=JSON.parse(check.stdout)[0];if(check.status===0&&c.Id===id&&c.Config.Labels['com.abar.h7-owner']===owner&&c.Mounts.every(x=>x.Type==='tmpfs'))docker(['rm','-f',id]);}catch{console.error('Owned PostgreSQL cleanup needs manual ownership inspection.');}}
 if(manifestPath) console.log(`Private fixture manifest retained for parent-owned checks: ${manifestPath}`);
 else console.log(`Private scratch retained for parent cleanup: ${scratch}`);
}
process.exitCode=exit;
