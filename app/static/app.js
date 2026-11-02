'use strict';
const $ = id => document.getElementById(id);
const storageKey = 'bibelraum.history.v1';
let history = [];
try { const saved = JSON.parse(localStorage.getItem(storageKey) || '[]'); if (Array.isArray(saved)) history = saved.filter(x => x && typeof x.question === 'string' && typeof x.answer === 'string' && Array.isArray(x.sources)).slice(0, 20); } catch (_) { /* Private browsing may disable storage. */ }
let controller = null, current = null, timer = null, started = 0;
const bookNames = {Gen:'1. Mose',Exod:'2. Mose',Lev:'3. Mose',Num:'4. Mose',Deut:'5. Mose',Josh:'Josua',Judg:'Richter',Ruth:'Rut','1Sam':'1. Samuel','2Sam':'2. Samuel','1Kgs':'1. Könige','2Kgs':'2. Könige','1Chr':'1. Chronik','2Chr':'2. Chronik',Ezra:'Esra',Neh:'Nehemia',Esth:'Ester',Job:'Hiob',Ps:'Psalm',Prov:'Sprüche',Eccl:'Prediger',Song:'Hohelied',Isa:'Jesaja',Jer:'Jeremia',Lam:'Klagelieder',Ezek:'Hesekiel',Dan:'Daniel',Hos:'Hosea',Joel:'Joel',Amos:'Amos',Obad:'Obadja',Jonah:'Jona',Mic:'Micha',Nah:'Nahum',Hab:'Habakuk',Zeph:'Zefanja',Hag:'Haggai',Zech:'Sacharja',Mal:'Maleachi',Matt:'Matthäus',Mark:'Markus',Luke:'Lukas',John:'Johannes',Acts:'Apostelgeschichte',Rom:'Römer','1Cor':'1. Korinther','2Cor':'2. Korinther',Gal:'Galater',Eph:'Epheser',Phil:'Philipper',Col:'Kolosser','1Thess':'1. Thessalonicher','2Thess':'2. Thessalonicher','1Tim':'1. Timotheus','2Tim':'2. Timotheus',Titus:'Titus',Phlm:'Philemon',Heb:'Hebräer',Jas:'Jakobus','1Pet':'1. Petrus','2Pet':'2. Petrus','1John':'1. Johannes','2John':'2. Johannes','3John':'3. Johannes',Jude:'Judas',Rev:'Offenbarung'};
function referenceLabel(ref) {
  const match = String(ref).match(/^(\S+)\s+(\d+):(\d+)-(\d+)$/);
  return match ? `${bookNames[match[1]] || match[1]} ${match[2]},${match[3]}${match[3] === match[4] ? '' : '–' + match[4]}` : String(ref);
}
// Construct text nodes, never inject model output as HTML.
function inline(parent, text) {
  const parts = text.split(/(\*\*[^*]+\*\*|\[\d+\])/g);
  for (const part of parts) {
    if (/^\*\*[^*]+\*\*$/.test(part)) {
      const strong = document.createElement('strong'); strong.textContent = part.slice(2, -2); parent.append(strong);
    } else if (/^\[\d+\]$/.test(part) && current?.sources[Number(part.slice(1,-1))-1]) {
      const number = Number(part.slice(1,-1)); const link = document.createElement('button');
      link.type = 'button'; link.className = 'citation'; link.textContent = number;
      link.setAttribute('aria-label', `Quelle ${number}: ${referenceLabel(current.sources[number-1].reference)}`);
      link.onclick = () => { const source = $(`source-${number}`); source.open = true; source.scrollIntoView({behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block:'nearest'}); source.querySelector('summary').focus(); };
      parent.append(link);
    } else parent.append(document.createTextNode(part));
  }
}
function renderAnswer() {
  const fragment = document.createDocumentFragment();
  for (const block of (current?.answer || '').split(/\n\s*\n/)) {
    if (!block.trim()) continue;
    const lines = block.split('\n');
    if (lines.every(line => /^\s*[-*]\s+/.test(line))) {
      const ul = document.createElement('ul'); for (const line of lines) { const li = document.createElement('li'); inline(li,line.replace(/^\s*[-*]\s+/,'')); ul.append(li); } fragment.append(ul);
    } else { const p = document.createElement('p'); inline(p, block.replace(/^#{1,3}\s+/gm, '')); fragment.append(p); }
  }
  $('answer').replaceChildren(fragment);
  $('copy').disabled = !current?.answer;
}
function renderSources() {
  $('sources').replaceChildren(); $('source-count').textContent = current.sources.length;
  current.sources.forEach((source, index) => {
    const details = document.createElement('details'); details.className = 'source'; details.id = `source-${index+1}`;
    const summary = document.createElement('summary'); const num = document.createElement('span'); num.className = 'source-number'; num.textContent = String(index+1).padStart(2,'0');
    const title = document.createElement('span'); title.textContent = referenceLabel(source.reference); summary.append(num,title);
    const p = document.createElement('p'); p.textContent = source.text; details.append(summary,p); $('sources').append(details);
  });
}
function renderHistory() {
  $('history').replaceChildren(); $('clear-history').hidden = !history.length;
  if (!history.length) { const p = document.createElement('p'); p.className='history-empty'; p.textContent='Deine Fragen erscheinen hier, sobald du eine Antwort erhalten hast.'; $('history').append(p); return; }
  for (const entry of history) {
    const button = document.createElement('button'); button.className = `history-item${entry.id === current?.id ? ' active' : ''}`; button.textContent = entry.question; button.title = entry.question; if (entry.id === current?.id) button.setAttribute('aria-current', 'true');
    button.onclick = () => { if (controller) return; current = {...entry}; $('question').value = entry.question; $('top-k').value = entry.top_k || 5; showResult(); renderAnswer(); renderSources(); showMetrics(); $('result-state').textContent = 'Aus deinem Verlauf'; $('loading').hidden = true; $('error').hidden = true; renderHistory(); closeNavigation(); };
    button.disabled = Boolean(controller); $('history').append(button);
  }
}
function showResult() { document.body.classList.add('has-result'); $('result-section').hidden = false; $('asked-question').textContent = current.question; $('truncated').hidden = !current.metrics?.truncated; }
function showMetrics() {
  const m = current?.metrics;
  $('timing').textContent = m ? `${m.total_seconds.toLocaleString('de-DE')} s` : '';
  $('timing').title = m ? `Erster Text: ${m.first_token_seconds ?? '–'} s · Suche: ${m.retrieval_seconds} s · ${m.tokens_per_second ?? '–'} Tokens/s` : '';
  $('truncated').hidden = !m?.truncated;
}
function setBusy(busy) {
  $('submit').hidden = busy; $('stop').hidden = !busy; $('question').disabled = busy; $('top-k').disabled = busy; $('new-question').disabled = busy; $('clear-history').disabled = busy;
  document.querySelectorAll('[data-question]').forEach(button => button.disabled = busy); renderHistory();
}
function saveHistory() { try { localStorage.setItem(storageKey, JSON.stringify(history)); } catch (_) { /* The answer remains available even if storage is full. */ } }
async function submit(event) {
  event.preventDefault(); if (controller) return;
  const question = $('question').value.trim(); if (!question) { $('question').focus(); return; }
  controller = new AbortController(); current = {id: crypto.randomUUID(), question, top_k:Number($('top-k').value), answer:'', sources:[], date:Date.now()};
  started = performance.now(); showResult(); renderAnswer(); renderSources(); showMetrics(); setBusy(true);
  $('error').hidden = true; $('loading').hidden = false; $('progress').textContent='Passende Bibelstellen werden gesucht …'; $('result-state').textContent='Suche läuft …';
  timer = setInterval(() => { $('timing').textContent = `${Math.floor((performance.now()-started)/1000)} s`; }, 1000);
  let completed = false;
  try {
    const response = await fetch('/ask/stream', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({question,top_k:current.top_k}), signal:controller.signal});
    if (!response.ok) throw new Error('Die Anfrage konnte nicht gestartet werden. Bitte versuche es erneut.');
    if (!response.body) throw new Error('Dein Browser unterstützt diese Verbindung nicht.');
    const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = '';
    function receive(line) {
      if (!line.trim()) return; const event = JSON.parse(line);
      if (event.type === 'status') { $('progress').textContent=event.message; $('result-state').textContent = event.message; }
      if (event.type === 'sources') { current.sources=event.sources; renderSources(); }
      if (event.type === 'token') { current.answer+=event.text; $('loading').hidden=true; $('result-state').textContent='Antwort wird geschrieben …'; renderAnswer(); }
      if (event.type === 'error') throw new Error(event.message);
      if (event.type === 'done') { current.metrics=event.metrics; completed=true; }
    }
    while (true) {
      const {value,done} = await reader.read(); buffer += done ? decoder.decode() : decoder.decode(value,{stream:true});
      const lines = buffer.split('\n'); buffer=lines.pop(); for (const line of lines) receive(line);
      if (done) { if (buffer.trim()) receive(buffer); break; }
    }
    if (!completed) throw new Error('Die Verbindung wurde unterbrochen. Bitte versuche es erneut.');
    history = [current,...history].slice(0,20); saveHistory(); $('result-state').textContent='Antwort fertig';
  } catch (error) {
    controller.abort();
    if (error.name === 'AbortError') { $('result-state').textContent='Gestoppt'; if (!current.answer) $('progress').textContent='Die Anfrage wurde gestoppt.'; }
    else { $('error').textContent=error.message || 'Die Verbindung wurde unterbrochen.'; $('error').hidden=false; $('result-state').textContent='Anfrage fehlgeschlagen'; }
  } finally {
    clearInterval(timer); controller=null; setBusy(false); $('loading').hidden=true;
    if (completed) showMetrics(); else $('timing').textContent='';
  }
}
$('question-form').addEventListener('submit',submit);
$('question').addEventListener('keydown',event=>{if(event.key==='Enter'&&(event.metaKey||event.ctrlKey)){event.preventDefault();$('question-form').requestSubmit();}});
$('stop').onclick = () => controller?.abort();
$('new-question').onclick=()=>{ if(controller)return; current=null; $('question').value='';$('result-section').hidden=true;$('error').hidden=true;document.body.classList.remove('has-result');renderHistory();closeNavigation(false);$('question').focus(); };
$('clear-history').onclick=()=>{ $('clear-dialog').returnValue = ''; $('clear-dialog').showModal(); };
$('clear-dialog').addEventListener('close',()=>{ if ($('clear-dialog').returnValue === 'delete') { history=[]; saveHistory(); renderHistory(); } });
document.querySelectorAll('[data-question]').forEach(button=>button.onclick=()=>{$('question').value=button.dataset.question;$('question').focus();});
$('copy').onclick=async()=>{try{const sourceText=current.sources.map((s,i)=>`[${i+1}] ${referenceLabel(s.reference)}`).join('\n');await navigator.clipboard.writeText(`${current.answer}\n\n${sourceText}`);$('copy').textContent='Kopiert ✓';setTimeout(()=>$('copy').textContent='Kopieren',2000);}catch(_){$('copy').textContent='Bitte Text markieren';}};
async function checkHealth() {
  $('connection-text').textContent='Verbindung prüfen …';
  try {const response=await fetch('/health',{signal:AbortSignal.timeout(10000)});if(!response.ok)throw new Error();const state=await response.json();$('connection').className=`connection ${state.ready?'ready':'offline'}`;$('connection-text').textContent=state.ready?'Lokal bereit':'Noch nicht bereit';$('connection').title=state.ready?`${state.documents.toLocaleString('de-DE')} Bibelabschnitte · Zum Prüfen klicken`:'Pipeline mit ./scripts/start-mac.sh starten. Zum Prüfen klicken.';}
  catch(_){$('connection').className='connection offline';$('connection-text').textContent='Nicht verbunden';}
}
$('connection').onclick=checkHealth;
const compactNavigation = matchMedia('(max-width: 900px)');
function syncNavigation() {
  const open = compactNavigation.matches ? document.body.classList.contains('nav-open') : !document.body.classList.contains('sidebar-hidden');
  $('toggle-sidebar').setAttribute('aria-expanded', String(open));
  $('sidebar-backdrop').hidden = !compactNavigation.matches || !open;
  $('workspace').inert = compactNavigation.matches && open;
  if (compactNavigation.matches && open) {
    $('sidebar').setAttribute('role', 'dialog');
    $('sidebar').setAttribute('aria-modal', 'true');
  } else {
    $('sidebar').removeAttribute('role');
    $('sidebar').removeAttribute('aria-modal');
  }
}
function closeNavigation(restoreFocus = true) {
  const wasOpen = document.body.classList.contains('nav-open');
  document.body.classList.remove('nav-open');
  syncNavigation();
  if (wasOpen && restoreFocus) $('toggle-sidebar').focus();
}
$('toggle-sidebar').onclick = () => {
  if (compactNavigation.matches) {
    document.body.classList.toggle('nav-open');
    document.body.classList.remove('sidebar-hidden');
    syncNavigation();
    if (document.body.classList.contains('nav-open')) $('close-sidebar').focus();
  } else {
    document.body.classList.toggle('sidebar-hidden');
    syncNavigation();
  }
};
$('close-sidebar').onclick = () => closeNavigation();
$('sidebar-backdrop').onclick = () => closeNavigation();
compactNavigation.addEventListener('change',()=>{ document.body.classList.remove('nav-open','sidebar-hidden'); syncNavigation(); });
document.addEventListener('keydown', event => {
  if (!compactNavigation.matches || !document.body.classList.contains('nav-open') || $('clear-dialog').open) return;
  if (event.key === 'Escape') { event.preventDefault(); closeNavigation(); }
  if (event.key === 'Tab') {
    const focusable = [...$('sidebar').querySelectorAll('a[href],button:not(:disabled)')].filter(el=>!el.hidden && el.getClientRects().length);
    const first=focusable[0], last=focusable[focusable.length-1];
    if (event.shiftKey && document.activeElement===first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement===last) { event.preventDefault(); first.focus(); }
  }
});
$('appearance').value = document.documentElement.dataset.theme || 'system';
$('appearance').onchange = () => {
  const value = $('appearance').value;
  if (value === 'system') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = value;
  try { localStorage.setItem('bibelraum.appearance', value); } catch (_) {}
};
syncNavigation(); renderHistory(); checkHealth();
