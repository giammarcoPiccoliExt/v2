// Zoom detection and auto-reset for mobile browsers
(function(){
  let lastScale = 1;
  let zoomTimeout = null;

  function isMobile() {
    return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
  }

  function resetZoom() {
    document.body.style.transform = '';
    document.body.style.transformOrigin = '';
    document.body.style.zoom = '';
    document.documentElement.style.zoom = '';
    if(window.visualViewport) window.visualViewport.scale = 1;
    window.scrollTo(0,0);
    lastScale = 1;
  }

  function detectZoom() {
    let scale = 1;
    if (window.visualViewport) {
      scale = window.visualViewport.scale;
    } else if (window.outerWidth && window.innerWidth) {
      scale = window.outerWidth / window.innerWidth;
    }
    if (scale > 1.01) {
      if (zoomTimeout) clearTimeout(zoomTimeout);
      zoomTimeout = setTimeout(()=>{
        resetZoom();
      }, 1000);
      lastScale = scale;
    } else {
      if (zoomTimeout) clearTimeout(zoomTimeout);
      lastScale = 1;
    }
  }

  if(isMobile()){
    window.addEventListener('resize', detectZoom, {passive:true});
    window.addEventListener('orientationchange', detectZoom, {passive:true});
    if(window.visualViewport) window.visualViewport.addEventListener('resize', detectZoom, {passive:true});
    document.addEventListener('focusin', detectZoom, {passive:true});
    document.addEventListener('focusout', detectZoom, {passive:true});
    setTimeout(detectZoom, 500);
  }
})();// Zoom detection and reset button for mobile browsers
(function(){
  let lastScale = 1;
  let zoomBtn = null;

  function isMobile() {
    return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
  }

  function showZoomBtn() {
    if (!zoomBtn) {
      zoomBtn = document.createElement('button');
      zoomBtn.textContent = 'Ripristina zoom';
      zoomBtn.style.position = 'fixed';
      zoomBtn.style.bottom = '90px';
      zoomBtn.style.right = '16px';
      zoomBtn.style.zIndex = 9999;
      zoomBtn.style.padding = '12px 18px';
      zoomBtn.style.background = '#1976d2';
      zoomBtn.style.color = '#fff';
      zoomBtn.style.border = 'none';
      zoomBtn.style.borderRadius = '8px';
      zoomBtn.style.fontSize = '1.1em';
      zoomBtn.style.boxShadow = '0 2px 8px rgba(0,0,0,0.18)';
      zoomBtn.style.display = 'none';
      zoomBtn.addEventListener('click', function(){
        document.body.style.transform = '';
        document.body.style.transformOrigin = '';
        document.body.style.zoom = '';
        document.documentElement.style.zoom = '';
        if(window.visualViewport) window.visualViewport.scale = 1;
        window.scrollTo(0,0);
        zoomBtn.style.display = 'none';
        lastScale = 1;
      });
      document.body.appendChild(zoomBtn);
    }
    zoomBtn.style.display = 'block';
  }

  function hideZoomBtn() {
    if (zoomBtn) zoomBtn.style.display = 'none';
  }

  function detectZoom() {
    let scale = 1;
    if (window.visualViewport) {
      scale = window.visualViewport.scale;
    } else if (window.outerWidth && window.innerWidth) {
      scale = window.outerWidth / window.innerWidth;
    }
    if (scale > 1.01) {
      showZoomBtn();
      lastScale = scale;
    } else {
      hideZoomBtn();
      lastScale = 1;
    }
  }

  if(isMobile()){
    window.addEventListener('resize', detectZoom, {passive:true});
    window.addEventListener('orientationchange', detectZoom, {passive:true});
    if(window.visualViewport) window.visualViewport.addEventListener('resize', detectZoom, {passive:true});
    document.addEventListener('focusin', detectZoom, {passive:true});
    document.addEventListener('focusout', detectZoom, {passive:true});
    setTimeout(detectZoom, 500);
  }
})();
