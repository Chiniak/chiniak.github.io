package io.github.chiniak.podroznik;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.TimeZone;
import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Sprawdzanie nowych wiadomości, gdy aplikacja jest zamknięta (bez serwera i bez Firebase Cloud Messaging):
 * co ok. 15 minut PushWorker pyta Firestore (REST) o nowe wpisy od ostatniego sprawdzenia i odszyfrowuje je w telefonie.
 * - czat wspólnej podróży: rooms/{pokój}/ops (operacje „chat” zaszyfrowane kluczem pokoju z linku zaproszenia – sync.js),
 * - czat ze znajomym: dm/{uidA_uidB}/msgs (klucz pary ECDH wyliczony w telefonie – social.js),
 * - zaproszenia do znajomych: people/{uid}/inbox (kind = req, imię jawne).
 * Konfigurację (tokeny, pokoje, klucze, teksty w języku aplikacji) zapisuje strona przez PushPlugin.configure (push.js).
 * Ta klasa nie używa nic z Androida – testy JVM uruchamiają ją na emulatorze Firebase (PushCheckTest).
 */
public class PushCheck {

    /** jedno powiadomienie: rozmowa / podróż, z wiadomościami od najstarszej */
    public static class Notice {
        public String key, title, route;
        public final List<String> lines = new ArrayList<>();
    }

    public interface Http {
        String post(String url, String body, String contentType, String bearer) throws Exception;
    }

    private final JSONObject cfg;
    private final JSONObject since;
    private final Http http;
    private String newRefreshToken;

    public PushCheck(JSONObject cfg, JSONObject since, Http http) {
        this.cfg = cfg;
        this.since = since;
        this.http = http != null ? http : PushCheck::httpPost;
    }

    /** nowy token odświeżania, jeśli serwer go zmienił (zapisz w konfiguracji) */
    public String refreshToken() { return newRefreshToken; }

    public JSONObject since() { return since; }

    /** od kiedy liczyć (ms): zapisane „since” klucza, inaczej moment konfiguracji */
    private long from(String key) {
        return since.has(key) ? since.optLong(key) : cfg.optLong("at", System.currentTimeMillis());
    }

    /** ustaw „since” wszystkich rozmów na teraz – użytkownik widział wszystko (aplikacja była otwarta) */
    public void seenAll(long now) throws Exception {
        for (String k : keys()) since.put(k, now);
    }

    public List<String> keys() {
        List<String> out = new ArrayList<>();
        JSONArray rooms = cfg.optJSONArray("rooms");
        if (rooms != null) for (int i = 0; i < rooms.length(); i++) out.add("r:" + rooms.optJSONObject(i).optString("tripId"));
        JSONArray fr = cfg.optJSONArray("friends");
        if (fr != null) for (int i = 0; i < fr.length(); i++) out.add("d:" + fr.optJSONObject(i).optString("uid"));
        if (cfg.optBoolean("inbox", true)) out.add("inbox");
        return out;
    }

