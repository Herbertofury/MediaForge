/* Weighted median-cut palette + cached nearest-color mapping for GIF frames. */
export function quantizeFrame(rgba, maxColors = 256) {
  if (!(rgba instanceof Uint8ClampedArray) && !(rgba instanceof Uint8Array)) throw new Error('RGBA byte array required');
  maxColors = Math.min(256, Math.max(2, maxColors|0));
  const bins = new Uint32Array(32768);
  const sumR = new Uint32Array(32768), sumG = new Uint32Array(32768), sumB = new Uint32Array(32768);
  for (let i=0;i<rgba.length;i+=4) {
    const r=rgba[i],g=rgba[i+1],b=rgba[i+2];
    const key=((r>>3)<<10)|((g>>3)<<5)|(b>>3);
    bins[key]++; sumR[key]+=r; sumG[key]+=g; sumB[key]+=b;
  }
  const keys=[];for(let k=0;k<bins.length;k++)if(bins[k])keys.push(k);
  if (!keys.length) return [[0,0,0]];
  const boxes=[makeBox(keys,bins)];
  while(boxes.length<maxColors){
    let pick=-1,score=-1;
    for(let i=0;i<boxes.length;i++){const b=boxes[i];if(b.keys.length<2)continue;const s=b.count*Math.max(b.r1-b.r0,b.g1-b.g0,b.b1-b.b0);if(s>score){score=s;pick=i;}}
    if(pick<0)break;
    const box=boxes.splice(pick,1)[0]; const channel=longest(box);
    box.keys.sort((a,b)=>channelValue(a,channel)-channelValue(b,channel));
    const half=box.count/2;let acc=0,split=1;
    for(let i=0;i<box.keys.length-1;i++){acc+=bins[box.keys[i]];if(acc>=half){split=i+1;break;}}
    boxes.push(makeBox(box.keys.slice(0,split),bins),makeBox(box.keys.slice(split),bins));
  }
  return boxes.map((box)=>{
    let n=0,r=0,g=0,b=0;for(const k of box.keys){const c=bins[k];n+=c;r+=sumR[k];g+=sumG[k];b+=sumB[k];}
    return [Math.round(r/n),Math.round(g/n),Math.round(b/n)];
  });
}
function channelValue(k,c){return c===0?((k>>10)&31):c===1?((k>>5)&31):(k&31);}
function makeBox(keys,bins){let r0=31,g0=31,b0=31,r1=0,g1=0,b1=0,count=0;for(const k of keys){const r=(k>>10)&31,g=(k>>5)&31,b=k&31;r0=Math.min(r0,r);g0=Math.min(g0,g);b0=Math.min(b0,b);r1=Math.max(r1,r);g1=Math.max(g1,g);b1=Math.max(b1,b);count+=bins[k];}return{keys,r0,g0,b0,r1,g1,b1,count};}
function longest(b){const rr=b.r1-b.r0,gg=b.g1-b.g0,bb=b.b1-b.b0;return rr>=gg&&rr>=bb?0:gg>=bb?1:2;}

export function applyPalette(rgba,palette){
  const out=new Uint8Array(rgba.length/4),cache=new Int16Array(32768);cache.fill(-1);
  for(let p=0,i=0;p<rgba.length;p+=4,i++){
    const r=rgba[p],g=rgba[p+1],b=rgba[p+2],key=((r>>3)<<10)|((g>>3)<<5)|(b>>3);let idx=cache[key];
    if(idx<0){let best=0,dist=Infinity;for(let j=0;j<palette.length;j++){const c=palette[j],dr=r-c[0],dg=g-c[1],db=b-c[2];const d=dr*dr*2+dg*dg*3+db*db;if(d<dist){dist=d;best=j;if(!d)break;}}idx=best;cache[key]=idx;}
    out[i]=idx;
  }
  return out;
}

// Stable ordered dithering for GIF/video frames. Unlike temporal/noise dithering,
// this 8x8 Bayer pattern is deterministic for a given pixel coordinate, which
// greatly reduces frame-to-frame shimmer while preserving gradients.
const BAYER8 = new Int8Array([
   0,32, 8,40, 2,34,10,42,
  48,16,56,24,50,18,58,26,
  12,44, 4,36,14,46, 6,38,
  60,28,52,20,62,30,54,22,
   3,35,11,43, 1,33, 9,41,
  51,19,59,27,49,17,57,25,
  15,47, 7,39,13,45, 5,37,
  63,31,55,23,61,29,53,21
]);

export function applyPaletteDither(rgba, palette, width, amount = 6) {
  if (!Number.isFinite(width) || width <= 0) return applyPalette(rgba, palette);
  const out = new Uint8Array(rgba.length / 4);
  const cache = new Int16Array(65536);
  cache.fill(-1);
  const amp = Math.max(0, Math.min(18, Number(amount) || 0));
  for (let p = 0, i = 0; p < rgba.length; p += 4, i++) {
    const x = i % width;
    const y = (i / width) | 0;
    const threshold = (BAYER8[(y & 7) * 8 + (x & 7)] - 31.5) / 31.5;
    const delta = threshold * amp;
    const r = Math.max(0, Math.min(255, Math.round(rgba[p] + delta)));
    const g = Math.max(0, Math.min(255, Math.round(rgba[p + 1] + delta)));
    const b = Math.max(0, Math.min(255, Math.round(rgba[p + 2] + delta)));
    const key = ((r >> 3) << 11) | ((g >> 2) << 5) | (b >> 3);
    let idx = cache[key];
    if (idx < 0) {
      let best = 0, dist = Infinity;
      for (let j = 0; j < palette.length; j++) {
        const c = palette[j], dr = r - c[0], dg = g - c[1], db = b - c[2];
        // Perceptual-ish RGB weighting. Green error is most visible, then red.
        const d = dr * dr * 2 + dg * dg * 4 + db * db;
        if (d < dist) { dist = d; best = j; if (!d) break; }
      }
      idx = best;
      cache[key] = idx;
    }
    out[i] = idx;
  }
  return out;
}
