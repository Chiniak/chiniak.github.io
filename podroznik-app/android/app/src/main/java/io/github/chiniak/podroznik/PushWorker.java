package io.github.chiniak.podroznik;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import androidx.annotation.NonNull;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.work.Constraints;
import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;
import androidx.work.Worker;
import androidx.work.WorkerParameters;
import java.util.List;
import java.util.concurrent.TimeUnit;
import org.json.JSONObject;

/**
 * Co ok. 15 minut (WorkManager, tylko z internetem): nowe wiadomości → powiadomienia (PushCheck).
 * Gdy aplikacja jest na ekranie, nic nie pokazuje – tylko przesuwa „od kiedy” (wiadomości widać w aplikacji).
 */
public class PushWorker extends Worker {

    static final String PREFS = "tw-push", WORK = "tw-wiadomosci", CHANNEL = "wiadomosci";

    public PushWorker(@NonNull Context ctx, @NonNull WorkerParameters p) { super(ctx, p); }

    static void schedule(Context ctx) {
        Constraints c = new Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build();
        PeriodicWorkRequest req = new PeriodicWorkRequest.Builder(PushWorker.class, 15, TimeUnit.MINUTES).setConstraints(c).build();
        WorkManager.getInstance(ctx).enqueueUniquePeriodicWork(WORK, ExistingPeriodicWorkPolicy.KEEP, req);
    }

    static void cancel(Context ctx) { WorkManager.getInstance(ctx).cancelUniqueWork(WORK); }

    /** wszystko do teraz uznane za przeczytane (aplikacja otwarta / zamknięta przed chwilą) */
    static synchronized void seenAll(Context ctx) {
        SharedPreferences sp = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String cfg = sp.getString("cfg", null);
        if (cfg == null) return;
        try {
            PushCheck pc = new PushCheck(new JSONObject(cfg), new JSONObject(sp.getString("since", "{}")), null);
            pc.seenAll(System.currentTimeMillis());
            sp.edit().putString("since", pc.since().toString()).apply();
        } catch (Exception ignored) { /* uszkodzona konfiguracja – nadpisze ją następne uruchomienie */ }
    }

    @NonNull
    @Override
    public Result doWork() {
        Context ctx = getApplicationContext();
        SharedPreferences sp = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String raw = sp.getString("cfg", null);
        if (raw == null || !sp.getBoolean("on", false)) return Result.success();
        if (PushPlugin.foreground) { seenAll(ctx); return Result.success(); }
        try {
            JSONObject cfg = new JSONObject(raw);
            List<PushCheck.Notice> list;
            PushCheck pc;
            synchronized (PushWorker.class) {
                pc = new PushCheck(cfg, new JSONObject(sp.getString("since", "{}")), null);
                list = pc.run();
                SharedPreferences.Editor ed = sp.edit().putString("since", pc.since().toString());
                if (pc.refreshToken() != null) ed.putString("cfg", cfg.put("refreshToken", pc.refreshToken()).toString());
                ed.apply();
            }
            if (!PushPlugin.foreground) for (PushCheck.Notice n : list) show(ctx, cfg, n);
            return Result.success();
        } catch (Exception e) {
            android.util.Log.w("PushWorker", "check failed: " + e.getMessage());
            return Result.retry();
        }
    }

    static void channel(Context ctx, JSONObject cfg) {
        if (Build.VERSION.SDK_INT < 26) return;
        JSONObject t = cfg != null ? cfg.optJSONObject("texts") : null;
        NotificationChannel ch = new NotificationChannel(CHANNEL, t != null ? t.optString("channel", "Wiadomości") : "Wiadomości", NotificationManager.IMPORTANCE_DEFAULT);
        ch.setDescription(t != null ? t.optString("channelDesc", "Czat podróży i znajomych") : "Czat podróży i znajomych");
        ctx.getSystemService(NotificationManager.class).createNotificationChannel(ch);
    }

    static void show(Context ctx, JSONObject cfg, PushCheck.Notice n) {
        channel(ctx, cfg);
        Intent open = new Intent(ctx, MainActivity.class)
            .setAction(Intent.ACTION_VIEW)
            .putExtra(PushPlugin.EXTRA_ROUTE, n.route)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        int id = n.key.hashCode();
        PendingIntent pi = PendingIntent.getActivity(ctx, id, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        String last = n.lines.get(n.lines.size() - 1);
        NotificationCompat.Builder b = new NotificationCompat.Builder(ctx, CHANNEL)
            .setSmallIcon(R.drawable.ic_stat_podroznik)
            .setColor(0xFF0F6E6E)
            .setContentTitle(n.title)
            .setContentText(last)
            .setNumber(n.lines.size())
            .setAutoCancel(true)
            .setCategory(NotificationCompat.CATEGORY_MESSAGE)
            .setVisibility(NotificationCompat.VISIBILITY_PRIVATE) // na zablokowanym ekranie bez treści (chyba że telefon pozwala)
            .setContentIntent(pi);
        if (n.lines.size() > 1) {
            NotificationCompat.InboxStyle st = new NotificationCompat.InboxStyle();
            for (String l : n.lines.subList(Math.max(0, n.lines.size() - 6), n.lines.size())) st.addLine(l);
            b.setStyle(st);
        } else b.setStyle(new NotificationCompat.BigTextStyle().bigText(last));
        try { NotificationManagerCompat.from(ctx).notify(PushPlugin.TAG, id, b.build()); }
        catch (SecurityException e) { /* brak zgody na powiadomienia */ }
    }
}
