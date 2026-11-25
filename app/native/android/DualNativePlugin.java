package com.hvsodream.dualplanner;

import android.Manifest;
import android.content.ContentUris;
import android.content.ContentValues;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.provider.CalendarContract;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.TimeZone;

// DUAL Planner 앱 전용 플러그인(안드로이드). iOS의 DualNativePlugin.swift와 이름·돌려주는 모양을 맞춘다.
// 아직 없는 것: 위젯(widgetSave는 받기만 함), 공유로 받아 적기(takePending은 빈 목록), Apple·Google 로그인(거절).
@CapacitorPlugin(
    name = "DualNative",
    permissions = {
        @Permission(alias = "calendar", strings = { Manifest.permission.READ_CALENDAR, Manifest.permission.WRITE_CALENDAR })
    }
)
public class DualNativePlugin extends Plugin {

    private String status() {
        PermissionState s = getPermissionState("calendar");
        if (s == PermissionState.GRANTED) return "granted";
        if (s == PermissionState.DENIED) return "denied";
        return "prompt";
    }

    private void resolveStatus(PluginCall call) {
        JSObject r = new JSObject();
        r.put("status", status());
        call.resolve(r);
    }

    // { ask: true } 이면 권한을 묻는다
    @PluginMethod
    public void calendarAccess(PluginCall call) {
        boolean ask = Boolean.TRUE.equals(call.getBoolean("ask", false));
        if (!"prompt".equals(status()) || !ask) { resolveStatus(call); return; }
        requestPermissionForAlias("calendar", call, "calendarAsked");
    }

    @PermissionCallback
    private void calendarAsked(PluginCall call) {
        resolveStatus(call);
    }

    // { from: "YYYY-MM-DD", to: "YYYY-MM-DD" } → 서버 /cal 과 같은 모양
    @PluginMethod
    public void calendarEvents(PluginCall call) {
        JSObject out = new JSObject();
        JSArray events = new JSArray();
        if (!"granted".equals(status())) { out.put("events", events); out.put("status", status()); call.resolve(out); return; }
        SimpleDateFormat df = new SimpleDateFormat("yyyy-MM-dd", Locale.US);
        SimpleDateFormat hm = new SimpleDateFormat("HH:mm", Locale.US);
        SimpleDateFormat utc = new SimpleDateFormat("yyyy-MM-dd", Locale.US);
        utc.setTimeZone(TimeZone.getTimeZone("UTC"));
        String fromS = call.getString("from", ""), toS = call.getString("to", "");
        Date from, to;
        try { from = df.parse(fromS); to = df.parse(toS); } catch (Exception e) { call.reject("bad range"); return; }
        if (from == null || to == null) { call.reject("bad range"); return; }
        Uri.Builder b = CalendarContract.Instances.CONTENT_URI.buildUpon();
        ContentUris.appendId(b, from.getTime());
        ContentUris.appendId(b, to.getTime());
        String[] cols = { CalendarContract.Instances.TITLE, CalendarContract.Instances.BEGIN, CalendarContract.Instances.END, CalendarContract.Instances.ALL_DAY, CalendarContract.Instances.STATUS };
        int n = 0;
        try (Cursor c = getContext().getContentResolver().query(b.build(), cols, null, null, CalendarContract.Instances.BEGIN + " ASC")) {
            while (c != null && c.moveToNext() && n < 400) {
                if (!c.isNull(4) && c.getInt(4) == CalendarContract.Events.STATUS_CANCELED) continue;
                String title = c.getString(0);
                if (title == null || title.isEmpty()) title = "(제목 없음)";
                long begin = c.getLong(1), end = c.isNull(2) ? begin : c.getLong(2);
                boolean allDay = c.getInt(3) != 0;
                if (allDay) {
                    // 종일 일정은 UTC 자정 기준으로 적혀 있다. 끝 날짜는 포함하지 않는다
                    long d = begin;
                    do {
                        String day = utc.format(new Date(d));
                        if (day.compareTo(fromS) >= 0 && day.compareTo(toS) < 0) {
                            JSObject e = new JSObject();
                            e.put("date", day); e.put("start", ""); e.put("end", ""); e.put("title", title); e.put("allDay", true);
                            events.put(e); n++;
                        }
                        d += 86400000L;
                    } while (d < end && n < 400);
                } else {
                    JSObject e = new JSObject();
                    e.put("date", df.format(new Date(begin))); e.put("start", hm.format(new Date(begin))); e.put("end", hm.format(new Date(end))); e.put("title", title); e.put("allDay", false);
                    events.put(e); n++;
                }
            }
        } catch (Exception e) { call.reject(String.valueOf(e.getMessage())); return; }
        out.put("events", events); out.put("status", "granted");
        call.resolve(out);
    }

