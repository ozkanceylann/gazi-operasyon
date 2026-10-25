'use strict';
(()=>{
 const preventGesture=event=>{if(event.cancelable)event.preventDefault();};
 const preventPinch=event=>{if(event.touches?.length>1)preventGesture(event);};
 for(const type of ['gesturestart','gesturechange','gestureend'])document.addEventListener(type,preventGesture,{passive:false});
 document.addEventListener('touchstart',preventPinch,{passive:false});
 document.addEventListener('touchmove',preventPinch,{passive:false});
 document.addEventListener('dblclick',event=>{
  if(event.sourceCapabilities?.firesTouchEvents||window.matchMedia('(pointer:coarse)').matches)preventGesture(event);
 },{passive:false});
})();
