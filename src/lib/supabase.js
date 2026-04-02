import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export const hasSupabaseConfig = Boolean(supabaseUrl && supabaseKey);

export const supabase = hasSupabaseConfig
  ? createClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: false },
    })
  : null;

export async function loadBrands() {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("brands")
    .select("id, name, color, notes, created_at")
    .order("name", { ascending: true });

  if (error) throw error;
  return data || [];
}

export async function loadVideos() {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("videos")
    .select("*")
    .order("date", { ascending: false, nullsFirst: false });

  if (error) throw error;
  return data || [];
}

export async function saveBrand(brand) {
  if (!supabase) return null;
  const payload = {
    name: brand.name,
    color: brand.color || null,
    notes: brand.notes || null,
  };

  const { data, error } = await supabase
    .from("brands")
    .upsert(payload, { onConflict: "name" })
    .select("id, name, color, notes, created_at")
    .single();

  if (error) throw error;
  return data;
}

export async function deleteBrand(name) {
  if (!supabase) return;
  const { error } = await supabase.from("brands").delete().eq("name", name);
  if (error) throw error;
}

export async function saveVideo(video) {
  if (!supabase) return null;
  const payload = {
    id: video.id,
    title: video.title || "Untitled",
    brand: video.brand || null,
    category: video.category || "Other",
    date: video.date || null,
    views: Number(video.views || 0),
    likes: Number(video.likes || 0),
    comments: Number(video.comments || 0),
    shares: Number(video.shares || 0),
    earnings: Number(video.earnings || 0),
    is_sample: Boolean(video.isSample),
    duration: video.duration || null,
    cover_url: video.coverUrl || null,
    share_url: video.shareUrl || null,
    embed_url: video.embedUrl || null,
    notes: video.notes || null,
    source: video.source || "manual",
  };

  const { data, error } = await supabase
    .from("videos")
    .upsert(payload)
    .select("*")
    .single();

  if (error) throw error;
  return data;
}
