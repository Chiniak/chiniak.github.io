package io.github.chiniak.podroznik;

import android.content.ContentResolver;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.provider.OpenableColumns;
import android.webkit.MimeTypeMap;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.ArrayList;
import java.util.List;

/**
 * „Udostępnij → Tripwillow”: pliki (PDF, zdjęcia, .ics, .pkpass, .eml) i tekst z innych aplikacji (intent SEND / SEND_MULTIPLE,
 * filtry w AndroidManifest). Pliki są kopiowane do pamięci podręcznej aplikacji (cache/przyjete) – strona czyta je przez
 * Capacitor.convertFileSrc (native.js) i przekazuje do udostepnione.js. Zdarzenie „shared” czeka, aż strona je odbierze.
 */
@CapacitorPlugin(name = "ShareIn")
public class ShareInPlugin extends Plugin {

    private static final long MAX_BYTES = 40L * 1024 * 1024; // większe pliki pomijamy (bilet / skan to zwykle < 5 MB)
    private static final int MAX_FILES = 10;

    @Override
    public void load() {
        // stare kopie z poprzednich udostępnień
        File dir = new File(getContext().getCacheDir(), "przyjete");
        File[] old = dir.listFiles();
        if (old != null) for (File f : old) if (System.currentTimeMillis() - f.lastModified() > 3600_000L) f.delete();
        Intent intent = getActivity().getIntent();
        if (handle(intent)) getActivity().setIntent(new Intent(Intent.ACTION_MAIN)); // obrót ekranu nie powtórzy udostępnienia
    }

    @Override
    protected void handleOnNewIntent(Intent intent) {
        super.handleOnNewIntent(intent);
        handle(intent);
    }

    private boolean handle(Intent intent) {
        if (intent == null) return false;
        String action = intent.getAction();
        if (!Intent.ACTION_SEND.equals(action) && !Intent.ACTION_SEND_MULTIPLE.equals(action)) return false;
        List<Uri> uris = new ArrayList<>();
        if (Intent.ACTION_SEND.equals(action)) {
            Uri u = stream(intent);
            if (u != null) uris.add(u);
        } else {
            ArrayList<Uri> list = streams(intent);
            if (list != null) uris.addAll(list);
        }
        if (uris.isEmpty() && intent.getClipData() != null) {
            for (int i = 0; i < intent.getClipData().getItemCount(); i++) {
                Uri u = intent.getClipData().getItemAt(i).getUri();
                if (u != null) uris.add(u);
            }
        }
        JSArray files = new JSArray();
        int n = 0;
        for (Uri u : uris) {
            if (n >= MAX_FILES) break;
            try {
                JSObject f = copy(u, intent.getType(), n);
                if (f != null) { files.put(f); n++; }
            } catch (Exception e) {
                android.util.Log.w("ShareIn", "copy failed: " + e);
            }
        }
        StringBuilder text = new StringBuilder();
        CharSequence subject = intent.getCharSequenceExtra(Intent.EXTRA_SUBJECT);
        CharSequence body = intent.getCharSequenceExtra(Intent.EXTRA_TEXT);
        if (subject != null && subject.length() > 0) text.append(subject).append('\n');
        if (body != null) text.append(body);
        if (files.length() == 0 && text.length() == 0) return false;
        JSObject data = new JSObject();
        data.put("files", files);
        data.put("text", text.toString().trim());
        notifyListeners("shared", data, true);
        return true;
    }

    @SuppressWarnings("deprecation")
    private Uri stream(Intent intent) {
        if (Build.VERSION.SDK_INT >= 33) return intent.getParcelableExtra(Intent.EXTRA_STREAM, Uri.class);
        return intent.getParcelableExtra(Intent.EXTRA_STREAM);
    }

    @SuppressWarnings("deprecation")
    private ArrayList<Uri> streams(Intent intent) {
        if (Build.VERSION.SDK_INT >= 33) return intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM, Uri.class);
        return intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM);
    }

    private JSObject copy(Uri uri, String fallbackType, int index) throws Exception {
        ContentResolver cr = getContext().getContentResolver();
        String name = null;
        long size = -1;
        try (Cursor c = cr.query(uri, new String[] { OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE }, null, null, null)) {
            if (c != null && c.moveToFirst()) {
                int ni = c.getColumnIndex(OpenableColumns.DISPLAY_NAME), si = c.getColumnIndex(OpenableColumns.SIZE);
                if (ni >= 0) name = c.getString(ni);
                if (si >= 0 && !c.isNull(si)) size = c.getLong(si);
            }
        } catch (Exception ignored) {
            // niektóre aplikacje nie podają nazwy – zostaje domyślna
        }
        if (size > MAX_BYTES) return null;
        String mime = cr.getType(uri);
        if (mime == null || mime.equals("application/octet-stream")) {
            String ext = name != null && name.contains(".") ? name.substring(name.lastIndexOf('.') + 1).toLowerCase() : "";
            String guess = guessMime(ext);
            mime = guess != null ? guess : (fallbackType != null && !fallbackType.contains("*") ? fallbackType : "application/octet-stream");
        }
        if (name == null || name.trim().isEmpty()) {
            String ext = MimeTypeMap.getSingleton().getExtensionFromMimeType(mime);
            name = "plik-" + (index + 1) + (ext != null ? "." + ext : "");
        }
        String safe = name.replaceAll("[\\\\/:*?\"<>|]+", "-");
        File dir = new File(getContext().getCacheDir(), "przyjete");
        if (!dir.exists() && !dir.mkdirs()) throw new Exception("no cache dir");
        File out = new File(dir, System.currentTimeMillis() + "-" + index + "-" + safe);
        long total = 0;
        try (InputStream in = cr.openInputStream(uri); OutputStream os = new FileOutputStream(out)) {
            if (in == null) throw new Exception("no stream");
            byte[] buf = new byte[64 * 1024];
            int r;
            while ((r = in.read(buf)) > 0) {
                total += r;
                if (total > MAX_BYTES) { os.close(); out.delete(); return null; }
                os.write(buf, 0, r);
            }
        }
        JSObject f = new JSObject();
        f.put("path", Uri.fromFile(out).toString());
        f.put("name", name);
        f.put("mime", mime);
        f.put("size", total);
        return f;
    }

    static String guessMime(String ext) {
        switch (ext) {
            case "pdf": return "application/pdf";
            case "ics": return "text/calendar";
            case "pkpass": return "application/vnd.apple.pkpass";
            case "eml": return "message/rfc822";
            case "txt": return "text/plain";
            case "html": case "htm": return "text/html";
            case "jpg": case "jpeg": return "image/jpeg";
            case "png": return "image/png";
            case "webp": return "image/webp";
            case "heic": return "image/heic";
            default: return null;
        }
    }
}