    public List<Notice> run() throws Exception {
        String token = idToken();
        String uid = cfg.getString("uid");
        JSONObject texts = cfg.optJSONObject("texts");
        if (texts == null) texts = new JSONObject();
        List<Notice> out = new ArrayList<>();

        JSONArray rooms = cfg.optJSONArray("rooms");
        if (rooms != null) for (int i = 0; i < rooms.length(); i++) {
            JSONObject r = rooms.getJSONObject(i);
            String key = "r:" + r.optString("tripId");
            Notice n = new Notice();
            n.key = key;
            n.title = r.optString("name", "Tripwillow");
            n.route = "#/razem/" + r.optString("tripId") + "?z=czat";
            long max = from(key);
            for (JSONObject d : query(token, "rooms/" + r.getString("room"), "ops", from(key))) {
                max = Math.max(max, d.optLong("_t"));
                if (uid.equals(d.optString("by"))) continue;
                try {
                    JSONObject op = new JSONObject(open(r.getString("aes"), d.optString("c")));
                    JSONObject rec = op.optJSONObject("r");
                    if (!"chat".equals(op.optString("s")) || rec == null || rec.has("sys")) continue; // wiadomości systemowe (dołączył, wyszedł) – bez powiadomień
                    if (r.optString("me").equals(rec.optString("by"))) continue; // ja z innego telefonu
                    String who = rec.optString("name", "");
                    n.lines.add((who.isEmpty() ? "" : who + ": ") + clip(rec.optString("text", "")));
                } catch (Exception e) { /* nie nasz klucz albo uszkodzone */ }
            }
            since.put(key, max);
            if (!n.lines.isEmpty()) out.add(n);
        }

        JSONArray fr = cfg.optJSONArray("friends");
        if (fr != null) for (int i = 0; i < fr.length(); i++) {
            JSONObject f = fr.getJSONObject(i);
            String key = "d:" + f.optString("uid");
            Notice n = new Notice();
            n.key = key;
            n.title = f.optString("name", "Tripwillow");
            n.route = "#/czat/" + f.optString("uid");
            long max = from(key);
            for (JSONObject d : query(token, "dm/" + f.getString("conv"), "msgs", from(key))) {
                max = Math.max(max, d.optLong("_t"));
                if (uid.equals(d.optString("by"))) continue;
                try {
                    JSONObject m = new JSONObject(open(f.getString("aes"), d.optString("c")));
                    String text = m.optString("text", "").trim();
                    JSONObject sh = m.optJSONObject("share");
                    if (text.isEmpty() && sh != null) {
                        text = "trip".equals(sh.optString("k")) ? "🧳 " + sh.optString("name")
                            : sh.optJSONObject("it") != null ? "📍 " + sh.optJSONObject("it").optString("title") : "";
                    }
                    if (!text.isEmpty()) n.lines.add(clip(text));
                } catch (Exception e) { /* nie da się odszyfrować */ }
            }
            since.put(key, max);
            if (!n.lines.isEmpty()) out.add(n);
        }

        if (cfg.optBoolean("inbox", true)) {
            Notice n = new Notice();
            n.key = "inbox";
            n.title = texts.optString("reqTitle", "Zaproszenie do znajomych");
            n.route = "#/znajomi";
            long max = from("inbox");
            for (JSONObject d : query(token, "people/" + uid, "inbox", from("inbox"))) {
                max = Math.max(max, d.optLong("_t"));
                if (!"req".equals(d.optString("kind"))) continue;
                n.lines.add(texts.optString("reqText", "{} chce dodać Cię do znajomych").replace("{}", d.optString("name", "?")));
            }
            since.put("inbox", max);
            if (!n.lines.isEmpty()) out.add(n);
        }
        return out;
    }

    private static String clip(String s) {
        s = s.replaceAll("\\s+", " ").trim();
        return s.length() > 200 ? s.substring(0, 199) + "…" : s;
    }

    /* ---------- Firebase Auth: token sesji z tokenu odświeżania (ten sam użytkownik co w aplikacji) ---------- */
    private String idToken() throws Exception {
        String base = cfg.optString("authUrl", "https://securetoken.googleapis.com");
        String body = "grant_type=refresh_token&refresh_token=" + URLEncoder.encode(cfg.getString("refreshToken"), "UTF-8");
        JSONObject j = new JSONObject(http.post(base + "/v1/token?key=" + URLEncoder.encode(cfg.getString("apiKey"), "UTF-8"), body,
            "application/x-www-form-urlencoded", null));
        String rt = j.optString("refresh_token", "");
        if (!rt.isEmpty() && !rt.equals(cfg.optString("refreshToken"))) newRefreshToken = rt;
        return j.getString("id_token");
    }

