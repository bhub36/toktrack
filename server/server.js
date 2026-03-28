// server.js — TikTok OAuth proxy
// Run with: node server.js
// Keeps your Client Secret out of the frontend

import express from "express";
import cors from "cors";
import fetch from "node-fetch";
import dotenv from "dotenv";
dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const CLIENT_KEY    = process.env.TIKTOK_CLIENT_KEY;
const CLIENT_SECRET = process.env.TIKTOK_CLIENT_SECRET;

if (!CLIENT_KEY || !CLIENT_SECRET) {
  console.error("❌  Missing TIKTOK_CLIENT_KEY or TIKTOK_CLIENT_SECRET in .env");
  process.exit(1);
}

// ── 1. Exchange auth code for access token ───────────────────────────────────
app.post("/auth/token", async (req, res) => {
  const { code, redirect_uri } = req.body;
  if (!code) return res.status(400).json({ error: "Missing code" });

  try {
    const resp = await fetch("https://open.tiktokapis.com/v2/oauth/token/", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_key:    CLIENT_KEY,
        client_secret: CLIENT_SECRET,
        code,
        grant_type:    "authorization_code",
        redirect_uri,
      }),
    });
    const data = await resp.json();
    if (data.error) return res.status(400).json({ error: data.error_description || data.error });
    res.json({ access_token: data.access_token, open_id: data.open_id, expires_in: data.expires_in });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Token exchange failed" });
  }
});

// ── 2. Fetch user profile ────────────────────────────────────────────────────
app.post("/tiktok/user", async (req, res) => {
  const { access_token } = req.body;
  if (!access_token) return res.status(400).json({ error: "Missing access_token" });

  try {
    const resp = await fetch(
      "https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name,avatar_url,follower_count,likes_count,video_count",
      {
        method: "GET",
        headers: { 
          Authorization: `Bearer ${access_token}`,
          "Content-Type": "application/json"
        }
      }
    );
    const data = await resp.json();
    console.log("TikTok user response:", JSON.stringify(data));
    
    // Don't error out if user data is partial — just return what we have
    res.json(data.data?.user || {});
  } catch (err) {
    console.error("User fetch error:", err);
    res.status(500).json({ error: "Failed to fetch user" });
  }
});

// ── 3. Fetch video list ──────────────────────────────────────────────────────
app.post("/tiktok/videos", async (req, res) => {
  const { access_token } = req.body;
  if (!access_token) return res.status(400).json({ error: "Missing access_token" });

  try {
    const resp = await fetch(
      "https://open.tiktokapis.com/v2/video/list/?fields=id,title,video_description,create_time,cover_image_url,share_url,view_count,like_count,comment_count,share_count,duration",
      {
        method: "POST",
        headers: { Authorization: `Bearer ${access_token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ max_count: 20 }),
      }
    );
    const data = await resp.json();
    if (data.error?.code !== "ok") return res.status(400).json({ error: data.error?.message });
    res.json(data.data?.videos || []);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch videos" });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`✅  TokTrack proxy running on port ${PORT}`));
