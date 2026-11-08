import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import Navbar from './components/Navbar.jsx'
import AuthModal from './components/AuthModal.jsx'
import { Activity, ArrowDown, ArrowRight, CalendarDays, Check, ClipboardCheck, FlaskConical, Heart, LayoutDashboard, LockKeyhole, Mail, Microscope, ShieldCheck, Sparkles, TestTubes, Users } from 'lucide-react'
import './App.css'
import './Hero.css'
import './theme.css'

function Logo() {
  const { t } = useTranslation('common')
  return <a href="#home" className="brand" lang="en" dir="ltr" aria-label={t('common:homeLabel')}><span className="brand-symbol"><Activity size={23} strokeWidth={2.4} /></span>Smart<span className="brand-lightweight">LIMS</span><span className="brand-dot">.</span></a>
}
function Button({ children, onClick }) {
  return <button className="button button-primary" onClick={onClick}>{children}<ArrowRight size={17} /></button>
}
function App() {
  const { t, i18n } = useTranslation(['landing', 'common'])
  const number = value => new Intl.NumberFormat(i18n.resolvedLanguage).format(value)
const steps = [
  { icon: CalendarDays, title: t('landing:steps.book.title'), text: t('landing:steps.book.text'), detail: t('landing:steps.book.detail') },
  { icon: TestTubes, title: t('landing:steps.track.title'), text: t('landing:steps.track.text'), detail: t('landing:steps.track.detail') },
  { icon: ClipboardCheck, title: t('landing:steps.results.title'), text: t('landing:steps.results.text'), detail: t('landing:steps.results.detail') },
]
const roles = [
  { icon: Heart, name: t('landing:roles.patient.name'), title: t('landing:roles.patient.title'), text: t('landing:roles.patient.text'), tags: [t('landing:roles.patient.tag1'), t('landing:roles.patient.tag2')] },
  { icon: LayoutDashboard, name: t('landing:roles.admin.name'), title: t('landing:roles.admin.title'), text: t('landing:roles.admin.text'), tags: [t('landing:roles.admin.tag1'), t('landing:roles.admin.tag2')] },
  { icon: Users, name: t('landing:roles.reception.name'), title: t('landing:roles.reception.title'), text: t('landing:roles.reception.text'), tags: [t('landing:roles.reception.tag1'), t('landing:roles.reception.tag2')] },
  { icon: Microscope, name: t('landing:roles.technician.name'), title: t('landing:roles.technician.title'), text: t('landing:roles.technician.text'), tags: [t('landing:roles.technician.tag1'), t('landing:roles.technician.tag2')] },
]

  const [period, setPeriod] = useState('6 months')
  const [metric, setMetric] = useState('Glucose')
  const [authMode, setAuthMode] = useState(null)
  const openAuth = (mode = 'signup') => setAuthMode(mode)
  const values = metric === 'Glucose' ? (period === '6 months' ? [108, 101, 104, 94, 98, 92] : [105, 107, 100, 98, 95, 92]) : (period === '6 months' ? [194, 188, 191, 179, 181, 172] : [198, 192, 187, 181, 177, 172])
  const points = values.map((v, i) => `${40 + i * 76},${metric === 'Glucose' ? 370 - v * 2.5 : 595 - v * 2.5}`).join(' ')
  return <>
    <Navbar logo={<Logo />} onOpenAuth={openAuth} />
    <main>
      <section className="tech-hero" id="home" aria-labelledby="hero-title">
        <div className="tech-hero__particles" aria-hidden="true" />
        <div className="tech-hero__inner">
          <div className="tech-hero__copy">
            <h1 id="hero-title" className="tech-hero__title">
              <span>{t('landing:hero.title1')}</span>
              <span>{t('landing:hero.title2')}</span>
              <span className="tech-hero__accent">{t('landing:hero.title3')}</span>
            </h1>
            <p className="tech-hero__description">{t('landing:hero.description')}</p>
            <div className="tech-hero__actions">
              <button type="button" className="tech-hero__button tech-hero__button--primary" onClick={() => openAuth('signup')}>
                {t('common:getStarted')}<ArrowRight size={18} aria-hidden="true" />
              </button>
              <a className="tech-hero__button tech-hero__button--outline" href="#features">
                {t('landing:hero.exploreFeatures')}<ArrowRight size={18} aria-hidden="true" />
              </a>
            </div>
          </div>
          <div className="tech-hero__visual">
            <div className="tech-hero__glow" aria-hidden="true" />
            <div className="tech-hero__tube-entrance">
              <img
                className="tech-hero__tube"
                src="/images/lims-tube.png.PNG"
                alt={t('landing:hero.imageAlt')}
                width="1536"
                height="1024"
                fetchPriority="high"
                decoding="async"
              />
            </div>
          </div>
        </div>
      </section>
      <div className="trust-strip"><div className="container trust-inner"><span>{t('landing:trust.intro')}<br /><strong>{t('landing:trust.everySide')}</strong></span><div><Heart />{t('landing:trust.patients')}</div><div><FlaskConical />{t('landing:trust.labs')}</div><div><ShieldCheck />{t('landing:trust.privacy')}</div><div><Activity />{t('landing:trust.insights')}</div></div></div>
      <section className="section container" id="how-it-works"><div className="section-heading centered"><div className="eyebrow">{t('landing:steps.eyebrow')}</div><h2>{t('landing:steps.title')}</h2><p>{t('landing:steps.description')}</p></div><div className="steps-grid">{steps.map(({ icon: Icon, title, text, detail }, i) => <article className="step-card" key={title}><div className="step-top"><span className="icon-box"><Icon size={24} /></span><span className="step-number">{number(i + 1).padStart(2, number(0))}</span></div><h3>{title}</h3><p>{text}</p><div className="step-detail"><span />{detail}</div></article>)}</div></section>
      <section className="platform-section" id="features"><div className="container section"><div className="section-heading split-heading"><div><h2>{t('landing:platform.title')}</h2></div><p>{t('landing:platform.description')}</p></div><div className="roles-grid">{roles.map(({ icon: Icon, name, title, text, tags }) => <article className="role-card" key={name}><div className="role-label"><Icon size={20} />{name}<ArrowRight size={18} className="role-arrow" /></div><h3>{title}</h3><p>{text}</p><div className="role-tags">{tags.map(tag => <span key={tag}><Check size={12} />{tag}</span>)}</div></article>)}</div></div></section>
      <section className="section container insights-section" id="insights"><div className="insights-copy"><div className="eyebrow">{t('landing:insights.eyebrow')}</div><h2>{t('landing:insights.title1')}<br /><span>{t('landing:insights.title2')}</span></h2><p>{t('landing:insights.description')}</p><ul className="check-list"><li><Check />{t('landing:insights.check1')}</li><li><Check />{t('landing:insights.check2')}</li><li><Check />{t('landing:insights.check3')}</li></ul><a className="text-link teal-link" href="#features">{t('landing:insights.discover')}<ArrowRight size={17} /></a></div><div className="chart-card"><div className="chart-header"><div><span className="small-label">{t('landing:chart.eyebrow')}</span><h3>{t('landing:chart.title')}</h3></div><span className="icon-box small"><Activity size={19} /></span></div><div className="chart-controls"><div className="metric-tabs" aria-label={t('landing:chart.metricLabel')}>{['Glucose', 'Cholesterol'].map(item => <button key={item} aria-pressed={metric === item} className={metric === item ? 'active' : ''} onClick={() => setMetric(item)}>{t(`landing:chart.metrics.${item.toLowerCase()}`)}</button>)}</div><select aria-label={t('landing:chart.periodLabel')} value={period} onChange={e => setPeriod(e.target.value)}><option value="6 months">{t('landing:chart.periods.six')}</option><option value="12 months">{t('landing:chart.periods.twelve')}</option></select></div><div className="chart-value">{number(values[5])} <span>{t('landing:chart.unit')}</span><span className="trend"><ArrowDown size={12} />{t('landing:chart.trend', { value: number(values[0] - values[5]) })}</span></div><div className="chart" role="img" aria-label={t('landing:chart.accessible', { metric: t(`landing:chart.metrics.${metric.toLowerCase()}`), period: t(period === '6 months' ? 'landing:chart.periods.six' : 'landing:chart.periods.twelve'), values: values.map(number).join(i18n.resolvedLanguage === 'ar' ? '، ' : ', ') })}><svg viewBox="0 0 460 220" direction="ltr"><defs><linearGradient id="chart-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--chart-line)" stopOpacity=".19" /><stop offset="100%" stopColor="var(--chart-line)" stopOpacity="0" /></linearGradient></defs>{[45, 95, 145, 195].map((y, i) => <g key={y}><line x1="35" x2="440" y1={y} y2={y} stroke="var(--chart-grid)" strokeDasharray="3 5" /><text x="0" y={y + 4} fill="var(--chart-label)" fontSize="10">{number(metric === 'Glucose' ? 130 - i * 20 : 220 - i * 20)}</text></g>)}<polygon points={`40,195 ${points} 420,195`} fill="url(#chart-fill)" /><polyline points={points} fill="none" stroke="var(--chart-line)" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />{points.split(' ').map((point, i) => <circle key={i} cx={point.split(',')[0]} cy={point.split(',')[1]} r="4.5" fill="var(--chart-point)" stroke="var(--chart-line)" strokeWidth="2.5" />)}</svg><div className="chart-months" dir="ltr">{(period === '6 months' ? ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'] : ['Jul', 'Sep', 'Nov', 'Jan', 'Mar', 'Jun']).map(month => <span key={month}>{t(`landing:months.${month}`)}</span>)}</div></div><div className="chart-note"><span className="status-dot" />{t('landing:chart.illustrative')}<span>{t('landing:chart.note')}</span></div></div></section>
      <section className="security-section" id="security"><div className="container security-inner"><div className="security-copy"><div className="eyebrow">{t('landing:security.eyebrow')}</div><h2>{t('landing:security.title1')}<br />{t('landing:security.title2')}</h2><p>{t('landing:security.description')}</p><a href="mailto:privacy@smart-lims.com" className="text-link">{t('landing:security.contact')}<ArrowRight size={17} /></a></div><div className="security-features">{[{ icon: LockKeyhole, title: t('landing:security.private.title'), text: t('landing:security.private.text') }, { icon: ShieldCheck, title: t('landing:security.access.title'), text: t('landing:security.access.text') }, { icon: ClipboardCheck, title: t('landing:security.accountability.title'), text: t('landing:security.accountability.text') }].map(({ icon: Icon, title, text }) => <div className="security-feature" key={title}><span><Icon size={23} /></span><div><h3>{title}</h3><p>{text}</p></div></div>)}</div></div></section>
      <section className="section container testimonial-section" id="vision"><div className="testimonial-photo"><img src="/images/lab-team.png" alt={t('landing:testimonial.imageAlt')} loading="lazy" /></div><div className="testimonial-copy"><div className="eyebrow">{t('landing:testimonial.eyebrow')}</div><h2>{t('landing:testimonial.title1')}<br />{t('landing:testimonial.title2')}</h2><span className="quote-mark">“</span><blockquote>{t('landing:testimonial.quote')}</blockquote><div className="quote-person"><span className="avatar"><Heart size={20} /></span><div><strong>{t('landing:testimonial.person')}</strong></div></div></div></section>
      <section className="final-cta container"><span className="cta-decoration" aria-hidden="true"><Activity /></span><div className="eyebrow"><Sparkles size={14} />{t('landing:cta.eyebrow')}</div><h2>{t('landing:cta.title1')}<br />{t('landing:cta.title2')}</h2><p>{t('landing:cta.description')}</p><Button onClick={() => openAuth('signup')}>{t('landing:cta.button')}</Button><span className="cta-footnote">{t('landing:cta.footnote')}</span></section>
    </main>
    <footer className="site-footer container"><div className="footer-top"><div className="footer-brand"><Logo /><p>{t('landing:footer.tagline1')}<br />{t('landing:footer.tagline2')}</p></div><div><h3>{t('landing:footer.explore')}</h3><a href="#home">{t('common:home')}</a><a href="#features">{t('landing:footer.features')}</a><a href="#how-it-works">{t('common:howItWorks')}</a></div><div><h3>{t('landing:footer.trust')}</h3><a href="#security">{t('landing:footer.security')}</a><a href="#insights">{t('landing:footer.insights')}</a><button onClick={() => openAuth('signup')}>{t('common:getStarted')}</button></div><div><h3>{t('landing:footer.connect')}</h3><a href="mailto:smart-lims@gmail.com"><Mail size={14} /><bdi lang="en">smart-lims@gmail.com</bdi></a><p>{t('landing:footer.future')}<br />{t('landing:footer.partOfYours')}</p></div></div><div className="footer-bottom"><span>{t('landing:footer.copyright', { year: number(new Date().getFullYear()).replace(/[٬,]/g, '') })}</span><span>{t('landing:footer.designed')}<Heart size={12} /></span></div></footer>
    <AuthModal mode={authMode} onModeChange={setAuthMode} onClose={() => setAuthMode(null)} />
  </>
}
export default App

