import { useEffect, useMemo, useState } from "react";

import {
  deleteBrand,
  hasSupabaseConfig,
  loadBrands,
  loadVideos,
  saveBrand,
  saveVideo,
} from "./lib/supabase";

const ACCENT = "#FF2D55";
const DARK = "#0A0A0F";
const CARD = "#12121A";
const CARD2 = "#1A1A26";
const BORDER = "#2A2A3A";

const BRAND_COLORS = {
  GlowLab: "#FF6B9D",
  FitFuel: "#00D4AA",
  TechNova: "#6C5CE7",
  UrbanThreads: "#FD9644",
};

const CATEGORY_OPTIONS = ["Beauty", "Health", "Tech", "Fashion", "Food", "Travel", "Lifestyle", "Other"];

const fmt = (n) => n >= 1000000 ? `${(n / 1000000).toFixed(1)}M` : n >= 1000 ? `${(n / 1000).toFixed(1)}K` : String(n || 0);
const fmtMoney = (n) => `$${(n || 0).toLocaleString()}`;
const slugify = (value) => (value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

const CLIENT_KEY = import.meta.env.VITE_TIKTOK_CLIENT_KEY;
const REDIRECT_URI = import.meta.env.VITE_REDIRECT_URI || "http://localhost:5173/auth/callback";
const PROXY = import.meta.env.VITE_PROXY_URL || "http://localhost:3001";
const SCOPES = "user.info.basic,video.list";

let callbackBootstrapInFlight = false;
let sessionBootstrapInFlight = false;

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

async function exchangeCodeForToken(code) {
  const res = await fetch(`${PROXY}/auth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code, redirect_uri: REDIRECT_URI }),
  });
  if (!res.ok) throw new Error("Token exchange failed");
  return res.json();
}

async function fetchTikTokUser(accessToken) {
  const res = await fetch(`${PROXY}/tiktok/user`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ access_token: accessToken }),
  });
  if (!res.ok) throw new Error("Failed to fetch user");
  return res.json();
}

async function fetchTikTokVideos(accessToken) {
  const res = await fetch(`${PROXY}/tiktok/videos`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ access_token: accessToken }),
  });
  if (!res.ok) throw new Error("Failed to fetch videos");
  return res.json();
}

const MOCK_VIDEOS = [
  { id: "1", title: "Morning routine with @GlowLab serums ✨", brand: "GlowLab", category: "Beauty", date: "2024-03-15", views: 284000, likes: 18400, comments: 920, shares: 3200, earnings: 1840, isSample: true, duration: "0:47", shareUrl: "", source: "manual" },
  { id: "2", title: "Honest review: @FitFuel protein shakes 💪", brand: "FitFuel", category: "Health", date: "2024-03-10", views: 512000, likes: 41200, comments: 2100, shares: 8900, earnings: 3200, isSample: false, duration: "1:02", shareUrl: "", source: "manual" },
  { id: "3", title: "Unboxing @TechNova earbuds 🎧", brand: "TechNova", category: "Tech", date: "2024-03-05", views: 189000, likes: 12800, comments: 540, shares: 2100, earnings: 980, isSample: true, duration: "0:58", shareUrl: "", source: "manual" },
  { id: "4", title: "GRWM ft @GlowLab new collection", brand: "GlowLab", category: "Beauty", date: "2024-02-28", views: 671000, likes: 53000, comments: 3400, shares: 11200, earnings: 4100, isSample: false, duration: "2:14", shareUrl: "", source: "manual" },
  { id: "5", title: "@UrbanThreads haul - are they worth it?", brand: "UrbanThreads", category: "Fashion", date: "2024-02-20", views: 94000, likes: 7200, comments: 380, shares: 910, earnings: 620, isSample: true, duration: "1:31", shareUrl: "", source: "manual" },
];

const DEFAULT_BRANDS = [
  { name: "GlowLab", color: "#FF6B9D", notes: "Skincare and beauty partner." },
  { name: "FitFuel", color: "#00D4AA", notes: "Supplements and protein products." },
  { name: "TechNova", color: "#6C5CE7", notes: "Consumer tech and gadgets." },
  { name: "UrbanThreads", color: "#FD9644", notes: "Streetwear and fashion collabs." },
];

function mapVideos(rawVideos) {
  return (rawVideos || []).map((v) => ({
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
    duration: v.duration ? `${Math.floor(v.duration / 60)}:${String(v.duration % 60).padStart(2, "0")}` : "",
    coverUrl: v.cover_image_url || null,
    shareUrl: v.share_url || "",
    embedUrl: v.embed_link || "",
    notes: "",
    source: "tiktok",
  }));
}

function normalizeVideoRecord(record) {
  return {
    id: String(record.id),
    title: record.title || "Untitled",
    brand: record.brand || "",
    category: record.category || "Other",
    date: record.date || "",
    views: Number(record.views || 0),
    likes: Number(record.likes || 0),
    comments: Number(record.comments || 0),
    shares: Number(record.shares || 0),
    earnings: Number(record.earnings || 0),
    isSample: Boolean(record.is_sample ?? record.isSample),
    duration: record.duration || "",
    coverUrl: record.cover_url || record.coverUrl || null,
    shareUrl: record.share_url || record.shareUrl || "",
    embedUrl: record.embed_url || record.embedUrl || "",
    notes: record.notes || "",
    source: record.source || "manual",
  };
}

function mergeVideos(baseVideos, storedVideos) {
  const storedById = new Map(storedVideos.map((video) => [video.id, video]));
  const merged = baseVideos.map((video) => {
    const saved = storedById.get(video.id);
    if (!saved) return video;
    return {
      ...video,
      brand: saved.brand || video.brand || "",
      category: saved.category || video.category || "Other",
      earnings: saved.earnings ?? 0,
      isSample: saved.isSample ?? false,
      notes: saved.notes || "",
      duration: video.duration || saved.duration || "",
      coverUrl: video.coverUrl || saved.coverUrl || null,
      shareUrl: video.shareUrl || saved.shareUrl || "",
      embedUrl: video.embedUrl || saved.embedUrl || "",
      source: video.source || saved.source || "tiktok",
    };
  });

  const knownIds = new Set(baseVideos.map((video) => video.id));
  storedVideos.forEach((video) => {
    if (!knownIds.has(video.id)) {
      merged.push(video);
    }
  });

  return merged;
}

function resolveBrandColor(brandName, brandCatalogMap) {
  return brandCatalogMap.get(brandName)?.color || BRAND_COLORS[brandName] || "#888";
}

function BrandInput({ value, onChange, options, placeholder }) {
  return (
    <>
      <input
        list="brand-options"
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        style={{ width: "100%", background: DARK, border: `1px solid ${BORDER}`, borderRadius: 8, padding: "10px 12px", color: "#fff", fontSize: 14, boxSizing: "border-box", outline: "none" }}
      />
      <datalist id="brand-options">
        {options.map((brand) => (
          <option key={brand} value={brand} />
        ))}
      </datalist>
    </>
  );
}

function VideoModal({ video, onClose, onSave, brandOptions }) {
  const [form, setForm] = useState({
    brand: video.brand || "",
    category: video.category || "Other",
    earnings: video.earnings || "",
    isSample: video.isSample || false,
    notes: video.notes || "",
  });
  const [tab, setTab] = useState(video.shareUrl ? "play" : "edit");
  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  const embedUrl = (() => {
    if (!video.shareUrl) return null;
    const match = video.shareUrl.match(/video\/(\d+)/);
    if (match) return `https://www.tiktok.com/embed/v2/${match[1]}`;
    return video.embedUrl || null;
  })();

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", backdropFilter: "blur(6px)" }}
      onClick={(event) => event.target === event.currentTarget && onClose()}
    >
      <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 24, width: "min(900px, 95vw)", maxHeight: "90vh", overflowY: "auto", display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "20px 24px", borderBottom: `1px solid ${BORDER}`, display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#fff", marginBottom: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{video.title}</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <span style={{ fontSize: 11, color: "#555" }}>{video.date}</span>
              {video.duration && <span style={{ fontSize: 11, color: "#555" }}>· {video.duration}</span>}
              <span style={{ fontSize: 11, color: "#555" }}>· 👁 {fmt(video.views)}</span>
              <span style={{ fontSize: 11, color: "#555" }}>· ❤️ {fmt(video.likes)}</span>
            </div>
          </div>
          <button onClick={onClose} style={{ background: CARD2, border: `1px solid ${BORDER}`, color: "#666", fontSize: 18, cursor: "pointer", borderRadius: 8, width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>✕</button>
        </div>

        <div style={{ display: "flex", gap: 0, padding: "0 24px", borderBottom: `1px solid ${BORDER}` }}>
          {[video.shareUrl && "play", "edit"].filter(Boolean).map((currentTab) => (
            <button key={currentTab} onClick={() => setTab(currentTab)} style={{ padding: "12px 20px", border: "none", cursor: "pointer", fontWeight: 600, fontSize: 13, background: "none", color: tab === currentTab ? "#fff" : "#555", borderBottom: tab === currentTab ? `2px solid ${ACCENT}` : "2px solid transparent", textTransform: "capitalize", transition: "all 0.15s" }}>
              {currentTab === "play" ? "▶  Play Video" : "✏️  Edit Details"}
            </button>
          ))}
        </div>

        <div style={{ padding: 24 }}>
          {tab === "play" && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 20 }}>
              {embedUrl ? (
                <div style={{ width: "100%", maxWidth: 340, aspectRatio: "9/16", borderRadius: 16, overflow: "hidden", background: "#000" }}>
                  <iframe src={embedUrl} style={{ width: "100%", height: "100%", border: "none" }} allow="autoplay; fullscreen" allowFullScreen title={video.title} />
                </div>
              ) : (
                <div style={{ width: "100%", maxWidth: 340, aspectRatio: "9/16", borderRadius: 16, overflow: "hidden", background: CARD2, border: `1px solid ${BORDER}`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, position: "relative" }}>
                  {video.coverUrl && <img src={video.coverUrl} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", opacity: 0.4 }} alt="" />}
                  <div style={{ position: "relative", textAlign: "center", padding: 20 }}>
                    <div style={{ fontSize: 48, marginBottom: 12 }}>▶</div>
                    <div style={{ fontSize: 13, color: "#ccc", marginBottom: 16 }}>Preview not available in sandbox mode</div>
                    {video.shareUrl && (
                      <a href={video.shareUrl} target="_blank" rel="noreferrer" style={{ padding: "10px 24px", background: ACCENT, color: "#fff", borderRadius: 10, fontWeight: 700, fontSize: 13, textDecoration: "none", display: "inline-block" }}>
                        Open on TikTok ↗
                      </a>
                    )}
                  </div>
                </div>
              )}

              <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap", width: "100%" }}>
                {[["👁", fmt(video.views), "Views"], ["❤️", fmt(video.likes), "Likes"], ["💬", fmt(video.comments), "Comments"], ["↗️", fmt(video.shares), "Shares"]].map(([icon, value, label]) => (
                  <div key={label} style={{ background: CARD2, borderRadius: 10, padding: "12px 16px", textAlign: "center", flex: 1, minWidth: 72 }}>
                    <div style={{ fontSize: 18, marginBottom: 4 }}>{icon}</div>
                    <div style={{ fontSize: 18, fontWeight: 800 }}>{value}</div>
                    <div style={{ fontSize: 11, color: "#555" }}>{label}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab === "edit" && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              {video.coverUrl && (
                <div style={{ gridColumn: "1 / -1", display: "flex", gap: 14, alignItems: "center", background: CARD2, borderRadius: 12, padding: 14 }}>
                  <img src={video.coverUrl} style={{ width: 56, height: 56, borderRadius: 8, objectFit: "cover", flexShrink: 0 }} alt="" />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, color: "#ddd", marginBottom: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{video.title}</div>
                    <div style={{ fontSize: 11, color: "#555" }}>{video.date} · 👁 {fmt(video.views)} · ❤️ {fmt(video.likes)}</div>
                  </div>
                  {video.shareUrl && (
                    <a href={video.shareUrl} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: ACCENT, textDecoration: "none", padding: "6px 14px", border: `1px solid ${ACCENT}44`, borderRadius: 8, whiteSpace: "nowrap", flexShrink: 0 }}>
                      View on TikTok ↗
                    </a>
                  )}
                </div>
              )}

              <div>
                <label style={{ fontSize: 12, color: "#888", display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: 1 }}>Brand</label>
                <BrandInput value={form.brand} onChange={(event) => set("brand", event.target.value)} options={brandOptions} placeholder="e.g. GlowLab" />
              </div>

              <div>
                <label style={{ fontSize: 12, color: "#888", display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: 1 }}>Category</label>
                <select value={form.category} onChange={(event) => set("category", event.target.value)} style={{ width: "100%", background: DARK, border: `1px solid ${BORDER}`, borderRadius: 8, padding: "10px 12px", color: "#fff", fontSize: 14 }}>
                  {CATEGORY_OPTIONS.map((category) => <option key={category}>{category}</option>)}
                </select>
              </div>

              <div style={{ gridColumn: "1 / -1" }}>
                <label style={{ fontSize: 12, color: "#888", display: "block", marginBottom: 8, textTransform: "uppercase", letterSpacing: 1 }}>Deal Type</label>
                <div style={{ display: "flex", gap: 8 }}>
                  {[["💰 Paid Partnership", false], ["🎁 Gifted / Sample", true]].map(([label, value]) => (
                    <button
                      key={label}
                      onClick={() => set("isSample", value)}
                      style={{
                        flex: 1,
                        padding: "12px",
                        borderRadius: 10,
                        border: `1px solid ${form.isSample === value ? (value ? "#FD9644" : ACCENT) : BORDER}`,
                        background: form.isSample === value ? (value ? "#FD964422" : `${ACCENT}22`) : DARK,
                        color: form.isSample === value ? (value ? "#FD9644" : ACCENT) : "#555",
                        cursor: "pointer",
                        fontSize: 13,
                        fontWeight: 700,
                        transition: "all 0.15s",
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ gridColumn: "1 / -1" }}>
                <label style={{ fontSize: 12, color: "#888", display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: 1 }}>
                  Earnings ($) {form.isSample && <span style={{ color: "#444", fontSize: 11, textTransform: "none" }}>- disabled for gifted videos</span>}
                </label>
                <input
                  type="number"
                  value={form.isSample ? "" : form.earnings}
                  onChange={(event) => set("earnings", event.target.value)}
                  placeholder={form.isSample ? "N/A - gifted" : "0.00"}
                  disabled={form.isSample}
                  style={{ width: "100%", background: form.isSample ? "#0A0A0F" : DARK, border: `1px solid ${BORDER}`, borderRadius: 8, padding: "10px 12px", color: form.isSample ? "#333" : "#fff", fontSize: 14, boxSizing: "border-box", outline: "none", cursor: form.isSample ? "not-allowed" : "text" }}
                />
              </div>

              <div style={{ gridColumn: "1 / -1" }}>
                <label style={{ fontSize: 12, color: "#888", display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: 1 }}>Deal Notes</label>
                <textarea
                  value={form.notes}
                  onChange={(event) => set("notes", event.target.value)}
                  placeholder="e.g. 3-post deal, usage rights included, 30-day exclusivity..."
                  rows={3}
                  style={{ width: "100%", background: DARK, border: `1px solid ${BORDER}`, borderRadius: 8, padding: "10px 12px", color: "#fff", fontSize: 14, boxSizing: "border-box", outline: "none", resize: "vertical", fontFamily: "inherit" }}
                />
              </div>

              <div style={{ gridColumn: "1 / -1", display: "flex", gap: 12 }}>
                <button onClick={onClose} style={{ flex: 1, padding: "12px", background: "none", border: `1px solid ${BORDER}`, borderRadius: 10, color: "#888", cursor: "pointer", fontSize: 14 }}>Cancel</button>
                <button
                  onClick={() => {
                    onSave({
                      ...video,
                      ...form,
                      brand: form.brand.trim(),
                      earnings: form.isSample ? 0 : (+form.earnings || 0),
                    });
                    onClose();
                  }}
                  style={{ flex: 2, padding: "12px", background: ACCENT, border: "none", borderRadius: 10, color: "#fff", fontWeight: 700, cursor: "pointer", fontSize: 14 }}
                >
                  Save Changes
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function AddVideoModal({ onClose, onAdd, brandOptions }) {
  const [form, setForm] = useState({ title: "", brand: "", category: "Beauty", date: "", views: "", likes: "", comments: "", shares: "", earnings: "", isSample: false, duration: "", notes: "" });
  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", backdropFilter: "blur(4px)" }}>
      <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 20, padding: 32, width: "min(540px, 90vw)", maxHeight: "85vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: "#fff" }}>Add Video</h2>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#666", fontSize: 22, cursor: "pointer" }}>✕</button>
        </div>

        <div style={{ display: "grid", gap: 14 }}>
          <div>
            <label style={{ fontSize: 12, color: "#888", display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: 1 }}>Video Title</label>
            <input value={form.title} onChange={(event) => set("title", event.target.value)} style={{ width: "100%", background: DARK, border: `1px solid ${BORDER}`, borderRadius: 8, padding: "10px 12px", color: "#fff", fontSize: 14, boxSizing: "border-box", outline: "none" }} />
          </div>

          <div>
            <label style={{ fontSize: 12, color: "#888", display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: 1 }}>Brand</label>
            <BrandInput value={form.brand} onChange={(event) => set("brand", event.target.value)} options={brandOptions} placeholder="Start typing a saved brand or add a new one" />
          </div>

          {[
            { label: "Date", key: "date", type: "date" },
            { label: "Duration", key: "duration", type: "text", placeholder: "e.g. 1:23" },
            { label: "Views", key: "views", type: "number" },
            { label: "Likes", key: "likes", type: "number" },
            { label: "Comments", key: "comments", type: "number" },
            { label: "Shares", key: "shares", type: "number" },
            { label: "Earnings ($)", key: "earnings", type: "number" },
          ].map((field) => (
            <div key={field.key}>
              <label style={{ fontSize: 12, color: "#888", display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: 1 }}>{field.label}</label>
              <input type={field.type} placeholder={field.placeholder} value={form[field.key]} onChange={(event) => set(field.key, event.target.value)} style={{ width: "100%", background: DARK, border: `1px solid ${BORDER}`, borderRadius: 8, padding: "10px 12px", color: "#fff", fontSize: 14, boxSizing: "border-box", outline: "none" }} />
            </div>
          ))}

          <div>
            <label style={{ fontSize: 12, color: "#888", display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: 1 }}>Category</label>
            <select value={form.category} onChange={(event) => set("category", event.target.value)} style={{ width: "100%", background: DARK, border: `1px solid ${BORDER}`, borderRadius: 8, padding: "10px 12px", color: "#fff", fontSize: 14 }}>
              {CATEGORY_OPTIONS.map((category) => <option key={category}>{category}</option>)}
            </select>
          </div>

          <div>
            <label style={{ fontSize: 12, color: "#888", display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: 1 }}>Notes</label>
            <textarea value={form.notes} onChange={(event) => set("notes", event.target.value)} rows={3} style={{ width: "100%", background: DARK, border: `1px solid ${BORDER}`, borderRadius: 8, padding: "10px 12px", color: "#fff", fontSize: 14, boxSizing: "border-box", outline: "none", resize: "vertical", fontFamily: "inherit" }} />
          </div>

          <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
            <input type="checkbox" checked={form.isSample} onChange={(event) => set("isSample", event.target.checked)} style={{ width: 18, height: 18, accentColor: ACCENT }} />
            <span style={{ color: "#ccc", fontSize: 14 }}>Gifted / Sample (not paid)</span>
          </label>
        </div>

        <div style={{ display: "flex", gap: 12, marginTop: 24 }}>
          <button onClick={onClose} style={{ flex: 1, padding: "12px", background: "none", border: `1px solid ${BORDER}`, borderRadius: 10, color: "#888", cursor: "pointer", fontSize: 14 }}>Cancel</button>
          <button
            onClick={() => {
              if (!form.title || !form.brand) return;
              onAdd({
                ...form,
                id: `manual-${slugify(form.title)}-${Date.now()}`,
                brand: form.brand.trim(),
                views: +form.views || 0,
                likes: +form.likes || 0,
                comments: +form.comments || 0,
                shares: +form.shares || 0,
                earnings: form.isSample ? 0 : (+form.earnings || 0),
                source: "manual",
              });
              onClose();
            }}
            style={{ flex: 2, padding: "12px", background: ACCENT, border: "none", borderRadius: 10, color: "#fff", fontWeight: 700, cursor: "pointer", fontSize: 14 }}
          >
            Add Video
          </button>
        </div>
      </div>
    </div>
  );
}

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

export default function App() {
  const [videos, setVideos] = useState(MOCK_VIDEOS);
  const [storedVideos, setStoredVideos] = useState([]);
  const [brandCatalog, setBrandCatalog] = useState(DEFAULT_BRANDS);
  const [tab, setTab] = useState("overview");
  const [showAdd, setShowAdd] = useState(false);
  const [editingVideo, setEditingVideo] = useState(null);
  const [filterBrand, setFilterBrand] = useState("All");
  const [filterType, setFilterType] = useState("All");
  const [sortKey, setSortKey] = useState("date");
  const [authState, setAuthState] = useState("idle");
  const [ttUser, setTtUser] = useState(null);
  const [authError, setAuthError] = useState(null);
  const [storageState, setStorageState] = useState(hasSupabaseConfig ? "loading" : "disabled");
  const [storageError, setStorageError] = useState(null);
  const [brandForm, setBrandForm] = useState({ name: "", color: "#14B8A6", notes: "" });
  const [savingBrand, setSavingBrand] = useState(false);

  const brandCatalogMap = useMemo(() => new Map(brandCatalog.map((brand) => [brand.name, brand])), [brandCatalog]);
  const brandNames = useMemo(() => [...new Set([...brandCatalog.map((brand) => brand.name), ...videos.map((video) => video.brand).filter(Boolean)])].sort((a, b) => a.localeCompare(b)), [brandCatalog, videos]);

  useEffect(() => {
    if (!hasSupabaseConfig) return;

    let isMounted = true;
    setStorageState("loading");
    loadBrands()
      .then((loadedBrands) => {
        if (!isMounted) return;
        if (loadedBrands.length > 0) {
          setBrandCatalog(loadedBrands.map((brand) => ({ ...brand, notes: brand.notes || "", color: brand.color || BRAND_COLORS[brand.name] || "#888" })));
        }
        return loadVideos();
      })
      .then((loadedVideos) => {
        if (!isMounted) return;
        const normalized = (loadedVideos || []).map(normalizeVideoRecord);
        setStoredVideos(normalized);
        if (normalized.length > 0) {
          setVideos(normalized);
        }
        setStorageState("ready");
      })
      .catch((error) => {
        if (!isMounted) return;
        setStorageError(error.message);
        setStorageState("error");
      });

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const state = params.get("state");
    const savedState = sessionStorage.getItem("tt_state");
    if (!code) return;
    if (callbackBootstrapInFlight) return;

    callbackBootstrapInFlight = true;
    window.history.replaceState({}, "", window.location.pathname);

    if (state !== savedState) {
      setAuthError("State mismatch. Please try again.");
      setAuthState("error");
      callbackBootstrapInFlight = false;
      return;
    }

    setAuthState("loading");
    (async () => {
      try {
        const { access_token } = await exchangeCodeForToken(code);
        sessionStorage.setItem("tt_token", access_token);
        const [user, rawVideos] = await Promise.all([fetchTikTokUser(access_token), fetchTikTokVideos(access_token)]);
        const remoteVideos = mapVideos(rawVideos);
        setTtUser(user);
        setVideos(mergeVideos(remoteVideos, storedVideos));
        setAuthState("connected");
      } catch (error) {
        setAuthError(error.message);
        setAuthState("error");
      } finally {
        callbackBootstrapInFlight = false;
      }
    })();
  }, [storedVideos]);

  useEffect(() => {
    const token = sessionStorage.getItem("tt_token");
    if (token && authState === "idle" && !window.location.search.includes("code=")) {
      if (sessionBootstrapInFlight) return;
      sessionBootstrapInFlight = true;
      setAuthState("loading");
      Promise.all([fetchTikTokUser(token), fetchTikTokVideos(token)])
        .then(([user, rawVideos]) => {
          const remoteVideos = mapVideos(rawVideos);
          setTtUser(user);
          setVideos(mergeVideos(remoteVideos, storedVideos));
          setAuthState("connected");
        })
        .catch(() => {
          sessionStorage.removeItem("tt_token");
          sessionStorage.removeItem("tt_open_id");
          sessionStorage.removeItem("tt_state");
          setAuthState("idle");
        })
        .finally(() => {
          sessionBootstrapInFlight = false;
        });
    }
  }, [authState, storedVideos]);

  const persistBrandIfConfigured = async (brand) => {
    if (!hasSupabaseConfig) return { ...brand };
    const saved = await saveBrand(brand);
    return { ...saved, notes: saved.notes || "", color: saved.color || brand.color || "#888" };
  };

  const persistVideoIfConfigured = async (video) => {
    if (!hasSupabaseConfig) return normalizeVideoRecord(video);
    const saved = await saveVideo(video);
    return normalizeVideoRecord(saved);
  };

  const ensureBrandExists = async (brandName) => {
    const trimmed = (brandName || "").trim();
    if (!trimmed || brandCatalogMap.has(trimmed)) return;
    const nextBrand = await persistBrandIfConfigured({ name: trimmed, color: BRAND_COLORS[trimmed] || "#888", notes: "" });
    setBrandCatalog((current) => [...current, nextBrand].sort((a, b) => a.name.localeCompare(b.name)));
  };

  const handleSaveVideo = async (updated) => {
    const normalized = normalizeVideoRecord(updated);
    setVideos((current) => current.map((video) => video.id === normalized.id ? normalized : video));
    setStorageError(null);

    try {
      await ensureBrandExists(normalized.brand);
      const saved = await persistVideoIfConfigured(normalized);
      setStoredVideos((current) => {
        const rest = current.filter((video) => video.id !== saved.id);
        return [saved, ...rest];
      });
      setVideos((current) => current.map((video) => video.id === saved.id ? mergeVideos([video], [saved])[0] : video));
    } catch (error) {
      setStorageError(error.message);
      setStorageState("error");
    }
  };

  const handleAddVideo = async (video) => {
    const normalized = normalizeVideoRecord(video);
    setVideos((current) => [normalized, ...current]);
    setStorageError(null);

    try {
      await ensureBrandExists(normalized.brand);
      const saved = await persistVideoIfConfigured(normalized);
      setStoredVideos((current) => [saved, ...current.filter((item) => item.id !== saved.id)]);
      setVideos((current) => [saved, ...current.filter((item) => item.id !== saved.id)]);
    } catch (error) {
      setStorageError(error.message);
      setStorageState("error");
    }
  };

  const handleCreateBrand = async () => {
    const trimmedName = brandForm.name.trim();
    if (!trimmedName) return;
    setSavingBrand(true);
    setStorageError(null);

    try {
      const saved = await persistBrandIfConfigured({
        name: trimmedName,
        color: brandForm.color,
        notes: brandForm.notes,
      });
      setBrandCatalog((current) => {
        const rest = current.filter((brand) => brand.name !== saved.name);
        return [...rest, saved].sort((a, b) => a.name.localeCompare(b.name));
      });
      setBrandForm({ name: "", color: "#14B8A6", notes: "" });
      if (storageState !== "disabled") setStorageState("ready");
    } catch (error) {
      setStorageError(error.message);
      setStorageState("error");
    } finally {
      setSavingBrand(false);
    }
  };

  const handleDeleteBrand = async (brandName, brandTotal) => {
    if (brandTotal > 0) return;
    setStorageError(null);
    const previous = brandCatalog;
    setBrandCatalog((current) => current.filter((brand) => brand.name !== brandName));

    try {
      if (hasSupabaseConfig) {
        await deleteBrand(brandName);
      }
    } catch (error) {
      setBrandCatalog(previous);
      setStorageError(error.message);
      setStorageState("error");
    }
  };

  const brands = useMemo(() => ["All", ...brandNames], [brandNames]);

  const filtered = useMemo(() => videos
    .filter((video) => filterBrand === "All" || video.brand === filterBrand)
    .filter((video) => filterType === "All" || (filterType === "Sample" ? video.isSample : !video.isSample))
    .sort((a, b) => {
      if (sortKey === "views") return b.views - a.views;
      if (sortKey === "earnings") return b.earnings - a.earnings;
      if (sortKey === "likes") return b.likes - a.likes;
      return new Date(b.date) - new Date(a.date);
    }), [videos, filterBrand, filterType, sortKey]);

  const stats = useMemo(() => ({
    totalViews: videos.reduce((sum, video) => sum + video.views, 0),
    totalEarnings: videos.reduce((sum, video) => sum + video.earnings, 0),
    totalVideos: videos.length,
    sampleCount: videos.filter((video) => video.isSample).length,
    paidCount: videos.filter((video) => !video.isSample).length,
    avgEngagement: videos.length ? Math.round(videos.reduce((sum, video) => sum + (video.views > 0 ? ((video.likes + video.comments + video.shares) / video.views) * 100 : 0), 0) / videos.length * 10) / 10 : 0,
  }), [videos]);

  const brandStats = useMemo(() => {
    const map = {};

    brandCatalog.forEach((brand) => {
      map[brand.name] = {
        brand: brand.name,
        total: 0,
        sample: 0,
        paid: 0,
        views: 0,
        earnings: 0,
        notes: brand.notes || "",
          color: brand.color || resolveBrandColor(brand.name, brandCatalogMap),
        isSaved: true,
      };
    });

    videos.forEach((video) => {
      const key = video.brand || "Untagged";
      if (!map[key]) {
        map[key] = {
          brand: key,
          total: 0,
          sample: 0,
          paid: 0,
          views: 0,
          earnings: 0,
          notes: "",
          color: resolveBrandColor(key, brandCatalogMap),
          isSaved: brandCatalogMap.has(key),
        };
      }
      map[key].total += 1;
      if (video.isSample) map[key].sample += 1;
      else map[key].paid += 1;
      map[key].views += video.views;
      map[key].earnings += video.earnings;
    });

    return Object.values(map).sort((a, b) => (b.total === a.total ? b.earnings - a.earnings : b.total - a.total));
  }, [brandCatalog, brandCatalogMap, videos]);

  const maxViews = Math.max(...brandStats.map((brand) => brand.views), 1);
  const connected = authState === "connected";

  return (
    <div style={{ minHeight: "100vh", background: DARK, color: "#fff", fontFamily: "'DM Sans', sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=DM+Mono:wght@400;500&display=swap');
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-track { background: ${DARK}; }
        ::-webkit-scrollbar-thumb { background: ${BORDER}; border-radius: 3px; }
        @keyframes pulse { 0%,100%{opacity:1}50%{opacity:0.4} }
        @keyframes fadeIn { from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)} }
        @keyframes spin { to{transform:rotate(360deg)} }
        .video-row { transition: border-color 0.2s, background 0.2s; }
        .video-row:hover { border-color: ${ACCENT}55 !important; background: #161620 !important; cursor: pointer; }
        .video-row:hover .edit-hint { opacity: 1 !important; }
      `}</style>

      <div style={{ borderBottom: `1px solid ${BORDER}`, padding: "0 32px", display: "flex", alignItems: "center", justifyContent: "space-between", height: 64, position: "sticky", top: 0, background: "rgba(10,10,15,0.95)", backdropFilter: "blur(12px)", zIndex: 50 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: ACCENT, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>♪</div>
          <span style={{ fontWeight: 800, fontSize: 18, letterSpacing: -0.5 }}>BrandManager</span>
          <span style={{ fontSize: 11, background: "#1E1E2E", color: "#666", padding: "2px 8px", borderRadius: 20, fontFamily: "monospace" }}>PRO</span>
          <span style={{ fontSize: 11, background: storageState === "ready" ? "#00D4AA22" : "#1E1E2E", color: storageState === "ready" ? "#00D4AA" : "#888", padding: "2px 8px", borderRadius: 20, fontFamily: "monospace" }}>
            {storageState === "ready" ? "SUPABASE" : hasSupabaseConfig ? "STORAGE..." : "LOCAL ONLY"}
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {(authState === "loading" || storageState === "loading") && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#888" }}>
              <div style={{ width: 14, height: 14, border: "2px solid #333", borderTopColor: ACCENT, borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
              {authState === "loading" ? "Syncing..." : "Loading storage..."}
            </div>
          )}
          {connected && ttUser && (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {ttUser.avatar_url && <img src={ttUser.avatar_url} style={{ width: 28, height: 28, borderRadius: "50%", border: `2px solid ${ACCENT}` }} alt="avatar" />}
              <span style={{ fontSize: 13, fontWeight: 600 }}>@{ttUser.display_name || ttUser.username || "connected"}</span>
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#00D4AA", animation: "pulse 2s infinite" }} />
            </div>
          )}
          {connected ? (
            <>
              <button onClick={() => setShowAdd(true)} style={{ padding: "8px 18px", borderRadius: 10, background: ACCENT, border: "none", color: "#fff", fontWeight: 700, cursor: "pointer", fontSize: 13 }}>+ Add Video</button>
              <button
                onClick={() => {
                  sessionStorage.removeItem("tt_token");
                  sessionStorage.removeItem("tt_open_id");
                  sessionStorage.removeItem("tt_state");
                  setAuthState("idle");
                  setTtUser(null);
                  setVideos(storedVideos.length > 0 ? storedVideos : MOCK_VIDEOS);
                }}
                style={{ padding: "8px 14px", borderRadius: 10, background: CARD2, border: `1px solid ${BORDER}`, color: "#666", cursor: "pointer", fontSize: 13 }}
              >
                Disconnect
              </button>
            </>
          ) : (
            <>
              <button onClick={() => { window.location.href = buildAuthURL(); }} disabled={authState === "loading"} style={{ padding: "8px 18px", borderRadius: 10, background: authState === "loading" ? "#1A1A26" : `linear-gradient(135deg, ${ACCENT}, #FF6B9D)`, border: "none", color: "#fff", fontWeight: 700, cursor: "pointer", fontSize: 13 }}>
                Connect TikTok
              </button>
              <button onClick={() => setShowAdd(true)} style={{ padding: "8px 18px", borderRadius: 10, background: CARD2, border: `1px solid ${BORDER}`, color: "#ccc", fontWeight: 600, cursor: "pointer", fontSize: 13 }}>+ Manual Entry</button>
            </>
          )}
        </div>
      </div>

      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "32px 24px" }}>
        {storageState === "disabled" && (
          <div style={{ background: "#1A1A26", border: `1px solid ${BORDER}`, borderRadius: 12, padding: "14px 20px", marginBottom: 20, fontSize: 13, color: "#aaa" }}>
            Supabase is not configured yet. Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` to enable saved brands and videos.
          </div>
        )}

        {storageError && (
          <div style={{ background: "#FF2D5522", border: `1px solid ${ACCENT}`, borderRadius: 12, padding: "14px 20px", marginBottom: 20, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 13, color: "#FF6B9D" }}>Storage issue: {storageError}</span>
            <button onClick={() => setStorageError(null)} style={{ background: "none", border: "none", color: "#666", cursor: "pointer" }}>✕</button>
          </div>
        )}

        {authState === "error" && (
          <div style={{ background: "#FF2D5522", border: `1px solid ${ACCENT}`, borderRadius: 12, padding: "14px 20px", marginBottom: 20, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 13, color: "#FF6B9D" }}>⚠️ {authError}</span>
            <button onClick={() => setAuthState("idle")} style={{ background: "none", border: "none", color: "#666", cursor: "pointer" }}>✕</button>
          </div>
        )}

        {authState === "idle" && (
          <div style={{ background: `linear-gradient(135deg, ${ACCENT} 0%, #6C5CE7 100%)`, borderRadius: 16, padding: "24px 28px", marginBottom: 28, display: "flex", justifyContent: "space-between", alignItems: "center", animation: "fadeIn 0.4s ease" }}>
            <div>
              <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 4 }}>Connect your TikTok account</div>
              <div style={{ fontSize: 13, opacity: 0.85 }}>Sync your real videos and keep your brand tags in Supabase.</div>
            </div>
            <button onClick={() => { window.location.href = buildAuthURL(); }} style={{ padding: "10px 24px", borderRadius: 10, background: "#fff", color: ACCENT, fontWeight: 800, border: "none", cursor: "pointer", fontSize: 14, whiteSpace: "nowrap" }}>
              Connect Now →
            </button>
          </div>
        )}

        {connected && (
          <div style={{ background: "#00D4AA11", border: "1px solid #00D4AA33", borderRadius: 12, padding: "12px 18px", marginBottom: 20, fontSize: 13, color: "#00D4AA", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span>✓ {videos.length} videos available · click any video to edit brand info, earnings and notes</span>
          </div>
        )}

        <div style={{ display: "flex", gap: 4, marginBottom: 28, background: CARD, borderRadius: 12, padding: 4, width: "fit-content" }}>
          {["overview", "videos", "brands", "samples"].map((currentTab) => (
            <button key={currentTab} onClick={() => setTab(currentTab)} style={{ padding: "8px 20px", borderRadius: 9, border: "none", cursor: "pointer", fontWeight: 600, fontSize: 13, background: tab === currentTab ? CARD2 : "none", color: tab === currentTab ? "#fff" : "#666", transition: "all 0.2s", textTransform: "capitalize" }}>
              {currentTab}
            </button>
          ))}
        </div>

        {tab === "overview" && (
          <div style={{ animation: "fadeIn 0.3s ease" }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16, marginBottom: 28 }}>
              <StatCard label="Total Views" value={fmt(stats.totalViews)} sub="across all videos" color={ACCENT} />
              <StatCard label="Total Earnings" value={fmtMoney(stats.totalEarnings)} sub="paid partnerships" color="#00D4AA" />
              <StatCard label="Avg. Engagement" value={`${stats.avgEngagement}%`} sub="likes+comments+shares/views" color="#6C5CE7" />
              <StatCard label="Tracked Brands" value={brandStats.length} sub={`${stats.paidCount} paid · ${stats.sampleCount} gifted`} color="#FD9644" />
            </div>

            <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 16, padding: 24, marginBottom: 20 }}>
              <h3 style={{ margin: "0 0 20px", fontSize: 16, fontWeight: 700 }}>🏆 Top Performing Videos</h3>
              <div style={{ display: "grid", gap: 4 }}>
                {[...videos].sort((a, b) => b.views - a.views).slice(0, 5).map((video, index) => (
                  <div key={video.id} onClick={() => setEditingVideo(video)} style={{ display: "flex", alignItems: "center", gap: 16, cursor: "pointer", borderRadius: 10, padding: "10px 8px", transition: "background 0.15s" }} onMouseEnter={(event) => { event.currentTarget.style.background = CARD2; }} onMouseLeave={(event) => { event.currentTarget.style.background = "transparent"; }}>
                    <span style={{ fontSize: 13, fontWeight: 800, color: index < 3 ? ACCENT : "#444", width: 20, textAlign: "center", fontFamily: "monospace" }}>{index + 1}</span>
                    {video.coverUrl && <img src={video.coverUrl} style={{ width: 36, height: 36, borderRadius: 6, objectFit: "cover" }} alt="" />}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, color: "#ddd", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginBottom: 4 }}>{video.title}</div>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        {video.brand ? <span style={{ fontSize: 11, background: `${resolveBrandColor(video.brand, brandCatalogMap)}22`, color: resolveBrandColor(video.brand, brandCatalogMap), padding: "1px 8px", borderRadius: 20 }}>{video.brand}</span> : <span style={{ fontSize: 11, color: "#444" }}>No brand tagged</span>}
                        {video.isSample && <span style={{ fontSize: 11, background: "#FD964422", color: "#FD9644", padding: "1px 8px", borderRadius: 20 }}>gifted</span>}
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 14, fontWeight: 700 }}>{fmt(video.views)}</div>
                      <div style={{ fontSize: 11, color: "#00D4AA" }}>{fmtMoney(video.earnings)}</div>
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
                  <div style={{ width: `${stats.totalVideos ? (stats.paidCount / stats.totalVideos) * 100 : 50}%`, background: ACCENT }} />
                  <div style={{ flex: 1, background: "#FD9644" }} />
                </div>
              </div>

              <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 16, padding: 24 }}>
                <h3 style={{ margin: "0 0 16px", fontSize: 14, fontWeight: 700, color: "#888" }}>EARNINGS BY BRAND</h3>
                {brandStats.slice(0, 4).map((brand) => (
                  <div key={brand.brand} style={{ marginBottom: 12 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                      <span style={{ fontSize: 12, color: "#ccc" }}>{brand.brand}</span>
                      <span style={{ fontSize: 12, fontWeight: 700 }}>{fmtMoney(brand.earnings)}</span>
                    </div>
                    <MiniBar value={brand.earnings} max={Math.max(...brandStats.map((item) => item.earnings), 1)} color={brand.color || ACCENT} />
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {tab === "videos" && (
          <div style={{ animation: "fadeIn 0.3s ease" }}>
            <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap", alignItems: "center" }}>
              <select value={filterBrand} onChange={(event) => setFilterBrand(event.target.value)} style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 8, padding: "8px 14px", color: "#ccc", fontSize: 13, cursor: "pointer" }}>
                {brands.map((brand) => <option key={brand}>{brand}</option>)}
              </select>
              <select value={filterType} onChange={(event) => setFilterType(event.target.value)} style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 8, padding: "8px 14px", color: "#ccc", fontSize: 13, cursor: "pointer" }}>
                {["All", "Paid", "Sample"].map((type) => <option key={type}>{type}</option>)}
              </select>
              <select value={sortKey} onChange={(event) => setSortKey(event.target.value)} style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 8, padding: "8px 14px", color: "#ccc", fontSize: 13, cursor: "pointer" }}>
                <option value="date">Sort: Latest</option>
                <option value="views">Sort: Views</option>
                <option value="earnings">Sort: Earnings</option>
                <option value="likes">Sort: Likes</option>
              </select>
              <span style={{ marginLeft: "auto", fontSize: 13, color: "#555" }}>{filtered.length} videos · click any to edit</span>
            </div>

            <div style={{ display: "grid", gap: 10 }}>
              {filtered.map((video) => (
                <div key={video.id} className="video-row" onClick={() => setEditingVideo(video)} style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 14, padding: "14px 18px", display: "grid", gridTemplateColumns: "52px 1fr auto", gap: 14, alignItems: "center" }}>
                  <div style={{ width: 52, height: 52, borderRadius: 10, overflow: "hidden", background: CARD2, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    {video.coverUrl ? <img src={video.coverUrl} style={{ width: "100%", height: "100%", objectFit: "cover" }} alt="" /> : <span style={{ fontSize: 20, opacity: 0.3 }}>▶</span>}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 5, flexWrap: "wrap" }}>
                      {video.brand ? <span style={{ fontSize: 11, background: `${resolveBrandColor(video.brand, brandCatalogMap)}22`, color: resolveBrandColor(video.brand, brandCatalogMap), padding: "2px 10px", borderRadius: 20, fontWeight: 600 }}>{video.brand}</span> : <span style={{ fontSize: 11, background: "#FF2D5511", color: "#FF2D5588", padding: "2px 10px", borderRadius: 20 }}>+ tag brand</span>}
                      {video.isSample && <span style={{ fontSize: 11, background: "#FD964422", color: "#FD9644", padding: "2px 10px", borderRadius: 20 }}>🎁 Gifted</span>}
                      <span style={{ fontSize: 11, color: "#444" }}>{video.date}{video.duration ? ` · ${video.duration}` : ""}</span>
                      <span style={{ fontSize: 11, color: "#444" }}>{video.source === "manual" ? "Manual" : "TikTok sync"}</span>
                    </div>
                    <div style={{ fontSize: 14, color: "#ddd", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginBottom: 6 }}>{video.title}</div>
                    <div style={{ display: "flex", gap: 14 }}>
                      {[["👁", fmt(video.views)], ["❤️", fmt(video.likes)], ["💬", fmt(video.comments)], ["↗️", fmt(video.shares)]].map(([icon, value]) => (
                        <span key={icon} style={{ fontSize: 12, color: "#555" }}>{icon} {value}</span>
                      ))}
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    {video.earnings > 0 ? <div style={{ fontSize: 20, fontWeight: 800, color: "#00D4AA" }}>{fmtMoney(video.earnings)}</div> : video.isSample ? <div style={{ fontSize: 13, color: "#FD9644", fontWeight: 700 }}>Gifted</div> : <div style={{ fontSize: 12, color: "#333" }}>-</div>}
                    <div className="edit-hint" style={{ fontSize: 11, color: "#555", marginTop: 4, opacity: 0, transition: "opacity 0.2s" }}>✏️ edit</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === "brands" && (
          <div style={{ animation: "fadeIn 0.3s ease", display: "grid", gap: 16 }}>
            <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 16, padding: 24 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1.2fr 120px 1.2fr auto", gap: 12, alignItems: "end" }}>
                <div>
                  <label style={{ fontSize: 12, color: "#888", display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: 1 }}>Brand Name</label>
                  <input value={brandForm.name} onChange={(event) => setBrandForm((current) => ({ ...current, name: event.target.value }))} placeholder="e.g. Sunday Current" style={{ width: "100%", background: DARK, border: `1px solid ${BORDER}`, borderRadius: 8, padding: "10px 12px", color: "#fff", fontSize: 14, outline: "none" }} />
                </div>
                <div>
                  <label style={{ fontSize: 12, color: "#888", display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: 1 }}>Color</label>
                  <input type="color" value={brandForm.color} onChange={(event) => setBrandForm((current) => ({ ...current, color: event.target.value }))} style={{ width: "100%", height: 42, background: DARK, border: `1px solid ${BORDER}`, borderRadius: 8, padding: 4 }} />
                </div>
                <div>
                  <label style={{ fontSize: 12, color: "#888", display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: 1 }}>Notes</label>
                  <input value={brandForm.notes} onChange={(event) => setBrandForm((current) => ({ ...current, notes: event.target.value }))} placeholder="Optional brand context" style={{ width: "100%", background: DARK, border: `1px solid ${BORDER}`, borderRadius: 8, padding: "10px 12px", color: "#fff", fontSize: 14, outline: "none" }} />
                </div>
                <button onClick={handleCreateBrand} disabled={savingBrand} style={{ padding: "11px 18px", borderRadius: 10, background: ACCENT, border: "none", color: "#fff", fontWeight: 700, cursor: "pointer", fontSize: 13, whiteSpace: "nowrap", opacity: savingBrand ? 0.7 : 1 }}>
                  {savingBrand ? "Saving..." : "+ Add Brand"}
                </button>
              </div>
              <div style={{ fontSize: 12, color: "#666", marginTop: 12 }}>
                Saved brands appear in the brand tab immediately and show up as suggestions in video editing forms.
              </div>
            </div>

            {brandStats.map((brand) => (
              <div key={brand.brand} style={{ background: CARD, border: `1px solid ${(brand.color || BORDER)}33`, borderRadius: 16, padding: "22px 24px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20, gap: 16 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{ width: 40, height: 40, borderRadius: 12, background: `${brand.color || "#888"}22`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, fontWeight: 800, color: brand.color || "#888" }}>{brand.brand[0]}</div>
                    <div>
                      <div style={{ fontWeight: 800, fontSize: 18 }}>{brand.brand}</div>
                      <div style={{ fontSize: 12, color: "#555" }}>{brand.total} video{brand.total !== 1 ? "s" : ""} total</div>
                      {brand.notes && <div style={{ fontSize: 12, color: "#777", marginTop: 6, maxWidth: 480 }}>{brand.notes}</div>}
                    </div>
                  </div>

                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 24, fontWeight: 800, color: "#00D4AA" }}>{fmtMoney(brand.earnings)}</div>
                    <div style={{ fontSize: 12, color: "#555" }}>total earned</div>
                    {brand.brand !== "Untagged" && (
                      <button onClick={() => handleDeleteBrand(brand.brand, brand.total)} disabled={brand.total > 0} style={{ marginTop: 10, padding: "6px 10px", borderRadius: 8, background: "none", border: `1px solid ${brand.total > 0 ? BORDER : `${ACCENT}44`}`, color: brand.total > 0 ? "#555" : "#FF6B9D", cursor: brand.total > 0 ? "not-allowed" : "pointer", fontSize: 12 }}>
                        {brand.total > 0 ? "In use" : "Delete"}
                      </button>
                    )}
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
                  {[["Total Videos", brand.total, null], ["Paid", brand.paid, ACCENT], ["Gifted/Sample", brand.sample, "#FD9644"], ["Total Views", fmt(brand.views), null]].map(([label, value, color]) => (
                    <div key={label} style={{ background: CARD2, borderRadius: 10, padding: "12px 14px" }}>
                      <div style={{ fontSize: 18, fontWeight: 800, color: color || "#fff" }}>{value}</div>
                      <div style={{ fontSize: 11, color: "#555", marginTop: 2 }}>{label}</div>
                    </div>
                  ))}
                </div>

                <div style={{ marginTop: 16 }}>
                  <MiniBar value={brand.views} max={maxViews} color={brand.color || ACCENT} />
                  <div style={{ fontSize: 11, color: "#444", marginTop: 4 }}>{fmt(brand.views)} views ({Math.round((brand.views / Math.max(stats.totalViews, 1)) * 100)}% of total)</div>
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === "samples" && (
          <div style={{ animation: "fadeIn 0.3s ease" }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 16, marginBottom: 24 }}>
              <StatCard label="Total Gifted Videos" value={stats.sampleCount} color="#FD9644" />
              <StatCard label="Paid Videos" value={stats.paidCount} color={ACCENT} />
              <StatCard label="Sample Rate" value={`${Math.round((stats.sampleCount / Math.max(stats.totalVideos, 1)) * 100)}%`} sub="of all brand content" color="#6C5CE7" />
            </div>

            <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 16, padding: 24, marginBottom: 20 }}>
              <h3 style={{ margin: "0 0 20px", fontSize: 15, fontWeight: 700 }}>Samples per Brand</h3>
              <div style={{ display: "grid", gap: 16 }}>
                {brandStats.map((brand) => (
                  <div key={brand.brand}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: brand.color || "#ccc" }}>{brand.brand}</span>
                      <span style={{ fontSize: 12, color: "#555" }}>
                        <span style={{ color: "#FD9644", fontWeight: 700 }}>{brand.sample} gifted</span> · <span style={{ color: ACCENT, fontWeight: 700 }}>{brand.paid} paid</span>
                      </span>
                    </div>
                    <div style={{ display: "flex", height: 10, borderRadius: 5, overflow: "hidden", gap: 2 }}>
                      {Array.from({ length: brand.total }).map((_, index) => (
                        <div key={index} style={{ flex: 1, background: index < brand.sample ? "#FD9644" : ACCENT, borderRadius: 2 }} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 16, padding: 24 }}>
              <h3 style={{ margin: "0 0 16px", fontSize: 15, fontWeight: 700 }}>🎁 All Gifted Videos</h3>
              <div style={{ display: "grid", gap: 10 }}>
                {videos.filter((video) => video.isSample).sort((a, b) => b.views - a.views).map((video) => (
                  <div key={video.id} onClick={() => setEditingVideo(video)} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", background: CARD2, borderRadius: 10, cursor: "pointer", transition: "opacity 0.15s" }} onMouseEnter={(event) => { event.currentTarget.style.opacity = "0.75"; }} onMouseLeave={(event) => { event.currentTarget.style.opacity = "1"; }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      {video.coverUrl && <img src={video.coverUrl} style={{ width: 32, height: 32, borderRadius: 4, objectFit: "cover" }} alt="" />}
                      <div>
                        <div style={{ fontSize: 13, color: "#ddd" }}>{video.title}</div>
                        <div style={{ fontSize: 11, color: resolveBrandColor(video.brand, brandCatalogMap), marginTop: 2 }}>{video.brand || "Untagged"} · {video.date}</div>
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 13, fontWeight: 700 }}>{fmt(video.views)} views</div>
                      <div style={{ fontSize: 11, color: "#555" }}>❤️ {fmt(video.likes)}</div>
                    </div>
                  </div>
                ))}
                {videos.filter((video) => video.isSample).length === 0 && (
                  <div style={{ textAlign: "center", color: "#444", fontSize: 13, padding: 24 }}>No gifted videos yet.</div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {showAdd && <AddVideoModal onClose={() => setShowAdd(false)} onAdd={handleAddVideo} brandOptions={brandNames} />}
      {editingVideo && <VideoModal video={editingVideo} onClose={() => setEditingVideo(null)} onSave={handleSaveVideo} brandOptions={brandNames} />}
    </div>
  );
}
