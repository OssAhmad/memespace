import ForceGraph from 'force-graph';
import { api, mindPath } from './app.js';
const themeColors=()=>document.documentElement.dataset.theme==='dark'
  ? {published:'#7b9aff',unpublished:'#9baac1',missing:'#d6a76d',mind:'#b1a0f4',paper:'#1e2630',ink:'#ced7e5',edge:'#56657b',label:'#9dacc0',glow:'#7b9aff'}
  : {published:'#2449d8',unpublished:'#8792b4',missing:'#b87d45',mind:'#2449d8',paper:'#f5f3eb',ink:'#344675',edge:'#b4bbd0',label:'#637197',glow:'#2449d8'};
export async function initGraph() {
  const el=document.querySelector('#graph'), output=document.querySelector('#graph-status');
  let colors=themeColors();
  const response=await fetch('/assets/graph.json');if(!response.ok)throw new Error('Graph unavailable');
  const data=await response.json(), params=new URLSearchParams(location.search);
  const memes=document.querySelector('#show-memes'),minds=document.querySelector('#show-minds');
  let selected=params.get('node'),edgeFocus=params.get('edge'),loadedMinds=false,focusNeedsCenter=true,fitRequested=true;
  const initialTypes=params.get('types'); if(initialTypes!==null){memes.checked=initialTypes.split(',').includes('meme');minds.checked=initialTypes.split(',').includes('mind');}
  const byId=new Map(data.nodes.map(n=>[n.id,n]));
  let selectedNode=byId.get(selected)||data.nodes.find(n=>n.slug===selected);
  if(selectedNode){selected=selectedNode.id;if(selectedNode.kind==='mind')minds.checked=true;else memes.checked=true;}
  else if(selected){
    try{const {mind}=await api(`/api/minds?id=${encodeURIComponent(selected)}`);selectedNode={id:mind.id,kind:'mind',subtype:mind.kind,title:mind.name,status:'mind',path:mindPath(mind.id)};data.nodes.push(selectedNode);byId.set(mind.id,selectedNode);minds.checked=true;}
    catch{output.textContent='That node is not in the published graph.';selected=null;}
  }
  const focusedEdge=data.links.find(e=>e.id===edgeFocus);
  if(focusedEdge){for(const id of [focusedEdge.source,focusedEdge.target]){if(byId.get(id)?.kind==='mind')minds.checked=true;else memes.checked=true;}}
  else if(edgeFocus){output.textContent='That edge is not in the published graph.';edgeFocus=null;}
  const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
  function labelLines(node,ctx,scale){
    const width=(el.clientWidth<600?130:230)/scale,words=node.title.slice(0,80).split(/\s+/),lines=[];let line='';
    for(const word of words){const next=line?line+' '+word:word;if(line&&ctx.measureText(next).width>width){lines.push(line);line=word;}else line=next;}
    if(line)lines.push(line);
    return lines.slice(0,3).map((text,index)=>index===2&&lines.length>3?text+'…':text);
  }
  const graph=new ForceGraph(el).width(el.clientWidth).height(el.clientHeight).backgroundColor('rgba(0,0,0,0)').nodeId('id').nodeLabel(()=>null).linkLabel(e=>e.label)
    .warmupTicks(90).cooldownTicks(100).d3AlphaDecay(.045).d3VelocityDecay(.45)
    .nodeCanvasObject((node,ctx,scale)=>{
      const focus=node.id===selected || edgeFocus && focusedEdge && [focusedEdge.source,focusedEdge.target].includes(node.id);
      const radius=(node.kind==='mind'?6:8),color=colors[node.status]||colors.unpublished;
      ctx.save();
      if(focus){ctx.shadowBlur=22;ctx.shadowColor=colors.glow;ctx.beginPath();ctx.arc(node.x,node.y,radius+7,0,2*Math.PI);ctx.fillStyle=colors.glow+'2a';ctx.fill();ctx.shadowBlur=0;ctx.strokeStyle=colors.glow;ctx.lineWidth=1/scale;ctx.stroke();}
      ctx.beginPath();ctx.arc(node.x,node.y,radius,0,2*Math.PI);ctx.lineWidth=1.8/Math.max(scale,.6);ctx.strokeStyle=color;
      ctx.fillStyle=node.status==='published'?colors.published:colors.paper;ctx.fill();ctx.stroke();
      if(node.kind==='mind'){ctx.beginPath();ctx.arc(node.x,node.y,2.2,0,2*Math.PI);ctx.fillStyle=color;ctx.fill();}
      if(node.status==='missing'){ctx.setLineDash([2/scale,2/scale]);ctx.stroke();ctx.setLineDash([]);}
      ctx.font=`${focus?'600':'400'} ${13/scale}px Arial, sans-serif`;ctx.textAlign='center';ctx.textBaseline='top';ctx.fillStyle=focus?colors.published:colors.ink;
      labelLines(node,ctx,scale).forEach((text,i)=>ctx.fillText(text,node.x,node.y+radius+(9+i*16)/scale));ctx.restore();
    })
    .nodePointerAreaPaint((node,color,ctx,scale)=>{ctx.fillStyle=color;ctx.beginPath();ctx.arc(node.x,node.y,16/Math.max(scale,.6),0,2*Math.PI);ctx.fill();ctx.font=`${13/scale}px Arial`;const lines=labelLines(node,ctx,scale),width=Math.max(...lines.map(text=>ctx.measureText(text).width));ctx.fillRect(node.x-width/2,node.y+8,width,(10+lines.length*16)/scale);})
    .linkColor(e=>e.id===edgeFocus?colors.published:colors.edge).linkWidth(e=>e.id===edgeFocus?2:1)
    .linkDirectionalArrowLength(e=>e.directed?4:0).linkDirectionalArrowRelPos(.85)
    .linkCanvasObjectMode(()=> 'after').linkCanvasObject((edge,ctx,scale)=>{
      if(typeof edge.source!=='object'||typeof edge.target!=='object')return;
      const x=(edge.source.x+edge.target.x)/2,y=(edge.source.y+edge.target.y)/2;
      ctx.save();ctx.font=`${10/scale}px Arial`;ctx.textAlign='center';ctx.textBaseline='middle';const width=ctx.measureText(edge.label).width;
      ctx.fillStyle=colors.paper;ctx.fillRect(x-width/2-3/scale,y-7/scale,width+6/scale,14/scale);ctx.fillStyle=colors.label;ctx.fillText(edge.label,x,y);ctx.restore();
    })
    .onNodeHover(node=>{el.style.cursor=node?'pointer':'grab';})
    .onNodeClick(node=>{location.href=node.path;});
  graph.d3Force('charge').strength(-450);graph.d3Force('link').distance(135);
  graph.d3Force('center').strength(.08);
  function writeUrl(){
    const url=new URL(location.href);url.searchParams.delete('types');
    const types=[memes.checked?'meme':null,minds.checked?'mind':null].filter(Boolean).join(',');
    if(types!=='meme')url.searchParams.set('types',types);
    if(selected)url.searchParams.set('node',selected);else url.searchParams.delete('node');
    if(edgeFocus)url.searchParams.set('edge',edgeFocus);else url.searchParams.delete('edge');
    history.replaceState(null,'',url.pathname+url.search);
  }
  function panel(){
    const wrap=document.querySelector('#focus-panel'),node=byId.get(selected);
    wrap.hidden=!node&&!edgeFocus;
    document.querySelector('#focus-name').textContent=node?node.title:focusedEdge?.label || '';
    const open=document.querySelector('#focus-open');open.hidden=!node;if(node)open.href=node.path;
  }
  function resetView(){
    selected=null;edgeFocus=null;focusNeedsCenter=false;panel();writeUrl();graph.zoomToFit(reduced?0:400,el.clientWidth<600?90:145);
  }
  function fit(){
    const node=graph.graphData().nodes.find(n=>n.id===selected);
    if(node && focusNeedsCenter){graph.centerAt(node.x,node.y,reduced?0:350);graph.zoom(Math.min(1.8,el.clientWidth/320),reduced?0:350);focusNeedsCenter=false;}
    else if(!selected)graph.zoomToFit(reduced?0:350,el.clientWidth<600?90:145);
  }
  graph.onEngineTick(()=>{if(fitRequested){fit();fitRequested=false;}}).onEngineStop(()=>fit());
  async function update(){
    if(minds.checked&&!loadedMinds){
      loadedMinds=true;
      try{
        const result=await api('/api/minds');for(const mind of result.minds)if(!byId.has(mind.id)){const node={id:mind.id,kind:'mind',title:mind.name,subtype:mind.kind,status:'mind',path:mindPath(mind.id)};data.nodes.push(node);byId.set(node.id,node);}
        if(result.next)output.textContent='Showing the first 100 registered Minds. Direct node links can open others.';
      }catch{output.textContent='Showing the published Minds. Registered Minds are temporarily unavailable.';loadedMinds=false;}
    }
    const visible=data.nodes.filter(n=>n.kind==='meme'?memes.checked:minds.checked),ids=new Set(visible.map(n=>n.id));
    if(selected&&!ids.has(selected)){selected=null;focusNeedsCenter=false;}
    if(edgeFocus&&(!ids.has(focusedEdge?.source)||!ids.has(focusedEdge?.target)))edgeFocus=null;
    const old=new Map(graph.graphData().nodes.map(n=>[n.id,n]));
    const nodes=visible.map((n,i)=>({...n,...old.get(n.id),...(!old.has(n.id)?{x:Math.cos(i/visible.length*Math.PI*2)*135,y:Math.sin(i/visible.length*Math.PI*2)*110}:{})}));
    fitRequested=true;
    graph.graphData({nodes,links:data.links.filter(e=>ids.has(e.source)&&ids.has(e.target)).map(e=>({...e}))});
    const list=document.querySelector('#node-list');list.replaceChildren();
    for(const node of visible){const li=document.createElement('li'),link=document.createElement('a'),label=document.createElement('span');link.href=node.path;link.textContent=node.title;link.dir='auto';label.textContent=node.kind==='mind'?node.subtype:node.status==='published'?'Published':node.status==='missing'?'Unwritten link':'Coming soon';li.append(link,label);list.append(li);}
    if(!visible.length){const li=document.createElement('li');li.textContent='Select Memes or Minds to explore.';list.append(li);}
    document.querySelector('#node-count').textContent=`${visible.length} ${visible.length===1?'node':'nodes'}`;
    document.querySelector('#missing-legend').hidden=!visible.some(n=>n.status==='missing');
    panel();writeUrl();fit();
  }
  const resize=new ResizeObserver(()=>{graph.width(el.clientWidth).height(el.clientHeight);fit();});resize.observe(el);
  memes.addEventListener('change',update);minds.addEventListener('change',update);
  document.querySelector('#zoom-in').addEventListener('click',()=>graph.zoom(Math.min(8,graph.zoom()*1.4),reduced?0:200));
  document.querySelector('#zoom-out').addEventListener('click',()=>graph.zoom(Math.max(.2,graph.zoom()/1.4),reduced?0:200));
  document.querySelector('#fit-graph').addEventListener('click',resetView);document.querySelector('#clear-focus').addEventListener('click',resetView);
  document.addEventListener('visibilitychange',()=>document.hidden?graph.pauseAnimation():graph.resumeAnimation());
  document.addEventListener('memespace-theme',()=>{colors=themeColors();graph.linkColor(e=>e.id===edgeFocus?colors.published:colors.edge);});
  await update();
}
