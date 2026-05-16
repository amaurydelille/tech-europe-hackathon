export default function WhyPage() {
  return (
    <main
      style={{
        minHeight: "100dvh",
        background: "var(--bg)",
        color: "var(--text)",
        padding: "28px 16px 40px",
      }}
    >
      <div style={{ maxWidth: 940, margin: "0 auto" }}>
        <section
          style={{
            borderRadius: 22,
            border: "1px solid var(--border)",
            background: "var(--surface)",
            boxShadow: "var(--shadow-sm)",
            padding: "28px 22px",
            marginBottom: 16,
          }}
        >
          <div
            style={{
              display: "inline-block",
              padding: "5px 10px",
              borderRadius: 999,
              border: "1px solid var(--border)",
              background: "var(--bg-tint)",
              fontSize: 11,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "var(--text-3)",
              marginBottom: 12,
            }}
          >
            Why We Built This
          </div>

          <h1
            style={{
              margin: "0 0 12px",
              fontFamily: "var(--f-head)",
              fontSize: 38,
              lineHeight: 1.05,
              letterSpacing: "-0.02em",
            }}
          >
            Education Should Not Depend on Family Wealth
          </h1>

          <p style={{ margin: 0, color: "var(--text-2)", fontSize: 17, lineHeight: 1.55 }}>
            In 2026, it is still too common to see students in top schools coming mostly from rich families.
            We believe learning opportunities should be open to everyone, not only to people with resources.
          </p>
        </section>

        <section
          style={{
            borderRadius: 22,
            border: "1px solid var(--border)",
            background: "var(--surface)",
            boxShadow: "var(--shadow-sm)",
            padding: "24px 22px",
            marginBottom: 16,
          }}
        >
          <h2 style={{ margin: "0 0 10px", fontFamily: "var(--f-head)", fontSize: 26 }}>
            Our Answer
          </h2>
          <p style={{ margin: 0, color: "var(--text-2)", fontSize: 16, lineHeight: 1.55 }}>
            We built a social-media-like way to learn: short, engaging video lessons with clear text support.
            You get a personal AI professor, available anytime, to guide you through any subject.
          </p>
        </section>

        <section
          style={{
            borderRadius: 22,
            border: "1px solid var(--border)",
            background: "var(--surface)",
            boxShadow: "var(--shadow-sm)",
            padding: "24px 22px",
            marginBottom: 16,
          }}
        >
          <h2 style={{ margin: "0 0 14px", fontFamily: "var(--f-head)", fontSize: 26 }}>
            How It Works
          </h2>

          <div style={{ display: "grid", gap: 10 }}>
            {[
              "Open the app and start talking with Keiron.",
              "Tell Keiron what subject you want to learn.",
              "Get a personalized course and start learning with video + text.",
              "Keep progressing with your AI tutor, at your own pace.",
            ].map((step, i) => (
              <div
                key={step}
                style={{
                  display: "flex",
                  gap: 10,
                  alignItems: "flex-start",
                  padding: "10px 12px",
                  borderRadius: 12,
                  background: "var(--bg-tint)",
                  border: "1px solid var(--border)",
                }}
              >
                <div
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: 12,
                    background: "#2a2520",
                    color: "#fff",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 12,
                    fontWeight: 700,
                    flexShrink: 0,
                  }}
                >
                  {i + 1}
                </div>
                <div style={{ fontSize: 15, color: "var(--text)", lineHeight: 1.45 }}>{step}</div>
              </div>
            ))}
          </div>
        </section>

        <section
          style={{
            borderRadius: 22,
            border: "1px solid var(--border)",
            background: "#2a2520",
            color: "#F8F4EC",
            padding: "20px 20px",
          }}
        >
          <div style={{ fontFamily: "var(--f-head)", fontSize: 24, marginBottom: 8 }}>
            Mission
          </div>
          <p style={{ margin: 0, fontSize: 16, lineHeight: 1.5, opacity: 0.95 }}>
            Reduce the gap between students by giving everyone access to high-quality, personal learning support.
          </p>
        </section>
      </div>
    </main>
  );
}
