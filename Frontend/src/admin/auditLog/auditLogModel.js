export const schedulingZone = 'Asia/Jerusalem'
export function eventDay(timestamp) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: schedulingZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(timestamp))
}
export function text(record, field, language) { return record[`${field}${language === 'ar' ? 'Ar' : 'En'}`] || '' }
export function filterEvents(events, { from, to, actor, action, query }) {
  const needle = query.trim().toLocaleLowerCase()
  return events.filter(event => {
    const day = eventDay(event.timestamp)
    return (!from || day >= from) && (!to || day <= to) && (!actor || event.actorId === actor) && (!action || event.action === action) &&
      (!needle || [event.entityEn, event.entityAr, event.entityId, event.detailsEn, event.detailsAr].some(value => value.toLocaleLowerCase().includes(needle)))
  }).sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp) || a.id.localeCompare(b.id))
}
