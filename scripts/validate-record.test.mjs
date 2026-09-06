import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateRecords, validateDefinition } from '../lib/validate-record.mjs';
test('valid DNS families', () => {
  for (const records of [{A:'203.0.113.1'},{AAAA:'2001:db8::1'},{CNAME:'site.example.com'},{TXT:['one','two']},{MX:[{target:'mail.example.com',priority:10}]},{CAA:[{flags:0,tag:'issue',value:'letsencrypt.org'}]},{NS:'ns.example.com'},{SRV:[{priority:1,weight:2,port:443,target:'srv.example.com'}]},{TLSA:[{usage:3,selector:1,matching_type:1,certificate:'ab'.repeat(32)}]},{DS:[{key_tag:1,algorithm:13,digest_type:2,digest:'ab'.repeat(32)}]},{URL:'https://example.com'}]) assert.doesNotThrow(()=>validateRecords(records));
});
test('reject malformed values and impossible combinations', () => {
  for (const value of [{},{A:'999.1.1.1'},{AAAA:'hello'},{CNAME:'https://example.com/a'},{CNAME:'example.com',TXT:'x'},{MX:[{}]},{CAA:[{flags:-1}]},{TLSA:[{certificate:'not-hex'}]},{DS:[{}]},{URL:'javascript:alert(1)'},{A:[]},{A:['1.1.1.1','1.1.1.1']}]) assert.throws(()=>validateRecords(value));
});
test('protect reserved names and schema fields', () => {
  const record={owner:{username:'octocat',id:1},records:{CNAME:'example.com'}};
  assert.throws(()=>validateDefinition('admin',record,{names:{admin:{allowDomainFile:false}}}));
  assert.throws(()=>validateDefinition('bad-',record));
  assert.throws(()=>validateDefinition('good',{...record,unexpected:true}));
  assert.doesNotThrow(()=>validateDefinition('good',record));
});
