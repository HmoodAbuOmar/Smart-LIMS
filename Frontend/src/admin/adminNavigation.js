import { LayoutDashboard, Users, ContactRound, FlaskConical, SlidersHorizontal, Ruler, CalendarClock, CreditCard, ChartNoAxesCombined, ScrollText } from 'lucide-react'

export const adminNavigation = [
  { id: 'overview', Icon: LayoutDashboard },
  { id: 'users', Icon: Users },
  { id: 'patients', Icon: ContactRound },
  {
    id: 'testCatalog', Icon: FlaskConical,
    children: [
      { id: 'tests', Icon: FlaskConical },
      { id: 'parameters', Icon: SlidersHorizontal },
      { id: 'referenceRanges', Icon: Ruler },
    ],
  },
  { id: 'bookingSlots', Icon: CalendarClock },
  { id: 'operationsPayments', Icon: CreditCard },
  { id: 'reports', Icon: ChartNoAxesCombined },
  { id: 'auditLog', Icon: ScrollText },
]
