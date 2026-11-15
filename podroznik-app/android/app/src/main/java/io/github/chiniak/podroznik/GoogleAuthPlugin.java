package io.github.chiniak.podroznik;

import android.app.Activity;
import androidx.activity.result.ActivityResult;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.IntentSenderRequest;
import androidx.activity.result.contract.ActivityResultContracts;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.gms.auth.api.identity.AuthorizationClient;
import com.google.android.gms.auth.api.identity.AuthorizationRequest;
import com.google.android.gms.auth.api.identity.AuthorizationResult;
import com.google.android.gms.auth.api.identity.Identity;
import com.google.android.gms.auth.api.identity.RevokeAccessRequest;
import com.google.android.gms.common.api.ApiException;
import com.google.android.gms.common.api.Scope;
import java.util.ArrayList;
import java.util.List;

/**
 * Dostęp do konta Google (np. Gmail tylko do odczytu) przez Google Identity Services – Authorization API.
 * Bez serwera i bez hasła: Google sprawdza aplikację po nazwie pakietu i odcisku klucza (klient „Android” w Google Cloud).
 * Zwraca krótkotrwały token dostępu (ok. 1 h); kolejne wywołanie bez okna zgody daje nowy.
 */
@CapacitorPlugin(name = "GoogleAuth")
public class GoogleAuthPlugin extends Plugin {

    private ActivityResultLauncher<IntentSenderRequest> consentLauncher;
    private PluginCall pendingCall;

    @Override
    public void load() {
        consentLauncher = getBridge().registerForActivityResult(new ActivityResultContracts.StartIntentSenderForResult(), this::onConsent);
    }

    private AuthorizationClient client() {
        return Identity.getAuthorizationClient(getActivity());
    }

    private static List<Scope> scopes(PluginCall call) {
        List<Scope> out = new ArrayList<>();
        JSArray arr = call.getArray("scopes", new JSArray());
        for (int i = 0; i < arr.length(); i++) {
            String s = arr.optString(i, "");
            if (!s.isEmpty()) out.add(new Scope(s));
        }
        return out;
    }

    /** authorize({ scopes: [...], interactive: true|false }) → { accessToken, scopes } */
    @PluginMethod
    public void authorize(PluginCall call) {
        List<Scope> list = scopes(call);
        if (list.isEmpty()) {
            call.reject("Brak zakresów (scopes)", "NO_SCOPES");
            return;
        }
        boolean interactive = call.getBoolean("interactive", true);
        AuthorizationRequest req = AuthorizationRequest.builder().setRequestedScopes(list).build();
        client()
            .authorize(req)
            .addOnSuccessListener(result -> {
                if (result.hasResolution()) {
                    if (!interactive || result.getPendingIntent() == null) {
                        call.reject("Potrzebna zgoda użytkownika", "NEED_CONSENT");
                        return;
                    }
                    if (pendingCall != null) pendingCall.reject("Przerwane nowym logowaniem", "CANCELED");
                    pendingCall = call;
                    consentLauncher.launch(new IntentSenderRequest.Builder(result.getPendingIntent().getIntentSender()).build());
                } else {
                    call.resolve(toJs(result));
                }
            })
            .addOnFailureListener(e -> call.reject(message(e), code(e)));
    }

    private void onConsent(ActivityResult res) {
        PluginCall call = pendingCall;
        pendingCall = null;
        if (call == null) return;
        if (res.getResultCode() != Activity.RESULT_OK) {
            call.reject("Anulowano", "CANCELED");
            return;
        }
        try {
            AuthorizationResult result = client().getAuthorizationResultFromIntent(res.getData());
            call.resolve(toJs(result));
        } catch (ApiException e) {
            call.reject(message(e), code(e));
        }
    }

    /** revoke({ accessToken?, scopes }) – odłączenie konta (cofnięcie zgody). */
    @PluginMethod
    public void revoke(PluginCall call) {
        List<Scope> list = scopes(call);
        try {
            RevokeAccessRequest req = RevokeAccessRequest.builder().setScopes(list).build();
            client().revokeAccess(req).addOnSuccessListener(v -> call.resolve()).addOnFailureListener(e -> call.reject(message(e), code(e)));
        } catch (Throwable t) {
            // starsze Usługi Google Play – wystarczy zapomnieć konto w aplikacji
            call.resolve();
        }
    }

    private static JSObject toJs(AuthorizationResult r) {
        JSObject o = new JSObject();
        o.put("accessToken", r.getAccessToken());
        JSArray s = new JSArray();
        for (String x : r.getGrantedScopes()) s.put(x);
        o.put("scopes", s);
        return o;
    }

    private static String message(Exception e) {
        if (e instanceof ApiException) {
            int c = ((ApiException) e).getStatusCode();
            // 10 = DEVELOPER_ERROR: aplikacja (pakiet + odcisk klucza) nie jest dodana w Google Cloud jako klient Android
            if (c == 10) return "Aplikacja nie jest zarejestrowana w Google Cloud (pakiet + odcisk SHA-1)";
            if (c == 7) return "Brak internetu";
            if (c == 16) return "Anulowano";
        }
        return e.getMessage() != null ? e.getMessage() : e.toString();
    }

    private static String code(Exception e) {
        return e instanceof ApiException ? "GOOGLE_" + ((ApiException) e).getStatusCode() : "ERROR";
    }
}
