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

test('normalizes legacy X photo size suffixes without corrupting format or identity', () => {
  for (const size of ['small','large','orig','thumb','medium']) {
    const raw=`https://pbs.twimg.com/media/ABC123.jpg:${size}`;
    const parsed=new URL(X.originalPhotoUrl(raw));
    assert.equal(parsed.pathname,'/media/ABC123');
    assert.equal(parsed.searchParams.get('format'),'jpg');
    assert.equal(parsed.searchParams.get('name'),'orig');
    assert.equal(X.mediaKey(raw),'ABC123');
    assert.equal(X.fileExt(raw,'bin'),'jpg');
  }
});

test('legacy photo normalization keeps query format precedence and stays scoped', () => {
  const u=new URL(X.originalPhotoUrl('https://pbs.twimg.com/media/ABC123.jpg:large?format=png&name=small'));
  assert.equal(u.searchParams.get('format'),'png');
  assert.equal(X.mediaKey('https://example.com/media/ABC123.jpg:large'),'ABC123.jpg:large');
  assert.equal(X.fileExt('https://example.com/media/ABC123.jpg:large','bin'),'bin');
  assert.equal(X.mediaKey('https://pbs.twimg.com/media/ABC123.jpg:custom'),'ABC123.jpg:custom');
});

for (const richFirst of [true, false]) {
  test(`duplicate video records preserve known duration (rich first: ${richFirst})`, () => {
    const entity = (duration, resolution) => ({
      type: 'video', media_key: '7_shared',
      video_info: { ...(duration ? { duration_millis: duration } : {}), variants: [{
        content_type: 'video/mp4',
        url: `https://video.twimg.com/ext_tw_video/123456/pu/vid/${resolution}/clip.mp4`
      }] }
    });
    const rich = entity(5000, '640x360');
    const sparse = entity(0, '1280x720');
    const nodes = (richFirst ? [rich, sparse] : [sparse, rich]).map(media => ({
      rest_id: '123456789', legacy: { extended_entities: { media: [media] } }
    }));
    const out = X.collectMedia(nodes);
    assert.equal(out.length, 1);
    assert.equal(out[0].durationMs, 5000);
    assert.equal(out[0].variants.length, 2);
    assert.match(out[0].url, /1280x720/);
  });
}

for (const richFirst of [true, false]) {
  test(`duplicate photos retain discovered original dimensions (rich first: ${richFirst})`, () => {
    const sparse = { type: 'photo', media_key: '3_photo', media_url_https: 'https://pbs.twimg.com/media/PHOTO.jpg' };
    const rich = { ...sparse, original_info: { width: 2048, height: 1365 } };
    const records = (richFirst ? [rich, sparse] : [sparse, rich]).map(photo => ({
      rest_id: '123456789', legacy: { entities: { media: [photo] } }
    }));
    const out = X.collectMedia(records);
    assert.equal(out.length, 1);
    assert.equal(out[0].width, 2048);
    assert.equal(out[0].height, 1365);
    assert.equal(X.qualityLabel(out[0]), '2048×1365');
    assert.equal(new URL(out[0].url).searchParams.get('name'), 'orig');
  });
}

test('photo enrichment keeps dimension pairs and never downgrades known size', () => {
  const photos = [
    { width: 640, height: 480 }, { width: 2048, height: 1365 },
    { width: 1280, height: 720 }, { width: 9999, height: 0 }
  ].map(original_info => ({
    type: 'photo', media_key: '3_photo', original_info,
    media_url_https: 'https://pbs.twimg.com/media/PHOTO.jpg'
  }));
  const out = X.collectMedia({ rest_id: '123456789', entities: { media: photos } });
  assert.equal(out.length, 1);
  assert.deepEqual([out[0].width, out[0].height], [2048, 1365]);
});

test('duplicate video URLs retain richer quality evidence regardless of discovery order', () => {
  const sparse = { content_type: 'video/mp4', url: 'https://video.twimg.com/quality.mp4' };
  const rich = { ...sparse, width: 1920, height: 1080, bitrate: 4000000 };
  const other = { content_type: 'video/mp4', url: 'https://video.twimg.com/other.mp4', width: 640, height: 360, bitrate: 500000 };
  for (const list of [[sparse, other, rich], [rich, other, sparse]]) {
    const best = X.chooseBestVariant(list);
    assert.equal(best.url, rich.url);
    assert.equal(best.width, 1920); assert.equal(best.height, 1080);
    const media = X.normalizeMediaEntity({ type: 'video', video_info: { variants: list.slice(0, 2) }, media_info: { variants: list.slice(2) } }, { tweetId: '123456', handle: 'test' }, 1);
    assert.equal(media.url, rich.url);
    assert.equal(media.variants.length, 2);
    assert.equal(media.variants[0].bitrate, 4000000);
  }
});
