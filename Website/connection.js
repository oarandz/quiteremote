/* Shared by the venue and the GitHub Pages operator. */
window.QuizRemoteConnection = (() => {
  const config = QUIZ_REMOTE_CONFIG;
  function client(accessToken) {
    return supabase.createClient(config.url, config.key, accessToken
      ? {accessToken, auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}}
      : {auth:{storageKey:'woodsman-remote-auth',persistSession:false,detectSessionInUrl:false}});
  }
  async function user(token) {
    const response = await fetch(config.url + '/auth/v1/user', {headers:{apikey:config.key,Authorization:'Bearer '+token},signal:AbortSignal.timeout(10000)});
    if (!response.ok) throw new Error('Please sign in again using your quiz host account.');
    return response.json();
  }
  function channel(db, owner, id, receive, status) {
    const ch = db.channel('quiz-control:'+owner+':'+id,{config:{private:true,broadcast:{ack:true,self:false}}});
    const parts=new Map();
    ch.on('broadcast',{event:'operator'},({payload})=>{
      if(payload?.protocol!==config.protocol||payload.session!==id)return;
      if(payload.kind!=='chunk'){receive(payload);return;}
      for(const [key,item]of parts)if(Date.now()-item.at>15000)parts.delete(key);
      if(typeof payload.id!=='string'||typeof payload.text!=='string'||payload.text.length>48000||!Number.isInteger(payload.index)||!Number.isInteger(payload.count)||payload.count<1||payload.count>180||payload.index<0||payload.index>=payload.count)return;
      if(!parts.has(payload.id)){if(parts.size>=3)parts.delete(parts.keys().next().value);parts.set(payload.id,{at:Date.now(),count:payload.count,pieces:new Map()});}
      const item=parts.get(payload.id);if(item.count!==payload.count)return;item.pieces.set(payload.index,payload.text);
      if(item.pieces.size===item.count){
        parts.delete(payload.id);
        try{const message=JSON.parse(Array.from({length:item.count},(_,i)=>item.pieces.get(i)).join(''));if(message.kind==='state'&&message.protocol===config.protocol&&message.session===id)receive(message);}catch(_){}
      }
    });
    ch.subscribe(status);
    return ch;
  }
  async function send(ch, session, packet) {
    // Never use the SDK's HTTP fallback to queue commands while disconnected.
    if (!ch || ch.state !== 'joined') throw new Error('Connection lost. Wait for the venue to reconnect.');
    const message={...packet,protocol:config.protocol,session};
    const json=JSON.stringify(message);
    const chunks=packet.kind==='state'&&json.length>48000;
    if(json.length>8640000)throw new Error('This operator view is too large to send.');
    const id=chunks?crypto.randomUUID():null,count=Math.ceil(json.length/48000);
    for(let i=0;i<(chunks?count:1);i++){
      if(ch.state!=='joined')throw new Error('Connection lost while updating the operator view.');
      const payload=chunks?{kind:'chunk',id,index:i,count,text:json.slice(i*48000,(i+1)*48000),protocol:config.protocol,session}:message;
      const result=await ch.send({type:'broadcast',event:'operator',payload});
      if(result!=='ok')throw new Error('Delivery was not confirmed. Check the current screen before trying again.');
    }
  }
  function explain(error) {
    if (/quiz_remote_sessions|schema cache|42P01|PGRST|42501/.test(error?.message||'')) return 'Remote access needs the supplied Supabase setup.sql applied to this quiz project.';
    return error?.message || 'Could not connect. Check the internet connection and Supabase setup.';
  }
  return {client,user,channel,send,explain};
})();
