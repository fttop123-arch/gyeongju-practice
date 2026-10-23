// 사용: node prepare-organization-data.mjs "조직도.xlsx"
import {existsSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
const source=process.argv[2];
if(!source){console.error('사용: node prepare-organization-data.mjs "조직도.xlsx"');process.exit(1);}
const bundled=join(homedir(),'.cache','codex-runtimes','codex-primary-runtime','dependencies','python','python.exe');
const python=process.env.ORGANIZATION_PYTHON || (existsSync(bundled)?bundled:'python');
const r=spawnSync(python,[fileURLToPath(new URL('./prepare-organization-data.py',import.meta.url)),source,fileURLToPath(new URL('./data/organization.json',import.meta.url))],{encoding:'utf8',windowsHide:true,env:{...process.env,PYTHONIOENCODING:'utf-8'}});
if(r.stdout)process.stdout.write(r.stdout);if(r.stderr)process.stderr.write(r.stderr);if(r.error)console.error('Python 실행에 실패했습니다. Python과 openpyxl을 확인해 주세요.');process.exit(r.status??1);
