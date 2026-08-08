import { getStore } from "@netlify/blobs";
import { createHash, timingSafeEqual } from "node:crypto";

const STORE = "closetmuse-wardrobes";
const jsonHeaders = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,DELETE,OPTIONS",
  "access-control-allow-headers": "content-type"
};

const reply = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: jsonHeaders });

const sha = (s) => createHash("sha256").update(String(s)).digest("hex");

function safeEqualHex(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  try { return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex")); }
  catch { return false; }
}

function validToken(s, min = 32, max = 160) {
  return typeof s === "string" && s.length >= min && s.length <= max && /^[a-f0-9]+$/i.test(s);
}

export default async (req) => {
  if (req.method === "OPTIONS") return new Response("", { status: 204, headers: jsonHeaders });

  const store = getStore(STORE);
  const url = new URL(req.url);

  try {
    if (req.method === "GET") {
      const shareId = url.searchParams.get("share");
      if (!validToken(shareId, 32, 128)) return reply({ error: "Invalid share link." }, 400);

      const manifest = await store.get(`manifest:${shareId}`, { type: "json", consistency: "strong" });
      if (!manifest || manifest.revoked) return reply({ error: "Shared wardrobe not found." }, 404);

      const itemIds = Array.isArray(manifest.itemIds) ? manifest.itemIds : [];
      const outfitIds = Array.isArray(manifest.outfitIds) ? manifest.outfitIds : [];

      const items = (await Promise.all(itemIds.map(id =>
        store.get(`item:${shareId}:${id}`, { type: "json", consistency: "strong" })
      ))).filter(Boolean);

      const outfits = (await Promise.all(outfitIds.map(id =>
        store.get(`outfit:${shareId}:${id}`, { type: "json", consistency: "strong" })
      ))).filter(Boolean);

      return reply({
        app: "ClosetMuse",
        readOnly: true,
        shareId,
        updatedAt: manifest.updatedAt,
        itemCount: items.length,
        outfitCount: outfits.length,
        items,
        outfits
      });
    }

    if (req.method === "POST") {
      const body = await req.json();
      const { shareId, ownerKey } = body || {};
      if (!validToken(shareId, 32, 128) || !validToken(ownerKey, 32, 160))
        return reply({ error: "Invalid owner credentials." }, 400);

      const incomingItems = Array.isArray(body.items) ? body.items.slice(0, 250) : [];
      const incomingOutfits = Array.isArray(body.outfits) ? body.outfits.slice(0, 250) : [];
      const ownerHash = sha(ownerKey);
      const key = `manifest:${shareId}`;
      const old = await store.get(key, { type: "json", consistency: "strong" });

      if (old && !safeEqualHex(old.ownerHash, ownerHash))
        return reply({ error: "This share ID belongs to a different owner." }, 403);

      const oldItemIds = new Set((old?.itemIds || []).map(String));
      const oldOutfitIds = new Set((old?.outfitIds || []).map(String));
      const itemIds = incomingItems.map(x => String(x.id));
      const outfitIds = incomingOutfits.map(x => String(x.id));

      await Promise.all(incomingItems.map(item =>
        store.setJSON(`item:${shareId}:${String(item.id)}`, {
          id: String(item.id),
          name: String(item.name || "").slice(0, 140),
          category: String(item.category || "").slice(0, 60),
          color: String(item.color || "").slice(0, 80),
          occasion: String(item.occasion || "").slice(0, 80),
          notes: String(item.notes || "").slice(0, 400),
          emoji: String(item.emoji || "").slice(0, 10),
          image: typeof item.image === "string" && item.image.startsWith("data:image/") ? item.image : ""
        })
      ));

      await Promise.all(incomingOutfits.map(outfit =>
        store.setJSON(`outfit:${shareId}:${String(outfit.id)}`, {
          id: String(outfit.id),
          name: String(outfit.name || "").slice(0, 140),
          date: String(outfit.date || "").slice(0, 80),
          items: Array.isArray(outfit.items) ? outfit.items.map(i => ({
            id: String(i.id),
            name: String(i.name || "").slice(0, 140),
            category: String(i.category || "").slice(0, 60),
            color: String(i.color || "").slice(0, 80),
            occasion: String(i.occasion || "").slice(0, 80)
          })) : []
        })
      ));

      const newItemSet = new Set(itemIds), newOutfitSet = new Set(outfitIds);
      await Promise.all([
        ...[...oldItemIds].filter(id => !newItemSet.has(id)).map(id => store.delete(`item:${shareId}:${id}`)),
        ...[...oldOutfitIds].filter(id => !newOutfitSet.has(id)).map(id => store.delete(`outfit:${shareId}:${id}`))
      ]);

      const updatedAt = new Date().toISOString();
      await store.setJSON(key, { ownerHash, itemIds, outfitIds, updatedAt, revoked: false });
      return reply({ ok: true, updatedAt, itemCount: itemIds.length, outfitCount: outfitIds.length });
    }

    if (req.method === "DELETE") {
      const body = await req.json();
      const { shareId, ownerKey } = body || {};
      if (!validToken(shareId, 32, 128) || !validToken(ownerKey, 32, 160))
        return reply({ error: "Invalid owner credentials." }, 400);

      const key = `manifest:${shareId}`;
      const old = await store.get(key, { type: "json", consistency: "strong" });
      if (!old) return reply({ ok: true });
      if (!safeEqualHex(old.ownerHash, sha(ownerKey))) return reply({ error: "Not authorized." }, 403);

      await Promise.all([
        ...(old.itemIds || []).map(id => store.delete(`item:${shareId}:${id}`)),
        ...(old.outfitIds || []).map(id => store.delete(`outfit:${shareId}:${id}`))
      ]);
      await store.delete(key);
      return reply({ ok: true });
    }

    return reply({ error: "Method not allowed." }, 405);
  } catch (err) {
    console.error("wardrobe function error", err);
    return reply({ error: "Wardrobe service error. Check Netlify Function logs." }, 500);
  }
};

export const config = { path: "/api/wardrobe" };
