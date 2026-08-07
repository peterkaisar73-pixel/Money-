(() => {
"use strict";

const KEY = "budget_offline_v1";
const today = () => new Date().toISOString().slice(0,10);
const uid = () => crypto?.randomUUID?.() || ("id_"+Date.now()+"_"+Math.random().toString(36).slice(2));
const money = n => new Intl.NumberFormat("ar-EG",{maximumFractionDigits:2}).format(Number(n)||0) + " ج.م";
const num = v => Math.max(0, Number(v)||0);
const esc = s => String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
const sum = arr => arr.reduce((a,b)=>a+Number(b||0),0);

const blank = {
  settings:{theme:"light"},
  cycles:[],
  currentCycleId:null,
  savingsMethods:[
    {id:"fawry",name:"فوري",system:true},
    {id:"gold",name:"ذهب",system:false},
    {id:"gold_investment",name:"استثمار الذهب",system:false},
    {id:"association",name:"جمعية",system:false},
    {id:"certificate",name:"شهادة",system:false},
    {id:"investment",name:"استثمار",system:false},
    {id:"other",name:"أخرى",system:false}
  ],
  fawry:{openingBalance:0, transactions:[], closings:[]},
  debt:{original:0, payments:[]},
  transactions:[]
};
let db = load();

function load(){
  try{
    const x=JSON.parse(localStorage.getItem(KEY));
    if(x){
      x.settings ||= {theme:"light"}; x.cycles ||= []; x.savingsMethods ||= blank.savingsMethods;
      if(!x.savingsMethods.some(m=>m.id==="gold_investment")) x.savingsMethods.splice(Math.max(0,x.savingsMethods.findIndex(m=>m.id==="association")),0,{id:"gold_investment",name:"استثمار الذهب",system:false});
      x.fawry ||= blank.fawry; x.debt ||= blank.debt; x.transactions ||= [];
      x.cycles.forEach(c=>{c.income ||= []; c.incomeAllocations ||= []; c.envelopes ||= []; c.savings ||= [];});
      return x;
    }
  }catch(e){}
  return structuredClone(blank);
}
function save(){localStorage.setItem(KEY,JSON.stringify(db));}
function toast(msg){const el=document.getElementById("toast");el.textContent=msg;el.classList.add("show");setTimeout(()=>el.classList.remove("show"),2200)}
function current(){return db.cycles.find(c=>c.id===db.currentCycleId) || null}
function cycleBy(id){return db.cycles.find(c=>c.id===id)}
function cycleName(c){return c?.name || monthLabel(c)}
function activeOrLatest(){return current() || db.cycles.at(-1) || null}
function cycleIncome(c){return sum((c?.income||[]).map(x=>x.amount))}
function cycleSavings(c){return sum((c?.savings||[]).map(x=>x.amount))}
function cycleActual(c){return sum((c?.envelopes||[]).map(x=>x.actual))}
function cyclePlanned(c){return sum((c?.envelopes||[]).map(x=>x.planned))}
function cycleEnvelopeAllocations(c){return sum((c?.incomeAllocations||[]).filter(x=>x.targetType==="envelope").map(x=>x.amount))}
function cycleAllocated(c){return cyclePlanned(c)+cycleEnvelopeAllocations(c)+savingsByMethod(c,"fawry")+savingsByMethod(c,"gold_investment")}
function monthLabel(c){
  if(!c) return "الدورة";
  const d=new Date((c.startDate||today())+"T12:00:00");
  return new Intl.DateTimeFormat("ar-EG",{month:"long",year:"numeric"}).format(d);
}
function cycleDisplayName(c){return c?.name || monthLabel(c)}
function previousCycle(c){
  if(!c) return null;
  const i=db.cycles.findIndex(x=>x.id===c.id);
  return i>0?db.cycles[i-1]:null;
}
function cycleUnallocated(c){return Math.max(0,cycleIncome(c)-cycleAllocated(c))}
function cycleOverAllocated(c){return Math.max(0,cycleAllocated(c)-cycleIncome(c))}
function allocationStatus(c){return {income:cycleIncome(c),allocated:cycleAllocated(c),remaining:cycleUnallocated(c),over:cycleOverAllocated(c)}}
function actualIsEntered(e){return e?.actualEntered===true || (e?.actualEntered===undefined && e?.actual!==null && e?.actual!==undefined && e?.actual!=="")}
function envelopeDelta(e){return actualIsEntered(e)?Number(e.planned||0)-Number(e.actual||0):0}
function savingsByMethod(c,id){return sum((c?.savings||[]).filter(x=>x.methodId===id).map(x=>x.amount))}
function allSavingsByMethod(id){return sum(db.cycles.flatMap(c=>(c.savings||[]).filter(x=>x.methodId===id).map(x=>x.amount)))}
function debtPaid(){return sum(db.debt.payments.map(x=>x.amount))}
function debtRemaining(){return Math.max(0,Number(db.debt.original||0)-debtPaid())}
function fawryForCycle(c){
  const tx=db.fawry.transactions.filter(x=>x.cycleId===c?.id);
  const deposits=sum(tx.filter(x=>x.type==="deposit").map(x=>x.amount));
  const withdrawals=sum(tx.filter(x=>x.type==="withdrawal").map(x=>x.amount));
  const close=db.fawry.closings.find(x=>x.cycleId===c?.id);
  const expected=Number(c?.fawryOpening||0)+deposits-withdrawals;
  const interest=close ? Number(close.actualBalance||0)-expected : null;
  return {tx,deposits,withdrawals,close,expected,interest};
}
function addTransaction(t){db.transactions.unshift({...t,id:uid(),date:t.date||today()});}

function render(){
  document.body.classList.toggle("dark",db.settings.theme==="dark");
  renderDashboard(); renderIncome(); renderEnvelopes(); renderSavings(); renderFawry(); renderDebt(); renderTransactions(); renderReports(); renderBackup();
}
function pageHead(title,desc,actions=""){return `<div class="page-head"><div><h2>${title}</h2><p>${desc}</p></div><div class="action-row">${actions}</div></div>`}
function noCycle(){return `<div class="card empty"><h3>لا توجد دورة مالية نشطة</h3><p>ابدأ دورة جديدة يدويًا عند نزول المرتب.</p><button class="btn btn-primary" onclick="openNewCycle()">🟢 بدء دورة مالية جديدة</button></div>`}
function metric(icon,label,value,sub="",cls=""){return `<div class="card metric ${cls}"><div class="label">${icon} ${label}</div><div class="value">${value}</div><div class="sub">${sub}</div></div>`}

function renderDashboard(){
 const c=activeOrLatest(); let h=pageHead("لوحة التحكم","الصورة المالية الكاملة لدورتك الحالية",`<button class="btn btn-secondary btn-sm" onclick="showPage('transactions')">🧾 سجل العمليات</button>`);
 if(!c){document.getElementById("page-dashboard").innerHTML=h+noCycle();return}
 const f=fawryForCycle(c), debt=debtRemaining(), paid=debtPaid(), pct=db.debt.original?Math.min(100,paid/db.debt.original*100):0;
 const surplus=sum((c.envelopes||[]).map(e=>Math.max(0,envelopeDelta(e))));
 const prev=previousCycle(c);
 h+=`<div class="card" style="margin-bottom:18px"><div class="section-title"><h3>📅 اختيار الدورة</h3><select class="cycle-select" onchange="selectCycle(this.value)">${db.cycles.slice().reverse().map(x=>`<option value="${x.id}" ${x.id===c.id?"selected":""}>${esc(cycleDisplayName(x))} — ${esc(x.startDate||"")}${x.endDate?" → "+esc(x.endDate):""}</option>`).join("")}</select></div></div>`;
 h+=(!c.approved&&!c.closed?`<div class="card" style="margin-bottom:18px;border:1px solid var(--warning);background:color-mix(in srgb,var(--warning) 8%,var(--surface))"><strong>🟡 الدورة غير معتمدة بعد</strong><p class="muted">راجع الدخل وبنود الأظرف المقترحة، ثم اضغط «اعتماد الدورة الجديدة».</p><button class="btn btn-primary btn-sm" onclick="approveCycle()">✅ اعتماد الدورة الجديدة</button></div>`:`<div></div>`)+`<div class="card hero" style="margin-bottom:18px"><div class="kpi-row">
   <div><div class="muted">الدورة الحالية</div><strong>${esc(cycleName(c))}</strong></div>
   <div><div class="muted">من</div><strong>${esc(c.startDate)}</strong></div>
   <div><div class="muted">الحالة</div><strong>${c.closed?"مغلقة":"مفتوحة"}</strong></div>
   ${c.closed?`<div><div class="muted">أغلقت في</div><strong>${esc(c.endDate||"")}</strong></div>`:""}
 </div></div>`;
 if(prev){
   const pActual=cycleActual(prev), pIncome=cycleIncome(prev), pSavings=cycleSavings(prev), pFawry=fawryForCycle(prev);
   h+=`<div class="card" style="margin-bottom:18px"><div class="section-title"><h3>📊 مقارنة بالدورة السابقة</h3><span class="muted">${esc(cycleDisplayName(prev))}</span></div><div class="comparison-grid">
     ${comparisonCell("الدخل",cycleIncome(c),pIncome)}
     ${comparisonCell("المصروف الفعلي",cycleActual(c),pActual)}
     ${comparisonCell("التحويش",cycleSavings(c),pSavings)}
     ${comparisonCell("رصيد فوري",f.close?.actualBalance??f.expected,pFawry.close?.actualBalance??pFawry.expected)}
   </div></div>`;
 }
 const al=allocationStatus(c);
 h+=`<div class="card" style="margin-bottom:18px;border:1px solid var(--border);background:var(--surface2)">
   <div class="section-title"><h3>📌 توزيع دخل الدورة</h3><strong class="${al.remaining>0?"money-negative":"money-positive"}">${al.remaining>0?`متبقي ${money(al.remaining)}`:`تم توزيع ${money(al.allocated)}`}</strong></div>
   <div class="list"><div class="list-row"><span>إجمالي الدخل</span><strong>${money(al.income)}</strong></div><div class="list-row"><span>على الأظرف</span><strong>${money(cyclePlanned(c))}</strong></div><div class="list-row"><span>تحويش فوري</span><strong>${money(savingsByMethod(c,"fawry"))}</strong></div><div class="list-row"><span>استثمار الذهب</span><strong>${money(savingsByMethod(c,"gold_investment"))}</strong></div></div>
   ${al.remaining>0?`<p class="money-negative" style="margin-top:10px">⚠️ لا يمكن اعتماد الدورة قبل توزيع كامل الدخل على الأظرف أو فوري أو استثمار الذهب.</p>`:""}
 </div>`;
 h+=`<div class="cards">
 ${metric("💵","إجمالي الدخل",money(cycleIncome(c)),"كل مصادر الدخل")}
 ${metric("💸","المصروف الفعلي",money(cycleActual(c)),"الأظرف الحالية")}
 ${metric("🎯","إجمالي التحويش",money(cycleSavings(c)),"تحويش مسجل")}
 ${metric("🏦","رصيد فوري",money(f.close?f.close.actualBalance:f.expected),f.close?"الرصيد الفعلي":"الرصيد المفترض")}
 ${metric("📈","فوائد فوري",f.interest===null?"—":money(f.interest),"تُحسب من رصيد النهاية")}
 ${metric("💳","المتبقي من الدين",money(debt),`نسبة السداد ${pct.toFixed(1)}%`)}
 </div>`;
 h+=`<div class="grid-2">
 <div class="card"><div class="section-title"><h3>🏠 الأظرف</h3><span class="pill ${surplus>=0?"pill-success":"pill-danger"}">الفائض الحالي ${money(surplus)}</span></div>
 ${renderEnvelopeMini(c)}</div>
 <div class="card"><div class="section-title"><h3>🎯 توزيع التحويش</h3><button class="btn btn-secondary btn-sm" onclick="showPage('savings')">إدارة</button></div>
 ${renderSavingsMini(c)}</div>
 <div class="card"><div class="section-title"><h3>🏦 فوري</h3><button class="btn btn-secondary btn-sm" onclick="showPage('fawry')">فتح الحساب</button></div>
 ${renderFawryMini(c)}</div>
 <div class="card"><div class="section-title"><h3>💳 الدين</h3><button class="btn btn-secondary btn-sm" onclick="showPage('debt')">إدارة الدين</button></div>
 <div style="font-size:26px;font-weight:800">${money(debt)}</div><div class="muted">مدفوع ${money(paid)} من ${money(db.debt.original)}</div><div class="progress" style="margin-top:12px"><span style="width:${pct}%"></span></div></div>
 </div>`;
 h+=renderEmergencies(c);
 document.getElementById("page-dashboard").innerHTML=h;
}
function comparisonCell(label,currentValue,previousValue){
 const diff=Number(currentValue||0)-Number(previousValue||0);
 return `<div class="comparison-cell"><span>${label}</span><strong>${money(currentValue)}</strong><small class="${diff>=0?"money-positive":"money-negative"}">${diff>=0?"+":""}${money(diff)} عن السابقة</small></div>`;
}
function selectCycle(id){if(cycleBy(id)){db.currentCycleId=id;save();render();showPage("dashboard");}}
function renderEnvelopeMini(c){
 if(!c.envelopes?.length)return `<div class="empty">لا توجد أظرف.</div>`;
 return `<div class="table-wrap"><table class="table"><thead><tr><th>البند</th><th>المخطط</th><th>الفعلي</th><th>فائض/عجز</th></tr></thead><tbody>${c.envelopes.map(e=>`<tr><td>${esc(e.name)}</td><td>${money(e.planned)}</td><td>${actualIsEntered(e)?money(e.actual):"—"}</td><td class="${envelopeDelta(e)>=0?"money-positive":"money-negative"}">${envelopeDelta(e)>=0?"+":""}${money(envelopeDelta(e))}</td></tr>`).join("")}</tbody></table></div>`;
}
function renderSavingsMini(c){
 const methods=db.savingsMethods.filter(m=>allSavingsByMethod(m.id)>0);
 if(!methods.length)return `<div class="empty">لا يوجد تحويش مسجل.</div>`;
 return `<div class="list">${methods.map(m=>`<div class="list-row"><span>${esc(m.name)}</span><strong>${money(allSavingsByMethod(m.id))}</strong></div>`).join("")}</div>`;
}
function renderFawryMini(c){
 const f=fawryForCycle(c);
 return `<div class="list">
 <div class="list-row"><span>رصيد بداية الدورة</span><strong>${money(c.fawryOpening||0)}</strong></div>
 <div class="list-row"><span>الإيداعات</span><strong class="money-positive">+${money(f.deposits)}</strong></div>
 <div class="list-row"><span>السحوبات</span><strong class="money-negative">-${money(f.withdrawals)}</strong></div>
 <div class="list-row"><span>الفائدة</span><strong>${f.interest===null?"—":money(f.interest)}</strong></div>
 </div>`;
}

function renderIncome(){
 const c=current(); let h=pageHead("💵 مصادر الدخل","مكان واحد فقط لإضافة وتعديل وحذف الدخل",c&&!c.closed?`${c.approved?`<button class="btn btn-success btn-sm" onclick="openMidCycleIncome()">＋ إضافة دخل أثناء الدورة</button>`:`<button class="btn btn-primary btn-sm" onclick="openIncome()">＋ إضافة مصدر دخل</button>`}`:"");
 if(!c){document.getElementById("page-income").innerHTML=h+noCycle();return}
 const al=allocationStatus(c);
 h+=`<div class="card" style="margin-bottom:18px;background:var(--surface2)"><div class="section-title"><h3>📌 توزيع الدخل</h3><strong class="${al.remaining>0?"money-negative":"money-positive"}">${al.remaining>0?`متبقي غير موزع ${money(al.remaining)}`:`تم توزيع الدخل بالكامل`}</strong></div><p class="muted">يتم اعتماد الدورة فقط عندما يساوي الدخل بالكامل: الأظرف + فوري + استثمار الذهب.</p><div class="list"><div class="list-row"><span>على الأظرف</span><strong>${money(cyclePlanned(c))}</strong></div><div class="list-row"><span>فوري</span><strong>${money(savingsByMethod(c,"fawry"))}</strong></div><div class="list-row"><span>استثمار الذهب</span><strong>${money(savingsByMethod(c,"gold_investment"))}</strong></div></div></div>`;
 h+=`<div class="card"><div class="section-title"><h3>مصادر الدخل</h3><strong>${money(cycleIncome(c))}</strong></div>
 <div class="table-wrap"><table class="table"><thead><tr><th>المصدر</th><th>المبلغ</th><th>إجراء</th></tr></thead><tbody>
 ${(c.income||[]).map(x=>`<tr><td>${esc(x.name)}</td><td><strong>${money(x.amount)}</strong></td><td><button class="btn btn-secondary btn-sm" onclick="openIncome('${x.id}')">تعديل</button> <button class="btn btn-danger btn-sm" onclick="deleteIncome('${x.id}')">حذف</button></td></tr>`).join("")||`<tr><td colspan="3" class="empty">أضف أول مصدر دخل.</td></tr>`}
 </tbody></table></div></div>`;
 if(c.approved && !c.closed){
   const mids=(c.income||[]).filter(x=>x.midCycle);
   h+=`<div class="card" style="margin-top:18px"><div class="section-title"><h3>🕐 دخل أثناء الدورة</h3><span class="muted">مثل مرتب الزوجة يوم 20 أو 23</span></div>${mids.length?`<div class="list">${mids.map(x=>`<div class="list-row"><span>${esc(x.name)} — ${money(x.amount)}</span><span class="pill pill-success">تم تسجيله</span></div>`).join("")}</div>`:`<p class="muted">يمكن إضافة مرتب الزوجة أو أي دخل ينزل في منتصف الدورة وتوزيعه بالكامل.</p>`}</div>`;
 }
 document.getElementById("page-income").innerHTML=h;
}

function renderEnvelopes(){
 const c=current(); let h=pageHead("🏠 الأظرف / بنود المصروفات","تتعامل مع البنود الكبيرة فقط: مخطط، فعلي، فائض أو عجز",c&&!c.closed?`<button class="btn btn-primary btn-sm" onclick="openEnvelope()">＋ إضافة بند</button>`:"");
 if(!c){document.getElementById("page-envelopes").innerHTML=h+noCycle();return}
 const surplus=sum(c.envelopes.map(e=>Math.max(0,envelopeDelta(e)))), deficit=sum(c.envelopes.map(e=>Math.max(0,-envelopeDelta(e))));
 h+=`<div class="cards" style="grid-template-columns:repeat(3,1fr)">${metric("📋","المخطط",money(cyclePlanned(c)))}${metric("💵","مخصص إضافي للبيت",money(cycleEnvelopeAllocations(c)))}${metric("💸","الفعلي",money(cycleActual(c)))}${metric("💰","الفائض / العجز",money(surplus),`العجز ${money(deficit)}`)}</div>`;
 h+=`<div class="card"><div class="table-wrap"><table class="table"><thead><tr><th>البند</th><th>المخطط</th><th>الفعلي</th><th>الفائض / العجز</th><th>إجراء</th></tr></thead><tbody>
 ${c.envelopes.map(e=>{let d=envelopeDelta(e);return `<tr><td>${esc(e.name)}</td><td>${money(e.planned)}</td><td>${money(e.actual ?? 0)}</td><td class="${d>=0?"money-positive":"money-negative"}">${d>=0?"+":""}${money(d)}</td><td><button class="btn btn-secondary btn-sm" onclick="openEnvelope('${e.id}')">تعديل</button> <button class="btn btn-danger btn-sm" onclick="deleteEnvelope('${e.id}')">حذف</button></td></tr>`}).join("")||`<tr><td colspan="5" class="empty">لا توجد بنود.</td></tr>`}
 </tbody></table></div>
 ${!c.closed?`<div style="margin-top:15px" class="action-row"><button class="btn btn-primary" onclick="closeCycle()">🔒 إغلاق الدورة</button></div>`:"<div class='muted' style='margin-top:14px'>هذه الدورة مغلقة ولا يمكن تعديلها.</div>"}
 </div>`;
 document.getElementById("page-envelopes").innerHTML=h;
}

function renderSavings(){
 const c=current(); let h=pageHead("🎯 التحويش","التحويش مفهوم مستقل؛ فوري مجرد مكان من أماكن الاحتفاظ بالتحويش",c&&!c.closed?`<div class="action-row"><button class="btn btn-primary btn-sm" onclick="openSavings()">＋ تسجيل تحويش</button><button class="btn btn-secondary btn-sm" onclick="openSavings('gold_investment')">🪙 استثمار الذهب</button></div>`:"");
 if(!c){document.getElementById("page-savings").innerHTML=h+noCycle();return}
 h+=`<div class="cards" style="grid-template-columns:repeat(3,1fr)">${metric("🎯","إجمالي التحويش",money(cycleSavings(c)))}${metric("🏦","تحويش فوري",money(savingsByMethod(c,"fawry")))}${metric("🪙","تحويش خارج فوري",money(cycleSavings(c)-savingsByMethod(c,"fawry")))}</div>`;
 h+=`<div class="grid-2"><div class="card"><div class="section-title"><h3>توزيع التحويش</h3><button class="btn btn-secondary btn-sm" onclick="openMethod()">＋ وسيلة جديدة</button></div>
 <div class="list">${db.savingsMethods.map(m=>`<div class="list-row"><span>${esc(m.name)}</span><strong>${money(allSavingsByMethod(m.id))}</strong></div>`).join("")}</div></div>
 <div class="card"><div class="section-title"><h3>عمليات تحويش هذه الدورة</h3></div>
 <div class="table-wrap"><table class="table"><thead><tr><th>الوصف</th><th>المكان</th><th>المبلغ</th><th>التاريخ</th></tr></thead><tbody>
 ${(c.savings||[]).map(x=>`<tr><td>${esc(x.description)}</td><td>${esc(db.savingsMethods.find(m=>m.id===x.methodId)?.name||"—")}</td><td>${money(x.amount)}</td><td>${esc(x.date)}</td></tr>`).join("")||`<tr><td colspan="4" class="empty">لا توجد عمليات.</td></tr>`}
 </tbody></table></div></div></div>`;
 document.getElementById("page-savings").innerHTML=h;
}

function renderFawry(){
 const c=current(); let h=pageHead("🏦 فوري","حساب مستقل له Ledger خاص. معاملات فوري فقط تؤثر على رصيده",c&&!c.closed?`<button class="btn btn-primary btn-sm" onclick="openFawryDeposit()">＋ إيداع فوري</button><button class="btn btn-secondary btn-sm" onclick="openFawryWithdrawal()">➖ دفع من فوري</button><button class="btn btn-success btn-sm" onclick="openFawryClose()">🔢 إدخال رصيد النهاية</button>`:"");
 if(!c){document.getElementById("page-fawry").innerHTML=h+noCycle();return}
 const f=fawryForCycle(c), actual=f.close?.actualBalance;
 h+=`<div class="cards" style="grid-template-columns:repeat(4,1fr)">
 ${metric("↩️","رصيد البداية",money(c.fawryOpening||0))}
 ${metric("➕","إيداعات فوري",money(f.deposits))}
 ${metric("➖","سحوبات فوري",money(f.withdrawals))}
 ${metric("🏦","الرصيد",money(actual??f.expected),actual===undefined?"مفترض":"فعلي")}
 </div>`;
 h+=`<div class="grid-2"><div class="card"><div class="section-title"><h3>حساب الدورة</h3></div>
 <div class="list"><div class="list-row"><span>رصيد البداية</span><strong>${money(c.fawryOpening||0)}</strong></div><div class="list-row"><span>+ الإيداعات</span><strong class="money-positive">${money(f.deposits)}</strong></div><div class="list-row"><span>- السحوبات</span><strong class="money-negative">${money(f.withdrawals)}</strong></div><div class="list-row"><span>الرصيد المفترض</span><strong>${money(f.expected)}</strong></div><div class="list-row"><span>الرصيد الفعلي</span><strong>${actual===undefined?"لم يُدخل بعد":money(actual)}</strong></div><div class="list-row"><span>📈 الفائدة</span><strong>${f.interest===null?"لم تُحسب بعد":money(f.interest)}</strong></div></div>
 <div class="muted" style="margin-top:12px">الفائدة = الرصيد الفعلي − (رصيد البداية + الإيداعات − السحوبات).</div></div>
 <div class="card"><div class="section-title"><h3>Ledger فوري</h3></div><div class="table-wrap"><table class="table"><thead><tr><th>النوع</th><th>الوصف</th><th>المبلغ</th><th>التاريخ</th></tr></thead><tbody>
 ${f.tx.map(x=>`<tr><td><span class="pill ${x.type==="deposit"?"pill-success":"pill-danger"}">${x.type==="deposit"?"إيداع":"سحب"}</span></td><td>${esc(x.description)}</td><td>${money(x.amount)}</td><td>${esc(x.date)}</td></tr>`).join("")||`<tr><td colspan="4" class="empty">لا توجد معاملات فوري.</td></tr>`}
 </tbody></table></div></div></div>`;
 document.getElementById("page-fawry").innerHTML=h;
}

function cycleEmergencies(c){return c?.emergencies||[]}
function renderEmergencies(c){
 const items=cycleEmergencies(c);
 return `<div class="card" style="margin-top:18px"><div class="section-title"><h3>🚨 مصاريف طارئة</h3><button class="btn btn-secondary btn-sm" onclick="openEmergency()">＋ إضافة طارئ</button></div>
 <p class="muted">مثل صيانة عربية أو كشف طبي. لا تخصم من أي ظرف؛ وإذا اخترت فوري فهي سحبة مستقلة من فوري.</p>
 ${items.length?`<div class="table-wrap"><table class="table"><thead><tr><th>الوصف</th><th>المبلغ</th><th>من</th><th>التاريخ</th></tr></thead><tbody>${items.map(x=>`<tr><td>${esc(x.description)}</td><td>${money(x.amount)}</td><td>${esc(x.source)}</td><td>${esc(x.date)}</td></tr>`).join("")}</tbody></table></div>`:`<div class="empty">لا توجد مصاريف طارئة.</div>`}</div>`;
}
function openEmergency(){
 const c=current(); if(!c||c.closed){alert("لا توجد دورة مفتوحة.");return}
 modal("🚨 إضافة مصروف طارئ",`<div class="form-grid"><div class="form-group full"><label>الوصف</label><input name="description" placeholder="صيانة عربية / كشف طبي" required></div><div class="form-group"><label>المبلغ</label><input name="amount" type="number" min=".01" step=".01" required></div><div class="form-group"><label>الدفع من</label><select name="source"><option value="fawry">فوري</option><option value="other">نقدي / مصدر آخر</option></select></div><div class="form-group"><label>التاريخ</label><input name="date" type="date" value="${today()}"></div></div>`,d=>{
   const amount=num(d.get("amount")), source=d.get("source"), date=d.get("date")||today(), description=d.get("description");
   if(source==="fawry" && amount>fawryForCycle(c).expected+0.005){alert("المبلغ أكبر من رصيد فوري المتاح.");return}
   c.emergencies ||= [];
   c.emergencies.push({id:uid(),description,amount,source:source==="fawry"?"فوري":"نقدي / مصدر آخر",date});
   if(source==="fawry"){db.fawry.transactions.push({id:uid(),cycleId:c.id,type:"withdrawal",amount,description:`طوارئ: ${description}`,date});addTransaction({cycleId:c.id,type:"مصروف طارئ",description,amount,account:"فوري"});}
   else addTransaction({cycleId:c.id,type:"مصروف طارئ",description,amount,account:"نقدي / مصدر آخر"});
   save();closeModal();render();toast("تم تسجيل المصروف الطارئ.");
 });
}
function renderDebt(){
 let h=pageHead("💳 الدين","الدين مستقل عن الدورات ولا يتصفر عند بدء دورة جديدة",`<button class="btn btn-primary btn-sm" onclick="openDebtPayment()">＋ تسجيل سداد</button><button class="btn btn-secondary btn-sm" onclick="openDebtSetup()">⚙️ إجمالي الدين</button>`);
 const paid=debtPaid(), rem=debtRemaining(), pct=db.debt.original?Math.min(100,paid/db.debt.original*100):0;
 h+=`<div class="cards" style="grid-template-columns:repeat(3,1fr)">${metric("💳","إجمالي الدين",money(db.debt.original))}${metric("✅","إجمالي المدفوع",money(paid))}${metric("📌","المتبقي",money(rem))}</div>
 <div class="card"><div class="section-title"><h3>نسبة السداد</h3><strong>${pct.toFixed(1)}%</strong></div><div class="progress"><span style="width:${pct}%"></span></div>
 <div class="section-title" style="margin-top:22px"><h3>سجل الدفعات</h3></div>
 <div class="table-wrap"><table class="table"><thead><tr><th>التاريخ</th><th>الدورة</th><th>الوصف</th><th>المبلغ</th></tr></thead><tbody>
 ${db.debt.payments.map(x=>`<tr><td>${esc(x.date)}</td><td>${esc(cycleName(cycleBy(x.cycleId)))}</td><td>${esc(x.description)}</td><td>${money(x.amount)}</td></tr>`).join("")||`<tr><td colspan="4" class="empty">لا توجد دفعات.</td></tr>`}
 </tbody></table></div></div>`;
 document.getElementById("page-debt").innerHTML=h;
}

function renderTransactions(){
 let h=pageHead("🧾 سجل العمليات","كل العمليات المالية المسجلة محليًا",`<button class="btn btn-secondary btn-sm" onclick="render()">↻ تحديث</button>`);
 h+=`<div class="card"><div class="table-wrap"><table class="table"><thead><tr><th>التاريخ</th><th>الدورة</th><th>النوع</th><th>الوصف</th><th>المبلغ</th><th>الحساب/الوسيلة</th></tr></thead><tbody>
 ${db.transactions.map(t=>`<tr><td>${esc(t.date)}</td><td>${esc(cycleName(cycleBy(t.cycleId)))}</td><td><span class="pill pill-blue">${esc(t.type)}</span></td><td>${esc(t.description)}</td><td>${money(t.amount)}</td><td>${esc(t.account||"—")}</td></tr>`).join("")||`<tr><td colspan="6" class="empty">لا توجد عمليات بعد.</td></tr>`}
 </tbody></table></div></div>`;
 document.getElementById("page-transactions").innerHTML=h;
}

function renderReports(){
 let h=pageHead("📈 التقارير","اختر دورة أو عدة دورات أو سنة كاملة",`<button class="btn btn-primary btn-sm" onclick="buildReport()">عرض التقرير</button>`);
 h+=`<div class="card"><div class="form-grid"><div class="form-group"><label>نوع التقرير</label><select id="reportType"><option value="cycle">دورة معينة</option><option value="multi">عدة دورات</option><option value="year">سنة كاملة</option></select></div><div class="form-group"><label>الدورة</label><select id="reportCycle"><option value="">اختر دورة</option>${db.cycles.map(c=>`<option value="${c.id}" ${c.id===db.currentCycleId?"selected":""}>${esc(cycleName(c))}</option>`).join("")}</select></div><div class="form-group"><label>السنة</label><input id="reportYear" type="number" value="${new Date().getFullYear()}"></div></div></div>
 <div id="reportOutput" style="margin-top:18px"></div>`;
 document.getElementById("page-reports").innerHTML=h;
 const rt=document.getElementById("reportType"), rc=document.getElementById("reportCycle");
 rt.addEventListener("change",()=>{rc.multiple=rt.value==="multi";rc.size=rt.value==="multi"?Math.min(6,Math.max(3,db.cycles.length)):1;});
}
function buildReport(){
 const type=document.getElementById("reportType").value, rc=document.getElementById("reportCycle"), ids=[...rc.selectedOptions].map(o=>o.value).filter(Boolean), year=Number(document.getElementById("reportYear").value);
 let cs=type==="cycle"?(ids[0]&&cycleBy(ids[0])?[cycleBy(ids[0])]:[]):type==="year"?db.cycles.filter(c=>String(c.startDate||"").startsWith(String(year))):db.cycles.filter(c=>ids.includes(c.id));
 const income=sum(cs.map(cycleIncome)), actual=sum(cs.map(cycleActual)), savings=sum(cs.map(cycleSavings));
 const fdeps=sum(cs.map(c=>fawryForCycle(c).deposits)), fwith=sum(cs.map(c=>fawryForCycle(c).withdrawals)), interest=sum(cs.map(c=>fawryForCycle(c).interest??0));
 const methodTotals=db.savingsMethods.map(m=>({name:m.name,value:sum(cs.map(c=>savingsByMethod(c,m.id)))})).filter(x=>x.value);
 const debtInPeriod=sum(db.debt.payments.filter(p=>cs.some(c=>c.id===p.cycleId)).map(p=>p.amount));
 document.getElementById("reportOutput").innerHTML=`<div class="card"><div class="section-title"><h3>نتيجة التقرير</h3><span class="muted">${cs.length} دورة</span></div><div class="cards" style="grid-template-columns:repeat(4,1fr)">
 ${metric("💵","الدخل",money(income))}${metric("💸","المصروفات",money(actual))}${metric("🎯","التحويش",money(savings))}${metric("🏦","إيداعات فوري",money(fdeps))}${metric("➖","سحوبات فوري",money(fwith))}${metric("📈","فوائد فوري",money(interest))}${metric("💳","سداد الدين",money(debtInPeriod))}${metric("📌","المتبقي من الدين",money(debtRemaining()))}
 </div><div class="grid-2"><div><h3>توزيع التحويش</h3><div class="list">${methodTotals.map(x=>`<div class="list-row"><span>${esc(x.name)}</span><strong>${money(x.value)}</strong></div>`).join("")||"<div class='empty'>لا يوجد تحويش.</div>"}</div></div><div><h3>الدورات المشمولة</h3><div class="list">${cs.map(c=>`<div class="list-row"><span>${esc(cycleName(c))}</span><span class="muted">${esc(c.startDate)}${c.endDate?" → "+esc(c.endDate):""}</span></div>`).join("")}</div></div></div></div>`;
}

function renderBackup(){
 document.getElementById("page-backup").innerHTML=pageHead("📦 Backup / Restore","كل شيء محفوظ محليًا في LocalStorage",`<button class="btn btn-primary btn-sm" onclick="exportBackup()">📦 Export Backup</button> <button class="btn btn-secondary btn-sm" onclick="document.getElementById('restoreFile').click()">♻️ Restore Backup</button> <button class="btn btn-secondary btn-sm" onclick="exportPDF()">📄 تصدير PDF</button> <button class="btn btn-danger btn-sm" onclick="clearAllData()">🗑️ مسح كل البيانات</button>`) + `
 <div class="grid-2"><div class="card"><h3>النسخ الاحتياطي</h3><p class="muted">يحتوي الملف على الدورات والأظرف والدخل والتحويش وفوري والفوائد والدين وسجل العمليات ووسائل التحويش.</p><button class="btn btn-primary" onclick="exportBackup()">تحميل نسخة احتياطية</button></div>
 <div class="card"><h3>استعادة البيانات</h3><p class="muted">اختر ملف JSON تم تصديره من التطبيق. سيتم استبدال البيانات الحالية بعد التأكيد.</p><button class="btn btn-secondary" onclick="document.getElementById('restoreFile').click()">اختيار ملف</button></div></div>
 <input id="restoreFile" type="file" accept=".json,application/json" hidden onchange="restoreBackup(this.files[0])">
 <div class="card" style="margin-top:18px;border-color:var(--danger)"><h3>⚠️ منطقة خطرة</h3><p class="muted">مسح كل البيانات يحذف الدورات والدخل والتحويش وفوري والدين وسجل العمليات من هذا الجهاز نهائيًا.</p><button class="btn btn-danger" onclick="clearAllData()">🗑️ مسح كل البيانات</button></div><div class="card" style="margin-top:18px"><h3>إحصائيات التخزين</h3><div class="kpi-row"><div class="kpi"><span>الدورات</span><strong>${db.cycles.length}</strong></div><div class="kpi"><span>العمليات</span><strong>${db.transactions.length}</strong></div><div class="kpi"><span>وسائل التحويش</span><strong>${db.savingsMethods.length}</strong></div></div></div>`;
}

function modal(title,body,onSubmit){
 document.getElementById("modalRoot").innerHTML=`<div class="modal-backdrop" id="modalBackdrop"><div class="modal"><button class="close" onclick="closeModal()">×</button><h3>${title}</h3><form id="modalForm">${body}<div class="modal-actions"><button class="btn btn-primary" type="submit">حفظ</button><button class="btn btn-secondary" type="button" onclick="closeModal()">إلغاء</button></div></form></div></div>`;
 document.getElementById("modalForm").onsubmit=e=>{e.preventDefault();onSubmit(new FormData(e.target));};
}
function closeModal(){document.getElementById("modalRoot").innerHTML=""}

function openNewCycle(){
 const prev=activeOrLatest();
 if(prev && !prev.closed && !prev.approved){alert("لا يمكن بدء دورة جديدة قبل اعتماد الدورة الحالية.");return}
 if(prev){
   const al=allocationStatus(prev);
   if(al.remaining>0.005){
     if(!confirm(`⚠️ يوجد ${money(al.remaining)} من دخل الدورة السابقة لم يتم توزيعه.\n\nيجب توزيع الدخل على الأظرف أو فوري أو استثمار الذهب.\n\nهل تريد بدء دورة جديدة رغم ذلك؟`)) return;
   }
 }
 modal("🟢 بدء دورة مالية جديدة",`<div class="form-grid">
 <div class="form-group"><label>اسم الدورة</label><input name="name" value="${prev?esc(monthLabel(new Date((prev.startDate||today())+"T12:00:00"))):""}" placeholder="مثال: أغسطس 2026" required></div>
 <div class="form-group"><label>تاريخ بداية الدورة</label><input name="startDate" type="date" value="${today()}" required></div>
 <div class="form-group full"><label>رصيد بداية فوري</label><input name="fawryOpening" type="number" min="0" step="0.01" value="${prev?fawryForCycle(prev).close?.actualBalance ?? fawryForCycle(prev).expected:0}" required><small class="muted">ينتقل من الرصيد الفعلي/المفترض للدورة السابقة.</small></div>
 </div>
 ${prev?`<div class="card" style="margin-top:14px;background:var(--surface2)"><strong>📋 بنود الدورة السابقة ستظهر كمقترحات بعد الإنشاء.</strong><p class="muted">لن يتم اعتمادها إلا بعد مراجعتها والضغط على "اعتماد الدورة الجديدة".</p></div>`:""}`,d=>{
   const c={id:uid(),name:d.get("name"),startDate:d.get("startDate"),endDate:null,closed:false,approved:false,income:prev?prev.income.map(x=>({id:uid(),name:x.name,amount:x.midCycle?0:x.amount,midCycle:false,proposed:true})):[],incomeAllocations:[],envelopes:prev?prev.envelopes.map(e=>({id:uid(),name:e.name,planned:e.planned,actual:null,actualEntered:false,proposed:true})):[],savings:[],fawryOpening:num(d.get("fawryOpening"))};
   db.cycles.push(c);db.currentCycleId=c.id;save();closeModal();render();showPage("income");toast("تم إنشاء الدورة. راجع البنود ثم اعتمدها.");
 });
}
function openIncome(id){
 const c=current(), x=(c.income||[]).find(x=>x.id===id);
 modal(id?"تعديل مصدر الدخل":"إضافة مصدر دخل",`<div class="form-grid"><div class="form-group"><label>المصدر</label><input name="name" value="${esc(x?.name||"")}" placeholder="المرتب" required></div><div class="form-group"><label>المبلغ</label><input name="amount" type="number" min="0" step=".01" value="${x?.amount??""}" required></div></div>`,d=>{
   if(id){x.name=d.get("name");x.amount=num(d.get("amount"));c.approved=false}else{const n={id:uid(),name:d.get("name"),amount:num(d.get("amount"))};c.income.push(n);addTransaction({cycleId:c.id,type:"دخل",description:n.name,amount:n.amount,account:"مصادر الدخل"});}
   save();closeModal();render();toast("تم حفظ الدخل.");
 });
}
function deleteIncome(id){if(confirm("حذف مصدر الدخل؟")){const c=current();c.income=c.income.filter(x=>x.id!==id);save();render();}}
function openMidCycleIncome(){
 const c=current(); if(!c||c.closed){alert("لا توجد دورة مفتوحة.");return}
 const envelopeOptions=(c.envelopes||[]).map(e=>`<option value="${e.id}">${esc(e.name)}</option>`).join("");
 modal("＋ إضافة دخل أثناء الدورة",`<div class="form-grid">
 <div class="form-group"><label>مصدر الدخل</label><input name="name" value="مرتب الزوجة" required></div>
 <div class="form-group"><label>المبلغ</label><input name="amount" type="number" min=".01" step=".01" required></div>
 <div class="form-group full"><label>تاريخ نزول الدخل</label><input name="date" type="date" value="${today()}"></div>
 </div>
 <div class="card" style="margin-top:14px;background:var(--surface2)"><strong>وزّع الدخل فورًا</strong><p class="muted">يمكن وضع كله في فوري، أو تقسيمه بين فوري ومصروف البيت واستثمار الذهب.</p></div>
 <div class="form-grid">
 <div class="form-group"><label>إلى فوري</label><input name="fawry" type="number" min="0" step=".01" value="0"></div>
 <div class="form-group"><label>إلى استثمار الذهب</label><input name="gold" type="number" min="0" step=".01" value="0"></div>
 <div class="form-group"><label>إلى ظرف البيت</label><select name="envelope">${envelopeOptions}</select></div>
 <div class="form-group"><label>مبلغ الظرف</label><input name="envelopeAmount" type="number" min="0" step=".01" value="0"></div>
 </div>`,d=>{
   const amount=num(d.get("amount")), f=num(d.get("fawry")), g=num(d.get("gold")), ea=num(d.get("envelopeAmount"));
   if(Math.abs(f+g+ea-amount)>0.005){alert(`يجب توزيع كامل الدخل. المتبقي: ${money(amount-f-g-ea)}`);return}
   const date=d.get("date")||today(), name=d.get("name")||"دخل إضافي";
   const income={id:uid(),name,amount,date,midCycle:true}; c.income.push(income);
   if(f>0){c.savings.push({id:uid(),methodId:"fawry",amount:f,description:`${name} → فوري`,date});addFawryDepositInternal(c,f,`${name} → فوري`,date,false);}
   if(g>0){c.savings.push({id:uid(),methodId:"gold_investment",amount:g,description:`${name} → استثمار الذهب`,date});addTransaction({cycleId:c.id,type:"تحويش",description:`${name} → استثمار الذهب`,amount:g,account:"استثمار الذهب"});}
   if(ea>0){c.incomeAllocations.push({id:uid(),incomeId:income.id,targetType:"envelope",targetId:d.get("envelope"),amount:ea,date});addTransaction({cycleId:c.id,type:"تخصيص دخل",description:`${name} → ظرف`,amount:ea,account:(c.envelopes.find(e=>e.id===d.get("envelope"))?.name||"ظرف")});}
   addTransaction({cycleId:c.id,type:"دخل أثناء الدورة",description:name,amount,account:"مصادر الدخل"});
   save();closeModal();render();toast("تم تسجيل دخل منتصف الدورة وتوزيعه بالكامل.");
 });
}
function openEnvelope(id){
 const c=current(), x=(c.envelopes||[]).find(x=>x.id===id);
 const allowActual=!!c.approved;
 const actualValue=x && actualIsEntered(x) ? x.actual : "";
 const actualField=allowActual
   ? `<div class="form-group"><label>المبلغ الفعلي <span class="muted">(يُدخل في نهاية الدورة)</span></label><input name="actual" type="number" min="0" step=".01" value="${actualValue}" placeholder="مثال: 3700"></div>`
   : `<input type="hidden" name="actual" value=""><div class="card" style="grid-column:1/-1;background:var(--surface2)"><strong>📅 بداية الدورة</strong><p class="muted" style="margin:6px 0 0">أدخل المبلغ المخطط فقط الآن. المصروف الفعلي سيتم إدخاله لاحقًا بعد اعتماد الدورة وعند نهاية الشهر.</p></div>`;
 modal(id?"تعديل بند":"إضافة بند",`<div class="form-grid"><div class="form-group full"><label>اسم البند</label><input name="name" value="${esc(x?.name||"")}" placeholder="مصاريف البيت" required></div><div class="form-group"><label>المبلغ المخطط</label><input name="planned" type="number" min="0" step=".01" value="${x?.planned??""}" required></div>${actualField}</div>`,d=>{
   const newName=d.get("name"), newPlanned=num(d.get("planned")), actualRaw=(d.get("actual")||"").trim();
   const hasActual=actualRaw!=="";
   if(id){
     const plannedChanged=Math.abs(Number(x.planned||0)-newPlanned)>0.005;
     x.name=newName; x.planned=newPlanned;
     if(allowActual && hasActual){x.actual=num(actualRaw);x.actualEntered=true;}
     else if(!actualIsEntered(x)){x.actual=null;x.actualEntered=false;}
     delete x.proposed;
     if(plannedChanged) c.approved=false;
   } else {
     c.envelopes.push({id:uid(),name:newName,planned:newPlanned,actual:allowActual&&hasActual?num(actualRaw):null,actualEntered:allowActual&&hasActual});
     c.approved=false;
   }
   save();closeModal();render();toast("تم حفظ البند. المصروف الفعلي لا يُطلب في بداية الدورة.");
 });
}
function deleteEnvelope(id){if(confirm("حذف البند؟")){const c=current();c.envelopes=c.envelopes.filter(x=>x.id!==id);save();render();}}
function openSavings(preselected=""){
 const c=current();
 modal("🎯 تسجيل تحويش",`<div class="form-grid"><div class="form-group full"><label>مكان التحويش</label><select name="method">${db.savingsMethods.map(m=>`<option value="${m.id}" ${m.id===preselected?"selected":""}>${esc(m.name)}</option>`).join("")}</select></div><div class="form-group"><label>المبلغ</label><input name="amount" type="number" min="0.01" step=".01" required></div><div class="form-group"><label>التاريخ</label><input name="date" type="date" value="${today()}"></div><div class="form-group full"><label>الوصف</label><input name="description" placeholder="شراء ذهب / إيداع فوري / جمعية" required></div></div>`,d=>{
   const method=d.get("method"), amount=num(d.get("amount")), desc=d.get("description"), date=d.get("date")||today();
   c.savings.push({id:uid(),methodId:method,amount,description:desc,date});
   c.approved=false;
   addTransaction({cycleId:c.id,type:"تحويش",description:desc,amount,account:db.savingsMethods.find(m=>m.id===method)?.name});
   if(method==="fawry") addFawryDepositInternal(c,amount,desc,date,false);
   save();closeModal();render();toast("تم تسجيل التحويش. فوري يتأثر فقط لأن المكان هو فوري.");
 });
}
function openMethod(){
 modal("＋ إضافة وسيلة تحويش جديدة",`<div class="form-group"><label>اسم الوسيلة</label><input name="name" placeholder="مثال: محفظة أخرى" required></div>`,d=>{
   db.savingsMethods.push({id:uid(),name:d.get("name"),system:false});save();closeModal();render();toast("تمت إضافة وسيلة التحويش.");
 });
}
function addFawryDepositInternal(c,amount,desc,date,makeSaving){
 db.fawry.transactions.push({id:uid(),cycleId:c.id,type:"deposit",amount,description:desc,date});
 addTransaction({cycleId:c.id,type:"إيداع فوري",description:desc,amount,account:"فوري"});
 if(makeSaving)c.savings.push({id:uid(),methodId:"fawry",amount,description:desc,date});
}
function openFawryDeposit(){
 const c=current();
 modal("＋ إيداع فوري / تحويش فوري",`<div class="form-grid"><div class="form-group"><label>المبلغ</label><input name="amount" type="number" min=".01" step=".01" required></div><div class="form-group"><label>التاريخ</label><input name="date" type="date" value="${today()}"></div><div class="form-group full"><label>الوصف</label><input name="description" placeholder="تحويش فوري" required></div></div><p class="muted">هذا الإيداع يُسجل كتحويش في فوري، ويزيد رصيد فوري بنفس المبلغ.</p>`,d=>{
   const amount=num(d.get("amount")), desc=d.get("description"), date=d.get("date")||today();
   c.savings.push({id:uid(),methodId:"fawry",amount,description:desc,date});
   c.approved=false;
   addFawryDepositInternal(c,amount,desc,date,false);
   save();closeModal();render();toast("تم إيداع وتحويش المبلغ في فوري.");
 });
}
function openFawryWithdrawal(){
 const c=current();
 modal("➖ دفع من فوري",`<div class="form-grid"><div class="form-group"><label>المبلغ</label><input name="amount" type="number" min=".01" step=".01" required></div><div class="form-group"><label>التاريخ</label><input name="date" type="date" value="${today()}"></div><div class="form-group full"><label>الوصف</label><input name="description" placeholder="فاتورة كهرباء" required></div></div><p class="muted">السحب من فوري لا يخصم من أي ظرف مصروفات.</p>`,d=>{
   const amount=num(d.get("amount")), desc=d.get("description"), date=d.get("date")||today();
   const f=fawryForCycle(c); if(amount>f.expected){alert("المبلغ أكبر من الرصيد المفترض لفوري.");return}
   db.fawry.transactions.push({id:uid(),cycleId:c.id,type:"withdrawal",amount,description:desc,date});
   addTransaction({cycleId:c.id,type:"سحب فوري",description:desc,amount,account:"فوري"});
   save();closeModal();render();toast("تم تسجيل السحب من فوري فقط.");
 });
}
function openFawryClose(){
 const c=current(), f=fawryForCycle(c);
 modal("🔢 رصيد فوري الفعلي في نهاية الدورة",`<div class="form-grid"><div class="form-group full"><label>الرصيد الفعلي الموجود في فوري</label><input name="actual" type="number" min="0" step=".01" value="${f.close?.actualBalance??f.expected}" required></div></div><div class="card" style="margin-top:12px;background:var(--surface2)">الرصيد المفترض حاليًا: <strong>${money(f.expected)}</strong><br>الفائدة = الرصيد الفعلي − الرصيد المفترض.</div>`,d=>{
   const actual=num(d.get("actual")), old=f.close;
   if(old){old.actualBalance=actual;old.date=today()}else db.fawry.closings.push({id:uid(),cycleId:c.id,actualBalance:actual,date:today()});
   const interest=actual-f.expected;
   addTransaction({cycleId:c.id,type:"فائدة فوري",description:"فائدة محسوبة من رصيد النهاية",amount:interest,account:"فوري"});
   save();closeModal();render();toast(`تم الحساب: الفائدة ${money(interest)}`);
 });
}
function approveCycle(){
 const c=current(); if(!c||c.closed)return;
 const al=allocationStatus(c);
 if(al.income<=0.005){alert("أدخل إجمالي الدخل أولًا قبل اعتماد الدورة.");return}
 if(al.remaining>0.005){alert(`لا يمكن اعتماد الدورة. يوجد ${money(al.remaining)} غير موزع من الدخل.\nوزّع المبلغ على الأظرف أو فوري أو استثمار الذهب.`);return}
 if(al.over>0.005){alert(`التوزيع أكبر من الدخل بمقدار ${money(al.over)}. راجع المبالغ قبل الاعتماد.`);return}
 c.approved=true; c.envelopes.forEach(e=>delete e.proposed); save(); render(); toast("تم اعتماد الدورة الجديدة بالكامل.");
}
function closeCycle(){
 const c=current(); if(!c){alert("لا توجد دورة مالية نشطة لإغلاقها.");return} if(c.closed)return; if(!c.approved){alert("اعتمد الدورة الجديدة أولًا.");return;}
 const missing=(c.envelopes||[]).filter(e=>!actualIsEntered(e));
 if(missing.length){
   alert(`⚠️ لا يمكن إغلاق الدورة قبل إدخال المصروف الفعلي لكل الأظرف.\n\nالمتبقي: ${missing.map(e=>e.name).join("، ")}\n\nإذا لم يُصرف شيء في أي ظرف، اكتب 0.`);
   showPage("envelopes");
   setTimeout(()=>openEnvelope(missing[0].id),80);
   return;
 }
 const surplus=sum(c.envelopes.map(e=>Math.max(0,envelopeDelta(e))));
 const deficit=sum(c.envelopes.map(e=>Math.max(0,-envelopeDelta(e))));
 // فائض وعجز الأظرف يتقابلان أولًا. لا يتم تحويش الفائض وسحب العجز معًا.
 const net=surplus-deficit;
 const f=fawryForCycle(c);
 const netLabel=net>0?"صافي الفائض بعد خصم العجز":net<0?"العجز المتبقي بعد خصم الفائض":"لا يوجد مبلغ مستحق بعد المقاصة";
 modal("🔒 إغلاق الدورة",`
   <div class="grid-2">
     <div class="card" style="background:var(--surface2)"><strong>💰 إجمالي الفائض = ${money(surplus)}</strong><p class="muted">قبل مقاصة العجز.</p></div>
     <div class="card" style="background:var(--surface2)"><strong>⚠️ إجمالي العجز = ${money(deficit)}</strong><p class="muted">قبل مقاصة الفائض.</p></div>
   </div>
   <div class="card" style="margin-top:14px;background:var(--surface2)">
     <strong>⚖️ ${netLabel}: ${money(Math.abs(net))}</strong>
     <p class="muted">الفائض والعجز يتم طرحهما من بعض أولًا. ${net>0?"سيتم توزيع صافي الفائض فقط.":net<0?"سيتم سحب العجز المتبقي فقط من فوري.":"لن يتم توزيع فائض ولن يتم سحب أي مبلغ من فوري."}</p>
   </div>
   ${net>0?`<div id="surplusRows" style="margin-top:12px"></div>
   <button type="button" class="btn btn-secondary btn-sm" onclick="addSurplusRow()">＋ إضافة توزيع لصافي الفائض</button>
   <div id="surplusTotal" class="muted" style="margin-top:8px">الموزع: 0 ج.م</div>`:""}
   <div class="card" style="margin-top:14px;background:var(--surface2)">
     <strong>🏦 رصيد فوري قبل التسوية: ${money(f.expected)}</strong>
     ${net<0
       ? (Math.abs(net)>f.expected+0.005
          ? `<p class="money-negative">⚠️ العجز المتبقي ${money(Math.abs(net))} أكبر من رصيد فوري المتاح ${money(f.expected)}. لا يمكن إغلاق الدورة.</p>`
          : `<p class="muted">سيتم تسجيل سحب فوري فقط بقيمة ${money(Math.abs(net))} بعد المقاصة.</p>`)
       : net>0
          ? `<p class="muted">لن يتم سحب أي مبلغ من فوري بسبب العجز؛ سيتم التعامل فقط مع صافي الفائض.</p>`
          : `<p class="muted">الفائض والعجز متساويان، لذلك لا يوجد تأثير على فوري.</p>`}
   </div>`,d=>{
   const rows=net>0?[...document.querySelectorAll(".surplus-row")].map(r=>({method:r.querySelector("select").value,amount:num(r.querySelector("input").value)})):[];
   const total=sum(rows.map(x=>x.amount));
   if(net>0 && Math.abs(total-net)>0.005){alert(`يجب توزيع صافي الفائض ${money(net)} بالكامل. الموزع الآن ${money(total)}.`);return}
   if(net<0 && Math.abs(net)>f.expected+0.005){alert(`لا يمكن إغلاق الدورة: العجز المتبقي بعد المقاصة ${money(Math.abs(net))} أكبر من رصيد فوري المتاح ${money(f.expected)}.`);return}

   rows.forEach(x=>{
     if(x.amount<=0)return;
     const method=x.method, desc=`صافي فائض الأظرف → ${db.savingsMethods.find(m=>m.id===method)?.name}`;
     c.savings.push({id:uid(),methodId:method,amount:x.amount,description:desc,date:today()});
     addTransaction({cycleId:c.id,type:"فائض ظرف",description:desc,amount:x.amount,account:db.savingsMethods.find(m=>m.id===method)?.name});
     if(method==="fawry")addFawryDepositInternal(c,x.amount,desc,today(),false);
   });

   if(net<0){
     const withdrawal=Math.abs(net);
     const desc=`تغطية صافي عجز الأظرف من فوري`;
     db.fawry.transactions.push({id:uid(),cycleId:c.id,type:"withdrawal",amount:withdrawal,description:desc,date:today()});
     addTransaction({cycleId:c.id,type:"سحب فوري",description:desc,amount:withdrawal,account:"فوري"});
   }

   c.closed=true;c.endDate=today();
   save();closeModal();render();
   toast(net>0?`تم إغلاق الدورة وتوزيع صافي فائض ${money(net)}.`:net<0?`تم إغلاق الدورة وسحب صافي عجز ${money(Math.abs(net))} من فوري.`:`تم إغلاق الدورة بدون فائض أو عجز مستحق.`);
 });
 if(net>0)addSurplusRow();
}
function addSurplusRow(){
 const box=document.getElementById("surplusRows");if(!box)return;
 const row=document.createElement("div");row.className="surplus-row";row.style.cssText="display:grid;grid-template-columns:1fr 1fr auto;gap:8px;margin-bottom:8px";
 row.innerHTML=`<select style="padding:10px;border:1px solid var(--border);background:var(--surface);color:var(--text);border-radius:10px">${db.savingsMethods.map(m=>`<option value="${m.id}">${esc(m.name)}</option>`).join("")}</select><input type="number" min="0" step=".01" placeholder="المبلغ" style="padding:10px;border:1px solid var(--border);background:var(--surface);color:var(--text);border-radius:10px"><button type="button" class="btn btn-danger btn-sm">×</button>`;
 row.querySelector("button").onclick=()=>{row.remove();updateSurplusTotal()};row.querySelector("input").oninput=updateSurplusTotal;box.appendChild(row);
}
function updateSurplusTotal(){const vals=[...document.querySelectorAll(".surplus-row input")].map(x=>num(x.value));const el=document.getElementById("surplusTotal");if(el)el.textContent=`الموزع: ${money(sum(vals))}`}

function openDebtSetup(){
 modal("⚙️ إعداد إجمالي الدين",`<div class="form-group"><label>إجمالي الدين الأصلي</label><input name="original" type="number" min="0" step=".01" value="${db.debt.original}" required></div>`,d=>{db.debt.original=num(d.get("original"));save();closeModal();render();toast("تم تحديث إجمالي الدين.")});
}
function openDebtPayment(){
 const c=current(); if(!c){alert("ابدأ دورة مالية أولًا.");return}
 modal("＋ تسجيل سداد دين",`<div class="form-grid"><div class="form-group"><label>المبلغ</label><input name="amount" type="number" min=".01" step=".01" required></div><div class="form-group"><label>التاريخ</label><input name="date" type="date" value="${today()}"></div><div class="form-group full"><label>الوصف</label><input name="description" value="سداد دين" required></div></div>`,d=>{
 const amount=num(d.get("amount"));if(amount>debtRemaining()){alert("المبلغ أكبر من المتبقي من الدين.");return}
 const p={id:uid(),cycleId:c.id,amount,date:d.get("date")||today(),description:d.get("description")};db.debt.payments.push(p);addTransaction({cycleId:c.id,type:"سداد دين",description:p.description,amount,account:"الدين"});save();closeModal();render();toast("تم تسجيل سداد الدين.");
 });
}

function exportBackup(){
 const blob=new Blob([JSON.stringify(db,null,2)],{type:"application/json"}),a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=`budget-backup-${today()}.json`;a.click();URL.revokeObjectURL(a.href);toast("تم تصدير النسخة الاحتياطية.");
}
function exportPDF(){
  const c=current();
  if(!c){alert("لا توجد دورة مالية لتصدير تقريرها.");return}

  const f=fawryForCycle(c), al=allocationStatus(c);
  const savingsBy=db.savingsMethods.map(m=>({name:m.name,value:savingsByMethod(c,m.id)})).filter(x=>x.value>0);
  const transactions=db.transactions.filter(t=>t.cycleId===c.id);
  const reportRows=(c.envelopes||[]).map(e=>{
    const entered=actualIsEntered(e), actual=entered?Number(e.actual||0):null, delta=entered?Number(e.planned||0)-actual:null;
    const deltaClass=delta===null?"":(delta>=0?"positive":"negative");
    return `<tr><td>${esc(e.name)}</td><td>${money(e.planned)}</td><td>${entered?money(actual):"لم يُدخل بعد"}</td><td class="${deltaClass}">${delta===null?"—":(delta>=0?"+":"")+money(delta)}</td></tr>`;
  }).join("");
  const txRows=transactions.map(t=>`<tr><td>${esc(t.date||"")}</td><td>${esc(t.type||"")}</td><td>${esc(t.description||"")}</td><td>${money(t.amount)}</td><td>${esc(t.account||"—")}</td></tr>`).join("");

  const old=document.getElementById("printReport"); if(old) old.remove();
  const report=document.createElement("div");
  report.id="printReport";
  report.innerHTML=`
    <div class="print-header"><div><h1>📊 تقرير الميزانية والإنفاق</h1><div class="print-muted">${esc(cycleName(c))} — من ${esc(c.startDate||"")} ${c.endDate?"إلى "+esc(c.endDate):"(مفتوحة)"}</div></div><div class="print-muted">تاريخ التقرير: ${today()}</div></div>
    <div class="print-cards">
      <div class="print-card"><div>إجمالي الدخل</div><strong>${money(cycleIncome(c))}</strong></div>
      <div class="print-card"><div>المصروف الفعلي</div><strong>${money(cycleActual(c))}</strong></div>
      <div class="print-card"><div>إجمالي التحويش</div><strong>${money(cycleSavings(c))}</strong></div>
      <div class="print-card"><div>رصيد فوري</div><strong>${money(f.close?.actualBalance??f.expected)}</strong></div>
    </div>
    <h2>🏠 تقرير المصروفات الفعلية</h2>
    <table><thead><tr><th>البند</th><th>المخطط</th><th>الفعلي</th><th>فائض / عجز</th></tr></thead><tbody>${reportRows||'<tr><td colspan="4">لا توجد بنود.</td></tr>'}</tbody></table>
    <h2>🎯 توزيع التحويش</h2>
    <table><thead><tr><th>وسيلة التحويش</th><th>المبلغ</th></tr></thead><tbody>${savingsBy.map(x=>`<tr><td>${esc(x.name)}</td><td>${money(x.value)}</td></tr>`).join("")||'<tr><td colspan="2">لا يوجد تحويش.</td></tr>'}</tbody></table>
    <h2>🚨 المصاريف الطارئة</h2>
    <table><thead><tr><th>الوصف</th><th>المبلغ</th><th>من</th><th>التاريخ</th></tr></thead><tbody>${(c.emergencies||[]).map(x=>`<tr><td>${esc(x.description)}</td><td>${money(x.amount)}</td><td>${esc(x.source)}</td><td>${esc(x.date)}</td></tr>`).join("")||'<tr><td colspan="4">لا توجد مصاريف طارئة.</td></tr>'}</tbody></table>
    <h2>🏦 تقرير فوري</h2>
    <table><tbody>
      <tr><th>رصيد البداية</th><td>${money(c.fawryOpening||0)}</td></tr>
      <tr><th>الإيداعات</th><td>${money(f.deposits)}</td></tr>
      <tr><th>السحوبات</th><td>${money(f.withdrawals)}</td></tr>
      <tr><th>الرصيد المفترض</th><td>${money(f.expected)}</td></tr>
      <tr><th>الرصيد الفعلي</th><td>${f.close?money(f.close.actualBalance):"لم يُدخل بعد"}</td></tr>
      <tr><th>الفائدة</th><td>${f.interest===null?"لم تُحسب بعد":money(f.interest)}</td></tr>
    </tbody></table>
    <h2>🧾 سجل العمليات</h2>
    <table><thead><tr><th>التاريخ</th><th>النوع</th><th>الوصف</th><th>المبلغ</th><th>الحساب / الوسيلة</th></tr></thead><tbody>${txRows||'<tr><td colspan="5">لا توجد عمليات.</td></tr>'}</tbody></table>
    <h2>📌 ملخص الدورة</h2>
    <table><tbody>
      <tr><th>المبلغ الموزع من الدخل</th><td>${money(al.allocated)}</td></tr>
      <tr><th>المتبقي غير الموزع</th><td>${money(al.remaining)}</td></tr>
      <tr><th>سداد الدين خلال الدورة</th><td>${money(sum(db.debt.payments.filter(p=>p.cycleId===c.id).map(p=>p.amount)))}</td></tr>
    </tbody></table>
    <div class="print-footer">© Designed by Peter Kaisar — تقرير محلي Offline</div>`;
  document.body.appendChild(report);

  const style=document.createElement("style");
  style.id="printReportStyle";
  style.textContent=`
    #printReport{display:none}
    @media print{
      @page{size:A4;margin:12mm}
      body.printing-report > *:not(#printReport){display:none!important}
      body.printing-report #printReport{display:block!important;direction:rtl;background:#fff;color:#172033;font-family:Arial,Tahoma,sans-serif;line-height:1.5;font-size:12px}
      #printReport *{box-sizing:border-box}
      #printReport h1{font-size:24px;margin:0 0 4px}
      #printReport h2{font-size:17px;margin:22px 0 9px;border-bottom:2px solid #0f766e;padding-bottom:5px}
      .print-header{display:flex;justify-content:space-between;border-bottom:2px solid #172033;padding-bottom:12px;margin-bottom:16px}
      .print-muted{color:#64748b;font-size:11px}
      .print-cards{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}
      .print-card{border:1px solid #dce3ec;border-radius:8px;padding:10px}
      .print-card div{font-size:10px;color:#64748b}.print-card strong{display:block;font-size:17px;margin-top:4px}
      #printReport table{width:100%;border-collapse:collapse;margin-top:8px}
      #printReport th,#printReport td{border:1px solid #dce3ec;padding:7px;text-align:right;font-size:10.5px}
      #printReport th{background:#f5f7fb;color:#475569}
      #printReport .positive{color:#15803d;font-weight:700}.negative{color:#b91c1c;font-weight:700}
      .print-footer{margin-top:24px;font-size:10px;color:#64748b;text-align:center}
    }`;
  document.head.appendChild(style);
  document.body.classList.add("printing-report");

  const cleanup=()=>{
    document.body.classList.remove("printing-report");
    report.remove(); style.remove(); window.removeEventListener("afterprint",cleanup);
  };
  window.addEventListener("afterprint",cleanup);
  setTimeout(()=>window.print(),100);
}
function clearAllData(){
  if(!confirm("⚠️ تحذير: سيتم حذف كل بيانات الميزانية من هذا الجهاز. هل أنت متأكد؟"))return;
  if(!confirm("تأكيد أخير: لا يمكن استرجاع البيانات بعد المسح إلا من Backup محفوظ مسبقًا. هل تريد المتابعة؟"))return;
  localStorage.removeItem(KEY);
  db=load();
  render();
  toast("تم مسح كل البيانات بنجاح.");
}
function restoreBackup(file){
 if(!file)return;const r=new FileReader();r.onload=()=>{try{const x=JSON.parse(r.result);if(!x.cycles||!x.savingsMethods||!x.fawry||!x.debt)throw Error();if(confirm("سيتم استبدال البيانات الحالية. هل أنت متأكد؟")){db=x;save();render();toast("تمت استعادة البيانات.");}}catch(e){alert("ملف Backup غير صالح.");}};r.readAsText(file);
}
function showPage(page){
 document.querySelectorAll(".nav-item").forEach(x=>x.classList.toggle("active",x.dataset.page===page));
 document.querySelectorAll(".page").forEach(x=>x.classList.remove("active"));document.getElementById("page-"+page).classList.add("active");
 if(page==="reports")renderReports();
}
window.approveCycle=approveCycle;window.showPage=showPage;window.openNewCycle=openNewCycle;window.openIncome=openIncome;window.openMidCycleIncome=openMidCycleIncome;window.selectCycle=selectCycle;window.openEmergency=openEmergency;window.deleteIncome=deleteIncome;window.openEnvelope=openEnvelope;window.deleteEnvelope=deleteEnvelope;window.openSavings=openSavings;window.openMethod=openMethod;window.openFawryDeposit=openFawryDeposit;window.openFawryWithdrawal=openFawryWithdrawal;window.openFawryClose=openFawryClose;window.closeCycle=closeCycle;window.addSurplusRow=addSurplusRow;window.openDebtSetup=openDebtSetup;window.openDebtPayment=openDebtPayment;window.exportBackup=exportBackup;window.restoreBackup=restoreBackup;window.exportPDF=exportPDF;window.clearAllData=clearAllData;window.buildReport=buildReport;window.closeModal=closeModal;window.render=render;

document.querySelectorAll(".nav-item").forEach(b=>b.addEventListener("click",()=>showPage(b.dataset.page)));
document.getElementById("newCycleBtn").addEventListener("click",openNewCycle);
document.getElementById("closeCycleTopBtn").addEventListener("click",closeCycle);
document.getElementById("pdfBtn").addEventListener("click",exportPDF);
document.getElementById("themeBtn").addEventListener("click",()=>{db.settings.theme=db.settings.theme==="dark"?"light":"dark";save();render()});
if(db.settings.theme==="dark")document.body.classList.add("dark");
render();
})();