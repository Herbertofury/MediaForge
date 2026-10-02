const test = require('node:test');
const assert = require('node:assert/strict');
const B = require('../src/background.js');

test('sanitizes Windows-reserved and unsafe filename parts', () => {
  assert.equal(B.sanitizeSegment('CON'), '_CON');
  assert.equal(B.sanitizeSegment('bad:name?.mp4'), 'bad_name_.mp4');
  assert.equal(B.sanitizeFolder('MediaForge GX/../bad:*folder'), 'MediaForge GX/bad__folder');
});

test('builds stable X media filename', () => {
  const name = B.buildFilename({handle:'skarlët',tweetId:'123456789',index:2,type:'video',ext:'mp4',url:'https://video.twimg.com/x.mp4'}, {folder:'MediaForge GX'}, null);
  assert.equal(name, 'MediaForge GX/skarlët-123456789-2.mp4');
});

test('recognizes direct web and data download URLs while rejecting blob/script URLs', () => {
  assert.equal(B.isDownloadableUrl('https://video.twimg.com/a.mp4'), true);
  assert.equal(B.isDownloadableUrl('data:image/png;base64,AA=='), true);
  assert.equal(B.isDownloadableUrl('blob:https://x.com/abc'), false);
  assert.equal(B.isDownloadableUrl('javascript:alert(1)'), false);
});

test('calculates data URL byte size and MIME type', () => {
  const meta = B.dataUrlMeta('data:text/plain;base64,SGVsbG8=');
  assert.equal(meta.sizeBytes, 5);
  assert.equal(meta.mime, 'text/plain');
});

test('merges duplicate records without losing richer metadata', () => {
  const merged = B.mergeRecord({url:'https://x.test/a.jpg',width:320,height:200,source:'img',position:9},{url:'https://x.test/a.jpg',width:1280,height:720,source:'css',position:3,sizeBytes:1234});
  assert.equal(merged.width, 1280);
  assert.equal(merged.height, 720);
  assert.equal(merged.sizeBytes, 1234);
  assert.equal(merged.position, 3);
  assert.deepEqual(new Set(merged.sources), new Set(['img','css']));
});
