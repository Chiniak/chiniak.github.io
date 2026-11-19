package io.github.chiniak.podroznik;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import java.io.File;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.List;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;

/**
 * PushCheck bez telefonu:
 * - dekodowanie czasu i base64url,
 * - na emulatorze Firebase: konfiguracja zbudowana przez stronę (test podroznik-testy/t70.js zapisuje ją do
 *   build/push-test/cfg.json razem z próbką szyfru z WebCrypto); wynik do build/push-test/out.json – sprawdza go t70.
 *   Bez pliku – część z emulatorem się pomija.
 */
public class PushCheckTest {

    @Test
    public void isoAndBase64() throws Exception {
        assertEquals(1795082400123L, PushCheck.parseIso("2026-11-19T10:00:00.123456Z"));
        assertEquals(1795082400000L, PushCheck.parseIso("2026-11-19T10:00:00Z"));
        assertEquals("2026-11-19T10:00:00.123Z", PushCheck.iso(1795082400123L));
        assertEquals("hello", new String(PushCheck.unb64u("aGVsbG8"), StandardCharsets.UTF_8));
    }

    @Test
    public void emulator() throws Exception {
        File in = new File("build/push-test/cfg.json");
        if (!in.exists()) return;
        JSONObject all = new JSONObject(new String(Files.readAllBytes(in.toPath()), StandardCharsets.UTF_8));
        JSONObject cfg = all.getJSONObject("cfg");
        JSONObject out = new JSONObject();

        // szyfr z WebCrypto (AES-GCM) odszyfrowany w Javie
        JSONObject sample = all.getJSONObject("sample");
        out.put("sample", PushCheck.open(sample.getString("key"), sample.getString("c")));

        PushCheck pc = new PushCheck(cfg, new JSONObject(), null);
        List<PushCheck.Notice> list = pc.run();
        JSONArray first = new JSONArray();
        for (PushCheck.Notice n : list) first.put(new JSONObject().put("key", n.key).put("title", n.title).put("route", n.route).put("lines", new JSONArray(n.lines)));
        out.put("first", first);
        out.put("since", pc.since());
        // drugie sprawdzenie od zapisanego „since” – nic nowego
        PushCheck pc2 = new PushCheck(cfg, pc.since(), null);
        out.put("second", pc2.run().size());
        // „widziane” – since wszystkich rozmów na teraz
        pc2.seenAll(System.currentTimeMillis());
        out.put("keys", new JSONArray(pc2.keys()));
        Files.write(new File("build/push-test/out.json").toPath(), out.toString(2).getBytes(StandardCharsets.UTF_8));
        assertTrue(first.length() > 0);
    }
}
