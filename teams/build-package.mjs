// Zips the Teams app package. Teams wants manifest.json and both icons at the
// root of the zip, never inside a folder.
import { createWriteStream } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
import { deflateRawSync, crc32 } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const files = ['manifest.json', 'color.png', 'outline.png'];

function dosTime(date) {
  const time = ((date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() / 2)) & 0xffff;
  const day = (((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()) & 0xffff;
  return { time, day };
}

const entries = [];
let offset = 0;
const chunks = [];
const now = dosTime(new Date());

for (const name of files) {
  const raw = await readFile(join(here, name));
  const deflated = deflateRawSync(raw);
  const sum = crc32(raw) >>> 0;
  const nameBuf = Buffer.from(name, 'utf8');

  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(0, 6);
  local.writeUInt16LE(8, 8);
  local.writeUInt16LE(now.time, 10);
  local.writeUInt16LE(now.day, 12);
  local.writeUInt32LE(sum, 14);
  local.writeUInt32LE(deflated.length, 18);
  local.writeUInt32LE(raw.length, 22);
  local.writeUInt16LE(nameBuf.length, 26);
  chunks.push(local, nameBuf, deflated);

  entries.push({ name: nameBuf, sum, compressed: deflated.length, size: raw.length, offset });
  offset += local.length + nameBuf.length + deflated.length;
}

const central = [];
let centralSize = 0;
for (const e of entries) {
  const head = Buffer.alloc(46);
  head.writeUInt32LE(0x02014b50, 0);
  head.writeUInt16LE(20, 4);
  head.writeUInt16LE(20, 6);
  head.writeUInt16LE(0, 8);
  head.writeUInt16LE(8, 10);
  head.writeUInt16LE(now.time, 12);
  head.writeUInt16LE(now.day, 14);
  head.writeUInt32LE(e.sum, 16);
  head.writeUInt32LE(e.compressed, 20);
  head.writeUInt32LE(e.size, 24);
  head.writeUInt16LE(e.name.length, 28);
  head.writeUInt32LE(e.offset, 42);
  central.push(head, e.name);
  centralSize += head.length + e.name.length;
}

const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0);
end.writeUInt16LE(entries.length, 8);
end.writeUInt16LE(entries.length, 10);
end.writeUInt32LE(centralSize, 12);
end.writeUInt32LE(offset, 16);

const out = join(here, 'sprintdeck-teams.zip');
const stream = createWriteStream(out);
for (const c of [...chunks, ...central, end]) stream.write(c);
stream.end();
await new Promise((resolve) => stream.on('close', resolve));

const listed = await readdir(here);
console.log(`Wrote ${out}`);
console.log(`Contents: ${files.join(', ')} (folder has ${listed.length} files)`);
