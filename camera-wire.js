// Only connection descriptions and ICE candidates use Supabase. Video remains
// WebRTC video, with no recording, uploads or microphone track.
window.QuizCameraWire = (() => {
  function uuid() {
    if (crypto.randomUUID) return crypto.randomUUID();
    const bytes=crypto.getRandomValues(new Uint8Array(16));bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;
    const h=[...bytes].map(b=>b.toString(16).padStart(2,'0')).join('');return [h.slice(0,8),h.slice(8,12),h.slice(12,16),h.slice(16,20),h.slice(20)].join('-');
  }
  const defaults = [{urls:'stun:stun.l.google.com:19302'}];
  function iceConfig(servers = defaults, relayOnly = false) {
    if (!Array.isArray(servers) || servers.length > 6) throw new Error('Invalid camera connection settings.');
    const iceServers = servers.map(server => {
      const urls = Array.isArray(server.urls) ? server.urls : [server.urls];
      if (!urls.length || urls.length > 4 || urls.some(url => typeof url !== 'string' || url.length > 512 || !/^(stun|stuns|turn|turns):[^\s]+$/.test(url))) throw new Error('Enter a valid relay address.');
      const entry = {urls};
      for (const field of ['username','credential']) if (server[field] != null) {
        if (typeof server[field] !== 'string' || server[field].length > 512) throw new Error('Invalid relay login.');
        entry[field] = server[field];
      }
      return entry;
    });
    if (relayOnly && !iceServers.some(server => server.urls.some(url => /^turns?:/.test(url)))) throw new Error('Add a relay address before choosing relay only.');
    return {iceServers,iceTransportPolicy:relayOnly?'relay':'all'};
  }
  function peer({config,send,onStream=()=>{},onState=()=>{},onError=()=>{}}) {
    const pc = new RTCPeerConnection(config), stream = new MediaStream();
    let closed = false, queue = Promise.resolve(), candidates = [];
    const fail = e => {if (!closed) onError(e);};
    pc.onicecandidate = event => {if (!closed && event.candidate) Promise.resolve(send({candidate:event.candidate.toJSON()})).catch(fail);};
    pc.onconnectionstatechange = () => {if (!closed) onState(pc.connectionState);};
    pc.ontrack = event => {
      if (event.track.kind !== 'video') {event.track.stop();fail(new Error('Only video is allowed on the phone camera connection.'));return;}
      if (!stream.getTracks().some(track => track.id === event.track.id)) stream.addTrack(event.track);
      onStream(stream);
    };
    async function receive(signal) {
      queue = queue.then(async () => {
        if (closed || !signal || typeof signal !== 'object') return;
        if (signal.description) {
          const d = signal.description;
          if (!['offer','answer'].includes(d.type) || typeof d.sdp !== 'string' || d.sdp.length > 32000) throw new Error('Invalid camera connection response.');
          if (d.type === 'answer' && pc.signalingState !== 'have-local-offer') return;
          if (d.type === 'offer' && pc.signalingState !== 'stable') return;
          await pc.setRemoteDescription({type:d.type,sdp:d.sdp});
          for (const candidate of candidates) {if (closed) return;await pc.addIceCandidate(candidate);}
          candidates = [];
          if (d.type === 'offer' && !closed) {
            await pc.setLocalDescription(await pc.createAnswer());
            if (!closed) await send({description:pc.localDescription.toJSON()});
          }
        } else if (signal.candidate) {
          const c = signal.candidate;
          if (typeof c.candidate !== 'string' || c.candidate.length > 4096 || (c.sdpMid != null && (typeof c.sdpMid !== 'string' || c.sdpMid.length > 80)) || (c.sdpMLineIndex != null && (!Number.isInteger(c.sdpMLineIndex) || c.sdpMLineIndex < 0))) return;
          const candidate = {candidate:c.candidate,sdpMid:c.sdpMid,sdpMLineIndex:c.sdpMLineIndex};
          if (pc.remoteDescription) await pc.addIceCandidate(candidate);
          else if (candidates.length < 200) candidates.push(candidate);
        }
      }).catch(fail);
      return queue;
    }
    async function offer(source,preview=false) {
      if (closed) return;
      for (const track of source.getVideoTracks()) {
        const sender = pc.addTrack(track,source);
        try {const p=sender.getParameters();p.encodings=[{...p.encodings?.[0],maxBitrate:preview?350000:1800000,maxFramerate:preview?12:30,scaleResolutionDownBy:preview?2:1}];await sender.setParameters(p);} catch (_) {}
      }
      if (closed) return;
      await pc.setLocalDescription(await pc.createOffer());
      if (!closed) await send({description:pc.localDescription.toJSON()});
    }
    function close() {closed=true;candidates=[];pc.ontrack=pc.onicecandidate=pc.onconnectionstatechange=null;pc.close();stream.getTracks().forEach(track=>track.stop());}
    return {pc,stream,receive,offer,close};
  }
  return {uuid,iceConfig,peer};
})();
