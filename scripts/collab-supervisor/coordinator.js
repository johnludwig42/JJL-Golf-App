import { readJson } from './lib/processes.js';
import { executeFakeSession } from './lib/fake-runtime.js';
try { const result=await executeFakeSession(readJson(process.argv[2]));process.stdout.write(JSON.stringify({stop:result.state.stop})+'\n');process.exitCode=result.exit; }
catch(error){process.stderr.write(`${error.code||'AGENT_ERROR'}: ${error.message}\n`);process.exitCode=99;}
