import { useState, useMemo, useEffect } from "react";

const ACCENT = "#FF2D55";
const ACCENT2 = "#00F2EA";
const DARK = "#0A0A0F";
const CARD = "#12121A";
const CARD2 = "#1A1A26";
const BORDER = "#2A2A3A";

const BRAND_COLORS = {
  GlowLab: "#FF6B9D", FitFuel: "#00D4AA", TechNova: "#6C5CE7", UrbanThreads: "#FD9644",
};

const fmt = (n) => n >= 1000000 ? (n/1000000).toFixed(1)+"M" : n >= 1000 ? (n/1000).toFixed(1)+"K" : String(n||0);
const fmtMoney = (n) => "$" + (n||0).toLocaleString();

// ─── TikTok OAuth helpers ────────────────────────────────────────────────────

const CLIENT_KEY = import.meta.env.VITE_TIKTOK_CLIENT_KEY;
const REDIRECT_URI = "http://localhost:5173/auth/callback";
const SCOPES = "user.info.basic,video.list,creator.info.basic";

function buildAuthURL() {
  const state = crypto.randomUUID();
  sessionStorage.setItem("tt_state", state);
  const params = new URLSearchParams({
    client_key: CLIENT_KEY,
    scope: SCOPES,
    response_type: "code",
    redirect_uri: REDIRECT_URI,
    state,
  });
  return `https://www.tiktok.com/v2/auth/authorize?${params}`;
}

// NOTE: Token exchange MUST happen server-side to protect your Client Secret.
// This function calls a small local proxy you'll run (see instructions below).
async function exchangeCodeForToken(code) {
  const res = await fetch("http://localhost:3001/auth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code, redirect_uri: REDIRECT_URI }),
  });
  if (!res.ok) throw new Error("Token exchange failed");
  return res.json(); // { access_token, open_id, expires_in }
}

async function fetchTikTokUser(accessToken, openId) {
  const res = await fetch("http://localhost:3001/tiktok/user", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ access_token: accessToken, open_id: openId }),
  });
  if (!res.ok) throw new Error("Failed to fetch user");
  return res.json();
}

async function fetchTikTokVideos(accessToken, openId) {
  const res = await fetch("http://localhost:3001/tiktok/videos", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ access_token: accessToken, open_id: openId }),
  });
  if (!res.ok) throw new Error("Failed to fetch videos");
  return res.json();
}

// ─── Mock data (shown before connecting) ────────────────────────────────────

const MOCK_VIDEOS = [
  { id: 1, title: "Morning routine with @GlowLab serums ✨", brand: "GlowLab", category: "Beauty", date: "2024-03-15", views: 284000, likes: 18400, comments: 920, shares: 3200, earnings: 1840, isSample: true, duration: "0:47" },
  { id: 2, title: "Honest review: @FitFuel protein shakes 💪", brand: "FitFuel", category: "Health", date: "2024-03-10", views: 512000, likes: 41200, comments: 2100, shares: 8900, earnings: 3200, isSample: false, duration: "1:02" },
  { id: 3, title: "Unboxing @TechNova earbuds 🎧", brand: "TechNova", category: "Tech", date: "2024-03-05", views: 189000, likes: 12800, comments: 540, shares: 2100, earnings: 980, isSample: true, duration: "0:58" },
  { id: 4, title: "GRWM ft @GlowLab new collection", brand: "GlowLab", category: "Beauty", date: "2024-02-28", views: 671000, likes: 53000, comments: 3400, shares: 11200, earnings: 4100, isSample: false, duration: "2:14" },
  { id: 5, title: "@UrbanThreads haul — are they worth it?", brand: "UrbanThreads", category: "Fashion", date: "2024-02-20", views: 94000, likes: 7200, comments: 380, shares: 910, earnings: 620, isSample: true, duration: "1:31" },
];

// ─── Sub-components ──────────────────────────────────────────────────────────

