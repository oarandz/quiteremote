window.QuizOperatorMirror = (() => {
  let doc=null,current=null,ready=false,canUse=false;
  const dirty=new Map();let changeTimer=null;
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
    frame.srcdoc='<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'self\' \'unsafe-inline\'; font-src \'self\'; img-src \'self\' data:; media-src \'self\'; script-src \'none\'; form-action \'none\'"><link rel="stylesheet" href="mirror.css"><link rel="stylesheet" href="quiz-assets/vendor/fonts.css"><style id="dynamic-style"></style><style>html{overflow:auto!important}body{margin:0}*{scrollbar-width:thin}input:disabled,button:disabled,select:disabled,textarea:disabled{cursor:not-allowed}[data-remote-control]{touch-action:manipulation}</style></head><body></body></html>';
    frame.addEventListener('load',()=>{
      doc=frame.contentDocument;ready=true;
      doc.addEventListener('submit',e=>e.preventDefault());
      doc.addEventListener('click',e=>{
        const el=e.target.closest('[data-remote-control]');
        if(!el)return;
        if(el.matches('input:not([type=checkbox]),textarea,select'))return;
        e.preventDefault();e.stopPropagation();if(!canUse)return;
        clearTimeout(changeTimer);const seek=el.dataset.remoteType==='seek',rect=el.getBoundingClientRect();
        callbacks.action(seek?'seek':'click',el.dataset.remoteControl,seek?Math.max(0,Math.min(1,(e.clientX-rect.left)/rect.width)):null,[...dirty].map(([target,value])=>({target,value})));
      },true);
      doc.addEventListener('input',e=>{if(e.target.matches('[data-remote-control]:not([type=checkbox])'))dirty.set(e.target.dataset.remoteControl,e.target.value);});
      doc.addEventListener('change',e=>{
        const el=e.target;if(!el.matches('[data-remote-control]:not([type=checkbox])'))return;
        dirty.set(el.dataset.remoteControl,el.value);clearTimeout(changeTimer);
        changeTimer=setTimeout(()=>{if(canUse)callbacks.action('set',el.dataset.remoteControl,el.value,[])},150);
      });
      doc.addEventListener('keydown',e=>callbacks.key(e));
      if(current)render(current);
    });
  }
  function render(view){
    current=view;if(!ready)return;
    const template=doc.createElement('template');template.innerHTML=view.html;safe(template.content);
    patch(doc.body,template.content);doc.body.className=view.bodyClass||'';doc.documentElement.className=view.htmlClass||'';
    doc.getElementById('dynamic-style').textContent=view.css||'';
    for(const item of view.media||[]){
      const video=doc.querySelector('[data-mirror-key="'+CSS.escape(item.key)+'"]');if(!video||video.tagName!=='VIDEO')continue;
      video.muted=true;
      const seek=()=>{if(Number.isFinite(item.time)&&Math.abs(video.currentTime-item.time)>1.5)try{video.currentTime=item.time}catch(_){}};
      if(video.readyState)seek();else video.onloadedmetadata=seek;
      if(item.playing&&video.paused)video.play().catch(()=>{});else if(!item.playing)video.pause();
    }
  }
  function enable(value){canUse=value;}
  function applied(command){
    if(command.action==='set')dirty.delete(command.target);
    for(const edit of command.edits||[])dirty.delete(edit.target);
  }
  function reset(){current=null;dirty.clear();clearTimeout(changeTimer);if(doc)doc.body.replaceChildren();}
  return {init,render,enable,applied,reset};
})();
