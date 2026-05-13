import React, { useState } from 'react'
import { fmtDate } from '../lib/dateUtils'
import { logo_rion_notag } from '../lib/icons'
import { useNavigate } from 'react-router-dom'

const NAVY = '#3D5570'
const DEEP = '#2A3D54'
const PINK = '#EB99C2'
const BRAND_PINK = '#DA408D'

const STATUS_CYCLE = ['To Do','In Progress','In Review','Done']
const STATUS_STYLE = {
  'Done':        { color:'#3A9E7E', bg:'rgba(58,158,126,0.1)',  border:'rgba(58,158,126,0.3)'  },
  'In Review':   { color:'#C9A55A', bg:'rgba(201,165,90,0.1)',  border:'rgba(201,165,90,0.3)'  },
  'In Progress': { color:'#4A7FBF', bg:'rgba(74,127,191,0.1)',  border:'rgba(74,127,191,0.3)'  },
  'To Do':       { color:'#7A8090', bg:'rgba(122,128,144,0.1)', border:'rgba(122,128,144,0.3)' },
}
const PRIO_COLOR = { High:'#D9726A', Medium:'#C9A55A', Low:'#6A9FCC' }
const PROJECT_COLORS = ['#EB99C2','#6A9FCC','#6BBFA0','#C9A55A','#D9726A','#9B7FCC']

const INIT_PROJECTS = [
  {
    id:1, name:'Building Radar', color:'#EB99C2',
    desc:'Full platform build — from concept to live product.',
    milestones:[
      { id:1, name:'Discovery & Strategy',     status:'Done',        due:'2025-03-31', tasks:[
        { id:1, title:'Define scope and requirements', priority:'High',   status:'Done',        due:'2025-03-10' },
        { id:2, title:'Stakeholder interviews',        priority:'Medium', status:'Done',        due:'2025-03-20' },
      ]},
      { id:2, name:'Design & Branding',         status:'In Progress', due:'2025-06-30', tasks:[
        { id:3, title:'Brand identity & visual system',priority:'High',   status:'Done',        due:'2025-04-10' },
        { id:4, title:'UI component library',          priority:'High',   status:'In Progress', due:'2025-05-20' },
        { id:5, title:'Dashboard wireframes',          priority:'Medium', status:'In Progress', due:'2025-06-01'  },
        { id:6, title:'Mobile responsive layouts',     priority:'Low',    status:'To Do',       due:'2025-06-20' },
      ]},
      { id:3, name:'Development — Core Platform', status:'To Do',    due:'2025-10-31', tasks:[
        { id:7, title:'Authentication & user management', priority:'High',   status:'To Do', due:'2025-07-15' },
        { id:8, title:'Client data model & API',          priority:'High',   status:'To Do', due:'2025-07-30' },
        { id:9, title:'Dashboard & reporting',            priority:'Medium', status:'To Do', due:'2025-08-31' },
      ]},
      { id:4, name:'Beta Launch',               status:'To Do',       due:'2025-12-15', tasks:[
        { id:10, title:'Internal testing',  priority:'High',   status:'To Do', due:'2025-11-01'  },
        { id:11, title:'Bug fixes',         priority:'High',   status:'To Do', due:'2025-11-30' },
        { id:12, title:'Go live',           priority:'High',   status:'To Do', due:'2025-12-15' },
      ]},
    ]
  }
]

function pct(tasks) {
  if (!tasks.length) return 0
  return Math.round(tasks.filter(t=>t.status==='Done').length/tasks.length*100)
}

function StatusBadge({ status, onClick }) {
  const s = STATUS_STYLE[status] || STATUS_STYLE['To Do']
  return (
    <span onClick={onClick} style={{ padding:'2px 9px', borderRadius:20, fontSize:10, fontWeight:500, color:s.color, background:s.bg, border:`1px solid ${s.border}`, cursor:onClick?'pointer':'default', whiteSpace:'nowrap' }}>
      {status}
    </span>
  )
}

