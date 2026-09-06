import { isIP } from 'node:net';

const hostname =
  /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.?$/i;
export const recordTypes = [
  'A',
  'AAAA',
  'CNAME',
  'TXT',
  'MX',
  'CAA',
  'NS',
  'SRV',
  'TLSA',
  'DS',
  'URL',
];
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};
const integer = (value, min, max) =>
  Number.isInteger(value) && value >= min && value <= max;
const object = (value) =>
  value && typeof value === 'object' && !Array.isArray(value);
const keys = (value, allowed) =>
  Object.keys(value).every((key) => allowed.includes(key));
const list = (value) => (Array.isArray(value) ? value : [value]);
const host = (value) =>
  typeof value === 'string' &&
  isIP(value) === 0 &&
  hostname.test(value) &&
  !/\.(localhost|local|internal)\.?$/i.test(value);
const text = (value) =>
  typeof value === 'string' &&
  value.length > 0 &&
  value.length <= 2048 &&
  Array.from(value).every((character) => character.codePointAt(0) >= 32);
export function validateRecords(records) {
  assert(
    object(records) && Object.keys(records).length > 0,
    'Add at least one DNS record.',
  );
  const entries = Object.entries(records);
  assert(
    entries.every(([type]) => recordTypes.includes(type)),
    'Unsupported record type.',
  );
  assert(
    !('CNAME' in records) || entries.length === 1,
    'CNAME cannot share its name with any other record.',
  );
  assert(
    !('URL' in records) || entries.length === 1,
    'URL redirects cannot be combined with DNS records.',
  );
  let count = 0;
  for (const [type, value] of entries) {
    const values = list(value);
    count += values.length;
    assert(values.length > 0 && count <= 20, 'Use between 1 and 20 records.');
    assert(
      new Set(values.map((item) => JSON.stringify(item))).size ===
        values.length,
      'Remove duplicate records.',
    );
    for (const item of values) {
      if (type === 'A')
        assert(
          typeof item === 'string' && isIP(item) === 4,
          'A requires a valid IPv4 address.',
        );
      if (type === 'AAAA')
        assert(
          typeof item === 'string' && isIP(item) === 6,
          'AAAA requires a valid IPv6 address.',
        );
      if (['CNAME', 'NS'].includes(type))
        assert(
          host(item),
          type + ' requires a hostname, without a protocol or path.',
        );
      if (type === 'CNAME')
        assert(!Array.isArray(value), 'Only one CNAME target is allowed.');
      if (type === 'TXT')
        assert(text(item), 'TXT must contain 1–2048 printable characters.');
      if (type === 'MX')
        assert(
          object(item) &&
            keys(item, ['target', 'priority']) &&
            host(item.target) &&
            integer(item.priority, 0, 65535),
          'MX requires target and priority (0–65535).',
        );
      if (type === 'CAA')
        assert(
          object(item) &&
            keys(item, ['flags', 'tag', 'value']) &&
            integer(item.flags, 0, 255) &&
            ['issue', 'issuewild', 'iodef'].includes(item.tag) &&
            text(item.value),
          'CAA requires flags, a supported tag, and a value.',
        );
      if (type === 'SRV')
        assert(
          object(item) &&
            keys(item, ['priority', 'weight', 'port', 'target']) &&
            ['priority', 'weight', 'port'].every((key) =>
              integer(item[key], 0, 65535),
            ) &&
            (item.target === '.' || host(item.target)),
          'SRV requires priority, weight, port, and target.',
        );
      if (type === 'TLSA')
        assert(
          object(item) &&
            keys(item, ['usage', 'selector', 'matching_type', 'certificate']) &&
            integer(item.usage, 0, 3) &&
            integer(item.selector, 0, 1) &&
            integer(item.matching_type, 0, 2) &&
            typeof item.certificate === 'string' &&
            /^(?:[a-f0-9]{2})+$/i.test(item.certificate) &&
            (item.matching_type === 0 ||
              item.certificate.length ===
                (item.matching_type === 1 ? 64 : 128)),
          'TLSA requires valid fields and hexadecimal certificate data.',
        );
      if (type === 'DS')
        assert(
          object(item) &&
            keys(item, ['key_tag', 'algorithm', 'digest_type', 'digest']) &&
            integer(item.key_tag, 0, 65535) &&
            integer(item.algorithm, 1, 255) &&
            [1, 2, 4].includes(item.digest_type) &&
            typeof item.digest === 'string' &&
            /^[a-f0-9]+$/i.test(item.digest) &&
            item.digest.length === { 1: 40, 2: 64, 4: 96 }[item.digest_type],
          'DS requires valid fields and a correctly sized hexadecimal digest.',
        );
      if (type === 'URL') {
        let url;
        try {
          url = new URL(item);
        } catch {
          throw new Error('URL requires a full HTTPS destination.');
        }
        assert(
          !Array.isArray(value) &&
            url.protocol === 'https:' &&
            host(url.hostname) &&
            !url.username &&
            !url.password,
          'URL requires a public HTTPS destination without credentials.',
        );
      }
    }
  }
  return records;
}

export function validateDefinition(name, data, reserved = { names: {} }) {
  assert(
    typeof name === 'string' &&
      name.length <= 230 &&
      /^(?!-)(?!.*--)[a-z0-9_-]+(?:\.[a-z0-9_-]+)*$/.test(name),
    'Invalid registry name.',
  );
  assert(
    name
      .split('.')
      .every((label) => label.length <= 63 && !label.endsWith('-')),
    'Invalid DNS label.',
  );
  assert(
    object(data) && keys(data, ['owner', 'records', 'proxied']),
    'Invalid registry document.',
  );
  assert(
    object(data.owner) &&
      keys(data.owner, ['username', 'id']) &&
      /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(
        data.owner.username,
      ),
    'A GitHub owner is required.',
  );
  if (data.owner.id !== undefined)
    assert(
      Number.isSafeInteger(data.owner.id) && data.owner.id > 0,
      'Invalid GitHub owner ID.',
    );
  assert(
    data.proxied === undefined || data.proxied === false,
    'User records must be DNS-only.',
  );
  const reservation = reserved.names[name.split('.').at(-1)];
  if (reservation)
    assert(
      reservation.allowDomainFile &&
        data.owner.username.toLowerCase() === 'bhav3shchawla',
      'This name is reserved.',
    );
  validateRecords(data.records);
  return data;
}