    // { date: "YYYY-MM-DD", start: "HH:mm", minutes, title, alarm } → 기본 캘린더에 일정 하나
    @PluginMethod
    public void calendarAdd(PluginCall call) {
        JSObject out = new JSObject();
        if (!"granted".equals(status())) { out.put("ok", false); out.put("status", status()); call.resolve(out); return; }
        Date st;
        try { st = new SimpleDateFormat("yyyy-MM-dd HH:mm", Locale.US).parse(call.getString("date", "") + " " + call.getString("start", "")); } catch (Exception e) { call.reject("bad time"); return; }
        if (st == null) { call.reject("bad time"); return; }
        long calId = -1;
        String[] cols = { CalendarContract.Calendars._ID, CalendarContract.Calendars.IS_PRIMARY };
        String where = CalendarContract.Calendars.CALENDAR_ACCESS_LEVEL + " >= " + CalendarContract.Calendars.CAL_ACCESS_CONTRIBUTOR + " AND " + CalendarContract.Calendars.VISIBLE + " = 1";
        try (Cursor c = getContext().getContentResolver().query(CalendarContract.Calendars.CONTENT_URI, cols, where, null, null)) {
            while (c != null && c.moveToNext()) {
                if (calId < 0) calId = c.getLong(0);
                if (c.getInt(1) == 1) { calId = c.getLong(0); break; }
            }
        } catch (Exception e) { call.reject(String.valueOf(e.getMessage())); return; }
        if (calId < 0) { call.reject("no calendar"); return; }
        Integer minutes = call.getInt("minutes", 60);
        ContentValues v = new ContentValues();
        v.put(CalendarContract.Events.CALENDAR_ID, calId);
        v.put(CalendarContract.Events.TITLE, call.getString("title", ""));
        v.put(CalendarContract.Events.DTSTART, st.getTime());
        v.put(CalendarContract.Events.DTEND, st.getTime() + (minutes == null ? 60 : minutes) * 60000L);
        v.put(CalendarContract.Events.EVENT_TIMEZONE, TimeZone.getDefault().getID());
        try {
            Uri u = getContext().getContentResolver().insert(CalendarContract.Events.CONTENT_URI, v);
            if (u == null) { call.reject("insert failed"); return; }
            long id = ContentUris.parseId(u);
            Integer alarm = call.getInt("alarm");
            if (alarm != null) {
                ContentValues r = new ContentValues();
                r.put(CalendarContract.Reminders.EVENT_ID, id);
                r.put(CalendarContract.Reminders.MINUTES, alarm);
                r.put(CalendarContract.Reminders.METHOD, CalendarContract.Reminders.METHOD_ALERT);
                getContext().getContentResolver().insert(CalendarContract.Reminders.CONTENT_URI, r);
            }
            out.put("ok", true); out.put("id", String.valueOf(id));
            call.resolve(out);
        } catch (Exception e) { call.reject(String.valueOf(e.getMessage())); }
    }

    // 위젯은 아직 없다. 웹이 부르는 대로 받기만 한다
    @PluginMethod
    public void widgetSave(PluginCall call) {
        call.resolve();
    }

    // 위젯 체크·공유로 들어온 것: 아직 없으니 늘 빈 목록
    @PluginMethod
    public void takePending(PluginCall call) {
        JSObject out = new JSObject();
        out.put("checks", new JSArray()); out.put("picks", new JSArray()); out.put("shared", new JSArray());
        call.resolve(out);
    }

    // { url } → 다른 앱 열기(claude://…). 못 열면 ok=false
    @PluginMethod
    public void openUrl(PluginCall call) {
        JSObject out = new JSObject();
        try {
            Intent i = new Intent(Intent.ACTION_VIEW, Uri.parse(call.getString("url", "")));
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(i);
            out.put("ok", true);
        } catch (Exception e) { out.put("ok", false); }
        call.resolve(out);
    }

    // 로그인은 스토어 서명 키가 정해진 뒤에 붙인다(Google 쪽에 키 지문을 등록해야 한다)
    @PluginMethod
    public void googleSignIn(PluginCall call) {
        call.reject("unavailable");
    }

    @PluginMethod
    public void appleSignIn(PluginCall call) {
        call.reject("unavailable");
    }
}
