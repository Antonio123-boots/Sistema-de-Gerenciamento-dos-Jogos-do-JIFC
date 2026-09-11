(function(){
  if(!document.getElementById('wzCampusChecklist') && !document.getElementById('wzCampusList') && !document.getElementById('wzQuickChips')) return;

  /* ---------- helpers ---------- */
  function el(tag,attrs,parent){
    var e=document.createElement(tag);
    if(attrs) Object.keys(attrs).forEach(function(k){
      if(k==='text') e.textContent=attrs[k]; else if(k==='html') e.innerHTML=attrs[k]; else if(k==='selected') e.selected=true; else e.setAttribute(k,attrs[k]);
    });
    if(parent) parent.appendChild(e);
    return e;
  }
  function val(v,d){return v==null||v===''?d:v}

  /* ---------- custom campus ---------- */
  window.wzAddCustom=function(){
    var tpl=document.getElementById('wzCustomTemplate');
    if(!tpl) return;
    var clone=tpl.querySelector('.wz-r').cloneNode(true);
    document.getElementById('wzCustomList').appendChild(clone);
    var first=clone.querySelector('input');
    if(first) first.focus();
  };

  /* ---------- modalidade row ---------- */
  window.wzAddMod=function(){
    var tpl=document.getElementById('wzModTemplate');
    if(!tpl) return;
    var clone=tpl.querySelector('.wz-r').cloneNode(true);
    document.getElementById('wzModList').appendChild(clone);
    var first=clone.querySelector('input');
    if(first) first.focus();
  };

  /* ---------- grupos / chaves ---------- */
  window.wzAddGrupo=function(){
    var cont=document.getElementById('wzGrupoInputs');
    if(!cont) return;
    var count=cont.querySelectorAll('.wz-r').length;
    var letra=(window.LT||'ABCDEFGHIJKLMNOPQRSTUVWXYZ')[count]||('G'+(count+1));
    var wrap=el('div',{class:'wz-grp-row wz-r','style':'background:#fff;border:1px solid #d0d5dd;padding:6px 10px'});
    var inp=el('input',{class:'wz-input','name':'grupo_nome','value':letra,'style':'width:70px;text-align:center;font-weight:700'},wrap);
    var rm=el('button',{type:'button',class:'wz-btn-remove','html':'×','style':'background:none;border:none;cursor:pointer;color:#b42318;font-size:1rem;padding:4px'},wrap);
    rm.onclick=function(){wrap.remove()};
    cont.appendChild(wrap);
  };

  /* ---------- confrontos ---------- */
  function lerDadosConfrontos(){
    var raw=document.getElementById('wzData');
    if(!raw) return null;
    try{return JSON.parse(raw.textContent||raw.innerHTML||'{}');}catch(e){return null;}
  }

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

  window.wzUpdateCfrOpts=function(row){
    var dados=lerDadosConfrontos();
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
    var dados=lerDadosConfrontos();
    var grupos=(dados&&dados.grupos)||[];
    var part=(dados&&dados.participantes)||[];
    var cont=document.getElementById('wzCfrList');
    if(!cont) return;
    var wrap=el('div',{class:'wz-cfr wz-r'});
    /* grupo */
    var gWrap=el('div',{class:'wz-field','style':'flex:0 1 100px'},wrap);
    el('label',{text:'Chave'},gWrap);
    var gSel=el('select',{class:'wz-select','name':'conf_grupo[]'},gWrap);
    gSel.innerHTML=montarGrupoOpts(grupos,0);
    gSel.onchange=function(){wzUpdateCfrOpts(wrap)};
    /* casa */
    var cWrap=el('div',{class:'wz-field'},wrap);
    el('label',{text:'Casa'},cWrap);
    var cSel=el('select',{class:'wz-select','name':'conf_casa[]'},cWrap);
    cSel.innerHTML=montarOpts(grupos[0]?grupos[0].participantes:part,null);
    /* fora */
    var fWrap=el('div',{class:'wz-field'},wrap);
    el('label',{text:'Fora'},fWrap);
    var fSel=el('select',{class:'wz-select','name':'conf_fora[]'},fWrap);
    fSel.innerHTML=montarOpts(grupos[0]?grupos[0].participantes:part,null);
    /* rodada */
    var rWrap=el('div',{class:'wz-field','style':'flex:0 1 60px'},wrap);
    el('label',{text:'Rodada'},rWrap);
    el('input',{class:'wz-input','type':'number','name':'conf_rodada[]','min':'1','value':'1'},rWrap);
    /* data */
    var dWrap=el('div',{class:'wz-field','style':'flex:0 1 130px'},wrap);
    el('label',{text:'Data'},dWrap);
    el('input',{class:'wz-input','type':'date','name':'conf_data[]'},dWrap);
    /* hora */
    var hWrap=el('div',{class:'wz-field','style':'flex:0 1 85px'},wrap);
    el('label',{text:'Hora'},hWrap);
    el('input',{class:'wz-input','type':'time','name':'conf_horario[]'},hWrap);
    /* local */
    var lWrap=el('div',{class:'wz-field','style':'flex:1 1 120px'},wrap);
    el('label',{text:'Local'},lWrap);
    el('input',{class:'wz-input','name':'conf_local[]'},lWrap);
    /* rm */
    var rmBtn=el('button',{type:'button',class:'wz-btn-remove','html':'×'},wrap);
    rmBtn.onclick=function(){wrap.remove()};
    cont.appendChild(wrap);
  };

  /* ---------- WO / vencedor ---------- */
  window.wzSyncWo=function(cb){
    var tr=cb.closest('tr');
    if(!tr) return;
    var sel=tr.querySelector('select[name*="_vencedor"]');
    if(!sel) return;
    sel.disabled=!cb.checked;
    if(!cb.checked) sel.value='';
  };

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

  /* ---------- checklist toggle style ---------- */
  document.addEventListener('change',function(e){
    if(e.target.matches('.wz-check input[type="checkbox"]')){
      e.target.closest('.wz-check').classList.toggle('wz-check--on',e.target.checked);
    }
  });

})();
