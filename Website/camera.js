(() => {
  const $=id=>document.getElementById(id), params=new URLSearchParams(location.hash.slice(1));
  const venue=params.get('venue'),owner=params.get('owner'),key=params.get('key'),client=QuizCameraWire.uuid();
  const uuid=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
  const valid=uuid(venue)&&uuid(owner)&&uuid(key),db=QuizRemoteConnection.client();
  let identity=null,channel=null,peer=null,capture=null,call=null,generation=0,working=false;
  let displayPeer=null,displayCall=null,connectionConfig=null;
  let ping=null,deadline=null,lastVenue=0,joined=false,facing='environment',wake=null,active=false;
  function status(message){$('camera-status').textContent=message;}
  function badge(text,onAir=false){$('camera-air').textContent=text;$('camera-air').dataset.air=String(onAir);}
  function controls(){ $('camera-start').disabled=working||active;$('camera-switch').disabled=working||!active;$('camera-stop').disabled=!working&&!active; }
  function send(packet){return QuizRemoteConnection.send(channel,venue,{...packet,client});}
  function releaseCapture(){
    for(const track of capture?.getTracks()||[])track.stop();capture=null;
    $('phone-preview').pause();$('phone-preview').srcObject=null;
    wake?.release().catch(()=>{});wake=null;
  }
  async function disconnect(message='Camera stopped.'){
    ++generation;clearInterval(ping);clearTimeout(deadline);ping=null;deadline=null;
    if(call)send({kind:'camera-stop',call}).catch(()=>{});
    displayPeer?.close();displayPeer=null;displayCall=null;connectionConfig=null;
    peer?.close();peer=null;releaseCapture();call=null;active=false;working=false;joined=false;lastVenue=0;
    const old=channel;channel=null;controls();badge('NOT CONNECTED');status(message);
    if(old)await db.removeChannel(old).catch(()=>{});
  }
  function explain(error){
    if(error?.name==='NotAllowedError')return 'Camera access was not allowed. Allow camera access in your browser’s site settings, then tap Connect camera.';
    if(error?.name==='NotFoundError')return 'No camera was found on this device.';
    if(error?.name==='NotReadableError')return 'The camera is in use by another app. Close that app and try again.';
    return error?.message||'The camera could not connect. Try the same Wi-Fi as the quiz computer.';
  }
  async function receive(packet,run){
    if(run!==generation||packet.session!==venue||packet.client!==client)return;
    if(packet.kind==='camera-reject'){await disconnect(packet.message||'The venue did not accept this camera.');return;}
    if(packet.kind==='camera-accept'){
      if(!capture||!uuid(packet.call)||call===packet.call)return;
      if(call)return;
      try{
        call=packet.call;lastVenue=Date.now();
        const config=QuizCameraWire.iceConfig(packet.config?.iceServers,packet.config?.iceTransportPolicy==='relay');connectionConfig=config;
        peer=QuizCameraWire.peer({config,send:signal=>send({kind:'camera-signal',call,signal}),
          onState:value=>{if(run!==generation)return;if(value==='connected'){active=true;working=false;controls();badge('PREVIEW ONLY');status('Connected. The operator can now preview your camera.');clearTimeout(deadline);}
            else if(['failed','closed'].includes(value))disconnect('Camera connection failed. Try the same Wi-Fi or ask the operator to configure a relay.');
            else if(value==='disconnected'){badge('RECONNECTING');status('Connection interrupted. The broadcast returns to its normal background.');}},
          onError:()=>{if(run===generation)disconnect('Camera connection failed. Tap Connect camera to try again.');}
        });
        $('camera-venue').textContent=(packet.label||'Venue computer')+' · '+(packet.mode==='LIVE'?'LIVE':'TEST');
        await peer.offer(capture,true);
      }catch(error){if(run===generation)await disconnect(explain(error));}
      return;
    }
    if(!call||packet.call!==call)return;
    if(packet.kind==='camera-display-request'){
      if(!capture||!connectionConfig||!uuid(packet.display)||packet.display===displayCall)return;
      displayPeer?.close();displayCall=packet.display;const bound=displayCall;
      const failed=()=>{if(run===generation&&displayCall===bound){send({kind:'camera-display-error',call,display:bound}).catch(()=>{});displayPeer?.close();displayPeer=null;displayCall=null;}};
      displayPeer=QuizCameraWire.peer({config:connectionConfig,
        send:signal=>send({kind:'camera-signal',call,display:bound,signal}),
        onState:value=>{if(['failed','disconnected','closed'].includes(value))failed();},onError:failed});
      try{await displayPeer.offer(capture);}catch(_){failed();}return;
    }
    if(packet.kind==='camera-display-stop'){
      if(packet.display===displayCall){displayPeer?.close();displayPeer=null;displayCall=null;}return;
    }
    if(packet.kind==='camera-signal'){if(packet.display){if(packet.display===displayCall)await displayPeer?.receive(packet.signal);}else await peer?.receive(packet.signal);return;}
    if(packet.kind==='camera-end'){await disconnect(packet.message||'The venue disconnected this camera. Scan a new code to reconnect.');return;}
    if(packet.kind==='camera-status'){
      lastVenue=Date.now();
      if(active){badge(packet.onAir?'ON BROADCAST':'PREVIEW ONLY',packet.onAir);status(packet.onAir?'Your camera is showing on the audience screen.':packet.ready?'Connected. The operator decides when to show the camera.':'Waiting for a fresh camera picture. Keep this page open.');}
    }
  }
  async function start(){
    if(working||active||!identity)return;
    const stopped=disconnect();working=true;controls();const run=generation;await stopped;if(run!==generation)return;
    status('Allow camera access when your browser asks.');
    try{
      if(!isSecureContext||!navigator.mediaDevices?.getUserMedia||!window.RTCPeerConnection)throw new Error('Open this page in an up-to-date phone browser using its HTTPS address.');
      const media=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:facing},width:{ideal:1280,max:1280},height:{ideal:720,max:720},frameRate:{ideal:24,max:30}}});
      if(run!==generation){media.getTracks().forEach(track=>track.stop());return;}
      capture=media;$('phone-preview').srcObject=media;await $('phone-preview').play();
      if(run!==generation)return;
      capture.getVideoTracks().forEach(track=>track.onended=()=>{if(run===generation)disconnect('Camera access ended. Tap Connect camera to try again.');});
      try{const lock=await navigator.wakeLock?.request('screen');if(run!==generation){lock?.release();return;}wake=lock;}catch(_){}
      const {data,error}=await db.auth.getSession();if(error||!data.session)throw new Error('Please sign in again.');
      await db.realtime.setAuth(data.session.access_token);if(run!==generation)return;
      status('Connecting to your venue…');badge('CONNECTING');
      channel=QuizRemoteConnection.channel(db,owner,venue,packet=>receive(packet,run),state=>{
        if(run!==generation)return;
        joined=state==='SUBSCRIBED';
        if(joined)send({kind:'camera-join',key}).catch(()=>disconnect('Cannot reach the venue. Check remote access and scan a fresh phone code.'));
        else if(['CHANNEL_ERROR','TIMED_OUT','CLOSED'].includes(state))disconnect('Venue connection lost. Check remote access, then connect again.');
      });
      deadline=setTimeout(()=>{if(run===generation)disconnect('No camera connection yet. Check the same host login, remote access and Wi-Fi. Some networks need a relay.');},25000);
      ping=setInterval(()=>{
        if(run!==generation||!joined)return;
        if(call){if(lastVenue&&Date.now()-lastVenue>8000){disconnect('Venue connection lost. Tap Connect camera to try again.');return;}send({kind:'camera-ping',call}).catch(()=>{});}
        else send({kind:'camera-join',key}).catch(()=>{});
      },2000);
    }catch(error){if(run===generation)await disconnect(explain(error));}
  }
  $('camera-login-form').onsubmit=async event=>{
    event.preventDefault();$('camera-login-button').disabled=true;$('camera-login-status').textContent='Signing in…';
    try{
      const {data,error}=await db.auth.signInWithPassword({email:$('camera-email').value.trim(),password:$('camera-password').value});if(error)throw error;
      $('camera-password').value='';
      if(data.user?.id!==owner){await db.auth.signOut();throw new Error('Use the same quiz host account as the venue that created this code.');}
      identity=data.user;$('camera-login').hidden=true;$('camera-workspace').hidden=false;$('camera-logout').hidden=false;status('Tap Connect camera and allow camera access.');
    }catch(error){$('camera-login-status').textContent=explain(error);}finally{$('camera-login-button').disabled=false;}
  };
  $('camera-start').onclick=start;$('camera-stop').onclick=()=>disconnect();
  $('camera-switch').onclick=async()=>{if(working)return;facing=facing==='environment'?'user':'environment';await disconnect('Switching camera…');await start();};
  $('camera-logout').onclick=async()=>{await disconnect();identity=null;await db.auth.signOut();$('camera-workspace').hidden=true;$('camera-login').hidden=false;$('camera-logout').hidden=true;$('camera-login-status').textContent='Signed out.';};
  db.auth.onAuthStateChange((event,session)=>{
    if(event==='TOKEN_REFRESHED'&&session)db.realtime.setAuth(session.access_token).catch(()=>{});
    if(event==='SIGNED_OUT'&&identity){identity=null;disconnect('Signed out. Sign in again to use the camera.');$('camera-workspace').hidden=true;$('camera-login').hidden=false;$('camera-logout').hidden=true;}
  });
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&(active||working))disconnect('Camera paused because you left this page. Tap Connect camera when you are ready.');});
  window.addEventListener('pagehide',()=>disconnect());
  // Scanning a replacement QR can navigate the existing tab by fragment only.
  // Release the old capture, then initialise against the new session/link.
  window.addEventListener('hashchange',()=>{disconnect('Opening the new phone link…');location.reload();});
  $('camera-link-help').hidden=valid;$('camera-login').hidden=!valid;controls();
})();
