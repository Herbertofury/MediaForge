const test=require('node:test');
const assert=require('node:assert/strict');
const C=require('../src/media-classifier.js');

test('smart classifier keeps real content and hides common page junk without deleting records',()=>{
  const page={hostname:'example.com'};
  const photo=C.classifyMediaRecord({type:'photo',url:'https://cdn.example.com/gallery/original-sunset.jpg',width:2400,height:1600,sizeBytes:1800000,source:'img',title:'Sunset photo'},page);
  const icon=C.classifyMediaRecord({type:'photo',url:'https://example.com/assets/favicon-icon.png',width:32,height:32,sizeBytes:2400,source:'img'},page);
  const ad=C.classifyMediaRecord({type:'photo',url:'https://ads.example.com/campaign/sponsored-banner.jpg',width:728,height:90,source:'stylesheet'},page);
  const pixel=C.classifyMediaRecord({type:'photo',url:'https://tracker.example.com/pixel.gif',width:1,height:1,sizeBytes:43,source:'network'},page);
  assert.equal(photo.likelyContent,true);
  assert.equal(icon.likelyContent,false);
  assert.equal(ad.bucket,'promo');
  assert.equal(pixel.bucket,'tracker');
});

test('provider awareness recognizes YouTube and Spotify media',()=>{
  assert.equal(C.providerForHost('music.youtube.com'),'youtube');
  assert.equal(C.providerForHost('open.spotify.com'),'spotify');
  const yt=C.classifyMediaRecord({type:'video',url:'https://www.youtube.com/watch?v=abc',streamingPage:true,nonDownloadable:true,source:'provider:youtube',provider:'youtube'},{});
  const sp=C.classifyMediaRecord({type:'audio',url:'https://open.spotify.com/track/abc',streamingPage:true,nonDownloadable:true,source:'provider:spotify',provider:'spotify'},{});
  assert.equal(yt.likelyContent,true);
  assert.equal(sp.likelyContent,true);
});


test('X smart view strongly prefers post media over site chrome, sports promos, and avatars',()=>{
  const page={hostname:'x.com'};
  const post=C.classifyMediaRecord({type:'photo',url:'https://pbs.twimg.com/media/GzABC?format=jpg&name=orig',width:1965,height:1005,source:'x-fast-dom',provider:'x',xPostMedia:true,inArticle:true,contentPriority:1380,semanticRegion:'x-post'},page);
  const sports=C.classifyMediaRecord({type:'photo',url:'https://ton.twimg.com/twitter-assets/sports-product/leagues/nfl.png',width:512,height:512,source:'inline-css',provider:'x',xSiteChrome:true,semanticRegion:'sidebar'},page);
  const avatar=C.classifyMediaRecord({type:'photo',url:'https://pbs.twimg.com/profile_images/123/avatar_normal.jpg',width:512,height:512,source:'img',provider:'x',xAvatar:true,inArticle:true},page);
  assert.equal(post.likelyContent,true);
  assert.equal(post.bucket,'content');
  assert.equal(sports.likelyContent,false);
  assert.equal(sports.bucket,'ui');
  assert.equal(avatar.likelyContent,false);
  assert.equal(avatar.bucket,'avatar');
  assert.ok(post.score > sports.score + 100);
});