function StatCard({ label, value, sub, color }) {
  return (
    <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 16, padding: "20px 24px", display: "flex", flexDirection: "column", gap: 6, position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: color || ACCENT }} />
      <span style={{ fontSize: 12, color: "#666", textTransform: "uppercase", letterSpacing: 1.5, fontFamily: "monospace" }}>{label}</span>
      <span style={{ fontSize: 28, fontWeight: 800, color: "#fff", letterSpacing: -1 }}>{value}</span>
      {sub && <span style={{ fontSize: 12, color: "#555" }}>{sub}</span>}
    </div>
  );
}

function MiniBar({ value, max, color }) {
  return (
    <div style={{ width: "100%", height: 4, background: "#1E1E2E", borderRadius: 2 }}>
      <div style={{ width: `${Math.round((value / max) * 100)}%`, height: "100%", background: color, borderRadius: 2, transition: "width 0.4s ease" }} />
    </div>
  );
}

function AddVideoModal({ onClose, onAdd }) {
  const [form, setForm] = useState({ title: "", brand: "", category: "Beauty", date: "", views: "", likes: "", comments: "", shares: "", earnings: "", isSample: false, duration: "" });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", backdropFilter: "blur(4px)" }}>
      <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 20, padding: 32, width: "min(540px, 90vw)", maxHeight: "85vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: "#fff" }}>Add Video</h2>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#666", fontSize: 22, cursor: "pointer" }}>✕</button>
        </div>
        <div style={{ display: "grid", gap: 14 }}>
          {[
            { label: "Video Title", key: "title", type: "text", placeholder: "e.g. Unboxing @Brand new drops..." },
            { label: "Brand", key: "brand", type: "text", placeholder: "Brand name" },
            { label: "Date", key: "date", type: "date" },
            { label: "Duration", key: "duration", type: "text", placeholder: "e.g. 1:23" },
            { label: "Views", key: "views", type: "number" },
            { label: "Likes", key: "likes", type: "number" },
            { label: "Comments", key: "comments", type: "number" },
            { label: "Shares", key: "shares", type: "number" },
            { label: "Earnings ($)", key: "earnings", type: "number" },
          ].map(f => (
            <div key={f.key}>
              <label style={{ fontSize: 12, color: "#888", display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: 1 }}>{f.label}</label>
              <input type={f.type} placeholder={f.placeholder} value={form[f.key]} onChange={e => set(f.key, e.target.value)}
                style={{ width: "100%", background: DARK, border: `1px solid ${BORDER}`, borderRadius: 8, padding: "10px 12px", color: "#fff", fontSize: 14, boxSizing: "border-box", outline: "none" }} />
            </div>
          ))}
          <div>
            <label style={{ fontSize: 12, color: "#888", display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: 1 }}>Category</label>
            <select value={form.category} onChange={e => set("category", e.target.value)}
              style={{ width: "100%", background: DARK, border: `1px solid ${BORDER}`, borderRadius: 8, padding: "10px 12px", color: "#fff", fontSize: 14 }}>
              {["Beauty","Health","Tech","Fashion","Food","Travel","Lifestyle","Other"].map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
            <input type="checkbox" checked={form.isSample} onChange={e => set("isSample", e.target.checked)} style={{ width: 18, height: 18, accentColor: ACCENT }} />
            <span style={{ color: "#ccc", fontSize: 14 }}>This was a <strong>sample/gifted</strong> video (not paid)</span>
          </label>
        </div>
        <div style={{ display: "flex", gap: 12, marginTop: 24 }}>
          <button onClick={onClose} style={{ flex: 1, padding: "12px", background: "none", border: `1px solid ${BORDER}`, borderRadius: 10, color: "#888", cursor: "pointer", fontSize: 14 }}>Cancel</button>
          <button onClick={() => {
            if (!form.title || !form.brand) return;
            onAdd({ ...form, id: Date.now(), views: +form.views||0, likes: +form.likes||0, comments: +form.comments||0, shares: +form.shares||0, earnings: +form.earnings||0 });
            onClose();
          }} style={{ flex: 2, padding: "12px", background: ACCENT, border: "none", borderRadius: 10, color: "#fff", fontWeight: 700, cursor: "pointer", fontSize: 14 }}>
            Add Video
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main App ────────────────────────────────────────────────────────────────

export default function App() {
  const [videos, setVideos] = useState(MOCK_VIDEOS);
  const [tab, setTab] = useState("overview");
  const [showAdd, setShowAdd] = useState(false);
  const [filterBrand, setFilterBrand] = useState("All");
  const [filterType, setFilterType] = useState("All");
  const [sortKey, setSortKey] = useState("date");
  const [authState, setAuthState] = useState("idle"); // idle | loading | connected | error
  const [ttUser, setTtUser] = useState(null);
  const [authError, setAuthError] = useState(null);

  // Handle OAuth callback — runs when TikTok redirects back with ?code=
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const state = params.get("state");
    const savedState = sessionStorage.getItem("tt_state");

    if (!code) return;

    // Clear the URL so refresh doesn't re-run this
    window.history.replaceState({}, "", "/");

    if (state !== savedState) {
      setAuthError("State mismatch — possible CSRF. Please try again.");
      setAuthState("error");
      return;
    }

    setAuthState("loading");

    (async () => {
      try {
        const { access_token, open_id } = await exchangeCodeForToken(code);
        sessionStorage.setItem("tt_token", access_token);
        sessionStorage.setItem("tt_open_id", open_id);

        const [user, rawVideos] = await Promise.all([
          fetchTikTokUser(access_token, open_id),
          fetchTikTokVideos(access_token, open_id),
        ]);

        setTtUser(user);

        // Map TikTok API video shape → our app's shape
        const mapped = (rawVideos || []).map(v => ({
          id: v.id,
          title: v.title || v.video_description || "Untitled",
          brand: "",
          category: "Other",
          date: v.create_time ? new Date(v.create_time * 1000).toISOString().split("T")[0] : "",
          views: v.view_count || 0,
          likes: v.like_count || 0,
          comments: v.comment_count || 0,
          shares: v.share_count || 0,
          earnings: 0,
          isSample: false,
          duration: v.duration ? `${Math.floor(v.duration/60)}:${String(v.duration%60).padStart(2,"0")}` : "",
          coverUrl: v.cover_image_url || null,
        }));

        setVideos(mapped.length > 0 ? mapped : MOCK_VIDEOS);
        setAuthState("connected");
      } catch (err) {
        console.error(err);
        setAuthError(err.message);
        setAuthState("error");
      }
    })();
  }, []);

  // Resume session if token exists
  useEffect(() => {
    const token = sessionStorage.getItem("tt_token");
    const openId = sessionStorage.getItem("tt_open_id");
    if (token && openId && authState === "idle") {
      setAuthState("loading");
      Promise.all([fetchTikTokUser(token, openId), fetchTikTokVideos(token, openId)])
        .then(([user, rawVideos]) => {
          setTtUser(user);
          const mapped = (rawVideos || []).map(v => ({
            id: v.id, title: v.title || v.video_description || "Untitled",
            brand: "", category: "Other",
            date: v.create_time ? new Date(v.create_time * 1000).toISOString().split("T")[0] : "",
            views: v.view_count||0, likes: v.like_count||0, comments: v.comment_count||0,
            shares: v.share_count||0, earnings: 0, isSample: false,
            duration: v.duration ? `${Math.floor(v.duration/60)}:${String(v.duration%60).padStart(2,"0")}` : "",
            coverUrl: v.cover_image_url || null,
          }));
          setVideos(mapped.length > 0 ? mapped : MOCK_VIDEOS);
          setAuthState("connected");
        })
        .catch(() => { sessionStorage.clear(); setAuthState("idle"); });
    }
  }, []);

  const brands = useMemo(() => ["All", ...new Set(videos.map(v => v.brand).filter(Boolean))], [videos]);

  const filtered = useMemo(() => videos
    .filter(v => filterBrand === "All" || v.brand === filterBrand)
    .filter(v => filterType === "All" || (filterType === "Sample" ? v.isSample : !v.isSample))
    .sort((a, b) => {
      if (sortKey === "views") return b.views - a.views;
      if (sortKey === "earnings") return b.earnings - a.earnings;
      if (sortKey === "likes") return b.likes - a.likes;
      return new Date(b.date) - new Date(a.date);
    }), [videos, filterBrand, filterType, sortKey]);

  const stats = useMemo(() => ({
    totalViews: videos.reduce((s, v) => s + v.views, 0),
    totalEarnings: videos.reduce((s, v) => s + v.earnings, 0),
    totalVideos: videos.length,
    sampleCount: videos.filter(v => v.isSample).length,
    paidCount: videos.filter(v => !v.isSample).length,
    avgEngagement: videos.length ? Math.round(videos.reduce((s, v) => s + (v.views > 0 ? (v.likes + v.comments + v.shares) / v.views * 100 : 0), 0) / videos.length * 10) / 10 : 0,
  }), [videos]);

  const brandStats = useMemo(() => {
    const map = {};
    videos.forEach(v => {
      const key = v.brand || "Untagged";
      if (!map[key]) map[key] = { brand: key, total: 0, sample: 0, paid: 0, views: 0, earnings: 0 };
      map[key].total++;
      if (v.isSample) map[key].sample++; else map[key].paid++;
      map[key].views += v.views;
      map[key].earnings += v.earnings;
    });
    return Object.values(map).sort((a, b) => b.earnings - a.earnings);
  }, [videos]);

  const maxViews = Math.max(...brandStats.map(b => b.views), 1);

  const handleConnect = () => {
    window.location.href = buildAuthURL();
  };

  const handleDisconnect = () => {
    sessionStorage.clear();
    setAuthState("idle");
    setTtUser(null);
    setVideos(MOCK_VIDEOS);
  };

  const tabs = ["overview", "videos", "brands", "samples"];
  const connected = authState === "connected";

  return (
    <div style={{ minHeight: "100vh", background: DARK, color: "#fff", fontFamily: "'DM Sans', sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=DM+Mono:wght@400;500&display=swap');
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 6px; } ::-webkit-scrollbar-track { background: ${DARK}; } ::-webkit-scrollbar-thumb { background: ${BORDER}; border-radius: 3px; }
        @keyframes pulse { 0%,100%{opacity:1}50%{opacity:0.4} }
        @keyframes fadeIn { from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)} }
        @keyframes spin { to{transform:rotate(360deg)} }
      `}</style>

      {/* Header */}
      <div style={{ borderBottom: `1px solid ${BORDER}`, padding: "0 32px", display: "flex", alignItems: "center", justifyContent: "space-between", height: 64, position: "sticky", top: 0, background: "rgba(10,10,15,0.95)", backdropFilter: "blur(12px)", zIndex: 50 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: ACCENT, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>♪</div>
          <span style={{ fontWeight: 800, fontSize: 18, letterSpacing: -0.5 }}>TokTrack</span>
          <span style={{ fontSize: 11, background: "#1E1E2E", color: "#666", padding: "2px 8px", borderRadius: 20, fontFamily: "monospace" }}>PRO</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {authState === "loading" && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#888" }}>
              <div style={{ width: 14, height: 14, border: "2px solid #333", borderTopColor: ACCENT, borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
              Syncing...
            </div>
          )}
          {connected && ttUser && (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {ttUser.avatar_url && <img src={ttUser.avatar_url} style={{ width: 28, height: 28, borderRadius: "50%", border: `2px solid ${ACCENT}` }} />}
              <span style={{ fontSize: 13, fontWeight: 600 }}>@{ttUser.display_name || ttUser.username}</span>
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#00D4AA", animation: "pulse 2s infinite" }} />
            </div>
          )}
          {connected ? (
            <>
              <button onClick={() => setShowAdd(true)} style={{ padding: "8px 18px", borderRadius: 10, background: ACCENT, border: "none", color: "#fff", fontWeight: 700, cursor: "pointer", fontSize: 13 }}>+ Add Video</button>
              <button onClick={handleDisconnect} style={{ padding: "8px 14px", borderRadius: 10, background: CARD2, border: `1px solid ${BORDER}`, color: "#666", cursor: "pointer", fontSize: 13 }}>Disconnect</button>
            </>
          ) : (
            <>
              <button onClick={handleConnect} disabled={authState === "loading"} style={{ padding: "8px 18px", borderRadius: 10, background: authState === "loading" ? "#1A1A26" : `linear-gradient(135deg, ${ACCENT}, #FF6B9D)`, border: "none", color: "#fff", fontWeight: 700, cursor: "pointer", fontSize: 13 }}>
                Connect TikTok
              </button>
              <button onClick={() => setShowAdd(true)} style={{ padding: "8px 18px", borderRadius: 10, background: CARD2, border: `1px solid ${BORDER}`, color: "#ccc", fontWeight: 600, cursor: "pointer", fontSize: 13 }}>+ Manual Entry</button>
            </>
          )}
        </div>
      </div>

      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "32px 24px" }}>

        {/* Error banner */}
        {authState === "error" && (
          <div style={{ background: "#FF2D5522", border: `1px solid ${ACCENT}`, borderRadius: 12, padding: "14px 20px", marginBottom: 20, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 13, color: "#FF6B9D" }}>⚠️ {authError || "Connection failed. Please try again."}</span>
            <button onClick={() => setAuthState("idle")} style={{ background: "none", border: "none", color: "#666", cursor: "pointer" }}>✕</button>
          </div>
        )}

        {/* Connect banner */}
        {authState === "idle" && (
          <div style={{ background: `linear-gradient(135deg, ${ACCENT} 0%, #6C5CE7 100%)`, borderRadius: 16, padding: "24px 28px", marginBottom: 28, display: "flex", justifyContent: "space-between", alignItems: "center", animation: "fadeIn 0.4s ease" }}>
            <div>
              <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 4 }}>Connect your TikTok account</div>
              <div style={{ fontSize: 13, opacity: 0.85 }}>Sync your real videos & analytics automatically. Sample data shown below.</div>
            </div>
            <button onClick={handleConnect} style={{ padding: "10px 24px", borderRadius: 10, background: "#fff", color: ACCENT, fontWeight: 800, border: "none", cursor: "pointer", fontSize: 14, whiteSpace: "nowrap" }}>
              Connect Now →
            </button>
          </div>
        )}

        {/* Real data note */}
        {connected && (
          <div style={{ background: "#00D4AA11", border: "1px solid #00D4AA33", borderRadius: 12, padding: "12px 18px", marginBottom: 20, fontSize: 13, color: "#00D4AA", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span>✓ Showing real data from your TikTok account · {videos.length} videos synced</span>
            <span style={{ color: "#555", fontSize: 12 }}>Tip: Add brand & earnings info manually per video</span>
          </div>
        )}

        {/* Tabs */}
        <div style={{ display: "flex", gap: 4, marginBottom: 28, background: CARD, borderRadius: 12, padding: 4, width: "fit-content" }}>
          {tabs.map(t => (
            <button key={t} onClick={() => setTab(t)} style={{ padding: "8px 20px", borderRadius: 9, border: "none", cursor: "pointer", fontWeight: 600, fontSize: 13, background: tab === t ? CARD2 : "none", color: tab === t ? "#fff" : "#666", transition: "all 0.2s", textTransform: "capitalize" }}>{t}</button>
          ))}
        </div>

        {/* OVERVIEW */}
        {tab === "overview" && (
          <div style={{ animation: "fadeIn 0.3s ease" }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16, marginBottom: 28 }}>
              <StatCard label="Total Views" value={fmt(stats.totalViews)} sub="across all videos" color={ACCENT} />
              <StatCard label="Total Earnings" value={fmtMoney(stats.totalEarnings)} sub="paid partnerships" color="#00D4AA" />
              <StatCard label="Avg. Engagement" value={stats.avgEngagement + "%"} sub="likes+comments+shares/views" color="#6C5CE7" />
              <StatCard label="Total Videos" value={stats.totalVideos} sub={`${stats.paidCount} paid · ${stats.sampleCount} gifted`} color="#FD9644" />
            </div>
            <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 16, padding: 24, marginBottom: 20 }}>
              <h3 style={{ margin: "0 0 20px", fontSize: 16, fontWeight: 700 }}>🏆 Top Performing Videos</h3>
              <div style={{ display: "grid", gap: 12 }}>
                {[...videos].sort((a, b) => b.views - a.views).slice(0, 5).map((v, i) => (
                  <div key={v.id} style={{ display: "flex", alignItems: "center", gap: 16 }}>
                    <span style={{ fontSize: 13, fontWeight: 800, color: i < 3 ? ACCENT : "#444", width: 20, textAlign: "center", fontFamily: "monospace" }}>{i + 1}</span>
                    {v.coverUrl && <img src={v.coverUrl} style={{ width: 36, height: 36, borderRadius: 6, objectFit: "cover" }} />}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, color: "#ddd", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginBottom: 4 }}>{v.title}</div>
                      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        {v.brand && <span style={{ fontSize: 11, background: (BRAND_COLORS[v.brand] || "#888") + "22", color: BRAND_COLORS[v.brand] || "#888", padding: "1px 8px", borderRadius: 20 }}>{v.brand}</span>}
                        {v.isSample && <span style={{ fontSize: 11, background: "#FD964422", color: "#FD9644", padding: "1px 8px", borderRadius: 20 }}>gifted</span>}
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 14, fontWeight: 700 }}>{fmt(v.views)}</div>
                      <div style={{ fontSize: 11, color: "#00D4AA" }}>{fmtMoney(v.earnings)}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 16, padding: 24 }}>
                <h3 style={{ margin: "0 0 16px", fontSize: 14, fontWeight: 700, color: "#888" }}>PAID vs GIFTED</h3>
                <div style={{ display: "flex", gap: 16, marginBottom: 16 }}>
                  <div><div style={{ fontSize: 28, fontWeight: 800, color: ACCENT }}>{stats.paidCount}</div><div style={{ fontSize: 12, color: "#666" }}>Paid deals</div></div>
                  <div><div style={{ fontSize: 28, fontWeight: 800, color: "#FD9644" }}>{stats.sampleCount}</div><div style={{ fontSize: 12, color: "#666" }}>Gifted/Sample</div></div>
                </div>
                <div style={{ display: "flex", height: 8, borderRadius: 4, overflow: "hidden" }}>
                  <div style={{ width: `${stats.totalVideos ? stats.paidCount / stats.totalVideos * 100 : 50}%`, background: ACCENT }} />
                  <div style={{ flex: 1, background: "#FD9644" }} />
                </div>
              </div>
              <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 16, padding: 24 }}>
                <h3 style={{ margin: "0 0 16px", fontSize: 14, fontWeight: 700, color: "#888" }}>EARNINGS BY BRAND</h3>
                {brandStats.slice(0, 4).map(b => (
                  <div key={b.brand} style={{ marginBottom: 12 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                      <span style={{ fontSize: 12, color: "#ccc" }}>{b.brand}</span>
                      <span style={{ fontSize: 12, fontWeight: 700 }}>{fmtMoney(b.earnings)}</span>
                    </div>
                    <MiniBar value={b.earnings} max={Math.max(...brandStats.map(x => x.earnings), 1)} color={BRAND_COLORS[b.brand] || ACCENT} />
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* VIDEOS */}
        {tab === "videos" && (
          <div style={{ animation: "fadeIn 0.3s ease" }}>
            <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
              <select value={filterBrand} onChange={e => setFilterBrand(e.target.value)} style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 8, padding: "8px 14px", color: "#ccc", fontSize: 13, cursor: "pointer" }}>
                {brands.map(b => <option key={b}>{b}</option>)}
              </select>
              <select value={filterType} onChange={e => setFilterType(e.target.value)} style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 8, padding: "8px 14px", color: "#ccc", fontSize: 13, cursor: "pointer" }}>
                {["All","Paid","Sample"].map(t => <option key={t}>{t}</option>)}
              </select>
              <select value={sortKey} onChange={e => setSortKey(e.target.value)} style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 8, padding: "8px 14px", color: "#ccc", fontSize: 13, cursor: "pointer" }}>
                <option value="date">Sort: Latest</option>
                <option value="views">Sort: Views</option>
                <option value="earnings">Sort: Earnings</option>
                <option value="likes">Sort: Likes</option>
              </select>
              <span style={{ marginLeft: "auto", fontSize: 13, color: "#555", alignSelf: "center" }}>{filtered.length} videos</span>
            </div>
            <div style={{ display: "grid", gap: 12 }}>
              {filtered.map(v => (
                <div key={v.id} style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 14, padding: "18px 20px", display: "grid", gridTemplateColumns: "1fr auto", gap: 16, alignItems: "center" }}>
                  <div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6, flexWrap: "wrap" }}>
                      {v.brand && <span style={{ fontSize: 11, background: (BRAND_COLORS[v.brand] || "#888") + "22", color: BRAND_COLORS[v.brand] || "#888", padding: "2px 10px", borderRadius: 20, fontWeight: 600 }}>{v.brand}</span>}
                      {v.isSample && <span style={{ fontSize: 11, background: "#FD964422", color: "#FD9644", padding: "2px 10px", borderRadius: 20 }}>🎁 Gifted</span>}
                      <span style={{ fontSize: 11, color: "#444" }}>{v.category}</span>
                      <span style={{ fontSize: 11, color: "#444", marginLeft: "auto" }}>{v.date}{v.duration ? ` · ${v.duration}` : ""}</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                      {v.coverUrl && <img src={v.coverUrl} style={{ width: 40, height: 40, borderRadius: 6, objectFit: "cover", flexShrink: 0 }} />}
                      <div style={{ fontSize: 14, color: "#ddd" }}>{v.title}</div>
                    </div>
                    <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
                      {[["👁", fmt(v.views), "views"], ["❤️", fmt(v.likes), "likes"], ["💬", fmt(v.comments), "comments"], ["↗️", fmt(v.shares), "shares"]].map(([ic, val, lbl]) => (
                        <div key={lbl} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                          <span style={{ fontSize: 13 }}>{ic}</span>
                          <span style={{ fontSize: 13, fontWeight: 700 }}>{val}</span>
                          <span style={{ fontSize: 11, color: "#555" }}>{lbl}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 22, fontWeight: 800, color: v.isSample ? "#FD9644" : "#00D4AA" }}>{v.isSample ? "Gifted" : fmtMoney(v.earnings)}</div>
                    <div style={{ fontSize: 11, color: "#555" }}>{v.isSample ? "sample product" : "earned"}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* BRANDS */}
        {tab === "brands" && (
          <div style={{ animation: "fadeIn 0.3s ease", display: "grid", gap: 16 }}>
            {brandStats.map(b => (
              <div key={b.brand} style={{ background: CARD, border: `1px solid ${(BRAND_COLORS[b.brand] || BORDER)}33`, borderRadius: 16, padding: "22px 24px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{ width: 40, height: 40, borderRadius: 12, background: (BRAND_COLORS[b.brand] || "#888") + "22", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, fontWeight: 800, color: BRAND_COLORS[b.brand] || "#888" }}>{b.brand[0]}</div>
                    <div>
                      <div style={{ fontWeight: 800, fontSize: 18 }}>{b.brand}</div>
                      <div style={{ fontSize: 12, color: "#555" }}>{b.total} video{b.total !== 1 ? "s" : ""} total</div>
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 24, fontWeight: 800, color: "#00D4AA" }}>{fmtMoney(b.earnings)}</div>
                    <div style={{ fontSize: 12, color: "#555" }}>total earned</div>
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
                  {[["Total Videos", b.total, null], ["Paid", b.paid, ACCENT], ["Gifted/Sample", b.sample, "#FD9644"], ["Total Views", fmt(b.views), null]].map(([lbl, val, col]) => (
                    <div key={lbl} style={{ background: CARD2, borderRadius: 10, padding: "12px 14px" }}>
                      <div style={{ fontSize: 18, fontWeight: 800, color: col || "#fff" }}>{val}</div>
                      <div style={{ fontSize: 11, color: "#555", marginTop: 2 }}>{lbl}</div>
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: 16 }}>
                  <MiniBar value={b.views} max={maxViews} color={BRAND_COLORS[b.brand] || ACCENT} />
                  <div style={{ fontSize: 11, color: "#444", marginTop: 4 }}>{fmt(b.views)} views ({Math.round(b.views / Math.max(stats.totalViews, 1) * 100)}% of total)</div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* SAMPLES */}
        {tab === "samples" && (
          <div style={{ animation: "fadeIn 0.3s ease" }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 16, marginBottom: 24 }}>
              <StatCard label="Total Gifted Videos" value={stats.sampleCount} color="#FD9644" />
              <StatCard label="Paid Videos" value={stats.paidCount} color={ACCENT} />
              <StatCard label="Sample Rate" value={Math.round(stats.sampleCount / Math.max(stats.totalVideos, 1) * 100) + "%"} sub="of all brand content" color="#6C5CE7" />
            </div>
            <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 16, padding: 24, marginBottom: 20 }}>
              <h3 style={{ margin: "0 0 20px", fontSize: 15, fontWeight: 700 }}>Samples per Brand</h3>
              <div style={{ display: "grid", gap: 16 }}>
                {brandStats.map(b => (
                  <div key={b.brand}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: BRAND_COLORS[b.brand] || "#ccc" }}>{b.brand}</span>
                      <span style={{ fontSize: 12, color: "#555" }}>
                        <span style={{ color: "#FD9644", fontWeight: 700 }}>{b.sample} gifted</span> · <span style={{ color: ACCENT, fontWeight: 700 }}>{b.paid} paid</span>
                      </span>
                    </div>
                    <div style={{ display: "flex", height: 10, borderRadius: 5, overflow: "hidden", gap: 2 }}>
                      {Array.from({ length: b.total }).map((_, i) => (
                        <div key={i} style={{ flex: 1, background: i < b.sample ? "#FD9644" : ACCENT, borderRadius: 2 }} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 16, padding: 24 }}>
              <h3 style={{ margin: "0 0 16px", fontSize: 15, fontWeight: 700 }}>🎁 All Gifted Videos</h3>
              <div style={{ display: "grid", gap: 10 }}>
                {videos.filter(v => v.isSample).sort((a, b) => b.views - a.views).map(v => (
                  <div key={v.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", background: CARD2, borderRadius: 10 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      {v.coverUrl && <img src={v.coverUrl} style={{ width: 32, height: 32, borderRadius: 4, objectFit: "cover" }} />}
                      <div>
                        <div style={{ fontSize: 13, color: "#ddd" }}>{v.title}</div>
                        <div style={{ fontSize: 11, color: BRAND_COLORS[v.brand] || "#888", marginTop: 2 }}>{v.brand || "Untagged"} · {v.date}</div>
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 13, fontWeight: 700 }}>{fmt(v.views)} views</div>
                      <div style={{ fontSize: 11, color: "#555" }}>❤️ {fmt(v.likes)}</div>
                    </div>
                  </div>
                ))}
                {videos.filter(v => v.isSample).length === 0 && (
                  <div style={{ textAlign: "center", color: "#444", fontSize: 13, padding: 24 }}>No gifted videos yet. Mark videos as gifted when adding them.</div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {showAdd && <AddVideoModal onClose={() => setShowAdd(false)} onAdd={v => setVideos(prev => [v, ...prev])} />}
    </div>
  );
}
