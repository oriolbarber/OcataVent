package cat.ocatavent.app;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.text.SpannableString;
import android.text.Spanned;
import android.text.style.RelativeSizeSpan;
import android.widget.RemoteViews;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import org.json.JSONArray;
import org.json.JSONObject;

/* Ocata Vent: widget de la pantalla d'inici amb la idoneïtat per navegar.
   L'app hi desa (WidgetPlugin) el veredicte d'ara i la previsió de les 48 hores següents.
   Android el refresca cada 30 min sense obrir l'app: si les dades d'ara tenen menys de 45 min, les mostra
   (amb el vent de l'estació); si no, mostra la previsió de l'hora en curs. Tocar-lo obre l'app. */
public class VentWidget extends AppWidgetProvider {
    static final String PREFS = "ov_widget", KEY = "snap";
    static final long NOW_MAX = 45 * 60 * 1000L, HOUR = 3600 * 1000L;
    static final Locale CA = new Locale("ca", "ES");

    @Override
    public void onUpdate(Context c, AppWidgetManager m, int[] ids) {
        for (int id : ids) m.updateAppWidget(id, build(c));
    }

    static void updateAll(Context c) {
        AppWidgetManager m = AppWidgetManager.getInstance(c);
        int[] ids = m.getAppWidgetIds(new ComponentName(c, VentWidget.class));
        if (ids == null) return;
        for (int id : ids) m.updateAppWidget(id, build(c));
    }

    static RemoteViews build(Context c) {
        RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.widget_vent);
        Intent i = new Intent(c, MainActivity.class);
        i.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        v.setOnClickPendingIntent(R.id.wRoot, PendingIntent.getActivity(c, 0, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE));
        String s = c.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY, null);
        if (s == null) { empty(v, "Ocata Vent", "Obre l'app per veure les condicions"); return v; }
        try {
            JSONObject o = new JSONObject(s);
            long now = System.currentTimeMillis(), at = o.optLong("at", 0);
            SimpleDateFormat hm = new SimpleDateFormat("HH:mm", CA), hh = new SimpleDateFormat("HH", CA);
            JSONObject e = null; String src = null;
            if (now - at < NOW_MAX && o.has("now")) {
                e = o.getJSONObject("now");
                String st = o.optString("st", "");
                src = (st.isEmpty() ? "Previsió" : "Estació " + st) + " · " + hm.format(new Date(at));
            } else {
                JSONArray h = o.optJSONArray("hrs");
                if (h != null) for (int k = 0; k < h.length(); k++) {
                    JSONObject x = h.getJSONObject(k); long t = x.optLong("t", 0);
                    if (now >= t && now < t + HOUR) { e = x; src = "Previsió de les " + hh.format(new Date(t)) + " h"; break; }
                }
            }
            if (e == null) { empty(v, title(o), "Previsió caducada: obre l'app"); return v; }
            String k = e.optString("k", "no");
            int col = "ideal".equals(k) ? 0xFF34E39A : "marg".equals(k) ? 0xFFFF9A3C : 0xFFFF6476;
            v.setInt(R.id.wRoot, "setBackgroundResource", "ideal".equals(k) ? R.drawable.widget_bg_ideal : "marg".equals(k) ? R.drawable.widget_bg_marg : R.drawable.widget_bg_no);
            String sc = e.isNull("s") ? "–" : String.valueOf(Math.round(e.getDouble("s") / 10.0));
            SpannableString sp = new SpannableString(sc + "/10");
            sp.setSpan(new RelativeSizeSpan(0.45f), sc.length(), sp.length(), Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
            v.setTextViewText(R.id.wScore, sp);
            v.setTextColor(R.id.wScore, col);
            v.setTextViewText(R.id.wVerd, e.optString("v", "").toUpperCase(CA));
            v.setTextColor(R.id.wVerd, col);
            v.setTextViewText(R.id.wTitle, title(o));
            String wind = e.isNull("w") ? "Sense dades de vent" : Math.round(e.getDouble("w")) + " kn " + e.optString("dn", "")
                + (e.isNull("g") ? "" : " · ratxa " + Math.round(e.getDouble("g")));
            v.setTextViewText(R.id.wWind, wind.trim());
            String wave = e.isNull("h") ? "" : "Onada " + String.format(CA, "%.1f", e.getDouble("h")) + " m";
            String why = e.optString("why", "");
            v.setTextViewText(R.id.wWave, wave + (!wave.isEmpty() && !why.isEmpty() ? " · " : "") + why);
            v.setTextViewText(R.id.wSrc, src);
        } catch (Exception ex) {
            empty(v, "Ocata Vent", "Obre l'app per veure les condicions");
        }
        return v;
    }

    static String title(JSONObject o) {
        String a = o.optString("act", ""), l = o.optString("loc", "");
        return a.isEmpty() ? (l.isEmpty() ? "Ocata Vent" : l) : a + (l.isEmpty() ? "" : " · " + l);
    }

    static void empty(RemoteViews v, String title, String msg) {
        v.setInt(R.id.wRoot, "setBackgroundResource", R.drawable.widget_bg_none);
        v.setTextViewText(R.id.wScore, "–");
        v.setTextColor(R.id.wScore, Color.WHITE);
        v.setTextViewText(R.id.wVerd, "");
        v.setTextViewText(R.id.wTitle, title);
        v.setTextViewText(R.id.wWind, msg);
        v.setTextViewText(R.id.wWave, "");
        v.setTextViewText(R.id.wSrc, "");
    }
}
