import './BrandLogo.css'

export const APPROVED_LOGO = '/images/smart-lims-logo.png'

// The same approved transparent artwork and existing white presentation everywhere.
export default function BrandLogo({ className = '', ...props }) {
  return <img src={APPROVED_LOGO} alt="Smart-LIMS" className={`smartlims-approved-logo ${className}`} {...props} />
}
