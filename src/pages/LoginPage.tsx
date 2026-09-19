import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Button, Field, TextInput, Card, Segmented } from "../components/ui";
import { useAuthStore, DEMO_CREDENTIALS, demoProfile } from "../lib/authStore";
import { USERS, type Role } from "../lib/users";
import { palette, radius, shadow } from "../lib/theme";
import { Icon } from "../components/Icon";

/* ------------------------------------------------------------------ */
/* Animated counter hook                                               */
/* ------------------------------------------------------------------ */
function useCountTo(target: number, duration = 1800): string {
  const [val, setVal] = useState(0);
  const raf = useRef<number>(0);
  useEffect(() => {
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min((now - start) / duration, 1);
      const ease = 1 - Math.pow(1 - t, 3);
      setVal(Math.round(ease * target));
      if (t < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [target, duration]);
  return val.toLocaleString("fr-HT");
}

/* ------------------------------------------------------------------ */
/* Role label map                                                      */
/* ------------------------------------------------------------------ */
const ROLE_LABELS: Record<Role, string> = {
  owner: "Propriyetè",
  admin: "Admin",
  manager: "Manadjè",
  cashier: "Kesye",
};

const ROLE_ICONS: Record<Role, string> = {
  owner: "star",
  admin: "shield",
  manager: "people",
  cashier: "cash",
};

/* ------------------------------------------------------------------ */
/* Form inputs (underline style, self-contained)                       */
/* ------------------------------------------------------------------ */
function AuthInput({
  value,
  onChange,
  placeholder,
  type = "text",
  autoFocus,
  autoComplete,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  autoFocus?: boolean;
  autoComplete?: string;
}) {
  return (
    <input
      type={type}
      value={value}
      placeholder={placeholder}
      autoFocus={autoFocus}
      autoComplete={autoComplete}
      onChange={e => onChange(e.target.value)}
      className="auth-input"
    />
  );
}

/* ------------------------------------------------------------------ */
/* Main page                                                           */
/* ------------------------------------------------------------------ */
export function LoginPage() {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [secret, setSecret] = useState("");
  const [name, setName] = useState("");
  const [storeName, setStoreName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { signIn, signUp, demoSignIn } = useAuthStore();
  const nav = useNavigate();

  /* Animated counters */
  const transactions = useCountTo(48520, 2000);
  const revenue = useCountTo(2147000, 2000);
  const products = useCountTo(1286, 2000);
  const uptime = useCountTo(99, 1400);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      if (mode === "signup") {
        if (!email || !secret || !name || !storeName) {
          setError("Tout chan obligatwa.");
          setLoading(false);
          return;
        }
        const res = await signUp(email, secret, name, storeName);
        if (res.ok) { nav("/"); return; }
        setError(res.error ?? "Erè siy.");
        setLoading(false);
        return;
      }
      /* signin */
      if (email && secret) {
        const res = await signIn(email, secret);
        if (res.ok) { nav("/"); return; }
        setError(res.error ?? "Idantifikasyon pa kòrèk.");
        setLoading(false);
        return;
      }
      const match = DEMO_CREDENTIALS.find(c => c.email.toLowerCase().trim() === email.toLowerCase().trim());
      if (match) {
        await demoSignIn(match.userId);
        nav("/");
        return;
      }
      const userByPin = USERS.find(u => u.secret === secret);
      if (userByPin) {
        const demo = DEMO_CREDENTIALS.find(c => c.userId === userByPin.id) ?? demoProfile;
        await demoSignIn(demo.userId);
        nav("/");
        return;
      }
      setError("Idantifikasyon pa kòrèk");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erè siy");
    } finally {
      setLoading(false);
    }
  };

  const quickDemo = async (userId?: string) => {
    try {
      await demoSignIn(userId);
      nav("/");
    } catch {}
  };

  /* ---------------------------------------------------------------- */
  /* Left panel — brand hero                                           */
  /* ---------------------------------------------------------------- */
  const Hero = () => (
    <div
      className="auth-left"
      style={{
        position: "relative",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        padding: "56px 52px 52px 56px",
        background: palette.ink2,
        overflow: "hidden",
        borderRadius: 28,
      }}
    >
      {/* Gold glow */}
      <div
        className="auth-glow"
        style={{
          position: "absolute",
          top: -140,
          left: -80,
          width: 380,
          height: 380,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(200,162,74,0.32) 0%, rgba(200,162,74,0.08) 44%, transparent 72%)",
          filter: "blur(40px)",
          pointerEvents: "none",
          animation: "authDrift 12s ease-in-out infinite",
        }}
      />
      <div
        className="auth-glow2"
        style={{
          position: "absolute",
          bottom: -90,
          right: -50,
          width: 300,
          height: 300,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(200,162,74,0.24) 0%, transparent 68%)",
          filter: "blur(50px)",
          pointerEvents: "none",
          animation: "authDrift 14s ease-in-out 3s infinite",
        }}
      />

      {/* Orbit */}
      <div className="auth-orbits">
        <div className="auth-orbit o1" />
        <div className="auth-orbit o2" />
      </div>

      {/* Content */}
      <div style={{ position: "relative", zIndex: 2, maxWidth: 480 }}>
        {/* Kourro logo */}
        <div
          className="auth-anim"
          style={{
            width: 60,
            height: 60,
            borderRadius: 18,
            background: "#fff",
            border: "1px solid rgba(200,162,74,0.32)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 28,
            padding: 6,
          }}
        >
          <img src="/kourro-logo.png" alt="Kourro" style={{ width: 48, height: 48, objectFit: "contain" }} />
        </div>

        {/* Headline */}
        <h1
          className="auth-anim"
          style={{
            margin: 0,
            fontSize: 42,
            fontWeight: 800,
            lineHeight: 1.08,
            letterSpacing: -1.2,
            color: "#FFFFFF",
          }}
        >
          Bati yon biznis
        </h1>
        <h1
          className="auth-anim-d1"
          style={{
            margin: "6px 0 0",
            fontSize: 42,
            fontWeight: 800,
            lineHeight: 1.08,
            letterSpacing: -1.2,
            fontStyle: "italic",
            background: "linear-gradient(100deg, #EAD8B6 0%, #C8A24A 40%, #8A6A35 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            backgroundClip: "text",
          }}
        >
          ki ap siviv ou.
        </h1>

        {/* Subtitle */}
        <p
          className="auth-anim-d1"
          style={{
            margin: "20px 0 0",
            fontSize: 15,
            lineHeight: 1.6,
            color: "rgba(255,255,255,0.62)",
            maxWidth: 380,
          }}
        >
          Kourro — sistèm entelijan pou boutik, fwadwazi, ak depo. Siveye vant ou, kliyan, ak ekip, kote ou ye.
        </p>

        {/* Live KPI counters */}
        <div
          className="auth-left-live"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(2, 1fr)",
            gap: 10,
            marginTop: 34,
          }}
        >
          {[
            { label: "VANT", value: transactions, sub: "transaksyon" },
            { label: "REVNI", value: `§${revenue}`, sub: "dola Ayisyen" },
            { label: "PWODWI", value: products, sub: "an stock" },
            { label: "DISPONIB", value: `${uptime}%`, sub: "tan aktif" },
          ].map((item, i) => (
            <div
              key={item.label}
              className="auth-anim"
              style={{
                background: "rgba(255,255,255,0.06)",
                borderRadius: 14,
                padding: "14px 14px 12px",
                border: "1px solid rgba(255,255,255,0.08)",
                backdropFilter: "blur(12px)",
                WebkitBackdropFilter: "blur(12px)",
                animationDelay: `${0.1 + i * 0.08}s`,
              }}
            >
              <div style={{ fontSize: 9, fontWeight: 700, color: palette.accentGold, letterSpacing: 0.8, marginBottom: 4 }}>
                {item.label}
              </div>
              <div style={{ fontSize: 20, fontWeight: 800, color: "#FFFFFF", letterSpacing: -0.4, fontVariantNumeric: "tabular-nums" }}>
                {item.value}
              </div>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>{item.sub}</div>
            </div>
          ))}
        </div>

        {/* Bars */}
        <div
          className="auth-left-live"
          style={{
            display: "flex",
            alignItems: "flex-end",
            gap: 5,
            height: 42,
            marginTop: 18,
          }}
        >
          {[18, 30, 14, 34, 26, 38].map((h, i) => (
            <div
              key={i}
              className="auth-bars-bar"
              style={{
                flex: 1,
                height: `${h}px`,
                borderRadius: 5,
                background: `linear-gradient(180deg, ${palette.accentGold}, rgba(200,162,74,0.35))`,
                animationDelay: `${0.4 + i * 0.1}s`,
              }}
            />
          ))}
        </div>

        {/* Floating POS card */}
        <div
          className="auth-float"
          style={{
            marginTop: 22,
            background: "rgba(255,255,255,0.96)",
            borderRadius: 14,
            padding: "11px 14px",
            width: 260,
            border: "1px solid rgba(255,255,255,0.18)",
            boxShadow: "0 18px 50px rgba(0,0,0,0.28)",
          }}
        >
          {[
            { n: "Malt", p: 125, q: 2 },
            { n: "Blan dlo", p: 50, q: 3 },
          ].map(row => (
            <div key={row.n} style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 6 }}>
              <span style={{ color: "#837b69", fontWeight: 600 }}>{row.q}× {row.n}</span>
              <span style={{ fontWeight: 800, color: "#16130c", fontVariantNumeric: "tabular-nums" }}>§{(row.p * row.q).toLocaleString("fr-HT")}</span>
            </div>
          ))}
          <div
            style={{
              marginTop: 6,
              paddingTop: 7,
              borderTop: `0.5px solid #E5E5EA`,
              display: "flex",
              justifyContent: "space-between",
              fontSize: 12,
              fontWeight: 800,
            }}
          >
            <span style={{ color: "#16130c" }}>TOTAL</span>
            <span style={{ color: "#B08D3E", fontVariantNumeric: "tabular-nums" }}>§475</span>
          </div>
        </div>

        {/* Feature pills */}
        <div
          className="auth-left-live"
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 7,
            marginTop: 18,
          }}
        >
          {["POS entelijan", "Stock otomatik", "Analiz vant", "Ekip ak pèmisyon"].map(label => (
            <span
              key={label}
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: "rgba(255,255,255,0.72)",
                background: "rgba(255,255,255,0.08)",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: 999,
                padding: "6px 12px",
              }}
            >
              {label}
            </span>
          ))}
        </div>

        {/* Footer */}
        <div
          className="auth-left-live"
          style={{
            marginTop: 28,
            fontSize: 11,
            color: "rgba(255,255,255,0.3)",
          }}
        >
          Kourro v2 · Syt: magazen.ht
        </div>
      </div>
    </div>
  );

  /* ---------------------------------------------------------------- */
  /* Right panel — form                                                */
  /* ---------------------------------------------------------------- */
  const Form = () => (
    <div
      className="auth-right"
      style={{
        padding: "42px 36px 36px",
        borderRadius: 28,
        background: palette.surface,
        border: `0.5px solid ${palette.hairline}`,
        boxShadow: shadow.elevated,
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
      }}
    >
      {/* Header */}
      <div style={{ textAlign: "center", marginBottom: 28 }} className="auth-anim">
        <div
          style={{
            width: 52,
            height: 52,
            borderRadius: 16,
            background: palette.accentGoldSoft,
            border: "1px solid rgba(200,162,74,0.28)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "0 auto 14px",
          }}
        >
          <img src="/kourro-logo.png" alt="Kourro" style={{ width: 52, height: 52, objectFit: "contain" }} />
        </div>
        <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: -0.4, color: palette.ink }}>Kourro</div>
        <div style={{ fontSize: 13, color: palette.muted2, marginTop: 4 }}>Konekte sou sistèm lan</div>
      </div>

      {/* Mode segmented */}
      <div className="auth-anim" style={{ marginBottom: 24 }}>
        <Segmented
          value={mode}
          onChange={setMode}
          options={[
            { value: "signin", label: "Konekte" },
            { value: "signup", label: "Kreye Kont" },
          ]}
        />
      </div>

      {/* Form */}
      <form onSubmit={submit}>
        {/* Signup-only fields */}
        {mode === "signup" && (
          <>
            <div className="auth-anim">
              <label style={{ fontSize: 11, fontWeight: 700, color: palette.muted2, textTransform: "uppercase", letterSpacing: 0.4 }}>
                Non konplè <span style={{ color: palette.danger }}>*</span>
              </label>
              <AuthInput value={name} onChange={setName} placeholder="Jan Dòmi" autoFocus />
            </div>
            <div className="auth-anim" style={{ marginTop: 16 }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: palette.muted2, textTransform: "uppercase", letterSpacing: 0.4 }}>
                Non magazen <span style={{ color: palette.danger }}>*</span>
              </label>
              <AuthInput value={storeName} onChange={setStoreName} placeholder="Machin Maria" />
            </div>
            <div style={{ height: 16 }} />
          </>
        )}

        {/* Email / ID */}
        <div className="auth-anim">
          <label style={{ fontSize: 11, fontWeight: 700, color: palette.muted2, textTransform: "uppercase", letterSpacing: 0.4 }}>
            {mode === "signup" ? "Imèl" : "Idantifian"}
          </label>
          <AuthInput
            value={email}
            onChange={setEmail}
            placeholder={mode === "signup" ? "ou@magazen.ht" : "imèl / non"}
            autoFocus={mode === "signin"}
          />
        </div>

        {/* Password / Secret */}
        <div className="auth-anim" style={{ marginTop: 16 }}>
          <label style={{ fontSize: 11, fontWeight: 700, color: palette.muted2, textTransform: "uppercase", letterSpacing: 0.4 }}>
            {mode === "signup" ? "Modpas" : "Kòd"}
          </label>
          <AuthInput
            value={secret}
            onChange={setSecret}
            placeholder={mode === "signup" ? "6+ karaktè" : "PIN / sekrè"}
            type="password"
          />
        </div>

        {/* Error */}
        {error && (
          <div
            style={{
              background: palette.dangerBg,
              border: `0.5px solid ${palette.dangerBd}`,
              borderRadius: radius.md,
              padding: 11,
              fontSize: 12,
              fontWeight: 600,
              color: palette.danger,
              marginTop: 14,
              textAlign: "center",
            }}
          >
            {error}
          </div>
        )}

        {/* CTA */}
        <button
          type="submit"
          disabled={loading}
          className="auth-cta-btn auth-anim"
          style={{
            width: "100%",
            height: 52,
            marginTop: 22,
            borderRadius: 16,
            border: "none",
            background: "linear-gradient(135deg, #ff4d00 0%, #ff6a2e 50%, #ff4d00 100%)",
            backgroundSize: "200% 100%",
            color: "#fff6ee",
            fontSize: 15,
            fontWeight: 800,
            fontFamily: "'DM Sans', 'Quicksand', system-ui, sans-serif",
            cursor: loading ? "not-allowed" : "pointer",
            opacity: loading ? 0.65 : 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            letterSpacing: -0.15,
            boxShadow: "0 4px 14px rgba(255,77,0,0.38)",
            transition: "opacity .15s ease, transform .08s ease",
          }}
        >
          {loading ? (
            <span style={{ display: "inline-block", width: 18, height: 18, border: "2.5px solid rgba(255,246,238,0.35)", borderTopColor: "#fff6ee", borderRadius: "50%", animation: "authSpin .7s linear infinite" }} />
          ) : (
            <>
              {mode === "signin" ? "Konekte" : "Kreye Kont"}
              <Icon name="arrow-right" size={16} color="#fff6ee" />
            </>
          )}
        </button>
      </form>

      {/* Divider */}
      <div
        className="auth-anim"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          margin: "22px 0 16px",
        }}
      >
        <div style={{ flex: 1, height: 1, background: palette.hairlineStrong }} />
        <span style={{ fontSize: 10, fontWeight: 700, color: palette.muted3, letterSpacing: 0.6, textTransform: "uppercase" }}>
          Eseye san kreye kont
        </span>
        <div style={{ flex: 1, height: 1, background: palette.hairlineStrong }} />
      </div>

      {/* Demo quick access */}
      <button
        onClick={() => quickDemo(demoProfile.userId)}
        className="auth-anim"
        style={{
          width: "100%",
          padding: "10px 0",
          borderRadius: 14,
          background: "rgba(200,162,74,0.08)",
          border: `1px solid ${palette.accentGold}`,
          color: palette.accentGold,
          fontSize: 13,
          fontWeight: 700,
          fontFamily: "inherit",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 6,
          transition: "border-color .15s ease",
        }}
      >
        <Icon name="trending-up" size={15} color={palette.accentGold} />
        Konekte san credentials
      </button>

      {/* Demo roster */}
      <div
        className="auth-anim"
        style={{
          marginTop: 20,
          paddingTop: 16,
          borderTop: `0.5px solid ${palette.hairline}`,
        }}
      >
        <div style={{ fontSize: 10, fontWeight: 700, color: palette.muted3, textTransform: "uppercase", letterSpacing: 0.5, textAlign: "center", marginBottom: 12 }}>
          Demo — chwazi wòl
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7 }}>
          {DEMO_CREDENTIALS.map(cred => (
            <button
              key={cred.userId}
              onClick={() => quickDemo(cred.userId)}
              style={{
                background: palette.surfaceGrouped,
                border: `0.5px solid ${palette.hairline}`,
                borderRadius: 13,
                padding: "10px 11px",
                cursor: "pointer",
                fontFamily: "inherit",
                textAlign: "left",
                transition: "border-color .12s ease, background .12s ease",
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = palette.accentGold; e.currentTarget.style.background = palette.accentGoldSoft; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = palette.hairline; e.currentTarget.style.background = palette.surfaceGrouped; }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                <Icon name={ROLE_ICONS[cred.role]} size={12} color={palette.accentGold} />
                <span style={{ fontWeight: 700, fontSize: 12, color: palette.ink }}>{ROLE_LABELS[cred.role]}</span>
              </div>
              <div style={{ fontSize: 10, color: palette.muted2, marginBottom: 5 }}>{cred.email}</div>
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 3,
                  fontSize: 10,
                  fontWeight: 700,
                  color: palette.accentGold,
                  background: "rgba(200,162,74,0.14)",
                  border: "1px solid rgba(200,162,74,0.26)",
                  borderRadius: 999,
                  padding: "2px 7px",
                  lineHeight: "16px",
                }}
              >
                KÒD {cred.pin}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  /* ---------------------------------------------------------------- */
  /* Render                                                            */
  /* ---------------------------------------------------------------- */
  return (
    <div
      className="auth-root"
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#F8F9FA",
        padding: 24,
      }}
    >
      <div
        className="auth-split"
        style={{
          display: "grid",
          gridTemplateColumns: "1.15fr 0.85fr",
          gap: 20,
          width: 960,
          maxWidth: "100%",
        }}
      >
        <Hero />
        <Form />
      </div>
    </div>
  );
}
