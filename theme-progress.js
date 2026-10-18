// A presentation-only animation shared by the venue, broadcast and remote view.
// The quiz clock supplies the position; this never schedules a quiz action.
window.QuizThemeProgress = (() => {
  const animations=new WeakMap(),bedAnimations=new WeakMap();
  // Half-second colour cues sampled from the original 30-second quiz-bed video.
  const BED_COLOURS=['#ff650a','#12fe0b','#0efffe','#12fe0b','#ff0dfe','#0cff0c','#df0eff','#fff010','#fe0c12','#520cfd','#fefe0a','#fe0c93','#0fff0c','#07fffa','#14fd0d','#ff0cff','#11ff0a','#0591fe','#ff0d6e','#0c21ff','#ff0d6c','#ffff0d','#fe0c91','#ff650e','#0945ff','#0efffe','#12ff07','#ff0cff','#13ff0a','#0df9fc','#0cff09','#ff0b14','#520cfd','#fcff09','#fe0c91','#12fe0f','#0effff','#15ff12','#ff0fff','#0a58ff','#35ff0b','#8d0dff','#ff0c15','#520cff','#ffff0e','#ff0d94','#ff650c','#0eff0b','#0cfffe','#12fe09','#ff0dfe','#09ff05','#084cff','#0bfe0c','#fe0c12','#520cff','#fffe0c','#ff0c93','#10ff0b','#08fffa'];
  function drawBed(track,clock){
    if(!clock||!Number.isFinite(clock.elapsed)||typeof track.animate!=='function'){
      bedAnimations.get(track)?.cancel();bedAnimations.delete(track);return;
    }
    let animation=bedAnimations.get(track);
    if(!animation){
      const frames=BED_COLOURS.map((color,i)=>({color,offset:i/BED_COLOURS.length,easing:'steps(1,end)'}));
      frames.push({color:BED_COLOURS[0],offset:1});
      animation=track.animate(frames,{duration:30000,iterations:Infinity});
      animation.currentTime=Math.max(0,clock.elapsed)*1000;bedAnimations.set(track,animation);
    }
    if(clock.running&&animation.playState==='paused')animation.play();
    else if(!clock.running&&animation.playState!=='paused')animation.pause();
    if(Math.abs(Number(animation.currentTime)-clock.elapsed*1000)>50)animation.currentTime=Math.max(0,clock.elapsed)*1000;
  }
  function stop(bar){animations.get(bar)?.animation.cancel();animations.delete(bar);}
  function draw(bar,clock){
    const duration=Number(clock?.duration),elapsed=Number(clock?.elapsed);
    if(!Number.isFinite(duration)||duration<=0||!Number.isFinite(elapsed)){stop(bar);return;}
    const position=Math.min(1,Math.max(0,elapsed/duration))*100;
    const from=position.toFixed(5)+' 100';
    bar.setAttribute('stroke-dasharray',from);
    // Keep the same linear animation between clock samples, avoiding a restart
    // on each network or timer tick. Pauses and seeks still take effect directly.
    if(clock.running&&position<100&&typeof bar.animate==='function'){
      let state=animations.get(bar);
      if(!state||state.duration!==duration){
        stop(bar);
        state={duration,animation:bar.animate([{strokeDasharray:'0 100'},{strokeDasharray:'100 100'}],{duration:duration*1000,easing:'linear',fill:'forwards'})};
        state.animation.currentTime=Math.max(0,elapsed)*1000;animations.set(bar,state);
      }else if(Math.abs(Number(state.animation.currentTime)-elapsed*1000)>50){state.animation.currentTime=Math.max(0,elapsed)*1000;}
    }else stop(bar);
  }
  return {draw,stop,drawBed};
})();
