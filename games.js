(() => {
  const el = id => document.getElementById(id);
  function node(tag, text, cls) {
    const n = document.createElement(tag);
    if (text) n.textContent = text;
    if (cls) n.className = cls;
    return n;
  }
  async function api(url, options) {
    const response = await fetch(url, {cache:"no-store", ...options});
    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.error || "A művelet nem sikerült.");
    return data;
  }
  window.partyGames = {
    guest(base, query) {
      const invite = el("invite"), toggle = el("gamesToggle"), panel = el("gamesPane");
      let allowed = false, snapshot = "", serial = 0;
      function select(open) {
        invite.classList.toggle("games-open", open);
        toggle.setAttribute("aria-checked",String(open));
        panel.hidden = !open;
        window.scrollTo(0,0);
      }
      toggle.onclick = () => {
        if (allowed) select(panel.hidden);
        else el("gamesHint").textContent = "A játéktérhez az admin adhat hozzáférést.";
      };
      async function refresh() {
        const attempt = ++serial;
        try {
          const {items} = await api(base+"/games/list?"+query());
          if (attempt !== serial) return;
          allowed = true;
          toggle.removeAttribute("aria-disabled");
          el("gamesHint").textContent = "";
          const next = JSON.stringify(items);
          if (snapshot === next) return;
          const list = el("gameCards");
          list.replaceChildren();
          for (const item of items.slice().sort((a,b)=>Number(b.party)-Number(a.party))) {
            const card = node("article", "", "game-card");
            const fileUrl = id => base+"/games/file/"+encodeURIComponent(id)+"?"+query();
            if (item.cover) {
              const img = node("img"); img.alt = ""; img.loading = "lazy"; img.src = fileUrl(item.cover); card.append(img);
            }
            if (item.party) card.append(node("small","Party szabályzata"));
            card.append(node("h3",item.title),node("p",item.description));
            for (const f of item.files) {
              const link = node("a","↓  "+f.name); link.href=fileUrl(f.id); link.download=f.name; card.append(link);
            }
            list.append(card);
          }
          if (!items.length) list.append(node("p","A játékok és a szabályzatok hamarosan ide kerülnek."));
          snapshot = next;
        } catch {
          if (attempt !== serial) return;
          allowed = false; snapshot = ""; toggle.setAttribute("aria-disabled","true");
          if (!panel.hidden) { select(false); el("gamesHint").textContent="A játéktér jelenleg nem elérhető."; }
          el("gameCards").replaceChildren();
        }
      }
      refresh();
      setInterval(()=>{if (!document.hidden) refresh();},20000);
      document.addEventListener("visibilitychange",()=>{if (!document.hidden) refresh();});
    },
    async admin(base,key,guests) {
      const root=el("gameAccess"), status=el("gameAccessStatus"), form=el("gamePublish");
      const all=el("gameAll");
      const controls = new Map();
      root.replaceChildren();
      all.disabled=true;
      let busy=false;
      function paint(ids) {
        let count=0;
        for (const [id,input] of controls) {
          input.checked=ids.includes(id); input.disabled=busy;
          if(input.checked) count++;
        }
        all.checked=controls.size>0 && count===controls.size;
        all.indeterminate=count>0 && count<controls.size;
        all.disabled=busy || !controls.size;
      }
      let current=[];
      async function change(id,enabled) {
        busy=true; paint(current);
        try {
          const result=await api(base+"/games/access",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({key,id,enabled})});
          current=result.ids; status.textContent="Hozzáférések mentve.";
        } catch(e) {status.textContent=e.message;}
        finally {busy=false;paint(current);}
      }
      for (const guest of guests) {
        const label=node("label"), input=node("input"); input.type="checkbox"; input.disabled=true;
        input.onchange=()=>change(guest.id,input.checked);
        controls.set(guest.id,input); label.append(input," "+guest.name); root.append(label);
      }
      all.onchange=()=>change("*",all.checked);
      form.onsubmit=async e=>{
        e.preventDefault();
        const msg=el("gameUploadStatus"), button=form.querySelector("button");
        button.disabled=true; msg.textContent="Feltöltés…";
        try {
          const data=new FormData(form);
          if(data.getAll("files").length>6 || [...data.values()].reduce((sum,f)=>sum+(f.size||0),0)>16*1024*1024) throw new Error("Legfeljebb 6 csatolmány és összesen 16 MB tölthető fel.");
          await api(base+"/games/publish",{method:"POST",headers:{"X-Game-Key":key},body:data});
          form.reset(); msg.textContent="Megjelent a játéktérben.";
        } catch(err){msg.textContent=err.message;}
        finally {button.disabled=false;}
      };
      try {current=(await api(base+"/games/access?key="+encodeURIComponent(key))).ids; paint(current);status.textContent="";}
      catch(e){status.textContent="A hozzáférések nem tölthetők be.";}
    }
  };
})();