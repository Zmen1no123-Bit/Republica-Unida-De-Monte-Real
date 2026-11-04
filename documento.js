const docs={
'constituicao':'documentos/constituicao.md',
'decreto-modelo':'documentos/decretos/DECRETO-001-MODELO.md',
'regimento-congresso':'documentos/regimento-congresso.md',
'presidencia':'instituicoes/presidencia.md',
'congresso':'instituicoes/congresso.md',
'supremo-tribunal':'instituicoes/supremo-tribunal.md',
'migracao':'ministerios/migracao.md'
};
const params=new URLSearchParams(location.search);
const key=params.get('doc');
const target=docs[key];
const root=document.getElementById('documentContent');
if(!target){root.innerHTML='<h1>Documento não encontrado</h1><p>Escolha um documento no portal institucional.</p>';}
else{
 document.title=(key==='decreto-modelo'?'Modelo de decreto':key.replaceAll('-',' ').replace(/\b\w/g,c=>c.toUpperCase()))+' • RUMR';
 fetch(target).then(r=>{if(!r.ok)throw new Error('Não foi possível carregar o documento.');return r.text();})
 .then(md=>{const html=marked.parse(md,{gfm:true,breaks:false});root.innerHTML=DOMPurify.sanitize(html);})
 .catch(()=>{root.innerHTML='<h1>Falha ao carregar</h1><p>Tente novamente ou volte ao portal.</p>';});
}