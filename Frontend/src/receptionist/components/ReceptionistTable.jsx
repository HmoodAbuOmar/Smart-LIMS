export default function ReceptionistTable({ columns, rows, numeric = [] }) {
  return <div className="ro-table"><table><thead><tr>{columns.map((label, index) =>
    <th scope="col" key={index} className={numeric.includes(index) ? 'ro-numeric' : undefined}>{label}</th>
  )}</tr></thead><tbody>{rows.map((cells, row) =>
    <tr key={row}>{cells.map((cell, column) => <td key={column} className={numeric.includes(column) ? 'ro-numeric' : undefined}>
      <span className="ro-mobile-label" aria-hidden="true">{columns[column]}</span><div>{cell}</div>
    </td>)}</tr>
  )}</tbody></table></div>
}
