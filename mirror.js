window.QuizOperatorMirror = (() => {
  let doc=null,current=null,ready=false,canUse=false;
  const dirty=new Map(),commits=new Set();let changeTimer=null,actions=null;
  const timerBars=new Set(),bedBorders=new Set();
  function schedule(){
    clearTimeout(changeTimer);
    changeTimer=setTimeout(()=>{
      if(!canUse)return;
      for(const target of commits){
        commits.delete(target);if(!dirty.has(target))continue;
        actions.action('set',target,dirty.get(target),[]);break;
      }
    },180);
  }
  function safe(root){
    root.querySelectorAll('script,style,link,meta,base,iframe,object,embed,audio').forEach(el=>el.remove());
    root.querySelectorAll('*').forEach(el=>{
      for(const a of [...el.attributes]){
        if(/^on/i.test(a.name)||/^(srcset|action|formaction|autoplay|controls)$/i.test(a.name))el.removeAttribute(a.name);
        if(/^(href|xlink:href)$/i.test(a.name)&&!a.value.startsWith('#'))el.removeAttribute(a.name);
        if(a.name==='src'&&!/^(quiz-assets\/|data:image\/(png|jpe?g|webp|gif);)/i.test(a.value))el.removeAttribute('src');
      }
    });
  }
  function patch(parent,next){
    const byKey=new Map([...parent.children].map(el=>[el.dataset.mirrorKey,el]));
    let cursor=parent.firstChild;
    for(const incoming of [...next.childNodes]){
      const key=incoming.nodeType===1?incoming.dataset.mirrorKey:null;
      let node=key?byKey.get(key):cursor?.nodeType===incoming.nodeType?cursor:null;
      if(node&&node.nodeName!==incoming.nodeName)node=null;
      if(!node){node=doc.importNode(incoming,true);parent.insertBefore(node,cursor);}
      else {
        if(node!==cursor)parent.insertBefore(node,cursor);
        if(node.nodeType===3)node.data=incoming.data;
        else {
          for(const a of [...node.attributes])if(!incoming.hasAttribute(a.name))node.removeAttribute(a.name);
          for(const a of [...incoming.attributes])if(node.getAttribute(a.name)!==a.value)node.setAttribute(a.name,a.value);
          const editing=dirty.has(node.dataset.remoteControl)||(node===doc.activeElement&&node.matches('input:not([type=checkbox]),textarea,select'));
          if(!editing||!node.matches('input,textarea,select'))patch(node,incoming);
          if(node.matches('input,textarea,select')&&!editing){node.value=incoming.value;node.checked=incoming.checked;}
        }
      }
      cursor=node.nextSibling;
    }
    while(cursor){const next=cursor.nextSibling;cursor.remove();cursor=next;}
  }
  function init(frame,callbacks){
    actions=callbacks;
    frame.srcdoc='<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'self\' \'unsafe-inline\'; font-src \'self\'; img-src \'self\' data:; media-src \'self\'; script-src \'none\'; form-action \'none\'"><link rel="stylesheet" href="mirror.css"><link rel="stylesheet" href="quiz-assets/vendor/fonts.css"><style id="dynamic-style"></style><style>html{overflow:auto!important}body{margin:0}*{scrollbar-width:thin}input:disabled,button:disabled,select:disabled,textarea:disabled{cursor:not-allowed}[data-remote-control]{touch-action:manipulation}</style></head><body></body></html>';
    frame.addEventListener('load',()=>{
      doc=frame.contentDocument;ready=true;
      doc.addEventListener('submit',e=>e.preventDefault());
      doc.addEventListener('click',e=>{
        const el=e.target.closest('[data-remote-control]');
        if(!el)return;
        if(el.matches('input:not([type=checkbox]),textarea,select'))return;
        e.preventDefault();e.stopPropagation();if(!canUse)return;
        clearTimeout(changeTimer);commits.clear();const seek=el.dataset.remoteType==='seek',rect=el.getBoundingClientRect();
        callbacks.action(seek?'seek':'click',el.dataset.remoteControl,seek?Math.max(0,Math.min(1,(e.clientX-rect.left)/rect.width)):null,[...dirty].map(([target,value])=>({target,value})));
      },true);
      doc.addEventListener('input',e=>{
        const el=e.target;if(!el.matches('[data-remote-control]:not([type=checkbox])'))return;
        dirty.set(el.dataset.remoteControl,el.value);
        if(el.dataset.remoteLive==='true'){commits.add(el.dataset.remoteControl);schedule();}
      });
      doc.addEventListener('change',e=>{
        const el=e.target;if(!el.matches('[data-remote-control]:not([type=checkbox])'))return;
        dirty.set(el.dataset.remoteControl,el.value);commits.add(el.dataset.remoteControl);schedule();
      });
      doc.addEventListener('keydown',e=>callbacks.key(e));
      if(current)render(current);
    });
  }
  function render(view){
    current=view;if(!ready)return;
    const template=doc.createElement('template');template.innerHTML=view.html;safe(template.content);
    const available=new Set([...template.content.querySelectorAll('[data-remote-control]:not(:disabled)')].map(el=>el.dataset.remoteControl));
    for(const target of dirty.keys())if(!available.has(target)){dirty.delete(target);commits.delete(target);}
    patch(doc.body,template.content);doc.body.className=view.bodyClass||'';doc.documentElement.className=view.htmlClass||'';
    doc.body.style.overflow=view.bodyOverflow==='hidden'?'hidden':'';
    doc.getElementById('dynamic-style').textContent=view.css||'';
    for(const bar of timerBars){if(!bar.isConnected||!bar.closest('.qt-scene[data-timer-duration]')){QuizThemeProgress.stop(bar);timerBars.delete(bar);}}
    for(const el of doc.querySelectorAll('.qt-scene[data-timer-duration]')){
      const bar=el.querySelector('.qt-progress');if(!bar||el.hidden)continue;
      const running=el.dataset.timerRunning==='true';
      // Both stamps came from the venue: do not assume the laptop's clock agrees.
      const age=running?Math.max(0,Number(view.capturedAt)-Number(el.dataset.timerSampledAt))/1000:0;
      QuizThemeProgress.draw(bar,{duration:Number(el.dataset.timerDuration),elapsed:Number(el.dataset.timerElapsed)+(Number.isFinite(age)?age:0),running});timerBars.add(bar);
    }
    for(const track of bedBorders){if(!track.isConnected||!track.closest('.qt-scene[data-bed-elapsed]')){QuizThemeProgress.drawBed(track,null);bedBorders.delete(track);}}
    for(const el of doc.querySelectorAll('.qt-scene[data-bed-elapsed]')){
      const track=el.querySelector('.qt-track');if(!track||el.hidden)continue;
      const running=el.dataset.bedRunning==='true';
      const age=running?Math.max(0,Number(view.capturedAt)-Number(el.dataset.bedSampledAt))/1000:0;
      QuizThemeProgress.drawBed(track,{elapsed:Number(el.dataset.bedElapsed)+(Number.isFinite(age)?age:0),running});bedBorders.add(track);
    }
    for(const item of view.media||[]){
      const video=doc.querySelector('[data-mirror-key="'+CSS.escape(item.key)+'"]');if(!video||video.tagName!=='VIDEO')continue;
      video.muted=true;
      const seek=()=>{if(Number.isFinite(item.time)&&Math.abs(video.currentTime-item.time)>1.5)try{video.currentTime=item.time}catch(_){}};
      if(video.readyState)seek();else video.onloadedmetadata=seek;
      if(item.playing&&video.paused)video.play().catch(()=>{});else if(!item.playing)video.pause();
    }
  }
  function enable(value){const resumed=value&&!canUse;canUse=value;if(resumed&&commits.size)schedule();}
  function applied(command){
    const clean=(target,value)=>{if(dirty.get(target)===value){dirty.delete(target);commits.delete(target);}};
    if(command.action==='set')clean(command.target,command.value);
    for(const edit of command.edits||[])clean(edit.target,edit.value);
  }
  function reset(){current=null;dirty.clear();commits.clear();clearTimeout(changeTimer);for(const bar of timerBars)QuizThemeProgress.stop(bar);timerBars.clear();for(const track of bedBorders)QuizThemeProgress.drawBed(track,null);bedBorders.clear();if(doc)doc.body.replaceChildren();}
  return {init,render,enable,applied,reset};
})();