    /* ---------- Firestore REST: dokumenty kolekcji z t > od, po kolei ---------- */
    private List<JSONObject> query(String token, String parent, String collection, long fromMs) throws Exception {
        String base = cfg.optString("fsUrl", "https://firestore.googleapis.com");
        String url = base + "/v1/projects/" + cfg.getString("projectId") + "/databases/(default)/documents/" + parent + ":runQuery";
        JSONObject q = new JSONObject()
            .put("from", new JSONArray().put(new JSONObject().put("collectionId", collection)))
            .put("where", new JSONObject().put("fieldFilter", new JSONObject()
                .put("field", new JSONObject().put("fieldPath", "t"))
                .put("op", "GREATER_THAN")
                .put("value", new JSONObject().put("timestampValue", iso(fromMs)))))
            .put("orderBy", new JSONArray().put(new JSONObject().put("field", new JSONObject().put("fieldPath", "t")).put("direction", "ASCENDING")))
            .put("limit", 50);
        JSONArray res = new JSONArray(http.post(url, new JSONObject().put("structuredQuery", q).toString(), "application/json", token));
        List<JSONObject> out = new ArrayList<>();
        for (int i = 0; i < res.length(); i++) {
            JSONObject doc = res.getJSONObject(i).optJSONObject("document");
            if (doc == null) continue;
            JSONObject f = doc.optJSONObject("fields"), d = new JSONObject();
            if (f == null) continue;
            java.util.Iterator<String> it = f.keys();
            while (it.hasNext()) {
                String k = it.next();
                JSONObject v = f.getJSONObject(k);
                if (v.has("stringValue")) d.put(k, v.getString("stringValue"));
                else if (v.has("timestampValue")) d.put("_t", parseIso(v.getString("timestampValue")));
                else if (v.has("integerValue")) d.put(k, v.getString("integerValue"));
            }
            out.add(d);
        }
        return out;
    }

    static String iso(long ms) {
        SimpleDateFormat f = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US);
        f.setTimeZone(TimeZone.getTimeZone("UTC"));
        return f.format(new Date(ms));
    }

    /** „2026-11-19T10:00:00.123456Z” → ms (ułamek dowolnej długości) */
    static long parseIso(String s) throws Exception {
        String main = s.replace("Z", "");
        String frac = "";
        int dot = main.indexOf('.');
        if (dot >= 0) { frac = main.substring(dot + 1); main = main.substring(0, dot); }
        SimpleDateFormat f = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", Locale.US);
        f.setTimeZone(TimeZone.getTimeZone("UTC"));
        long ms = f.parse(main).getTime();
        if (!frac.isEmpty()) ms += Long.parseLong((frac + "000").substring(0, 3));
        return ms;
    }

    /* ---------- AES-256-GCM jak w WebCrypto: base64url(iv 12 B + szyfr + znacznik 16 B) ---------- */
    static String open(String keyB64u, String c) throws Exception {
        byte[] key = unb64u(keyB64u), b = unb64u(c);
        Cipher ci = Cipher.getInstance("AES/GCM/NoPadding");
        ci.init(Cipher.DECRYPT_MODE, new SecretKeySpec(key, "AES"), new GCMParameterSpec(128, b, 0, 12));
        return new String(ci.doFinal(b, 12, b.length - 12), StandardCharsets.UTF_8);
    }

    static byte[] unb64u(String s) {
        String a = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        int buf = 0, bits = 0;
        for (char ch : s.replace('+', '-').replace('/', '_').replace("=", "").toCharArray()) {
            int v = a.indexOf(ch);
            if (v < 0) continue;
            buf = (buf << 6) | v;
            bits += 6;
            if (bits >= 8) { bits -= 8; out.write((buf >> bits) & 0xff); }
        }
        return out.toByteArray();
    }

    /* ---------- HTTP ---------- */
    static String httpPost(String url, String body, String contentType, String bearer) throws Exception {
        HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
        c.setConnectTimeout(15000);
        c.setReadTimeout(20000);
        c.setRequestMethod("POST");
        c.setDoOutput(true);
        c.setRequestProperty("Content-Type", contentType);
        if (bearer != null) c.setRequestProperty("Authorization", "Bearer " + bearer);
        try (OutputStream os = c.getOutputStream()) { os.write(body.getBytes(StandardCharsets.UTF_8)); }
        int code = c.getResponseCode();
        InputStream in = code < 400 ? c.getInputStream() : c.getErrorStream();
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        if (in != null) try (InputStream i = in) { byte[] b = new byte[8192]; int r; while ((r = i.read(b)) > 0) out.write(b, 0, r); }
        String s = out.toString("UTF-8");
        if (code >= 400) throw new Exception("HTTP " + code + ": " + (s.length() > 300 ? s.substring(0, 300) : s));
        return s;
    }

    /** prosta mapa kluczy (do testów) */
    static Map<String, Long> toMap(JSONObject o) {
        Map<String, Long> m = new LinkedHashMap<>();
        java.util.Iterator<String> it = o.keys();
        while (it.hasNext()) { String k = it.next(); m.put(k, o.optLong(k)); }
        return m;
    }
}
