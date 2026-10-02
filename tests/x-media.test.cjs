const test = require('node:test');
const assert = require('node:assert/strict');
const X = require('../src/x-media.js');

test('chooses highest visual quality before bitrate', () => {
  const best = X.chooseBestVariant([
    { content_type:'video/mp4', bitrate:4000000, url:'https://video.twimg.com/ext_tw_video/1/pu/vid/640x360/a.mp4' },
    { content_type:'video/mp4', bitrate:2000000, url:'https://video.twimg.com/ext_tw_video/1/pu/vid/1280x720/b.mp4' },
    { content_type:'application/x-mpegURL', url:'https://video.twimg.com/a.m3u8' }
  ]);
  assert.match(best.url, /1280x720/);
  assert.equal(best.width, 1280);
  assert.equal(best.height, 720);
});

test('upgrades X photos to original resolution URL', () => {
  const url = X.originalPhotoUrl('https://pbs.twimg.com/media/ABC123.jpg?name=small');
  const parsed = new URL(url);
  assert.equal(parsed.searchParams.get('name'), 'orig');
  assert.equal(parsed.searchParams.get('format'), 'jpg');
  assert.equal(parsed.pathname, '/media/ABC123');
});

test('collects photo, video and animated gif from nested X payload', () => {
  const media = [
    { type:'photo', media_key:'3_photo', media_url_https:'https://pbs.twimg.com/media/PIC.png?name=small', original_info:{width:2048,height:1365} },
    { type:'video', media_key:'7_video', media_url_https:'https://pbs.twimg.com/ext_tw_video_thumb/111/pu/img/v.jpg', video_info:{ duration_millis:5000, variants:[
      {content_type:'video/mp4',bitrate:832000,url:'https://video.twimg.com/ext_tw_video/111/pu/vid/640x360/a.mp4'},
      {content_type:'video/mp4',bitrate:2176000,url:'https://video.twimg.com/ext_tw_video/111/pu/vid/1280x720/b.mp4'}
    ]}},
    { type:'animated_gif', media_key:'16_gif', media_url_https:'https://pbs.twimg.com/tweet_video_thumb/222/x.jpg', video_info:{ variants:[
      {content_type:'video/mp4',bitrate:0,url:'https://video.twimg.com/tweet_video/222/anim.mp4'}
    ]}}
  ];
  const json = {
    data: {
      tweet: {
        rest_id: '1234567890123456789',
        core: { user_results: { result: { legacy: { screen_name: 'tester' } } } },
        legacy: { extended_entities: { media } }
      }
    }
  };
  const out = X.collectMedia(json);
  assert.equal(out.length, 3);
  assert.equal(out.find(x=>x.type==='photo').url.includes('name=orig'), true);
  assert.match(out.find(x=>x.type==='video').url, /1280x720/);
  assert.equal(out.find(x=>x.type==='gif').ext, 'mp4');
  assert.equal(out.every(x=>x.handle==='tester'), true);
});

test('rejects non-twimg video variants', () => {
  assert.equal(X.normalizeVideoVariant({content_type:'video/mp4',url:'https://evil.example/video.mp4'}), null);
});
