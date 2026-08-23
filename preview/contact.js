/* Contact form -> same Apps Script endpoint as inquiry.js.
   Paste your deployed web app URL below. */
(function(){
  "use strict";
  var ENDPOINT = "PASTE_YOUR_APPS_SCRIPT_WEB_APP_URL_HERE";

  var DISPOSABLE = ["mailinator.com","tempmail.com","temp-mail.org","10minutemail.com",
    "guerrillamail.com","yopmail.com","throwawaymail.com","getnada.com","dispostable.com",
    "trashmail.com","sharklasers.com","maildrop.cc","fakeinbox.com","mintemail.com","tmail.ws"];
  var PERSONAL = ["gmail.com","yahoo.com","yahoo.co.in","outlook.com","hotmail.com","live.com",
    "rediffmail.com","icloud.com","protonmail.com","proton.me","aol.com","zoho.com"];

  var form = document.getElementById("contactForm");
  if(!form) return;
  var status = document.getElementById("frm-status");

  function say(msg, bad){
    status.textContent = msg;
    status.style.color = bad ? "#C0392B" : "var(--body)";
  }

  function mxOk(domain){
    var url = "https://dns.google/resolve?name=" + encodeURIComponent(domain) + "&type=MX";
    var ctrl = new AbortController();
    var t = setTimeout(function(){ ctrl.abort(); }, 4000);
    return fetch(url, {signal: ctrl.signal})
      .then(function(r){ return r.json(); })
      .then(function(j){ clearTimeout(t); return j.Status !== 3; })
      .catch(function(){ return true; });   // fail open, never block a real buyer
  }

  form.addEventListener("submit", function(ev){
    ev.preventDefault();
    if(form.website.value.trim() !== "") { say("Thanks, we'll be in touch."); return; }

    var email = form.email.value.trim().toLowerCase();
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) { say("Please enter a valid email address.", true); return; }
    var domain = email.split("@")[1];
    if(DISPOSABLE.indexOf(domain) !== -1) { say("Disposable email addresses aren't accepted. Please use a real inbox.", true); return; }

    var btn = form.querySelector("button[type=submit]");
    btn.disabled = true;
    say("Checking email\u2026");

    var check = PERSONAL.indexOf(domain) !== -1 ? Promise.resolve(true) : mxOk(domain);
    check.then(function(ok){
      if(!ok){ say("That email domain doesn't appear to exist. Please check for typos.", true); btn.disabled = false; return; }
      say("Sending\u2026");
      return fetch(ENDPOINT, {
        method: "POST",
        // no Content-Type header, so the browser sends a simple request and skips CORS preflight
        body: JSON.stringify({
          type: "contact",
          topic: form.topic.value,
          name: form.name.value.trim(),
          company: form.company.value.trim(),
          email: email,
          phone: form.phone.value.trim(),
          message: form.message.value.trim(),
          emailType: PERSONAL.indexOf(domain) !== -1 ? "Personal" : "Company",
          pageUrl: location.href
        })
      }).then(function(r){ return r.json(); })
        .then(function(res){
          if(res && res.ok){ say("\u2713 Message sent. We'll reply within a working day."); form.reset(); }
          else { say((res && res.error) || "Something went wrong. Please try again.", true); }
          btn.disabled = false;
        })
        .catch(function(){
          say("Network error. Please try again, or email shaonak@mycela.in directly.", true);
          btn.disabled = false;
        });
    });
  });
})();
