const test = require('node:test');
const assert = require('node:assert/strict');
global.window = global;
require('../portrait-crop.js');
const {frame, fit, ratio} = PortraitCrop;

function valid(b, w, h) {
  assert(b.every(Number.isFinite));
  assert(b[0]>=0 && b[1]>=0 && b[2]<=1+1e-12 && b[3]<=1+1e-12);
  assert(b[2]>b[0] && b[3]>b[1]);
  assert(Math.abs((b[2]-b[0])*w/((b[3]-b[1])*h)-ratio)<1e-9);
}
test('portrait stays 4:5 in pixels at every edge, for landscape and portrait sources',()=>{
  for(const [w,h] of [[1040,725],[725,1040],[1200,400],[400,1200]])
    for(const [x,y] of [[0,0],[1,1],[-.3,.5],[1.2,0],[.5,.5]])
      for(const size of [.01,.5,1,2]) valid(frame(x,y,size,w,h),w,h);
});
test('legacy and missing crops become valid frames without mutating the original coordinates',()=>{
  for(const original of [[.669,.174,.998,.725],[.005,.2,.333,.915],[0,0,1,1],null,[1,1,0,0]]) {
    const before=JSON.stringify(original);
    valid(fit(original,1040,725),1040,725);
    assert.equal(JSON.stringify(original),before);
  }
});
test('valid fixed crop survives save and reloading without a framing shift',()=>{
  const original=frame(.7,.4,.56,1040,725);
  const after=fit(JSON.parse(JSON.stringify(original)),1040,725);
  original.forEach((v,i)=>assert(Math.abs(v-after[i])<1e-12));
});
