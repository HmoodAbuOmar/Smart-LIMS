// Only loaded by the development service boundary. No personal or clinical records.
export function createEvents() {
  const actors = [
    { actorId: 'actor-1', actorEn: 'Lina Haddad', actorAr: 'لينا حداد', role: 'admin' },
    { actorId: 'actor-2', actorEn: 'Omar Nasser', actorAr: 'عمر ناصر', role: 'coordinator' },
  ]
  return Array.from({ length: 34 }, (_, i) => ({
    id: `event-${i + 1}`, timestamp: new Date(Date.now() - i * 18 * 60 * 60 * 1000).toISOString(),
    ...actors[i % actors.length], action: ['CREATED', 'UPDATED', 'DELETED'][i % 3],
    entityEn: ['Collection schedule', 'Catalog definition', 'Notification template'][i % 3],
    entityAr: ['جدول جمع العينات', 'تعريف الفحص', 'قالب الإشعار'][i % 3],
    entityId: `CFG-${1001 + i}`, requestId: `request-${2001 + i}`,
    detailsEn: ['Created a collection schedule. No appointments were changed.', 'Updated the catalog description. Historical order snapshots were retained.', 'Removed an unused notification template. Existing messages were retained.'][i % 3],
    detailsAr: ['أُضيف جدول لجمع العينات. لم تتغير المواعيد.', 'حُدّث وصف الفحص مع الاحتفاظ بسجلات الطلبات السابقة.', 'أُزيل قالب إشعار غير مستخدم مع الاحتفاظ بالرسائل السابقة.'][i % 3],
  }))
}
