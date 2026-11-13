/* Fixed portrait framing; stored coordinates retain the existing normalized format. */
window.PortraitCrop = (() => {
  const ratio = 4 / 5;
  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
  function frame(cx, cy, scale, width, height) {
    const pixels = Math.min(width, height * ratio) * clamp(scale, .1, 1);
    const w = pixels / width, h = pixels / ratio / height;
    const x = clamp(cx - w / 2, 0, 1 - w), y = clamp(cy - h / 2, 0, 1 - h);
    return [x, y, x + w, y + h];
  }
  function fit(box, width, height) {
    const valid = Array.isArray(box) && box.length === 4 && box.every(Number.isFinite)
      && box[2] > box[0] && box[3] > box[1];
    const b = valid ? box : [0, 0, 1, 1];
    return frame((b[0] + b[2]) / 2, (b[1] + b[3]) / 2,
      (b[2] - b[0]) * width / Math.min(width, height * ratio), width, height);
  }
  function mount(root, onChange) {
    const image = root.querySelector('#front'), stage = root.querySelector('.crop-stage');
    const outline = root.querySelector('.crop-outline'), preview = root.querySelector('#portrait');
    const slider = root.querySelector('#crop-size'), output = root.querySelector('#crop-size-value');
    const readout = root.querySelector('.crop-position'), hint = root.querySelector('.crop-feedback');
    const reset = root.querySelector('#crop-reset'), enlarge = root.querySelector('#crop-enlarge');
    const dialog = document.querySelector('#crop-dialog'), home = root.parentNode;
    let box = null, original = null, drag = null, generation = 0, ready = false;
    const scale = () => (box[2] - box[0]) * image.naturalWidth / Math.min(image.naturalWidth, image.naturalHeight * ratio);
    function paint(changed = false) {
      if (!ready) return;
      const [l, t, r, b] = box;
      outline.hidden = false;
      Object.assign(outline.style, {left: l * 100 + '%', top: t * 100 + '%', width: (r-l)*100+'%', height:(b-t)*100+'%'});
      preview.getContext('2d').drawImage(image, l*image.naturalWidth, t*image.naturalHeight,
        (r-l)*image.naturalWidth, (b-t)*image.naturalHeight, 0, 0, preview.width, preview.height);
      slider.value = String(scale() * 100);
      output.value = Math.round(scale() * 100) + '%';
      readout.textContent = '中心 ' + Math.round((l+r)*50) + '% / ' + Math.round((t+b)*50) + '%';
      if (changed) {
        onChange([...box]);
        hint.textContent = '裁剪已调整，保存单位后生效。';
      }
    }
    function point(e) {
      const r = stage.getBoundingClientRect();
      return [(e.clientX-r.left)/r.width, (e.clientY-r.top)/r.height];
    }
    function move(cx, cy, size = scale()) {
      box = frame(cx, cy, size, image.naturalWidth, image.naturalHeight);
      paint(true);
    }
    stage.addEventListener('pointerdown', e => {
      if (!ready || (e.pointerType === 'mouse' && e.button !== 0)) return;
      e.preventDefault(); stage.focus({preventScroll:true});
      const [x, y] = point(e), [l,t,r,b] = box;
      const inside = x >= l && x <= r && y >= t && y <= b;
      drag = {id:e.pointerId, startX:e.clientX, startY:e.clientY, moved:false,
        dx:inside ? (l+r)/2-x : 0, dy:inside ? (t+b)/2-y : 0};
      stage.setPointerCapture(e.pointerId);
      if (!inside) move(x, y);
    });
    stage.addEventListener('pointermove', e => {
      if (!drag || drag.id !== e.pointerId) return;
      if (Math.hypot(e.clientX-drag.startX,e.clientY-drag.startY) > 3) drag.moved = true;
      if (!drag.moved) return;
      const [x,y] = point(e); move(x+drag.dx, y+drag.dy);
    });
    const finish = e => {
      if (drag?.id !== e.pointerId) return;
      // A click inside the frame also places its centre at the clicked point.
      if (e.type === 'pointerup' && !drag.moved) {const [x,y]=point(e);move(x,y);}
      drag = null;
      if (stage.hasPointerCapture(e.pointerId)) stage.releasePointerCapture(e.pointerId);
    };
    stage.addEventListener('pointerup', finish);
    stage.addEventListener('pointercancel', finish);
    stage.addEventListener('lostpointercapture', () => {drag=null;});
    stage.addEventListener('keydown', e => {
      if (!ready || !['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)) return;
      e.preventDefault();
      const step = e.shiftKey ? 10 : 1;
      move((box[0]+box[2])/2 + (e.key==='ArrowLeft' ? -step : e.key==='ArrowRight' ? step : 0)/image.naturalWidth,
        (box[1]+box[3])/2 + (e.key==='ArrowUp' ? -step : e.key==='ArrowDown' ? step : 0)/image.naturalHeight);
    });
    slider.addEventListener('input', () => {if (ready) move((box[0]+box[2])/2, (box[1]+box[3])/2, Number(slider.value)/100);});
    reset.addEventListener('click', () => {if (ready) {box=[...original];paint(true);}});
    enlarge.addEventListener('click', () => {dialog.append(root); dialog.showModal(); stage.focus();});
    dialog.querySelector('.crop-dialog-close').addEventListener('click', () => dialog.close());
    dialog.addEventListener('close', () => {home.prepend(root);enlarge.focus();});
    function load(src, savedBox) {
      const request = ++generation;
      ready = false; box = null; drag = null; outline.hidden = true;
      slider.disabled = reset.disabled = enlarge.disabled = true;
      stage.setAttribute('aria-disabled', 'true');
      preview.getContext('2d').clearRect(0,0,preview.width,preview.height);
      hint.textContent = src ? '点击原图定位，或拖动选框；方向键可微调。调整后保存生效。' : '上传卡图后即可设置缩略图。';
      readout.textContent = ''; output.value = '';
      image.onload = () => {
        if (request !== generation) return;
        ready = true; box = fit(savedBox, image.naturalWidth, image.naturalHeight); original = [...box];
        slider.disabled = reset.disabled = enlarge.disabled = false;
        stage.setAttribute('aria-disabled','false'); paint();
      };
      image.onerror = () => {if(request===generation)hint.textContent='卡图无法载入，请检查图片或重新上传。';};
      if (src) image.src = src; else image.removeAttribute('src');
    }
    return {load};
  }
  return {ratio, frame, fit, mount};
})();
