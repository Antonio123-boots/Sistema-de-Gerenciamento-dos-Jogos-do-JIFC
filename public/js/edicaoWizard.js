(function(){
  if(!document.querySelector('.wz-card')) return;

  /* ---------- helpers ---------- */
  function el(tag,attrs,parent){
    var e=document.createElement(tag);
    if(attrs) Object.keys(attrs).forEach(function(k){
      if(k==='text') e.textContent=attrs[k]; else if(k==='html') e.innerHTML=attrs[k]; else if(k==='selected') e.selected=true; else e.setAttribute(k,attrs[k]);
    });
    if(parent) parent.appendChild(e);
    return e;
  }
  function lerJson(id){
    var raw=document.getElementById(id);
    if(!raw) return null;
    try{return JSON.parse(raw.textContent||raw.innerHTML||'{}');}catch(e){return null;}
  }
  function lerPeriodo(){
    var d=lerJson('wzData');
    return (d&&Array.isArray(d.periodo))?d.periodo:[];
  }
  function fmtData(d){
    if(!d) return '';
    var p=String(d).split('-');
    return p.length===3?(p[2]+'/'+p[1]+'/'+p[0]):d;
  }
  function montarDataOpts(sel){
    var ds=lerPeriodo().slice();
    var s=String(sel||'');
    if(s&&ds.indexOf(s)<0) ds.push(s);
    var h='<option value="">—</option>';
    ds.forEach(function(d){ h+='<option value="'+d+'"'+(s===String(d)?' selected':'')+'>'+fmtData(d)+'</option>'; });
    return h;
  }

  /* ---------- upload de ícone / logo (file -> base64 -> hidden + preview) ---------- */
  document.addEventListener('change',function(e){
    var t=e.target;
    if(!t.matches('input[type=file][data-role="wz-mod-icone"], input[type=file][data-role="wz-camp-logo"]')) return;
    var arquivo=t.files&&t.files[0];
    var row=t.closest('.wz-r');
    if(!row) return;
    var hidden=row.querySelector('input[type=hidden][name="mod_icone"], input[type=hidden][name="custom_foto"]');
    var preview=row.querySelector('.wz-icone-preview, .wz-logo');
    if(!arquivo){ if(hidden) hidden.value=''; return; }
    if(!arquivo.type||!arquivo.type.startsWith('image/')){ t.value=''; if(hidden)hidden.value=''; return; }
    var reader=new FileReader();
    reader.onload=function(){
      if(hidden) hidden.value=String(reader.result||'');
      if(preview) preview.src=String(reader.result||'');
    };
    reader.readAsDataURL(arquivo);
  });

  /* ---------- botões "Escolher" abrem o input de arquivo ---------- */
  document.addEventListener('click',function(e){
    var btn=e.target.closest('.wz-upload-btn');
    if(!btn) return;
    var row=btn.closest('.wz-r')||btn.closest('div');
    var file=row.querySelector('input[type=file]');
    if(file) file.click();
  });

  /* ---------- custom campus ---------- */
  window.wzAddCustom=function(){
    var tpl=document.getElementById('wzCustomTemplate');
    if(!tpl) return;
    var clone=tpl.querySelector('.wz-r').cloneNode(true);
    document.getElementById('wzCustomList').appendChild(clone);
    var first=clone.querySelector('input:not([type=file]):not([type=hidden]):not([type=color])');
    if(first) first.focus();
  };

  /* ---------- modalidade row ---------- */
  window.wzAddMod=function(){
    var tpl=document.getElementById('wzModTemplate');
    if(!tpl) return;
    var clone=tpl.querySelector('.wz-r').cloneNode(true);
    document.getElementById('wzModList').appendChild(clone);
    var first=clone.querySelector('input:not([type=file]):not([type=hidden]):not([type=color])');
    if(first) first.focus();
  };

  /* ---------- selecionar todos (campus / participantes) ---------- */
  function toggleTodos(btn){
    var form=btn.closest('form');
    var boxes=(form||document).querySelectorAll('input[type=checkbox][name="campi_atual"], input[type=checkbox][name="participantes"]');
    var marcados=[].filter.call(boxes,function(b){return b.checked;});
    var todos=[].filter.call(boxes,function(b){return b.disabled!==true;});
    var ligar = marcados.length < todos.length;
    todos.forEach(function(b){ b.checked=ligar; });
    todos.forEach(function(b){
      var label=b.closest('.wz-check');
      if(label) label.classList.toggle('wz-check--on',b.checked);
    });
    btn.textContent = ligar?'Limpar seleção':'Selecionar todos';
  }
  function bindToggleAll(btn){
    btn.addEventListener('click',function(){ toggleTodos(btn); });
  }
  var toggleBtns=document.querySelectorAll('#wzToggleCampus, .js-toggle-check');
  toggleBtns.forEach(function(b){ bindToggleAll(b); });

  /* ---------- checklist toggle style ---------- */
  document.addEventListener('change',function(e){
    if(e.target.matches('.wz-check input[type="checkbox"]')){
      e.target.closest('.wz-check').classList.toggle('wz-check--on',e.target.checked);
    }
  });

  /* ---------- quick chips ---------- */
  document.addEventListener('click',function(e){
    var chip=e.target.closest('.wz-chip');
    if(!chip) return;
    var nome=chip.getAttribute('data-nome');
    if(!nome) return;
    chip.classList.toggle('wz-chip--sel');
    if(chip.classList.contains('wz-chip--sel')){
      var list=document.getElementById('wzModList');
      if(!list) return;
      var rows=list.querySelectorAll('.wz-r');
      var added=false;
      for(var i=0;i<rows.length;i++){
        var inp=rows[i].querySelector('input[name="mod_nome"]');
        if(inp && !inp.value.trim()){ inp.value=nome; rows[i].setAttribute('data-base',nome); added=true; break; }
      }
      if(!added){ window.wzAddMod && window.wzAddMod(); var last=list.querySelector('.wz-r:last-child'); if(last){var lastInp=last.querySelector('input[name="mod_nome"]');if(lastInp){lastInp.value=nome;last.setAttribute('data-base',nome);}} }
    }
  });

  /* ---------- chaves dinâmicas ---------- */
  var chaveState={participantes:[],chaves:[],modalIdx:null};
  window.wzAddGrupo=function(){};

  function lerChaveData(){
    var d=lerJson('wzData');
    if(!d) return null;
    return {participantes:(d.participantes||[]).map(function(p){return {id:Number(p.id),nome:p.nome,foto:p.foto||'/imagens/avatar.svg'};}), grupos:(d.grupos||[])};
  }

  function letrasChaves(qtd){
    var L=window.LT||'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    var out=[];
    for(var i=0;i<qtd;i++){ out.push(L[i]||('G'+(i+1))); }
    return out;
  }

  function todosAssinados(){
    return chaveState.participantes.every(function(p){
      return chaveState.chaves.some(function(ch){ return ch.participantes.indexOf(p.id)>=0; });
    });
  }

  function renderChaves(){
    var grid=document.getElementById('wzChaveGrid');
    if(!grid) return;
    grid.innerHTML='';
    chaveState.chaves.forEach(function(ch,i){
      var card=el('div',{class:'wz-chave-card','data-idx':i});
      var chips=ch.participantes.map(function(id){
        var p=chaveState.participantes.filter(function(x){return x.id===id;})[0];
        if(!p) return '';
        return '<span class="wz-chave-chip"><img src="'+p.foto+'" alt=""><span>'+p.nome+'</span></span>';
      }).join('');
      card.innerHTML='<div class="wz-chave-card__letra">'+ch.letra+'</div><div class="wz-chave-card__qtd">'+ch.participantes.length+' campi</div><div>'+(chips||'<span style="color:rgba(255,255,255,.4)">vazia</span>')+'</div>';
      card.addEventListener('click',function(){ abrirChave(Number(card.getAttribute('data-idx'))); });
      grid.appendChild(card);
    });
    var feitas=todosAssinados();
    var pendentes=chaveState.participantes.filter(function(p){
      return !chaveState.chaves.some(function(ch){ return ch.participantes.indexOf(p.id)>=0; });
    });
    var st=document.getElementById('wzChaveStatus');
    if(st){
      if(chaveState.chaves.length===0) st.innerHTML='Escolha a quantidade e clique em <strong style="color:#ece42d">Gerar chaves</strong>.';
      else if(!feitas) st.innerHTML='Faltam <strong style="color:#ece42d">'+pendentes.length+'</strong> campi sem chave. Clique nas chaves para distribuí-los.';
      else st.innerHTML='Todos os campi distribuídos — os confrontos serão gerados automaticamente.';
    }
    var btnSave=document.getElementById('wzBtnSalvarChaves');
    if(btnSave) btnSave.disabled=!feitas || !chaveState.chaves.length;
    sincronizarChaveForm();
  }

  function sincronizarChaveForm(){
    var cont=document.getElementById('wzGrupoInputs');
    if(!cont) return;
    cont.innerHTML='';
    chaveState.chaves.forEach(function(ch){
      var ni=el('input',{type:'hidden',name:'grupo_nome',value:ch.letra});
      cont.appendChild(ni);
    });
    chaveState.participantes.forEach(function(p){
      var idx=-1;
      chaveState.chaves.forEach(function(ch,i){ if(ch.participantes.indexOf(p.id)>=0) idx=i; });
      var gi=el('input',{type:'hidden','name':'grupo_campus_'+p.id,value:idx>=0?String(idx):''});
      cont.appendChild(gi);
    });
  }

  function abrirChave(idx){
    var chave=chaveState.chaves[idx];
    if(!chave) return;
    chaveState.modalIdx=idx;
    var usados=[];
    chaveState.chaves.forEach(function(ch,i){
      if(i!==idx) usados=usados.concat(ch.participantes);
    });
    var disponiveis=chaveState.participantes.filter(function(p){ return usados.indexOf(p.id)<0; });
    var lista=document.getElementById('wzModalList');
    var titulo=document.getElementById('wzModalTitulo');
    titulo.innerHTML='Chave '+chave.letra;
    lista.innerHTML='';
    if(!disponiveis.length){
      lista.innerHTML='<div class="wz-empty">Nenhum campus disponível para esta chave.</div>';
    }
    disponiveis.forEach(function(p){
      var item=el('label',{class:'wz-modal-item'});
      if(chave.participantes.indexOf(p.id)>=0) item.classList.add('sel');
      item.innerHTML='<input type="checkbox" value="'+p.id+'"'+(chave.participantes.indexOf(p.id)>=0?' checked':'')+'><img class="wz-logo" src="'+p.foto+'" alt=""><span>'+p.nome+'</span>';
      item.addEventListener('change',function(){ item.classList.toggle('sel',item.querySelector('input').checked); });
      lista.appendChild(item);
    });
    var modal=document.getElementById('wzChaveModal');
    modal.style.display='flex';
  }

  function finalizarChave(){
    var idx=chaveState.modalIdx;
    if(idx==null) return;
    var chave=chaveState.chaves[idx];
    var checked=[].map.call(document.getElementById('wzModalList').querySelectorAll('input:checked'),function(b){return Number(b.value);});
    chave.participantes=checked;
    document.getElementById('wzChaveModal').style.display='none';
    chaveState.modalIdx=null;
    renderChaves();
    /* auto-abre a próxima chave vazia, se houver */
    var proxima=-1;
    for(var i=0;i<chaveState.chaves.length;i++){
      if(!chaveState.chaves[i].participantes.length){ proxima=i; break; }
    }
    if(proxima>=0 && todosAssinados()===false) abrirChave(proxima);
  }

  function fecharModalChave(){
    document.getElementById('wzChaveModal').style.display='none';
    chaveState.modalIdx=null;
  }

  function gerarChaves(qtd){
    qtd=Math.max(1, Number(qtd)||1);
    var max=Math.min(8, Math.max(1, Math.floor(chaveState.participantes.length/2)));
    if(qtd>max) qtd=max;
    chaveState.chaves=letrasChaves(qtd).map(function(l){ return {letra:l,participantes:[]}; });
    chaveState.modalIdx=null;
    renderChaves();
  }

  function initChaves(){
    var grid=document.getElementById('wzChaveGrid');
    if(!grid) return;
    var dados=lerChaveData();
    if(!dados) return;
    chaveState.participantes=dados.participantes;
    chaveState.chaves=(dados.grupos||[]).map(function(g){ return {letra:g.letra,participantes:(g.participantes||[]).map(Number)}; });
    var qtdSel=document.getElementById('wzChaveQtd');
    if(qtdSel) qtdSel.value=chaveState.chaves.length?String(chaveState.chaves.length):'1';
    renderChaves();
  }

  var gerarBtn=document.getElementById('wzGerarChaves');
  if(gerarBtn){
    gerarBtn.addEventListener('click',function(){
      var qtd=document.getElementById('wzChaveQtd');
      gerarChaves(qtd?Number(qtd.value):1);
    });
  }
  var confirmBtn=document.getElementById('wzModalConfirmar');
  if(confirmBtn) confirmBtn.addEventListener('click',finalizarChave);
  var cancelBtn=document.getElementById('wzModalCancelar');
  if(cancelBtn) cancelBtn.addEventListener('click',fecharModalChave);
  var modalBack=document.getElementById('wzChaveModal');
  if(modalBack) modalBack.addEventListener('click',function(e){ if(e.target===modalBack) fecharModalChave(); });
  initChaves();

  /* ---------- confrontos ---------- */
  window.wzUpdateCfrOpts=function(row){
    var dados=lerJson('wzData');
    if(!dados) return;
    var gSel=row.querySelector('select[name="conf_grupo[]"]');
    var cSel=row.querySelector('select[name="conf_casa[]"]');
    var fSel=row.querySelector('select[name="conf_fora[]"]');
    if(!gSel||!cSel||!fSel) return;
    var gIdx=Number(gSel.value);
    var grupo=(dados.grupos||[])[gIdx];
    var part=grupo?grupo.participantes:dados.participantes||[];
    var ids=part.map(function(p){return Number(p.id||p);});
    var names=part.map(function(p){return p.nome||p;});
    var casId=Number(cSel.value);
    var foraId=Number(fSel.value);
    cSel.innerHTML='<option value="">Selecione</option>';
    fSel.innerHTML='<option value="">Selecione</option>';
    ids.forEach(function(id,i){
      if(id) cSel.innerHTML+='<option value="'+id+'"'+(id===casId?' selected':'')+'>'+names[i]+'</option>';
      if(id) fSel.innerHTML+='<option value="'+id+'"'+(id===foraId?' selected':'')+'>'+names[i]+'</option>';
    });
  };

  window.wzAddConfronto=function(){
    var dados=lerJson('wzData');
    var grupos=(dados&&dados.grupos)||[];
    var part=(dados&&dados.participantes)||[];
    var periodo=(dados&&Array.isArray(dados.periodo))?dados.periodo:[];
    var cont=document.getElementById('wzCfrList');
    if(!cont) return;
    var wrap=el('div',{class:'wz-cfr wz-r'});
    var gWrap=el('div',{class:'wz-field','style':'flex:0 1 100px'},wrap);
    el('label',{text:'Chave'},gWrap);
    var gSel=el('select',{class:'wz-select','name':'conf_grupo[]'},gWrap);
    gSel.innerHTML=montarGrupoOpts(grupos,0);
    gSel.onchange=function(){wzUpdateCfrOpts(wrap)};
    var cWrap=el('div',{class:'wz-field'},wrap);
    el('label',{text:'Casa'},cWrap);
    var cSel=el('select',{class:'wz-select','name':'conf_casa[]'},cWrap);
    cSel.innerHTML=montarOpts(grupos[0]?grupos[0].participantes:part,null);
    var fWrap=el('div',{class:'wz-field'},wrap);
    el('label',{text:'Fora'},fWrap);
    var fSel=el('select',{class:'wz-select','name':'conf_fora[]'},fWrap);
    fSel.innerHTML=montarOpts(grupos[0]?grupos[0].participantes:part,null);
    var rWrap=el('div',{class:'wz-field','style':'flex:0 1 60px'},wrap);
    el('label',{text:'Rodada'},rWrap);
    el('input',{class:'wz-input','type':'number','name':'conf_rodada[]','min':'1','value':'1'},rWrap);
    var dWrap=el('div',{class:'wz-field','style':'flex:0 1 130px'},wrap);
    el('label',{text:'Data'},dWrap);
    var dSel=el('select',{class:'wz-select','name':'conf_data[]'},dWrap);
    var opts='<option value="">—</option>';
    periodo.forEach(function(d){ opts+='<option value="'+d+'">'+fmtData(d)+'</option>'; });
    dSel.innerHTML=opts;
    var hWrap=el('div',{class:'wz-field','style':'flex:0 1 85px'},wrap);
    el('label',{text:'Hora'},hWrap);
    el('input',{class:'wz-input','type':'time','name':'conf_horario[]'},hWrap);
    var lWrap=el('div',{class:'wz-field','style':'flex:1 1 120px'},wrap);
    el('label',{text:'Local'},lWrap);
    el('input',{class:'wz-input','name':'conf_local[]'},lWrap);
    var rmBtn=el('button',{type:'button',class:'wz-btn-remove','html':'×'},wrap);
    rmBtn.onclick=function(){wrap.remove()};
    cont.appendChild(wrap);
  };

  function montarOpts(participantes,selected){
    var h='<option value="">Selecione</option>';
    (participantes||[]).forEach(function(p){
      h+='<option value="'+p.id+'"'+(Number(selected)===Number(p.id)?' selected':'')+'>'+p.nome+'</option>';
    });
    return h;
  }
  function montarGrupoOpts(grupos,selected){
    var h='';
    (grupos||[]).forEach(function(g,i){
      h+='<option value="'+i+'"'+(Number(selected)===i?' selected':'')+'>'+g.letra+'</option>';
    });
    return h;
  }

  /* ---------- WO / vencedor ---------- */
  window.wzSyncWo=function(cb){
    var tr=cb.closest('tr');
    if(!tr) return;
    var sel=tr.querySelector('select[name*="_vencedor"]');
    if(!sel) return;
    sel.disabled=!cb.checked;
    if(!cb.checked) sel.value='';
  };

  /* ---------- botões "Voltar" via forms ocultos ---------- */
  window.wzVoltar=function(etapa){
    var f=document.getElementById(etapa);
    if(f) f.submit();
  };

})();