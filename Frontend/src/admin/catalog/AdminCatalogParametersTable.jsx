import { Check, Minus } from 'lucide-react'
import { catalogName, catalogText } from './adminCatalogModel.js'
import AdminCatalogParameterActions from './AdminCatalogParameterActions.jsx'

const columns = ['orderColumn', 'code', 'name', 'typeColumn', 'unitColumn', 'methodColumn', 'required', 'active', 'actions']

export default function AdminCatalogParametersTable({ parameters, language, copy, busy, onEdit, onToggle, onRanges }) {
  const number = value => new Intl.NumberFormat(language).format(value)
  function cell(key, content, rowHeader = false) {
    const Tag = rowHeader ? 'th' : 'td'
    return <Tag key={key} role={rowHeader ? 'rowheader' : 'cell'} scope={rowHeader ? 'row' : undefined} headers={`ac-parameter-heading-${key}`} className={`ac-parameter-${key}`}><span className="ac-parameter-label" aria-hidden="true">{copy[key]}</span><div className="ac-parameter-value">{content}</div></Tag>
  }
  return <div className="ac-parameters-table" role="region" aria-label={copy.parameters}>
    <table role="table"><caption className="ac-sr-only">{copy.parameters}</caption><colgroup>{columns.map(key => <col key={key} className={`ac-parameter-${key}`} />)}</colgroup>
      <thead role="rowgroup"><tr role="row">{columns.map(key => <th role="columnheader" scope="col" id={`ac-parameter-heading-${key}`} key={key}>{copy[key]}</th>)}</tr></thead>
      <tbody role="rowgroup">{parameters.map(item => <tr role="row" key={item.id}>
        {cell('orderColumn', number(item.displayOrder))}
        {cell('code', <bdi className="ac-code">{item.code}</bdi>, true)}
        {cell('name', <><span>{catalogName(item, language)}</span>{item.historicallyUsed && <small className="ac-used">{copy.historicallyUsed}</small>}</>)}
        {cell('typeColumn', copy[item.valueType])}
        {cell('unitColumn', <bdi>{item.unit || copy.missing}</bdi>)}
        {cell('methodColumn', catalogText(item, 'method', language) || copy.missing)}
        {cell('required', <span className="ac-flag">{item.required ? <Check size={13} aria-hidden="true" /> : <Minus size={13} aria-hidden="true" />}<span>{item.required ? copy.yes : copy.no}</span></span>)}
        {cell('active', <span className={`ac-badge ac-flag ${item.active ? 'ac-active' : ''}`}>{item.active ? <Check size={12} aria-hidden="true" /> : <Minus size={12} aria-hidden="true" />}<span>{item.active ? copy.active : copy.inactive}</span></span>)}
        {cell('actions', <AdminCatalogParameterActions parameter={item} language={language} copy={copy} busy={busy} onEdit={() => onEdit(item)} onToggle={() => onToggle(item)} onRanges={() => onRanges(item)} />)}
      </tr>)}</tbody>
    </table>
  </div>
}
