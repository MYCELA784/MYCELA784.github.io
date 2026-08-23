/* shared header behaviour: theme toggle + sticky shadow */
(function(){
  var SUN='<circle cx="12" cy="12" r="4.2"/><path d="M12 2v2.4M12 19.6V22M4.2 4.2l1.7 1.7M18.1 18.1l1.7 1.7M2 12h2.4M19.6 12H22M4.2 19.8l1.7-1.7M18.1 5.9l1.7-1.7"/>';
  var MOON='<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"/>';
  var btn=document.getElementById("modeBtn"), ic=document.getElementById("modeIc"), hdr=document.getElementById("hdr");
  if(btn) btn.addEventListener("click",function(){
    var dark=document.documentElement.dataset.mode==="dark";
    document.documentElement.dataset.mode=dark?"light":"dark";
    ic.innerHTML=dark?MOON:SUN;
    btn.setAttribute("aria-label",dark?"Switch to dark mode":"Switch to light mode");
  });
  if(hdr) addEventListener("scroll",function(){hdr.classList.toggle("stuck",scrollY>8);});
})();
