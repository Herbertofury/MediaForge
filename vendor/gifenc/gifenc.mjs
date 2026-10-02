/*
 * Encoder core derived from gifenc by Matt DesLauriers (MIT).
 * https://github.com/mattdesl/gifenc
 * See THIRD_PARTY_NOTICES.md.
 */
const TRAILER = 0x3b;
const EOF_CODE = -1;
const BITS = 12;
const HSIZE = 5003;
const MASKS = [0x0000,0x0001,0x0003,0x0007,0x000f,0x001f,0x003f,0x007f,0x00ff,0x01ff,0x03ff,0x07ff,0x0fff,0x1fff,0x3fff,0x7fff,0xffff];

function stream(initialCapacity=4096){
  // Chunked output avoids repeatedly reallocating/copying one enormous
  // Uint8Array as long/high-resolution GIFs grow. Blob() can consume the
  // returned parts directly, while bytes() remains available for tests.
  const CHUNK_SIZE = 1024 * 1024;
  let chunks=[];
  let current=new Uint8Array(CHUNK_SIZE);
  let cursor=0,total=0;
  const ensure=(need)=>{
    if(current.length-cursor>=need)return;
    if(cursor){chunks.push(current.subarray(0,cursor));total+=cursor;}
    current=new Uint8Array(Math.max(CHUNK_SIZE,need));cursor=0;
  };
  const writeView=(data,off=0,len=data.byteLength ?? data.length)=>{
    if(!data?.subarray)data=Uint8Array.from(data||[]);
    let pos=off,left=len;
    while(left>0){
      if(cursor===current.length)ensure(1);
      const take=Math.min(left,current.length-cursor);
      current.set(data.subarray(pos,pos+take),cursor);
      cursor+=take;pos+=take;left-=take;
    }
  };
  return {
    reset(){chunks=[];current=new Uint8Array(CHUNK_SIZE);cursor=0;total=0;},
    byteLength(){return total+cursor;},
    parts(){return cursor?[...chunks,current.subarray(0,cursor)]:chunks.slice();},
    bytes(){const out=new Uint8Array(total+cursor);let at=0;for(const part of chunks){out.set(part,at);at+=part.length;}if(cursor)out.set(current.subarray(0,cursor),at);return out;},
    writeByte(b){ensure(1);current[cursor++]=b;},
    writeBytes(data,off=0,len=data.length){writeView(data,off,len);},
    writeView
  };
}
function u16(out,n){out.writeByte(n&255);out.writeByte((n>>8)&255);}
function text(out,s){for(let i=0;i<s.length;i++)out.writeByte(s.charCodeAt(i));}
function tableBits(len){return Math.max(Math.ceil(Math.log2(Math.max(2,len))),1);}
function colorTable(out,palette){const n=1<<tableBits(palette.length);for(let i=0;i<n;i++){const c=palette[i]||[0,0,0];out.writeByte(c[0]);out.writeByte(c[1]);out.writeByte(c[2]);}}

function lzw(width,height,pixels,colorDepth,out,accum,htab,codetab){
  const hsize=htab.length, initCodeSize=Math.max(2,colorDepth);
  accum.fill(0);codetab.fill(0);htab.fill(-1);
  let curAccum=0,curBits=0,clearFlag=false,nBits=initCodeSize+1,maxCode=(1<<nBits)-1;
  const clearCode=1<<initCodeSize, eofCode=clearCode+1; let freeEnt=clearCode+2,aCount=0,ent=pixels[0]||0;
  let hshift=0; for(let f=hsize;f<65536;f*=2)++hshift; hshift=8-hshift;
  out.writeByte(initCodeSize); output(clearCode);
  for(let idx=1;idx<pixels.length;idx++){
    const c=pixels[idx],fcode=(c<<BITS)+ent; let i=(c<<hshift)^ent;
    if(htab[i]===fcode){ent=codetab[i];continue;}
    const disp=i===0?1:hsize-i; let found=false;
    while(htab[i]>=0){i-=disp;if(i<0)i+=hsize;if(htab[i]===fcode){ent=codetab[i];found=true;break;}}
    if(found)continue;
    output(ent);ent=c;
    if(freeEnt<(1<<BITS)){codetab[i]=freeEnt++;htab[i]=fcode;}
    else{htab.fill(-1);freeEnt=clearCode+2;clearFlag=true;output(clearCode);}
  }
  output(ent);output(eofCode);out.writeByte(0);

  function output(code){
    curAccum&=MASKS[curBits];curAccum=curBits>0?(curAccum|(code<<curBits)):code;curBits+=nBits;
    while(curBits>=8){accum[aCount++]=curAccum&255;if(aCount>=254){out.writeByte(aCount);out.writeView(accum,0,aCount);aCount=0;}curAccum>>=8;curBits-=8;}
    if(freeEnt>maxCode||clearFlag){if(clearFlag){nBits=initCodeSize+1;maxCode=(1<<nBits)-1;clearFlag=false;}else{++nBits;maxCode=nBits===BITS?1<<nBits:(1<<nBits)-1;}}
    if(code===eofCode){while(curBits>0){accum[aCount++]=curAccum&255;if(aCount>=254){out.writeByte(aCount);out.writeView(accum,0,aCount);aCount=0;}curAccum>>=8;curBits-=8;}if(aCount>0){out.writeByte(aCount);out.writeView(accum,0,aCount);}}
  }
}

export function GIFEncoder(){
  const out=stream(),accum=new Uint8Array(256),htab=new Int32Array(HSIZE),codetab=new Int32Array(HSIZE);let initialized=false;
  return {
    reset(){out.reset();initialized=false;},
    finish(){out.writeByte(TRAILER);},
    bytes(){return out.bytes();},
    parts(){return out.parts();},
    byteLength(){return out.byteLength();},
    writeFrame(index,width,height,opts={}){
      const palette=opts.palette; if(!palette||!palette.length)throw new Error('palette required');
      const first=!initialized; if(first){text(out,'GIF89a');initialized=true;}
      const colorDepth=opts.colorDepth||8;
      if(first){
        const fields=(1<<7)|((colorDepth-1)<<4)|(tableBits(palette.length)-1);u16(out,width);u16(out,height);out.writeBytes([fields,0,0]);colorTable(out,palette);
        const repeat=opts.repeat??0;if(repeat>=0){out.writeBytes([0x21,0xff,11]);text(out,'NETSCAPE2.0');out.writeBytes([3,1]);u16(out,repeat);out.writeByte(0);}
      }
      const delay=Math.round((opts.delay||0)/10);out.writeBytes([0x21,0xf9,4]);out.writeByte(0);u16(out,delay);out.writeBytes([0,0]);
      out.writeByte(0x2c);u16(out,0);u16(out,0);u16(out,width);u16(out,height);
      if(first)out.writeByte(0);else{out.writeByte(0x80|(tableBits(palette.length)-1));colorTable(out,palette);}
      lzw(width,height,index,colorDepth,out,accum,htab,codetab);
    }
  };
}
