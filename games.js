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
  async function publish(base,key,form,status,editing) {
    const data=new FormData(form);
    const files=data.getAll("files").filter(f=>f.size);
    const cover=data.get("cover");
    const payload={id:crypto.randomUUID(), title:data.get("title"), description:data.get("description"), party:data.get("kind")==="party", files:[], cover:null};
    if(editing) {
      payload.id=editing.id;
      payload.version=editing.version;
      const kept=new Set(data.getAll("keepFile"));
      payload.files=editing.files.filter(f=>kept.has(f.id));
      payload.cover=data.has("keepCover") ? editing.cover : null;
    }
    const count=files.length+payload.files.length;
    if(count>6 || (payload.party && !count)) throw new Error("Szabályzathoz válassz fájlt. Legfeljebb 6 csatolmány adható hozzá.");
    const headers={"X-Game-Key":key};
    const post=(action,body)=>api(base+"/games/uploads/"+action,{method:"POST",headers:{...headers,"Content-Type":"application/json"},body:JSON.stringify(body)});
    const sessions=[];
    let publishing=false;
    try {
      for(const file of [...files,...(cover?.size ? [cover] : [])]) {
        const image=file===cover;
        const session=await post("start",{name:file.name,image,type:file.type});
        sessions.push(session);
        const parts=[];
        const MiB=1024*1024;
        const chunkSize=Math.min(95*MiB,Math.max(8,Math.ceil(file.size/(10000*MiB)))*MiB);
        for(let start=0;start<file.size;start+=chunkSize) {
          const number=parts.length+1;
          const query=new URLSearchParams({id:session.id,uploadId:session.uploadId,number});
          const body=file.slice(start,start+chunkSize);
          status.textContent=file.name+" · "+Math.floor(start/file.size*100)+"%";
          for(let attempt=1;;attempt++) {
            try {
              const result=await api(base+"/games/uploads/part?"+query,{method:"POST",headers,body});
              parts.push(result.part); break;
            } catch(error) { if(attempt===3) throw error; }
          }
        }
        await post("finish",{...session,parts});
        if(image) payload.cover=session.id;
        else payload.files.push({id:session.id,name:file.name});
      }
      publishing=true;
      await post(editing ? "edit" : "publish",payload);
    } catch(error) {
      if(!publishing) await Promise.allSettled(sessions.map(s=>post("cancel",s)));
      throw error;
    }
  }
  window.partyGames = {
    guest(base, query) {
      const invite = el("invite"), toggle = el("gamesToggle"), panel = el("gamesPane");
      let allowed = false, snapshot = "", serial = 0, gameReady = false;
      const gameOrigin = "https://hieuparty-narancshullas.puncsmartin.workers.dev";
      const inviteRoom = new URLSearchParams(location.search).get("szoba");
      let openInvitation = /^[0-9a-f]{64}$/.test(inviteRoom || "");
      function onlineCard(list) {
        const card = node("article", "", "game-card");
        const button = node("button", openInvitation ? "Csatlakozás a meghívott szobához" : "Játék indítása", "gold-btn");
        button.type = "button";
        button.onclick = () => {
          if (!allowed) return;
          const form = document.createElement("form");
          form.method = "POST"; form.action = gameOrigin + "/launch";
          const fields = {t: new URLSearchParams(query()).get("t") || ""};
          if (/^[0-9a-f]{64}$/.test(inviteRoom || "")) fields.room = inviteRoom;
          for (const [name, value] of Object.entries(fields)) {
            const input = document.createElement("input"); input.type = "hidden"; input.name = name; input.value = value; form.append(input);
          }
          document.body.append(form); form.submit(); form.remove();
        };
        card.append(node("h3","Narancshullás"),node("p","Országos társasjáték oktatókörrel, botokkal és meghívható játékosokkal."),button);
        list.append(card);
      }
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
          if (!gameReady) {
            try {
              const response = await fetch(gameOrigin + "/ready", {cache:"no-store", credentials:"omit", referrerPolicy:"no-referrer", signal:AbortSignal.timeout(3500)});
              gameReady = response.ok && await response.text() === "narancshullas-v1";
            } catch {}
          }
          if (attempt !== serial) return;
          const next = JSON.stringify([items,gameReady]);
          if (snapshot === next) return;
          const list = el("gameCards");
          list.replaceChildren();
          if (gameReady) { onlineCard(list); if (openInvitation) select(true); }
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
          if (!items.length && !gameReady) list.append(node("p","A játékok és a szabályzatok hamarosan ide kerülnek."));
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
      let editing=null;
      const list=el("gameAdminCards"), note=el("gameListStatus"), existing=el("gameExistingFiles");
      const save=form.querySelector("[type=submit]"), cancel=el("gameCancelEdit");
      function selectCard(card) {
        editing=card;
        form.reset(); existing.replaceChildren();
        form.querySelector("h3").textContent=card ? "Anyag szerkesztése" : "Új anyag";
        save.textContent=card ? "Változtatások mentése" : "Közzététel";
        cancel.hidden=!card;
        el("gameUploadStatus").textContent="";
        if(!card) return;
        form.elements.title.value=card.title;
        form.elements.description.value=card.description;
        form.elements.kind.value=card.party ? "party" : "game";
        function keep(name,value,text) {
          const label=node("label"), box=node("input");
          box.type="checkbox"; box.name=name; box.value=value; box.checked=true;
          label.append(box," "+text); existing.append(label);
        }
        if(card.cover) keep("keepCover",card.cover,"Jelenlegi borítókép megtartása");
        for(const f of card.files) keep("keepFile",f.id,"Megtartás · "+f.name);
        form.elements.title.focus();
      }
      cancel.onclick=()=>selectCard(null);
      selectCard(null);
      async function refreshCards() {
        try {
          const {items}=await api(base+"/games/uploads/catalog",{method:"POST",headers:{"X-Game-Key":key},body:"{}"});
          list.replaceChildren(); note.textContent=items.length ? "" : "Még nincs közzétett anyag.";
          for(const item of items) {
            const row=node("article"), heading=node("h4",item.title);
            const edit=node("button","Szerkesztés","del-btn"), remove=node("button","Törlés","del-btn");
            edit.type=remove.type="button";
            edit.onclick=()=>{if(!save.disabled) selectCard(item);};
            remove.onclick=async()=>{
              if(save.disabled || !confirm("Végleg törlöd ezt az anyagot a borítójával és a fájljaival együtt?\n"+item.title)) return;
              remove.disabled=true;
              try {
                await api(base+"/games/uploads/delete",{method:"POST",headers:{"X-Game-Key":key,"Content-Type":"application/json"},body:JSON.stringify({id:item.id,version:item.version})});
                if(editing?.id===item.id) selectCard(null);
                await refreshCards();
              } catch(err){await refreshCards();note.textContent=err.message;}
              finally {remove.disabled=false;}
            };
            row.append(heading,edit," ",remove); list.append(row);
          }
        } catch(err){note.textContent="A bejegyzések nem tölthetők be. "+err.message;}
      }
      refreshCards();
      form.onsubmit=async e=>{
        e.preventDefault();
        const msg=el("gameUploadStatus"), button=save;
        button.disabled=true; cancel.disabled=true; msg.textContent="Feltöltés…";
        try {
          const message=editing ? "A módosítások mentve." : "Megjelent a játéktérben.";
          await publish(base,key,form,msg,editing);
          selectCard(null); msg.textContent=message;
          await refreshCards();
        } catch(err){msg.textContent=err.message; await refreshCards();}
        finally {button.disabled=false;cancel.disabled=false;}
      };
      try {current=(await api(base+"/games/access?key="+encodeURIComponent(key))).ids; paint(current);status.textContent="";}
      catch(e){status.textContent="A hozzáférések nem tölthetők be.";}
    }
  };
})();