export default function ProjectStudio() {
  const navigate = useNavigate()
  const [projects, setProjects] = useState(INIT_PROJECTS)
  const [activeProject, setActiveProject] = useState(1)
  const [openMilestones, setOpenMilestones] = useState({2:true})
  const [addingTask, setAddingTask] = useState(null)
  const [newTask, setNewTask] = useState({ title:'', due:'', priority:'Medium' })
  const [showNewProject, setShowNewProject] = useState(false)
  const [newProjectName, setNewProjectName] = useState('')
  const [showNewMilestone, setShowNewMilestone] = useState(false)
  const [newMs, setNewMs] = useState({ name:'', due:'' })
  const [dragMsId, setDragMsId] = useState(null)
  const [dragOverMsId, setDragOverMsId] = useState(null)

  const proj = projects.find(p=>p.id===activeProject)
  const allTasks = proj ? proj.milestones.flatMap(m=>m.tasks) : []
  const totalPct = allTasks.length ? Math.round(allTasks.filter(t=>t.status==='Done').length/allTasks.length*100) : 0
  const overdue = allTasks.filter(t=>t.status!=='Done'&&t.due&&new Date(t.due)<new Date()).length

  function cycleStatus(pId, mId, tId) {
    setProjects(ps=>ps.map(p=>p.id!==pId?p:{...p,milestones:p.milestones.map(m=>m.id!==mId?m:{...m,tasks:m.tasks.map(t=>t.id!==tId?t:{...t,status:STATUS_CYCLE[(STATUS_CYCLE.indexOf(t.status)+1)%STATUS_CYCLE.length]})})}))
  }

  function deleteTask(pId, mId, tId) {
    setProjects(ps=>ps.map(p=>p.id!==pId?p:{...p,milestones:p.milestones.map(m=>m.id!==mId?m:{...m,tasks:m.tasks.filter(t=>t.id!==tId)})}))
  }

  function addTask(pId, mId) {
    if (!newTask.title.trim()) return
    const task = { id: Date.now(), ...newTask }
    setProjects(ps=>ps.map(p=>p.id!==pId?p:{...p,milestones:p.milestones.map(m=>m.id!==mId?m:{...m,tasks:[...m.tasks,task]})}))
    setNewTask({ title:'', due:'', priority:'Medium' })
    setAddingTask(null)
  }

  function addProject() {
    if (!newProjectName.trim()) return
    const id = Date.now()
    setProjects(ps=>[...ps,{ id, name:newProjectName, color:PROJECT_COLORS[ps.length%PROJECT_COLORS.length], desc:'', milestones:[] }])
    setActiveProject(id)
    setNewProjectName('')
    setShowNewProject(false)
  }

  function addMilestone(pId) {
    if (!newMs.name.trim()) return
    const ms = { id:Date.now(), name:newMs.name, status:'To Do', due:newMs.due, tasks:[] }
    setProjects(ps=>ps.map(p=>p.id!==pId?p:{...p,milestones:[...p.milestones,ms]}))
    setNewMs({ name:'', due:'' })
    setShowNewMilestone(false)
  }

  function handleMsDragStart(msId) { setDragMsId(msId) }
  function handleMsDragOver(e, msId) { e.preventDefault(); setDragOverMsId(msId) }
  function handleMsDrop(pId, targetMsId) {
    if (!dragMsId || dragMsId === targetMsId) { setDragMsId(null); setDragOverMsId(null); return }
    setProjects(ps => ps.map(p => {
      if (p.id !== pId) return p
      const milestones = [...p.milestones]
      const fromIdx = milestones.findIndex(m => m.id === dragMsId)
      const toIdx = milestones.findIndex(m => m.id === targetMsId)
      const [moved] = milestones.splice(fromIdx, 1)
      milestones.splice(toIdx, 0, moved)
      return { ...p, milestones }
    }))
    setDragMsId(null)
    setDragOverMsId(null)
  }

  const inp = { background:'#f7f8fa', border:'1px solid #e2e6ed', borderRadius:6, padding:'6px 10px', fontSize:12, color:'#1C2533', fontFamily:"'Montserrat',sans-serif", outline:'none' }

  return (
    <div style={{ display:'flex', height:'calc(100vh - 60px)', fontFamily:"'Montserrat',system-ui,sans-serif", overflow:'hidden' }}>
      {/* ── SIDEBAR ── */}
      <div style={{ width:252, flexShrink:0, background:DEEP, display:'flex', flexDirection:'column', height:'100%', boxShadow:'4px 0 20px rgba(0,0,0,0.15)' }}>
        {/* Brand */}
        <div style={{ padding:'16px 18px 0', borderBottom:'1px solid rgba(255,255,255,0.08)' }}>
          <div style={{ paddingBottom:12 }}>
            <img src={logo_rion_notag} alt="RION Capital" style={{ height:38, width:'auto', objectFit:'contain' }}/>
            <div style={{ fontSize:9, color:PINK, letterSpacing:'0.18em', fontFamily:"'Montserrat',sans-serif", fontWeight:600, marginTop:6, textTransform:'uppercase' }}>Project Studio</div>
          </div>
          <div style={{ height:1.5, background:`linear-gradient(90deg, ${PINK}, rgba(235,153,194,0.1))`, margin:'0 -18px' }}/>
        </div>
        {/* Project list */}
        <div style={{ fontSize:9, color:'rgba(255,255,255,0.3)', letterSpacing:'0.18em', padding:'14px 18px 6px', fontFamily:'monospace' }}>PROJECTS</div>
        <div style={{ flex:1, overflowY:'auto', padding:'0 10px' }}>
          {projects.map(p => {
            const pts = p.milestones.flatMap(m=>m.tasks)
            const pp = pts.length ? Math.round(pts.filter(t=>t.status==='Done').length/pts.length*100) : 0
            return (
              <button key={p.id} onClick={()=>setActiveProject(p.id)} style={{ display:'flex', alignItems:'center', gap:10, width:'100%', padding:10, background:activeProject===p.id?'rgba(235,153,194,0.12)':'none', border:activeProject===p.id?`1px solid rgba(235,153,194,0.3)`:'1px solid transparent', borderRadius:8, cursor:'pointer', marginBottom:3, textAlign:'left', transition:'all 0.15s' }}>
                <div style={{ width:8, height:8, borderRadius:'50%', background:p.color, flexShrink:0 }}/>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:12, fontWeight:600, color:activeProject===p.id?PINK:'rgba(255,255,255,0.7)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{p.name}</div>
                  <div style={{ display:'flex', alignItems:'center', gap:5, marginTop:4 }}>
                    <div style={{ flex:1, height:2, background:'rgba(255,255,255,0.1)', borderRadius:1, overflow:'hidden' }}>
                      <div style={{ height:'100%', width:`${pp}%`, background:p.color, borderRadius:1 }}/>
                    </div>
                    <span style={{ fontSize:9, color:'rgba(255,255,255,0.3)', fontFamily:'monospace', minWidth:26, textAlign:'right' }}>{pp}%</span>
                  </div>
                </div>
              </button>
            )
          })}
        </div>
        {/* New project */}
        <div style={{ padding:'12px 12px 18px', borderTop:'1px solid rgba(255,255,255,0.07)' }}>
          {showNewProject ? (
            <div style={{ display:'flex', gap:4 }}>
              <input autoFocus value={newProjectName} onChange={e=>setNewProjectName(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')addProject();if(e.key==='Escape'){setShowNewProject(false);setNewProjectName('')}}} placeholder="Project name..." style={{ ...inp, flex:1, background:'rgba(255,255,255,0.08)', border:'1px solid rgba(235,153,194,0.3)', color:'#fff', fontSize:11 }}/>
              <button onClick={addProject} style={{ padding:'4px 8px', borderRadius:6, background:BRAND_PINK, border:'none', color:'#fff', cursor:'pointer', fontSize:11 }}>+</button>
            </div>
          ) : (
            <button onClick={()=>setShowNewProject(true)} style={{ width:'100%', padding:'9px 0', background:'transparent', border:`1px dashed rgba(235,153,194,0.3)`, borderRadius:7, cursor:'pointer', color:'rgba(255,255,255,0.4)', fontSize:11, fontFamily:"'Montserrat',sans-serif", transition:'all 0.15s' }}
              onMouseOver={e=>{e.currentTarget.style.borderColor=PINK;e.currentTarget.style.color=PINK}} onMouseOut={e=>{e.currentTarget.style.borderColor='rgba(235,153,194,0.3)';e.currentTarget.style.color='rgba(255,255,255,0.4)'}}>
              + New Project
            </button>
          )}
          <button onClick={()=>navigate('/')} style={{ width:'100%', marginTop:8, padding:'6px 0', background:'transparent', border:'none', cursor:'pointer', color:'rgba(255,255,255,0.25)', fontSize:10, fontFamily:"'Montserrat',sans-serif" }}
            onMouseOver={e=>e.currentTarget.style.color='rgba(255,255,255,0.5)'} onMouseOut={e=>e.currentTarget.style.color='rgba(255,255,255,0.25)'}>
            ← Back to Home
          </button>
        </div>
      </div>

      {/* ── MAIN ── */}
      {proj ? (
        <div style={{ flex:1, overflowY:'auto', padding:'32px 40px', background:'#fff' }}>
          {/* Project header */}
          <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:12, flexWrap:'wrap', marginBottom:24, paddingBottom:18, borderBottom:'2px solid #e2e6ed' }}>
            <div>
              <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:4 }}>
                <div style={{ width:12, height:12, borderRadius:'50%', background:proj.color, flexShrink:0 }}/>
                <h2 style={{ fontSize:26, fontWeight:800, color:NAVY, fontFamily:'Georgia,serif' }}>{proj.name}</h2>
              </div>
              {proj.desc && <p style={{ marginLeft:22, fontSize:12, color:'#7A8090' }}>{proj.desc}</p>}
            </div>
            <button onClick={()=>setShowNewMilestone(true)} style={{ background:NAVY, border:'none', borderRadius:8, padding:'9px 18px', color:'#fff', fontSize:11, fontWeight:600, cursor:'pointer', fontFamily:"'Montserrat',sans-serif", letterSpacing:'0.06em' }}
              onMouseOver={e=>e.currentTarget.style.background=DEEP} onMouseOut={e=>e.currentTarget.style.background=NAVY}>
              + NEW MILESTONE
            </button>
          </div>

          {/* New milestone modal */}
          {showNewMilestone && (
            <div style={{ background:'#f7f8fa', border:'1px solid #e2e6ed', borderRadius:10, padding:16, marginBottom:20, display:'flex', gap:10, alignItems:'flex-end', flexWrap:'wrap' }}>
              <div>
                <div style={{ fontSize:10, color:'#7A8090', marginBottom:4, fontWeight:500 }}>MILESTONE NAME</div>
                <input autoFocus value={newMs.name} onChange={e=>setNewMs(m=>({...m,name:e.target.value}))} style={{ ...inp, width:240 }} placeholder="e.g. Phase 3 — Testing"/>
              </div>
              <div>
                <div style={{ fontSize:10, color:'#7A8090', marginBottom:4, fontWeight:500 }}>DUE DATE</div>
                <input type="date" value={newMs.due} onChange={e=>setNewMs(m=>({...m,due:e.target.value}))} style={inp}/>
              </div>
              <button onClick={()=>addMilestone(proj.id)} style={{ background:BRAND_PINK, border:'none', borderRadius:7, padding:'7px 16px', color:'#fff', fontWeight:600, fontSize:11, cursor:'pointer', fontFamily:"'Montserrat',sans-serif" }}>Add</button>
              <button onClick={()=>{setShowNewMilestone(false);setNewMs({name:'',due:''})}} style={{ background:'transparent', border:'1px solid #e2e6ed', borderRadius:7, padding:'7px 14px', color:'#7A8090', fontSize:11, cursor:'pointer', fontFamily:"'Montserrat',sans-serif" }}>Cancel</button>
            </div>
          )}

          {/* Overview card */}
          <div style={{ background:'#f7f8fa', borderRadius:12, padding:'20px 24px', marginBottom:24, border:'1px solid #e2e6ed' }}>
            <div style={{ display:'flex', gap:28, flexWrap:'wrap', marginBottom:20 }}>
              {/* Progress ring */}
              <div style={{ display:'flex', alignItems:'center', justifyContent:'center', position:'relative', width:80, height:80, flexShrink:0 }}>
                <svg width="80" height="80" style={{ transform:'rotate(-90deg)' }}>
                  <circle cx="40" cy="40" r="33" fill="none" stroke="#e2e6ed" strokeWidth="7"/>
                  <circle cx="40" cy="40" r="33" fill="none" stroke={PINK} strokeWidth="7" strokeDasharray="207.3" strokeDashoffset={207.3*(1-totalPct/100)} strokeLinecap="round"/>
                </svg>
                <div style={{ position:'absolute', textAlign:'center' }}>
                  <div style={{ fontSize:16, fontWeight:700, color:BRAND_PINK }}>{totalPct}%</div>
                  <div style={{ fontSize:8, color:'#7A8090', letterSpacing:'0.1em' }}>DONE</div>
                </div>
              </div>
              {/* Stats */}
              <div style={{ display:'flex', gap:20, alignItems:'center' }}>
                {[['TASKS',allTasks.length,'#2A3D54'],['MILESTONES',proj.milestones.length,'#2A3D54'],['OVERDUE',overdue,overdue>0?'#C0443C':'#3A9E7E']].map(([l,v,c])=>(
                  <div key={l} style={{ textAlign:'center' }}>
                    <div style={{ fontSize:22, fontWeight:700, color:c }}>{v}</div>
                    <div style={{ fontSize:9, color:'#7A8090', letterSpacing:'0.1em' }}>{l}</div>
                  </div>
                ))}
              </div>
            </div>
            {/* Milestone progress bars */}
            <div>
              <div style={{ fontSize:10, fontWeight:600, color:'#7A8090', textTransform:'uppercase', letterSpacing:'0.1em', marginBottom:10 }}>Milestone Progress</div>
              {proj.milestones.map(m => {
                const mp = pct(m.tasks)
                const s = STATUS_STYLE[m.status] || STATUS_STYLE['To Do']
                return (
                  <div key={m.id} style={{ display:'flex', alignItems:'center', gap:10, marginBottom:7 }}>
                    <span style={{ fontSize:11, color:'#3D4F6B', minWidth:180, flex:1 }}>{m.name}</span>
                    <div style={{ flex:2, height:5, background:'#e2e6ed', borderRadius:3, overflow:'hidden' }}>
                      <div style={{ height:'100%', width:`${mp}%`, background:mp===100?'#6BBFA0':PINK, borderRadius:3, transition:'width 0.4s' }}/>
                    </div>
                    <span style={{ fontSize:10, fontWeight:600, color:mp===100?'#6BBFA0':BRAND_PINK, minWidth:30, textAlign:'right' }}>{mp}%</span>
                    <StatusBadge status={m.status}/>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Milestones */}
          {proj.milestones.map(m => {
            const mp = pct(m.tasks)
            const isOpen = !!openMilestones[m.id]
            const borderColor = mp===100?'#6BBFA0':m.status==='In Progress'?PINK:m.status==='In Review'?'#C9A55A':'#CBD2DC'
            return (
              <div key={m.id}
                draggable
                onDragStart={()=>handleMsDragStart(m.id)}
                onDragOver={e=>handleMsDragOver(e, m.id)}
                onDrop={()=>handleMsDrop(proj.id, m.id)}
                onDragEnd={()=>{setDragMsId(null);setDragOverMsId(null)}}
                style={{ border:'1px solid #e2e6ed', borderLeft:`4px solid ${borderColor}`, borderRadius:8, marginBottom:12, overflow:'hidden', opacity:dragMsId===m.id?0.4:1, outline:dragOverMsId===m.id&&dragMsId!==m.id?`2px dashed ${PINK}`:'none', transition:'opacity 0.15s', cursor:'grab' }}>
                {/* Milestone header */}
                <div onClick={e=>{if(e.target.dataset.drag)return;setOpenMilestones(o=>({...o,[m.id]:!o[m.id]}))}} style={{ display:'flex', alignItems:'center', gap:10, padding:'12px 16px', cursor:'pointer', background:isOpen?'#fafbfd':'#fff' }}>
                  <span data-drag='1' title='Drag to reorder' style={{ color:'#CBD2DC', fontSize:12, cursor:'grab', userSelect:'none', flexShrink:0 }}>⠿</span>
                  <span style={{ fontSize:10, color:'#7A8090', transform:isOpen?'rotate(90deg)':'none', transition:'transform 0.2s', display:'inline-block' }}>▶</span>
                  <div style={{ flex:1 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4 }}>
                      <span style={{ fontSize:13, fontWeight:600, color:NAVY }}>{m.name}</span>
                      <StatusBadge status={m.status}/>
                    </div>
                    <div style={{ height:3, background:'#e2e6ed', borderRadius:2, overflow:'hidden' }}>
                      <div style={{ height:'100%', width:`${mp}%`, background:borderColor, borderRadius:2, transition:'width 0.4s' }}/>
                    </div>
                  </div>
                  <div style={{ textAlign:'right', minWidth:60 }}>
                    <div style={{ fontSize:13, fontWeight:600, color:borderColor }}>{mp}%</div>
                    <div style={{ fontSize:10, color:'#7A8090' }}>{fmtDate(m.due)}</div>
                  </div>
                </div>
                {/* Tasks */}
                {isOpen && (
                  <div style={{ padding:'0 16px 14px', background:'#fff' }}>
                    <div style={{ display:'grid', gridTemplateColumns:'8px 1fr 100px 110px 28px', gap:'0 10px', padding:'6px 0', borderBottom:'1px solid #e2e6ed', marginBottom:4 }}>
                      {['','Task','Due','Status',''].map((h,i)=>(
                        <span key={i} style={{ fontSize:9, fontWeight:600, color:'#7A8090', textTransform:'uppercase', letterSpacing:'0.08em' }}>{h}</span>
                      ))}
                    </div>
                    {m.tasks.map(t => (
                      <div key={t.id} style={{ display:'grid', gridTemplateColumns:'8px 1fr 100px 110px 28px', gap:'0 10px', alignItems:'center', padding:'7px 0', borderBottom:'1px solid #f0f2f6' }}>
                        <span style={{ width:8, height:8, borderRadius:'50%', background:PRIO_COLOR[t.priority]||'#7A8090', display:'block' }}/>
                        <span style={{ fontSize:12, color:t.status==='Done'?'#7A8090':'#1C2533', textDecoration:t.status==='Done'?'line-through':'none' }}>{t.title}</span>
                        <span style={{ fontSize:11, color:t.due&&new Date(t.due)<new Date()&&t.status!=='Done'?'#C0443C':'#7A8090' }}>{fmtDate(t.due)}</span>
                        <StatusBadge status={t.status} onClick={()=>cycleStatus(proj.id,m.id,t.id)}/>
                        <button onClick={()=>deleteTask(proj.id,m.id,t.id)} style={{ background:'none', border:'none', cursor:'pointer', color:'#CBD2DC', fontSize:14, lineHeight:1 }}
                          onMouseOver={e=>e.currentTarget.style.color='#C0443C'} onMouseOut={e=>e.currentTarget.style.color='#CBD2DC'}>×</button>
                      </div>
                    ))}
                    {/* Add task */}
                    {addingTask===m.id ? (
                      <div style={{ display:'flex', gap:8, marginTop:10, flexWrap:'wrap', alignItems:'flex-end' }}>
                        <input autoFocus value={newTask.title} onChange={e=>setNewTask(t=>({...t,title:e.target.value}))} placeholder="Task title..." style={{ ...inp, flex:1, minWidth:160 }} onKeyDown={e=>e.key==='Enter'&&addTask(proj.id,m.id)}/>
                        <input type="date" value={newTask.due} onChange={e=>setNewTask(t=>({...t,due:e.target.value}))} style={inp}/>
                        <select value={newTask.priority} onChange={e=>setNewTask(t=>({...t,priority:e.target.value}))} style={inp}>
                          <option>High</option><option>Medium</option><option>Low</option>
                        </select>
                        <button onClick={()=>addTask(proj.id,m.id)} style={{ background:BRAND_PINK, border:'none', borderRadius:6, padding:'6px 14px', color:'#fff', fontWeight:600, fontSize:11, cursor:'pointer', fontFamily:"'Montserrat',sans-serif" }}>Add</button>
                        <button onClick={()=>setAddingTask(null)} style={{ background:'transparent', border:'1px solid #e2e6ed', borderRadius:6, padding:'6px 12px', color:'#7A8090', fontSize:11, cursor:'pointer', fontFamily:"'Montserrat',sans-serif" }}>Cancel</button>
                      </div>
                    ) : (
                      <button onClick={()=>setAddingTask(m.id)} style={{ marginTop:10, background:'transparent', border:`1px dashed rgba(218,64,141,0.3)`, borderRadius:6, padding:'6px 14px', color:'#DA408D', fontSize:11, cursor:'pointer', fontFamily:"'Montserrat',sans-serif", display:'flex', alignItems:'center', gap:6 }}>
                        <span style={{ fontSize:14 }}>＋</span> Add task
                      </button>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      ) : (
        <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', color:'#7A8090', fontSize:14 }}>
          Select a project from the sidebar
        </div>
      )}
    </div>
  )
}
