(() => {
  const $=id=>document.getElementById(id), db=QuizRemoteConnection.client(), client=crypto.randomUUID();
  let identity=null, channel=null, session=null, frame=null, received=0, pending=null, connectionRun=0, joined=false;
  let refreshTimer=null, helloTimer=null,awaitRevision=0;
  const notice=(text,error=false)=>{$('status').textContent=text;$('status').classList.toggle('error',error);$('mirror-notice').textContent=text;$('mirror-notice').hidden=!error;};
  const fresh=()=>joined&&frame&&Date.now()-received<6000;
  const owns=()=>fresh()&&frame.lease===client;
  function status() {
    const connected=fresh(), available=owns()&&!pending&&frame.revision>=awaitRevision;
    $('connection').textContent=connected?(frame.lease===client?'Connected · you have control':'Connected · viewing'):(session?'Connection lost or waiting for venue':'Choose a quiz');
    $('connection').classList.toggle('online',connected);
    $('advance').disabled=!available||!frame.advance||frame.fading;
    $('stop').disabled=!available;
    $('switch-mode').disabled=!available;
    $('take-control').disabled=!connected||!!pending||frame.lease===client;
    QuizOperatorMirror.enable(available);
    $('mirror-blocker').hidden=available;
    $('mirror-blocker').textContent=pending?'Waiting for the venue…':owns()&&frame.revision<awaitRevision?'Updating controls…':connected?'Click Take control to use this operator window.':'Waiting for the venue connection…';
    if(!connected){$('mode').textContent='NOT CONNECTED';$('mode').className='pill';}
    else {$('mode').textContent=frame.mode;$('mode').className='pill '+frame.mode.toLowerCase();}
  }
  function confirmAction(message) {
    $('confirm-message').textContent=message;$('confirm-dialog').showModal();
    return new Promise(resolve=>{
      $('confirm-yes').onclick=()=>{$('confirm-dialog').close();resolve(true)};
      $('confirm-no').onclick=()=>{$('confirm-dialog').close();resolve(false)};
      $('confirm-dialog').oncancel=()=>resolve(false);
    });
  }
  async function send(packet){return QuizRemoteConnection.send(channel,session,{...packet,client});}
  async function command(action,target,value,confirmed=false,edits=[]) {
    if(!owns()||pending||frame.revision<awaitRevision){notice('Wait for the updated controls and take control first.',true);return;}
    const packet={kind:'command',id:crypto.randomUUID(),action,target,value,confirmed,edits,nonce:frame.nonce,revision:frame.revision};
    const timeout=setTimeout(()=>{
      if(pending?.id!==packet.id)return;
      pending=null;notice('The venue has not confirmed this action. Check the current screen before trying again.',true);status();
    },7000);
    pending={...packet,timeout};status();notice('Waiting for the venue…');
    try{await send(packet);}catch(e){
      if(pending?.id===packet.id){clearTimeout(timeout);pending=null;notice(e.message,true);status();}
    }
  }
  async function receive(packet) {
    if(packet.session!==session)return;
    if(packet.kind==='heartbeat'){
      if(frame&&frame.revision===packet.revision){frame.nonce=packet.nonce;frame.lease=packet.lease;received=Date.now();status();}
      else send({kind:'hello'}).catch(()=>{});
      return;
    }
    if(packet.kind==='state'){
      if(!Array.isArray(packet.groups)||!Array.isArray(packet.screens))return;
      if(frame&&packet.revision<frame.revision)return;
      frame=packet;received=Date.now();render();status();return;
    }
    if(packet.kind==='ack'&&packet.client===client&&packet.id===pending?.id){
      const previous=pending;clearTimeout(previous.timeout);pending=null;
      if(Number.isInteger(packet.revision))awaitRevision=Math.max(awaitRevision,packet.revision);
      notice(packet.message,packet.status==='rejected');if(packet.status==='done')QuizOperatorMirror.applied(previous);status();
      if(packet.status==='confirm'&&await confirmAction(packet.message)){
        // Read a fresh frame before resubmitting an explicitly confirmed action.
        await send({kind:'hello'}).catch(()=>{});
        const start=Date.now();while(received<start&&Date.now()-start<2000)await new Promise(r=>setTimeout(r,50));
        command(previous.action,previous.target,previous.value,true,previous.edits);
      }
    }
  }
  function sizeMirror(){
    if(!frame?.mirror)return;
    const view=frame.mirror,mode=$('mirror-scale').value,full=!!document.fullscreenElement;
    const width=$('mirror-shell').clientWidth,height=Math.max(220,innerHeight-Math.max(0,$('mirror-shell').getBoundingClientRect().top)-12);
    const scale=full||mode==='fit'?Math.min(1,width/view.width,height/view.height):mode==='width'?Math.min(1,width/view.width):1;
    const window=$('operator-frame');window.style.width=view.width+'px';window.style.height=view.height+'px';window.style.transform='scale('+scale+')';
    $('mirror-size').style.width=(view.width*scale)+'px';$('mirror-size').style.height=(view.height*scale)+'px';
  }
  function render(){
    $('version').textContent=frame.version||'';
    $('playing').textContent=(frame.playing?'Playing: ':'Track: ')+(frame.track||'None');
    $('switch-mode').textContent=frame.mode==='TEST'?'Switch to LIVE':'Switch to TEST';
    $('audience').textContent=frame.audience?'Audience connected':'Audience not connected';
    if(frame.mirror){QuizOperatorMirror.render(frame.mirror);sizeMirror();}
  }
  async function list() {
    if(!identity)return;
    const {data,error}=await db.rpc('quiz_remote_list_sessions');
    if(error){notice(QuizRemoteConnection.explain(error),true);return;}
    const value=$('sessions').value;
    $('sessions').replaceChildren(new Option('Choose a running quiz…',''),...(data||[]).map(s=>new Option(s.label+' · '+s.mode+' · '+s.id.slice(0,6),s.id)));
    if([...$('sessions').options].some(o=>o.value===value))$('sessions').value=value;
    if(!data?.length)$('session-help').textContent='No venue found. Sign in to the venue app with this same account and enable remote access.';
    else $('session-help').textContent='Choose the computer connected to your quiz screens and speakers.';
  }
  async function disconnect() {
    ++connectionRun;joined=false;clearInterval(helloTimer);
    if(pending)clearTimeout(pending.timeout);pending=null;
    const old=channel;channel=null;session=null;frame=null;received=0;awaitRevision=0;
    if(old)await db.removeChannel(old);
    QuizOperatorMirror.reset();status();
  }
  async function connect() {
    const chosen=$('sessions').value;if(!chosen){notice('Choose a running quiz first.',true);return;}
    await disconnect();session=chosen;const run=connectionRun;
    notice('Connecting to the venue…');
    channel=QuizRemoteConnection.channel(db,identity.id,session,receive,async state=>{
      if(run!==connectionRun)return;
      joined=state==='SUBSCRIBED';status();
      if(joined){await send({kind:'claim'}).catch(()=>{});await send({kind:'hello'}).catch(()=>{});notice('Connected. Controls will appear when the venue responds.');}
      else {received=0;notice('Connection interrupted. Commands are paused until the venue responds.',true);}
    });
    helloTimer=setInterval(()=>{if(joined)send({kind:'hello'}).catch(()=>{});},2500);
  }
  $('login-form').onsubmit=async event=>{
    event.preventDefault();$('login-button').disabled=true;$('login-status').textContent='Signing in…';
    try{
      const {data,error}=await db.auth.signInWithPassword({email:$('email').value.trim(),password:$('password').value});
      if(error)throw error;identity=data.user;$('password').value='';
      $('login').hidden=true;$('workspace').hidden=false;$('logout').hidden=false;$('login-status').textContent='';
      await list();refreshTimer=setInterval(list,7000);
    }catch(e){$('login-status').textContent=QuizRemoteConnection.explain(e);}
    finally{$('login-button').disabled=false;}
  };
  db.auth.onAuthStateChange((event,auth)=>{if(event==='SIGNED_OUT'&&identity){setTimeout(async()=>{identity=null;clearInterval(refreshTimer);await disconnect();$('login').hidden=false;$('workspace').hidden=true;$('logout').hidden=true;},0);}});
  $('logout').onclick=async()=>{clearInterval(refreshTimer);await disconnect();await db.auth.signOut({scope:'local'});identity=null;$('login').hidden=false;$('workspace').hidden=true;$('logout').hidden=true;};
  $('refresh').onclick=list;$('connect').onclick=connect;
  $('advance').onclick=()=>command('advance');$('stop').onclick=()=>command('stop');
  $('take-control').onclick=async()=>{if(await confirmAction('Take control of this quiz on this computer? Any other remote operator will switch to viewing.'))send({kind:'claim',takeover:true}).catch(e=>notice(e.message,true));};
  $('switch-mode').onclick=async()=>{const value=frame.mode==='TEST'?'LIVE':'TEST';if(await confirmAction(value==='LIVE'?'Switch to LIVE? Public phones will follow the quiz.':'Switch to TEST? Public phones will stop following this quiz.'))command('mode',null,value);};
  function key(event){
    if(event.target.closest('#quiz-appearance-settings'))return;
    if(event.shiftKey||event.ctrlKey||event.metaKey||event.target.closest('input,textarea,select,[contenteditable]:not([contenteditable="false"])')||$('confirm-dialog').open||$('workspace').hidden)return;
    if(!event.altKey&&frame?.keys?.includes(event.code)){event.preventDefault();if(!event.repeat&&owns()&&!pending)command('key',null,event.code);return;}
    if(!(event.code==='Tab'&&!event.altKey)&&!(event.code==='ArrowRight'&&event.altKey))return;
    if(!fresh())return;event.preventDefault();if(!event.repeat&&!$('advance').disabled)command('advance');
  }
  document.addEventListener('keydown',key);
  QuizOperatorMirror.init($('operator-frame'),{action:(a,t,v,edits)=>command(a,t,v,false,edits),key});
  $('mirror-fullscreen').onclick=()=>{$('mirror-shell').requestFullscreen?.().catch(()=>notice('Full screen is unavailable in this browser.',true))};
  document.addEventListener('fullscreenchange',sizeMirror);
  $('mirror-scale').onchange=sizeMirror;window.addEventListener('resize',sizeMirror);
  setInterval(status,500);
})();
