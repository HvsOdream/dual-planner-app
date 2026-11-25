package com.hvsodream.dualplanner;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

// 앱 전용 플러그인(DualNative)을 올린다. iOS의 DualViewController와 같은 자리
public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(DualNativePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
