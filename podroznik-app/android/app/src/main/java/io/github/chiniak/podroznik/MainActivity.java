package io.github.chiniak.podroznik;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // własne wtyczki aplikacji – rejestrowane przed startem mostka
        registerPlugin(GoogleAuthPlugin.class);
        registerPlugin(ShareInPlugin.class);
        registerPlugin(PushPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
