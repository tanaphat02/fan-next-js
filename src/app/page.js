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
          <p className="bank-session-note">Touch-first layout, optimized for iPhone SE2</p>
        </header>

        <FanPanel />
      </section>
    </main>
  );
}
