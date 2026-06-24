export default function DashboardPanel({ title, subtitle, children }) {
  return (
    <section className="panel">
      <header className="panel-header">
        <h2 className="panel-title">{title}</h2>
        {subtitle && <span className="panel-subtitle">{subtitle}</span>}
      </header>
      <div className="panel-body">{children}</div>
    </section>
  );
}
