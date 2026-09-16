package dev.sonora.app;

import android.Manifest;
import android.content.Intent;
import android.os.Build;
import androidx.core.content.ContextCompat;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

/**
 * Starts and stops the foreground service that keeps the WebView alive while audio plays.
 * The lockscreen controls come from the page's navigator.mediaSession, not from here.
 */
@CapacitorPlugin(
    name = "KeepAlive",
    permissions = { @Permission(alias = "notifications", strings = { Manifest.permission.POST_NOTIFICATIONS }) }
)
public class KeepAlivePlugin extends Plugin {

    @PluginMethod
    public void start(PluginCall call) {
        // Android 13+ hides the service's notification without this; the service itself still runs.
        if (Build.VERSION.SDK_INT >= 33 && getPermissionState("notifications") != PermissionState.GRANTED) {
            requestPermissionForAlias("notifications", call, "afterPermission");
            return;
        }
        startService();
        call.resolve();
    }

    @PermissionCallback
    private void afterPermission(PluginCall call) {
        startService(); // granted or not: the process still needs to stay up
        call.resolve();
    }

    @PluginMethod
    public void stop(PluginCall call) {
        getContext().stopService(new Intent(getContext(), KeepAliveService.class));
        call.resolve();
    }

    private void startService() {
        ContextCompat.startForegroundService(getContext(), new Intent(getContext(), KeepAliveService.class));
    }
}
