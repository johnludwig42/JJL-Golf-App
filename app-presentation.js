// Presentation only. Keep SVG annotation text readable after viewBox scaling;
// Scoring and storage are never read or changed here.
(() => {
  const selector='.momentum-chart svg,.ssp-momentum svg,.round-record-momentum svg';
  const tracked=new Set();
  let queued=false;
  let lastRootSize=null;
  let lastViewportWidth=null;
  const refresh=()=>{
    queued=false;
    const rootSize=getComputedStyle(document.documentElement).fontSize;
    if(lastRootSize!==null&&(lastRootSize!==rootSize||lastViewportWidth!==window.innerWidth))globalThis.refreshMomentumTypography?.();
    lastRootSize=rootSize;
    lastViewportWidth=window.innerWidth;
    for(const svg of tracked)if(!svg.isConnected){resize.unobserve(svg);tracked.delete(svg);}
    for(const svg of document.querySelectorAll(selector)){
      if(!tracked.has(svg)){tracked.add(svg);resize.observe(svg);}
      const width=svg.getBoundingClientRect().width,viewWidth=svg.viewBox.baseVal.width;
      if(width<=0||viewWidth<=0)continue;
      const factor=Math.max(1,viewWidth/width).toFixed(4);
      if(svg.style.getPropertyValue('--graphic-text-scale')!==factor)svg.style.setProperty('--graphic-text-scale',factor);
    }
  };
  const schedule=()=>{if(!queued){queued=true;requestAnimationFrame(refresh);}};
  const resize=new ResizeObserver(schedule);
  const start=()=>{
    const probe=document.createElement('span');probe.setAttribute('aria-hidden','true');
    probe.style.cssText='position:fixed;left:-9999px;top:0;width:1rem;height:1rem;visibility:hidden;pointer-events:none';
    document.body.appendChild(probe);resize.observe(probe);
    new MutationObserver(schedule).observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['style','class']});
    window.addEventListener('resize',schedule);
    const print=window.matchMedia('print');
    print.addEventListener('change',()=>{globalThis.refreshMomentumTypography?.();schedule();});
    schedule();
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
