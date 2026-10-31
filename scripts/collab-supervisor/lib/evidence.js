import { mkdirSync, openSync, writeSync, fsyncSync, closeSync, renameSync, readFileSync, existsSync } from 'node:fs';
import { replaceCheckpoint } from './replace.js';
import { resolve, dirname, isAbsolute } from 'node:path';
import { randomUUID } from 'node:crypto';
import { fault, hash, inside } from './policy.js';
import { Buffer } from 'node:buffer';

export class Evidence {
  constructor(root, { inject = () => {} } = {}) {
    if (!isAbsolute(root)) throw fault('EVIDENCE_WRITE', 'Explicit absolute evidence folder required');
    this.root = resolve(root); this.inject = inject; this.sequence = 0;
    mkdirSync(this.root, { recursive: true });
    this.indexPath = resolve(this.root, 'evidence-index.jsonl');
    if (existsSync(this.indexPath)) {
      const entries = this.entries(); this.sequence = entries.length;
    }
  }
  path(name) {
    const path = resolve(this.root, name);
    if (!inside(this.root, path) || path === this.root) throw fault('EVIDENCE_WRITE', 'Artifact outside evidence folder');
    return path;
  }
  bytes(path, bytes, exclusive = true) {
    let fd;
    try {
      this.inject('open', path); mkdirSync(dirname(path), { recursive: true });
      fd = openSync(path, exclusive ? 'wx' : 'a');
      const buffer = Buffer.from(bytes); let offset = 0;
      while (offset < buffer.length) {
        this.inject('write', path);
        const count = writeSync(fd, buffer, offset, buffer.length - offset);
        if (count <= 0) throw fault('EVIDENCE_WRITE', 'Short evidence write');
        offset += count;
      }
      this.inject('flush', path); fsyncSync(fd);
    } catch (error) { throw fault('EVIDENCE_WRITE', `${path}: ${error.code || error.message}`); }
    finally { if (fd !== undefined) closeSync(fd); }
  }
  entries() {
    if (!existsSync(this.indexPath)) return [];
    let previous = ''; let sequence = 0;
    return readFileSync(this.indexPath, 'utf8').split('\n').filter(Boolean).map(line => {
      const row = JSON.parse(line);
      if (row.sequence !== ++sequence || row.previous !== previous) throw fault('INTEGRITY', 'Broken evidence index');
      previous = hash(Buffer.from(line)); return row;
    });
  }
  index(name, bytes, mutable) {
    const entries = this.entries(); const last = entries.at(-1);
    const previous = last ? hash(Buffer.from(JSON.stringify(last))) : '';
    const row = { sequence: entries.length + 1, artifact: name, hash: hash(bytes), size: Buffer.byteLength(bytes), mutable, previous };
    this.bytes(this.indexPath, JSON.stringify(row) + '\n', false); this.sequence = row.sequence;
  }
  write(name, value, { mutable = false, raw = false } = {}) {
    const bytes = raw ? Buffer.from(value) : Buffer.from(JSON.stringify(value, null, 2) + '\n');
    const path = this.path(name);
    if (name === 'evidence-index.jsonl') throw fault('EVIDENCE_WRITE', 'Index is maintained internally');
    if (mutable) {
      const temporary = path + '.' + randomUUID() + '.tmp';
      this.bytes(temporary, bytes);
      replaceCheckpoint(temporary, path, (from, to) => { this.inject('rename', path); renameSync(from, to); });
    } else this.bytes(path, bytes);
    this.index(name, bytes, mutable); return hash(bytes);
  }
  event(row) {
    const old = existsSync(this.path('events.jsonl')) ? readFileSync(this.path('events.jsonl')) : Buffer.alloc(0);
    this.bytes(this.path('events.jsonl'), JSON.stringify(row) + '\n', false);
    const bytes = readFileSync(this.path('events.jsonl'));
    if (bytes.length <= old.length) throw fault('EVIDENCE_WRITE');
    this.index('events.jsonl', bytes, true);
  }
  verify() {
    const latest = new Map(); for (const row of this.entries()) latest.set(row.artifact, row);
    const problems = [];
    for (const [name, row] of latest) {
      try { if (hash(readFileSync(this.path(name))) !== row.hash) problems.push(name); }
      catch { problems.push(name); }
    }
    return problems;
  }
}
