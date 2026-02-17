import FanPanel from "@/components/FanPanel";

export default function Page() {
  return (
    <main className="bank-shell">
      <section className="bank-console">
        <header className="bank-header">
          <div className="bank-brand">
            <span className="bank-badge">MQ</span>
            <div>
              <p className="bank-eyebrow">Remote Air Systems</p>
              <h1>Fan MQTT Control Desk</h1>
            </div>
          </div>
        </header>

        <FanPanel />
      </section>
    </main>
  );
}
