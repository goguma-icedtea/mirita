export class AppError extends Error { constructor(message,status=400){super(message);this.status=status;} }
export function validateRoute(v){
 const text=(x,max)=>{if(typeof x!=='string'||!x.trim()||x.trim().length>max)throw new AppError('입력 내용을 확인해 주세요.');return x.trim();};
 const integer=(x,min,max)=>{if(!Number.isInteger(x)||x<min||x>max)throw new AppError('시간 범위를 확인해 주세요.');return x;};
 const id=x=>{if(typeof x!=='string'||!/^\d{1,12}$/.test(x))throw new AppError('정류장과 버스를 다시 선택해 주세요.');return x;};
 if(!v||!/^([01]\d|2[0-3]):[0-5]\d$/.test(v.time)||!Array.isArray(v.days)||!v.days.length||v.days.some(x=>!Number.isInteger(x)||x<0||x>6)||typeof v.enabled!=='boolean')throw new AppError('요일과 알림 시각을 확인해 주세요.');
 return {origin:text(v.origin,80),station:{id:id(v.station?.id),arsId:id(v.station?.arsId),name:text(v.station?.name,100)},bus:{id:id(v.bus?.id),name:text(v.bus?.name,40),order:id(v.bus?.order),direction:typeof v.bus?.direction==='string'?v.bus.direction.slice(0,100):''},walkMinutes:integer(v.walkMinutes,1,60),bufferMinutes:integer(v.bufferMinutes,1,10),time:v.time,days:[...new Set(v.days)].sort(),enabled:v.enabled};
}
export function departure(seconds,walk,buffer){
 if(!Number.isFinite(seconds)||seconds<=0)return null;
 const left=seconds-(walk+buffer)*60;
 return {minutes:Math.ceil(seconds/60),leaveInMinutes:Math.max(0,Math.floor(left/60)),state:seconds<walk*60?'missed':left<=0?'leave':'wait'};
}
