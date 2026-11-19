package io.github.chiniak.podroznik;

import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.List;
import org.json.JSONObject;

/**
 * Powiadomienia o wiadomościach przy zamkniętej aplikacji (push.js ↔ PushWorker / PushCheck).
 * configure({ on, cfg }) – zapis konfiguracji i włączenie / wyłączenie sprawdzania co 15 min,
 * check() – sprawdź teraz (wynik: liczba nowych rozmów; powiadomienia pokazuje tylko, gdy show = true),
 * zdarzenie „open” { route } – dotknięto powiadomienia (native.js zmienia ekran).
 */
@CapacitorPlugin(name = "Push")
public class PushPlugin extends Plugin {

    static final String EXTRA_ROUTE = "tw_route", TAG = "tw-push";
    static volatile boolean foreground = false;

    @Override
    public void load() {
        foreground = true;
        route(getActivity().getIntent());
    }

    @Override
    protected void handleOnNewIntent(Intent intent) {
        super.handleOnNewIntent(intent);
        route(intent);
    }

    private void route(Intent intent) {
        if (intent == null) return;
        String r = intent.getStringExtra(EXTRA_ROUTE);
        if (r == null || !r.startsWith("#/")) return;
        intent.removeExtra(EXTRA_ROUTE);
        JSObject d = new JSObject();
        d.put("route", r);
        notifyListeners("open", d, true);
    }

    @Override
    protected void handleOnResume() {
        super.handleOnResume();
        foreground = true;
        PushWorker.seenAll(getContext());
    }

    @Override
    protected void handleOnPause() {
        super.handleOnPause();
        foreground = false;
        PushWorker.seenAll(getContext()); // to, co było na ekranie, już widziane
    }

    private SharedPreferences prefs() { return getContext().getSharedPreferences(PushWorker.PREFS, Context.MODE_PRIVATE); }

    @PluginMethod
    public void configure(PluginCall call) {
        boolean on = Boolean.TRUE.equals(call.getBoolean("on", false));
        String cfg = call.getString("cfg");
        SharedPreferences.Editor ed = prefs().edit().putBoolean("on", on);
        if (cfg != null) {
            try { new JSONObject(cfg); } catch (Exception e) { call.reject("bad cfg"); return; }
            ed.putString("cfg", cfg);
        } else if (!on) ed.remove("cfg").remove("since");
        ed.apply();
        if (on && cfg != null) {
            try { PushWorker.channel(getContext(), new JSONObject(cfg)); } catch (Exception ignored) { }
            PushWorker.schedule(getContext());
        } else if (!on) PushWorker.cancel(getContext());
        call.resolve();
    }

    /** sprawdź od razu (np. „Sprawdź teraz” / test); show = pokaż powiadomienia mimo otwartej aplikacji */
    @PluginMethod
    public void check(PluginCall call) {
        boolean show = Boolean.TRUE.equals(call.getBoolean("show", false));
        Long fromMs = call.getLong("from");
        new Thread(() -> {
            try {
                SharedPreferences sp = prefs();
                String raw = sp.getString("cfg", null);
                if (raw == null) { call.reject("not configured"); return; }
                JSONObject cfg = new JSONObject(raw);
                JSONObject since = new JSONObject(sp.getString("since", "{}"));
                if (fromMs != null) { for (java.util.Iterator<String> it = since.keys(); it.hasNext();) { it.next(); it.remove(); } cfg.put("at", fromMs); }
                List<PushCheck.Notice> list;
                synchronized (PushWorker.class) {
                    PushCheck pc = new PushCheck(cfg, since, null);
                    list = pc.run();
                    SharedPreferences.Editor ed = sp.edit().putString("since", pc.since().toString());
                    if (pc.refreshToken() != null) ed.putString("cfg", cfg.put("refreshToken", pc.refreshToken()).toString());
                    ed.apply();
                }
                if (show) for (PushCheck.Notice n : list) PushWorker.show(getContext(), cfg, n);
                JSObject r = new JSObject();
                r.put("count", list.size());
                call.resolve(r);
            } catch (Exception e) {
                call.reject(String.valueOf(e.getMessage()));
            }
        }).start();
    }
}
